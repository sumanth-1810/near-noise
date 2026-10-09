import { create } from 'zustand'
import { GENRES } from './data/atlas'
import { FEATURES, FILTER_KEYS, type FilterKey } from './lib/features'

export type Range = [number, number]

export type MapLayer = 'genres' | 'artists'

export type CameraRequest =
  | { kind: 'cluster'; index: number; nonce: number }
  | { kind: 'genre'; id: number; nonce: number }
  | { kind: 'artist'; mbid: string; genreId?: number; nonce: number }

const defaultRanges = () =>
  Object.fromEntries(FILTER_KEYS.map((k) => [k, [FEATURES[k].min, FEATURES[k].max]])) as Record<FilterKey, Range>

export interface ArtistRef {
  mbid: string
  name: string
  genreId?: number
  /** Home genres in up to three families, strongest family first. */
  genreIds?: number[]
  deezerId?: number
}

function homeInCluster(artist: ArtistRef | null, cluster: number): number | undefined {
  if (!artist) return undefined
  const ids = artist.genreIds ?? (artist.genreId != null ? [artist.genreId] : [])
  return ids.find((id) => GENRES[id].cluster === cluster)
}

interface AtlasState {
  regions: string[]
  ranges: Record<FilterKey, Range>
  selectedId: number | null
  artist: ArtistRef | null
  artistTrail: ArtistRef[]
  clusterIndex: number
  mapLayer: MapLayer
  camera: CameraRequest | null
  hintDismissed: boolean

  toggleRegion: (region: string) => void
  setRange: (key: FilterKey, range: Range) => void
  select: (id: number | null) => void
  focusOn: (id: number) => void
  setMapLayer: (layer: MapLayer) => void
  openArtist: (artist: ArtistRef, from?: 'search' | 'similar' | 'genre' | 'map') => void
  jumpTrail: (index: number) => void
  closeArtist: () => void
  goToCluster: (index: number) => void
  dismissHint: () => void
  resetFilters: () => void
}

const toggle = (list: string[], item: string) =>
  list.includes(item) ? list.filter((x) => x !== item) : [...list, item]

let nonce = 0

/** Open on the cluster that holds the most-listened genre. */
const START_CLUSTER = GENRES.reduce((a, b) => (b.popularity > a.popularity ? b : a)).cluster

export const useAtlas = create<AtlasState>((set) => ({
  regions: [],
  ranges: defaultRanges(),
  selectedId: null,
  artist: null,
  artistTrail: [],
  clusterIndex: START_CLUSTER,
  mapLayer: 'genres',
  camera: null,
  hintDismissed: false,

  toggleRegion: (region) => set((s) => ({ regions: toggle(s.regions, region) })),
  setRange: (key, range) => set((s) => ({ ranges: { ...s.ranges, [key]: range } })),
  select: (selectedId) => set({ selectedId, artist: null, artistTrail: [] }),
  focusOn: (id) =>
    set({
      selectedId: id,
      artist: null,
      artistTrail: [],
      mapLayer: 'genres',
      clusterIndex: GENRES[id].cluster,
      camera: { kind: 'genre', id, nonce: ++nonce },
    }),
  setMapLayer: (mapLayer) =>
    set((s) => {
      if (mapLayer === s.mapLayer) return s
      const genreId = s.artist?.genreId ?? s.selectedId
      return {
        mapLayer,
        selectedId: mapLayer === 'artists' ? null : s.selectedId,
        camera:
          mapLayer === 'artists' && s.artist
            ? { kind: 'artist', mbid: s.artist.mbid, genreId: s.artist.genreId, nonce: ++nonce }
            : mapLayer === 'genres' && genreId != null
              ? { kind: 'genre', id: genreId, nonce: ++nonce }
              : s.camera,
      }
    }),
  openArtist: (artist, from = 'search') =>
    set((s) => {
      const trail =
        from === 'similar' && s.artist
          ? s.artist.mbid === artist.mbid
            ? s.artistTrail
            : [...s.artistTrail, artist]
          : [artist]
      const genreId = artist.genreId ?? s.selectedId
      const towardArtist = s.mapLayer === 'artists' || from === 'map'
      return {
        artist,
        artistTrail: trail,
        selectedId: towardArtist ? null : genreId,
        clusterIndex: genreId != null ? GENRES[genreId].cluster : s.clusterIndex,
        camera: towardArtist
          ? { kind: 'artist', mbid: artist.mbid, genreId: genreId ?? undefined, nonce: ++nonce }
          : genreId != null
            ? { kind: 'genre', id: genreId, nonce: ++nonce }
            : s.camera,
      }
    }),
  jumpTrail: (index) =>
    set((s) => {
      const artist = s.artistTrail[index]
      if (!artist) return s
      const genreId = artist.genreId ?? s.selectedId
      const towardArtist = s.mapLayer === 'artists'
      return {
        artist,
        artistTrail: s.artistTrail.slice(0, index + 1),
        selectedId: towardArtist ? null : genreId,
        clusterIndex: genreId != null ? GENRES[genreId].cluster : s.clusterIndex,
        camera: towardArtist
          ? { kind: 'artist', mbid: artist.mbid, genreId: genreId ?? undefined, nonce: ++nonce }
          : s.camera,
      }
    }),
  closeArtist: () => set({ artist: null, artistTrail: [] }),
  goToCluster: (index) =>
    set((s) => {
      const stay = s.mapLayer === 'artists' ? homeInCluster(s.artist, index) : undefined
      return {
        clusterIndex: index,
        selectedId: s.selectedId != null && GENRES[s.selectedId].cluster === index ? s.selectedId : null,
        artist: stay != null ? s.artist : null,
        artistTrail: stay != null ? s.artistTrail : [],
        camera:
          stay != null && s.artist
            ? { kind: 'artist', mbid: s.artist.mbid, genreId: stay, nonce: ++nonce }
            : { kind: 'cluster', index, nonce: ++nonce },
      }
    }),
  dismissHint: () => set({ hintDismissed: true }),
  resetFilters: () => set({ regions: [], ranges: defaultRanges() }),
}))
