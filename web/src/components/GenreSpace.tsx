import { LinearInterpolator, OrbitView, type PickingInfo } from '@deck.gl/core'
import { ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import DeckGL from '@deck.gl/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { artistDotRadius, placementInCluster, useArtistMap, type MappedArtist } from '../data/artistSpace'
import { GENRES, regionLabel } from '../data/atlas'
import { CLUSTERS, CLUSTER_MEMBERS, POSITIONS_3D, type Vec3 } from '../data/space'
import { clusterColor, clusterRgb } from '../lib/colors'
import { decade } from '../lib/features'
import { useMatchMask } from '../lib/filter'
import { labelSize, placeLabels, type Box, type Projected } from '../lib/labels'
import { usePlayer } from '../player'
import { useAtlas } from '../store'
import type { Genre } from '../types'
import { MinusIcon, PlusIcon, RecenterIcon } from './icons'

const VIEW = new OrbitView({ id: 'space', orbitAxis: 'Y', fovy: 40 })
const INTERPOLATOR = new LinearInterpolator(['target', 'zoom', 'rotationOrbit', 'rotationX'])
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif'
const HOME_ROTATION = { rotationOrbit: -22, rotationX: 12 }
const CLUSTER_FLIGHT_MS = 850
// Half the details sheet's footprint (22rem + right-4), so focused genres land in the visible area.
const DETAILS_SHEET_OFFSET = 184
// How far a scroll gesture must travel before it counts, and how long to ignore its momentum afterwards.
const SCROLL_THRESHOLD = 40
const SCROLL_LOCK_MS = 750
const SCROLL_QUIET_MS = 180
// A wheel event at least this strong while locked shows intent rather than leftover momentum.
const SCROLL_INTENT_DELTA = 8
// Momentum lock that always applies after a step, even to a new swipe in the same direction.
const SCROLL_MIN_LOCK_MS = 350
const NO_DEPTH = { depthCompare: 'always', depthWriteEnabled: false } as const

type RGBA = [number, number, number, number]

const PALETTE = {
  label: [46, 42, 31, 255] as RGBA,
  outline: [232, 226, 192, 230] as RGBA,
  ring: [46, 42, 31],
  on: 240,
  off: 38,
  ghost: 40,
}

interface ViewState {
  target: Vec3
  zoom: number
  rotationOrbit: number
  rotationX: number
  minZoom: number
  maxZoom: number
  minRotationX: number
  maxRotationX: number
  transitionDuration?: number
  transitionInterpolator?: LinearInterpolator
  transitionEasing?: (t: number) => number
}

interface DepthInfo extends Projected {
  /** Signed distance from the target plane, in cluster radii. Negative is closer to the camera. */
  depth: number
  /** Billboarded text scales with perspective in OrbitView; multiplying pixel sizes by this undoes it. */
  flatten: number
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const easeOut = (t: number) => 1 - (1 - t) ** 3
const radius = (g: Genre) => 1.6 + (g.popularity / 100) ** 1.5 * 6
const artistRadius = (a: MappedArtist) => artistDotRadius(a.popularity)
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const length = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
/** The home angle, shifted by whole turns to sit nearest the current one, so resetting never spins around. */
const homeRotation = (v: ViewState) => ({
  rotationOrbit: HOME_ROTATION.rotationOrbit + 360 * Math.round((v.rotationOrbit - HOME_ROTATION.rotationOrbit) / 360),
  rotationX: HOME_ROTATION.rotationX,
})

/** Approximate footprints of the floating controls (see App, SearchBar, Dock, DetailsSheet). */
function chromeBoxes(w: number, h: number, sheetOpen: boolean, playerOpen: boolean): Box[] {
  const dockHalf = playerOpen ? 480 : 350
  const boxes: Box[] = [
    { x0: 0, y0: 0, x1: 460, y1: 170 },
    { x0: w / 2 - 236, y0: 0, x1: w / 2 + 236, y1: 68 },
    { x0: w / 2 - dockHalf, y0: h - 100, x1: w / 2 + dockHalf, y1: h },
    { x0: 0, y0: h - 150, x1: 72, y1: h },
  ]
  if (sheetOpen) boxes.push({ x0: w - 384, y0: 0, x1: w, y1: h })
  return boxes
}

export function GenreSpace() {
  const palette = PALETTE
  const { selectedId, artist, camera, clusterIndex, mapLayer, select, openArtist, closeArtist, goToCluster, dismissHint } =
    useAtlas(
      useShallow((s) => ({
        selectedId: s.selectedId,
        artist: s.artist,
        camera: s.camera,
        clusterIndex: s.clusterIndex,
        mapLayer: s.mapLayer,
        select: s.select,
        openArtist: s.openArtist,
        closeArtist: s.closeArtist,
        goToCluster: s.goToCluster,
        dismissHint: s.dismissHint,
      })),
    )
  const { mask } = useMatchMask()
  const artistMap = useArtistMap()
  const playingId = usePlayer((s) => (s.status === 'idle' || s.source?.kind !== 'genre' ? null : s.source.id))
  const playingMbid = usePlayer((s) => (s.status === 'idle' || s.source?.kind !== 'artist' ? null : s.source.mbid))

  const containerRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [viewState, setViewState] = useState<ViewState | null>(null)
  const [hover, setHover] = useState<
    { kind: 'genre'; genre: Genre; x: number; y: number } | { kind: 'artist'; artist: MappedArtist; x: number; y: number } | null
  >(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) =>
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height }),
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const fitZoom = (index: number) =>
    size ? Math.log2((Math.min(size.w, size.h - 140) * 0.8) / (2 * CLUSTERS[index].radius)) : 0

  const homeView = (index: number): ViewState => ({
    target: CLUSTERS[index].origin,
    zoom: fitZoom(index),
    ...HOME_ROTATION,
    minZoom: -2,
    maxZoom: 6,
    minRotationX: -85,
    maxRotationX: 85,
  })

  useEffect(() => {
    if (size && !viewState) setViewState(homeView(clusterIndex))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, viewState])

  const viewport = useMemo(
    () => (viewState && size ? VIEW.makeViewport({ width: size.w, height: size.h, viewState }) : null),
    [viewState, size],
  )

  /** The camera's horizontal right-hand direction for a given view. */
  const rightVector = (v: ViewState): Vec3 => {
    const viewportFor = size && VIEW.makeViewport({ width: size.w, height: size.h, viewState: v })
    if (!viewportFor) return [1, 0, 0]
    const cam = viewportFor.cameraPosition as Vec3
    const forward = sub(v.target, cam)
    const right: Vec3 = [-forward[2], 0, forward[0]]
    const len = Math.hypot(right[0], right[2]) || 1
    return [right[0] / len, 0, right[2] / len]
  }

  const flyToPoint = (p: Vec3, index: number) => {
    setViewState((v) => {
      if (!v) return v
      const zoom = Math.max(v.zoom, fitZoom(index) + 0.9)
      const shift = DETAILS_SHEET_OFFSET / 2 ** zoom
      const fromElsewhere = Math.abs(v.target[0] - CLUSTERS[index].origin[0]) > CLUSTERS[index].radius * 2
      const rotation = fromElsewhere ? homeRotation(v) : { rotationOrbit: v.rotationOrbit, rotationX: v.rotationX }
      const right = rightVector({ ...v, ...rotation })
      return {
        ...v,
        ...rotation,
        target: [p[0] + right[0] * shift, p[1], p[2] + right[2] * shift],
        zoom,
        transitionDuration: CLUSTER_FLIGHT_MS,
        transitionInterpolator: INTERPOLATOR,
        transitionEasing: easeInOutCubic,
      }
    })
  }

  useEffect(() => {
    if (!camera) return
    if (camera.kind === 'cluster') {
      setViewState((v) =>
        v && {
          ...v,
          ...homeRotation(v),
          target: CLUSTERS[camera.index].origin,
          zoom: fitZoom(camera.index),
          transitionDuration: CLUSTER_FLIGHT_MS,
          transitionInterpolator: INTERPOLATOR,
          transitionEasing: easeInOutCubic,
        },
      )
      return
    }
    if (camera.kind === 'artist') {
      const wantCluster = camera.genreId != null ? GENRES[camera.genreId].cluster : clusterIndex
      const mapped = artistMap ? placementInCluster(artistMap, camera.mbid, wantCluster) : undefined
      const p = mapped?.position ?? (camera.genreId != null ? POSITIONS_3D[camera.genreId] : null)
      const index = mapped?.cluster ?? wantCluster
      if (p) flyToPoint(p, index)
      return
    }
    flyToPoint(POSITIONS_3D[camera.id], GENRES[camera.id].cluster)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, artistMap])

  // Latest values for the native event listeners below, which are bound once.
  const live = useRef({ clusterIndex, goToCluster, dismissHint, fitZoom, homeView })
  live.current = { clusterIndex, goToCluster, dismissHint, fitZoom, homeView }

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let accumulated = 0
    let lastWheel = 0
    let lockedUntil = 0
    let lastStepAt = 0
    let lastStepDir = 0
    let lastMagnitude = 0

    const bump = (dir: number) => {
      const { clusterIndex: index } = live.current
      setViewState((v) =>
        v && {
          ...v,
          ...homeRotation(v),
          target: [CLUSTERS[index].origin[0] + (dir * 36) / 2 ** v.zoom, v.target[1], v.target[2]],
          transitionDuration: 140,
          transitionInterpolator: INTERPOLATOR,
          transitionEasing: easeOut,
        },
      )
      setTimeout(
        () =>
          setViewState((v) =>
            v && {
              ...v,
              target: CLUSTERS[index].origin,
              transitionDuration: 380,
              transitionInterpolator: INTERPOLATOR,
              transitionEasing: easeInOutCubic,
            },
          ),
        150,
      )
    }

    const step = (dir: number) => {
      const { clusterIndex: index, goToCluster: go, dismissHint: dismiss } = live.current
      dismiss()
      const next = index + dir
      if (next < 0 || next >= CLUSTERS.length) bump(dir)
      else go(next)
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey) {
        setViewState((v) => v && { ...v, zoom: clamp(v.zoom - e.deltaY * 0.012, v.minZoom, v.maxZoom), transitionDuration: 0 })
        return
      }
      const now = performance.now()
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX
      const magnitude = Math.abs(delta)
      const dir = Math.sign(delta)
      if (now < lockedUntil) {
        // Momentum keeps the direction and fades out. Scrolling the other way, or a new swipe that
        // speeds up again after the minimum lock, is the user asking for another step.
        const reversed = dir !== 0 && dir !== lastStepDir && magnitude >= SCROLL_INTENT_DELTA
        const freshSwipe =
          dir === lastStepDir &&
          now - lastStepAt > SCROLL_MIN_LOCK_MS &&
          magnitude >= SCROLL_INTENT_DELTA &&
          magnitude > lastMagnitude * 2
        lastMagnitude = magnitude
        if (!reversed && !freshSwipe) {
          lockedUntil = Math.max(lockedUntil, now + SCROLL_QUIET_MS)
          return
        }
        lockedUntil = 0
        accumulated = 0
      }
      if (now - lastWheel > SCROLL_QUIET_MS) accumulated = 0
      lastWheel = now
      lastMagnitude = magnitude
      accumulated += delta
      if (Math.abs(accumulated) > SCROLL_THRESHOLD) {
        lastStepDir = Math.sign(accumulated)
        step(lastStepDir)
        accumulated = 0
        lastStepAt = now
        lockedUntil = now + SCROLL_LOCK_MS
      }
    }

    const onKey = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return
      if (['ArrowRight', 'ArrowDown', 'PageDown'].includes(e.key)) step(1)
      else if (['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) step(-1)
      else return
      e.preventDefault()
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey)
    return () => {
      el.removeEventListener('wheel', onWheel)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const cluster = CLUSTERS[clusterIndex]
  const active = CLUSTER_MEMBERS[clusterIndex]
  const others = useMemo(() => GENRES.filter((g) => g.cluster !== clusterIndex), [clusterIndex])
  const artistLayer = mapLayer === 'artists'
  const visibleArtists = useMemo(() => {
    const list = artistMap?.byCluster[clusterIndex] ?? []
    if (!artist?.mbid || !artistMap) return list
    if (list.some((a) => a.mbid === artist.mbid)) return list
    const extra = placementInCluster(artistMap, artist.mbid, clusterIndex)
    return extra && extra.cluster === clusterIndex ? [...list, extra] : list
  }, [artistMap, clusterIndex, artist])

  const depthBasis = useMemo(() => {
    if (!viewport || !viewState) return null
    const cam = viewport.cameraPosition as Vec3
    const toTarget = sub(viewState.target, cam)
    const targetDistance = length(toTarget)
    const forward: Vec3 = [toTarget[0] / targetDistance, toTarget[1] / targetDistance, toTarget[2] / targetDistance]
    const scale = 2 ** viewState.zoom
    const project = (p: Vec3): DepthInfo | undefined => {
      const v = sub(p, cam)
      const along = dot(v, forward)
      if (along < targetDistance * 0.05) return undefined
      const [x, y] = viewport.project(p)
      return {
        x,
        y,
        pxPerUnit: (scale * targetDistance) / along,
        depth: (along - targetDistance) / cluster.radius,
        flatten: along / targetDistance,
      }
    }
    return { project }
  }, [viewport, viewState, cluster.radius])

  const depthInfo = useMemo(() => {
    const out = new Map<number, DepthInfo>()
    if (!depthBasis || artistLayer) return out
    for (const g of active) {
      const info = depthBasis.project(POSITIONS_3D[g.id])
      if (info) out.set(g.id, info)
    }
    return out
  }, [depthBasis, active, artistLayer])

  const artistDepth = useMemo(() => {
    const out = new Map<string, DepthInfo>()
    if (!depthBasis || !artistLayer) return out
    for (const a of visibleArtists) {
      const info = depthBasis.project(a.position)
      if (info) out.set(a.mbid, info)
    }
    return out
  }, [depthBasis, artistLayer, visibleArtists])

  const relZoom = viewState ? viewState.zoom - fitZoom(clusterIndex) : 0
  const sheetOpen = selectedId != null || artist != null
  const playerOpen = playingId != null || playingMbid != null

  const placedLabels = useMemo(() => {
    if (!size || artistLayer) return []
    return placeLabels({
      candidates: active.filter((g) => mask[g.id] && g.id !== selectedId),
      reserved: selectedId != null && depthInfo.has(selectedId) ? [GENRES[selectedId]] : [],
      project: (g) => depthInfo.get(g.id),
      nameOf: (g) => g.name,
      sizeFor: (g) => labelSize(g.popularity),
      scoreOf: (g) => g.popularity,
      width: size.w,
      height: size.h,
      offsetFor: (g, p) => radius(g) * p.pxPerUnit + 3,
      maxLabels: Math.round(clamp(16 * 2 ** (relZoom * 1.4), 12, 260)),
      blocked: chromeBoxes(size.w, size.h, sheetOpen, playerOpen),
    })
  }, [active, artistLayer, mask, selectedId, depthInfo, size, relZoom, sheetOpen, playerOpen])

  const placedArtistLabels = useMemo(() => {
    if (!size || !artistLayer) return []
    const selected = artist?.mbid
    return placeLabels({
      candidates: visibleArtists.filter((a) => mask[a.genreId] && a.mbid !== selected),
      reserved: selected && artistDepth.has(selected) ? visibleArtists.filter((a) => a.mbid === selected) : [],
      project: (a) => artistDepth.get(a.mbid),
      nameOf: (a) => a.name,
      sizeFor: (a) => labelSize(a.popularity),
      scoreOf: (a) => a.users,
      width: size.w,
      height: size.h,
      offsetFor: (a, p) => artistRadius(a) * p.pxPerUnit + 3,
      maxLabels: Math.round(clamp(14 * 2 ** (relZoom * 1.4), 10, 180)),
      blocked: chromeBoxes(size.w, size.h, sheetOpen, playerOpen),
    })
  }, [visibleArtists, artistLayer, mask, artist, artistDepth, size, relZoom, sheetOpen, playerOpen])

  const textDefaults = {
    sizeUnits: 'pixels' as const,
    fontFamily: FONT,
    characterSet: 'auto' as const,
    fontSettings: { sdf: true },
    outlineColor: palette.outline,
    parameters: NO_DEPTH,
  }

  const flatten = (id: number) => depthInfo.get(id)?.flatten ?? 1
  const labelOffset = (g: Genre) => radius(g) * (depthInfo.get(g.id)?.pxPerUnit ?? 1) + 3
  const flattenArtist = (mbid: string) => artistDepth.get(mbid)?.flatten ?? 1
  const artistLabelOffset = (a: MappedArtist) => artistRadius(a) * (artistDepth.get(a.mbid)?.pxPerUnit ?? 1) + 3

  const depthAlpha = (id: number) => {
    const d = depthInfo.get(id)?.depth ?? 0
    return clamp(0.9 - d * 0.45, 0.28, 1)
  }
  const artistAlpha = (mbid: string) => {
    const d = artistDepth.get(mbid)?.depth ?? 0
    return clamp(0.9 - d * 0.45, 0.28, 1)
  }

  const hoverArtist = hover?.kind === 'artist' ? hover.artist : null
  const hoverGenre = hover?.kind === 'genre' ? hover.genre : null
  const selectedArtist = artistLayer ? visibleArtists.find((a) => a.mbid === artist?.mbid) : undefined

  const layers = [
    new ScatterplotLayer<Genre>({
      id: 'other-clusters',
      data: others,
      getPosition: (g) => POSITIONS_3D[g.id],
      getRadius: radius,
      radiusUnits: 'common',
      billboard: true,
      getFillColor: (g) => [...clusterRgb(g.cluster), palette.ghost] as RGBA,
      parameters: NO_DEPTH,
    }),

    !artistLayer &&
      playingId != null &&
      depthInfo.has(playingId) &&
      new ScatterplotLayer<Genre>({
        id: 'playing-halo',
        data: [GENRES[playingId]],
        getPosition: (g) => POSITIONS_3D[g.id],
        getRadius: (g) => radius(g) + 7,
        radiusUnits: 'common',
        billboard: true,
        getFillColor: (g) => [...clusterRgb(g.cluster), 70] as RGBA,
        parameters: NO_DEPTH,
      }),

    artistLayer &&
      playingMbid != null &&
      artistDepth.has(playingMbid) &&
      new ScatterplotLayer<MappedArtist>({
        id: 'playing-artist-halo',
        data: visibleArtists.filter((a) => a.mbid === playingMbid),
        getPosition: (a) => a.position,
        getRadius: (a) => artistRadius(a) + 7,
        radiusUnits: 'common',
        billboard: true,
        getFillColor: (a) => [...clusterRgb(a.cluster), 70] as RGBA,
        parameters: NO_DEPTH,
      }),

    !artistLayer &&
      new ScatterplotLayer<Genre>({
        id: 'genres',
        data: active,
        getPosition: (g) => POSITIONS_3D[g.id],
        getRadius: radius,
        radiusUnits: 'common',
        billboard: true,
        getFillColor: (g) =>
          [...clusterRgb(g.cluster), mask[g.id] ? palette.on * depthAlpha(g.id) : palette.off] as RGBA,
        pickable: true,
        updateTriggers: { getFillColor: [mask, depthInfo] },
      }),

    artistLayer &&
      new ScatterplotLayer<MappedArtist>({
        id: 'artists',
        data: visibleArtists,
        getPosition: (a) => a.position,
        getRadius: artistRadius,
        radiusUnits: 'common',
        billboard: true,
        getFillColor: (a) =>
          [...clusterRgb(a.cluster), mask[a.genreId] ? palette.on * artistAlpha(a.mbid) : palette.off] as RGBA,
        pickable: true,
        updateTriggers: { getFillColor: [mask, artistDepth] },
      }),

    !artistLayer &&
      new TextLayer<Genre>({
        ...textDefaults,
        id: 'genre-labels',
        data: placedLabels,
        getPosition: (g) => POSITIONS_3D[g.id],
        getText: (g) => g.name,
        getSize: (g) => labelSize(g.popularity) * flatten(g.id),
        getColor: (g) => [...palette.label.slice(0, 3), 255 * depthAlpha(g.id)] as RGBA,
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'bottom',
        getPixelOffset: (g) => [0, -labelOffset(g) * flatten(g.id)],
        fontWeight: 400,
        outlineWidth: 3,
        updateTriggers: { getSize: depthInfo, getPixelOffset: depthInfo, getColor: depthInfo },
      }),

    artistLayer &&
      new TextLayer<MappedArtist>({
        ...textDefaults,
        id: 'artist-labels',
        data: placedArtistLabels,
        getPosition: (a) => a.position,
        getText: (a) => a.name,
        getSize: (a) => labelSize(a.popularity) * flattenArtist(a.mbid),
        getColor: (a) => [...palette.label.slice(0, 3), 255 * artistAlpha(a.mbid)] as RGBA,
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'bottom',
        getPixelOffset: (a) => [0, -artistLabelOffset(a) * flattenArtist(a.mbid)],
        fontWeight: 400,
        outlineWidth: 3,
        updateTriggers: { getSize: artistDepth, getPixelOffset: artistDepth, getColor: artistDepth },
      }),

    !artistLayer &&
      new ScatterplotLayer<Genre>({
        id: 'rings',
        data: [...new Set([selectedId, hoverGenre?.id])]
          .filter((id): id is number => id != null && depthInfo.has(id))
          .map((id) => GENRES[id]),
        getPosition: (g) => POSITIONS_3D[g.id],
        getRadius: (g) => radius(g) + 2.5,
        radiusUnits: 'common',
        billboard: true,
        stroked: true,
        filled: false,
        getLineColor: (g) => [...palette.ring, g.id === selectedId ? 255 : 120] as RGBA,
        getLineWidth: 2,
        lineWidthUnits: 'pixels',
        parameters: NO_DEPTH,
        updateTriggers: { getLineColor: selectedId },
      }),

    artistLayer &&
      new ScatterplotLayer<MappedArtist>({
        id: 'artist-rings',
        data: [selectedArtist, hoverArtist].filter((a): a is MappedArtist => a != null && artistDepth.has(a.mbid)),
        getPosition: (a) => a.position,
        getRadius: (a) => artistRadius(a) + 2.5,
        radiusUnits: 'common',
        billboard: true,
        stroked: true,
        filled: false,
        getLineColor: (a) => [...palette.ring, a.mbid === artist?.mbid ? 255 : 120] as RGBA,
        getLineWidth: 2,
        lineWidthUnits: 'pixels',
        parameters: NO_DEPTH,
        updateTriggers: { getLineColor: artist?.mbid },
      }),

    !artistLayer &&
      selectedId != null &&
      depthInfo.has(selectedId) &&
      new TextLayer<Genre>({
        ...textDefaults,
        id: 'selected-label',
        data: [GENRES[selectedId]],
        getPosition: (g) => POSITIONS_3D[g.id],
        getText: (g) => g.name,
        getSize: (g) => 16 * flatten(g.id),
        getColor: palette.label,
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'bottom',
        getPixelOffset: (g) => [0, -(labelOffset(g) + 4) * flatten(g.id)],
        fontWeight: 600,
        outlineWidth: 5,
        updateTriggers: { getSize: depthInfo, getPixelOffset: depthInfo },
      }),

    artistLayer &&
      selectedArtist &&
      artistDepth.has(selectedArtist.mbid) &&
      new TextLayer<MappedArtist>({
        ...textDefaults,
        id: 'selected-artist-label',
        data: [selectedArtist],
        getPosition: (a) => a.position,
        getText: (a) => a.name,
        getSize: (a) => 16 * flattenArtist(a.mbid),
        getColor: palette.label,
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'bottom',
        getPixelOffset: (a) => [0, -(artistLabelOffset(a) + 4) * flattenArtist(a.mbid)],
        fontWeight: 600,
        outlineWidth: 5,
        updateTriggers: { getSize: artistDepth, getPixelOffset: artistDepth },
      }),
  ]

  const onHover = (info: PickingInfo<Genre | MappedArtist>) => {
    if (info.layer?.id === 'artists') {
      const a = info.object as MappedArtist | undefined
      setHover(a && mask[a.genreId] ? { kind: 'artist', artist: a, x: info.x, y: info.y } : null)
      return
    }
    const g = info.layer?.id === 'genres' ? (info.object as Genre | undefined) : undefined
    setHover(g && mask[g.id] ? { kind: 'genre', genre: g, x: info.x, y: info.y } : null)
  }

  const onClick = (info: PickingInfo<Genre | MappedArtist>) => {
    if (artistLayer) {
      const a = info.layer?.id === 'artists' ? (info.object as MappedArtist | undefined) : undefined
      if (a && mask[a.genreId])
        openArtist({ mbid: a.mbid, name: a.name, genreId: a.genreId, genreIds: a.genreIds, deezerId: a.deezerId }, 'map')
      else closeArtist()
      return
    }
    const g = info.layer?.id === 'genres' ? (info.object as Genre | undefined) : undefined
    select(g && mask[g.id] ? g.id : null)
  }

  const animateTo = (patch: Partial<ViewState>, duration = 450) =>
    setViewState((v) =>
      v && {
        ...v,
        ...patch,
        transitionDuration: duration,
        transitionInterpolator: INTERPOLATOR,
        transitionEasing: easeInOutCubic,
      },
    )

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden"
      style={{ background: 'radial-gradient(ellipse at 50% 45%, var(--bg-center) 0%, var(--bg) 78%)' }}
    >
      {viewState && (
        <DeckGL
          views={VIEW}
          viewState={viewState}
          onViewStateChange={({ viewState: next }) => setViewState(next as ViewState)}
          onInteractionStateChange={(s) => s.isDragging && dismissHint()}
          controller={{ scrollZoom: false, inertia: 400 }}
          layers={layers}
          onHover={onHover}
          onClick={onClick}
          getCursor={({ isDragging, isHovering }) => (isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab')}
        />
      )}

      {hover?.kind === 'genre' && hover.genre.id !== selectedId && <Tooltip genre={hover.genre} x={hover.x} y={hover.y} />}
      {hover?.kind === 'artist' && hover.artist.mbid !== artist?.mbid && (
        <ArtistTooltip artist={hover.artist} x={hover.x} y={hover.y} />
      )}

      <div className="glass absolute bottom-5 left-5 z-10 flex flex-col overflow-hidden rounded-full">
        <MapButton label="Zoom in" onClick={() => viewState && animateTo({ zoom: Math.min(viewState.zoom + 0.6, viewState.maxZoom) }, 250)}>
          <PlusIcon />
        </MapButton>
        <MapButton label="Zoom out" onClick={() => viewState && animateTo({ zoom: Math.max(viewState.zoom - 0.6, viewState.minZoom) }, 250)}>
          <MinusIcon />
        </MapButton>
        <div className="mx-2.5 h-px bg-hairline" />
        <MapButton label="Reset this cluster's view" onClick={() => animateTo(homeView(clusterIndex), 600)}>
          <RecenterIcon />
        </MapButton>
      </div>
    </div>
  )
}

function MapButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="pressable grid h-10 w-10 place-items-center text-fg-2 hover:bg-fill hover:text-fg"
    >
      {children}
    </button>
  )
}

function Tooltip({ genre, x, y }: { genre: Genre; x: number; y: number }) {
  return (
    <div className="glass pointer-events-none absolute z-10 rounded-xl px-3 py-2" style={{ left: x + 14, top: y + 14 }}>
      <div className="font-serif text-[17px] leading-tight tracking-[-0.012em]">{genre.name}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-fg-2">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: clusterColor(genre.cluster) }} />
        {CLUSTERS[genre.cluster].label} · {regionLabel(genre)}
        {genre.year != null && ` · ${decade(genre.year)}`}
      </div>
    </div>
  )
}

function formatListeners(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n.toLocaleString()
}

function ArtistTooltip({ artist, x, y }: { artist: MappedArtist; x: number; y: number }) {
  const genre = GENRES[artist.genreId]
  return (
    <div className="glass pointer-events-none absolute z-10 rounded-xl px-3 py-2" style={{ left: x + 14, top: y + 14 }}>
      <div className="font-serif text-[17px] leading-tight tracking-[-0.012em]">{artist.name}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[12px] text-fg-2">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: clusterColor(artist.cluster) }} />
        {genre.name}
        {artist.users > 0 && ` · ${formatListeners(artist.users)} listeners`}
      </div>
    </div>
  )
}
