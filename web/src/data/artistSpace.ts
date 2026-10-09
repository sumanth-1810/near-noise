import { useEffect, useState } from 'react'
import { loadArtistIndex, type IndexedArtist } from './artists'
import { GENRES } from './atlas'
import { CLUSTERS, POSITIONS_3D, type Vec3 } from './space'

/** How many people to plot in a family so the cloud stays readable. */
export const ARTISTS_PER_CLUSTER = 140

export interface MappedArtist {
  mbid: string
  name: string
  users: number
  deezerId?: number
  /** Genre this placement sits on (the home in this family). */
  genreId: number
  /** Homes in up to three families, strongest first. */
  genreIds: number[]
  cluster: number
  position: Vec3
  /** 1–100 within the visible set of this cluster, for label size. */
  popularity: number
}

export interface ArtistMap {
  byCluster: MappedArtist[][]
  /** Strongest-family placement, for search. */
  byMbid: Map<string, MappedArtist>
  /** Every family this artist is plotted in. */
  homesByMbid: Map<string, MappedArtist[]>
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

/** Circle size on the artist map. Spacing uses the same size so neighbors don't overlap. */
export const artistDotRadius = (popularity: number) => 1.2 + (popularity / 100) ** 1.4 * 5.2

/** Clear world units kept between the edges of two artist circles. */
const EDGE_GAP = 14

/** Sunflower disc around a genre, mostly flat so names don't stack in the camera. */
function offsetAround(i: number, n: number, spread: number): Vec3 {
  if (n <= 1) return [0, 0, 0]
  const golden = Math.PI * (3 - Math.sqrt(5))
  const radius = spread * Math.sqrt((i + 0.5) / n)
  const theta = golden * i
  return [Math.cos(theta) * radius, ((i % 7) - 3) * 1.2, Math.sin(theta) * radius]
}

/**
 * Push a room's visible artists apart in the floor plane.
 * Each one starts near their home genre, then yields until the circles clear.
 */
function spreadApart(list: MappedArtist[]) {
  const groups = new Map<number, MappedArtist[]>()
  for (const artist of list) {
    const group = groups.get(artist.genreId)
    if (group) group.push(artist)
    else groups.set(artist.genreId, [artist])
  }
  for (const [genreId, group] of groups) {
    const pitch = group.reduce((sum, artist) => sum + artistDotRadius(artist.popularity) * 2 + EDGE_GAP, 0) / group.length
    const spread = Math.max(8, Math.sqrt(group.length) * pitch * 0.62)
    group.forEach((artist, i) => {
      artist.position = add(POSITIONS_3D[genreId], offsetAround(i, group.length, spread))
    })
  }

  const count = list.length
  const pos = list.map((artist) => [artist.position[0], artist.position[1], artist.position[2]] as Vec3)
  const rad = list.map((artist) => artistDotRadius(artist.popularity))

  for (let pass = 0; pass < 60; pass++) {
    let moved = false
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        let dx = pos[i][0] - pos[j][0]
        let dz = pos[i][2] - pos[j][2]
        let dist = Math.hypot(dx, dz)
        const min = rad[i] + rad[j] + EDGE_GAP
        if (dist >= min) continue
        moved = true
        if (dist < 1e-3) {
          const theta = i * 2.399963229728653
          dx = Math.cos(theta)
          dz = Math.sin(theta)
          dist = 1e-3
        }
        const push = (min - dist) * 0.5
        const ux = (dx / dist) * push
        const uz = (dz / dist) * push
        pos[i][0] += ux
        pos[i][2] += uz
        pos[j][0] -= ux
        pos[j][2] -= uz
      }
    }
    if (!moved) break
  }

  list.forEach((artist, i) => {
    artist.position = pos[i]
  })
}

function mapped(a: IndexedArtist, genreId: number, position: Vec3, popularity: number): MappedArtist {
  return {
    mbid: a.mbid,
    name: a.name,
    users: a.users,
    deezerId: a.deezerId,
    genreId,
    genreIds: a.genreIds,
    cluster: GENRES[genreId].cluster,
    position,
    popularity,
  }
}

let pending: Promise<ArtistMap> | null = null

export function loadArtistMap(): Promise<ArtistMap> {
  if (!pending) {
    pending = loadArtistIndex().then((index) => {
      const buckets: MappedArtist[][] = CLUSTERS.map(() => [])
      const homesByMbid = new Map<string, MappedArtist[]>()
      const byMbid = new Map<string, MappedArtist>()

      for (const artist of index) {
        const homes: MappedArtist[] = []
        for (const genreId of artist.genreIds) {
          const row = mapped(artist, genreId, POSITIONS_3D[genreId], 1)
          buckets[row.cluster].push(row)
          homes.push(row)
        }
        if (homes.length) {
          homesByMbid.set(artist.mbid, homes)
          byMbid.set(artist.mbid, homes[0])
        }
      }

      const byCluster = buckets.map((list) => {
        const top = [...list].sort((a, b) => b.users - a.users).slice(0, ARTISTS_PER_CLUSTER)
        const logMax = Math.log1p(top[0]?.users ?? 1)
        const logMin = Math.log1p(top[top.length - 1]?.users ?? 0)
        const span = logMax - logMin || 1
        for (const a of top) {
          a.popularity = Math.max(1, Math.round(((Math.log1p(a.users) - logMin) / span) * 100))
        }
        spreadApart(top)
        return top
      })

      return { byCluster, byMbid, homesByMbid }
    })
  }
  return pending
}

export function placementInCluster(map: ArtistMap, mbid: string, cluster: number): MappedArtist | undefined {
  return map.homesByMbid.get(mbid)?.find((a) => a.cluster === cluster)
}

export function useArtistMap() {
  const [data, setData] = useState<ArtistMap | null>(null)
  useEffect(() => {
    void loadArtistMap().then(setData)
  }, [])
  return data
}
