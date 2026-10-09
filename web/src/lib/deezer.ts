import { CLUSTERS } from '../data/space'
import type { Genre, TopArtist } from '../types'

export interface Track {
  id: number
  title: string
  artist: string
  cover: string
  preview: string
  link: string
  artistMbid?: string
  deezerArtistId?: number
}

interface DeezerPlaylist {
  id: number
  nb_tracks: number
}

interface DeezerTrack {
  id: number
  title_short: string
  readable: boolean
  preview: string
  link: string
  artist: { id: number; name: string }
  album: { cover_medium: string }
}

const API = '/api/deezer'
const MIN_PLAYLIST_TRACKS = 10
const TRACKS_PER_GENRE = 8
/** Below this many artist tracks, top up from a playlist named after the genre. */
const MIN_ARTIST_TRACKS = 4
const LOOKUP_CONCURRENCY = 4

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`)
  if (!res.ok) throw new Error(`Deezer ${res.status}`)
  const body = await res.json()
  if (body.error) throw new Error(body.error.message ?? 'Deezer error')
  return body as T
}

/** "south african jazz" → ["south african jazz", "african jazz", "jazz", <cluster label>] */
function queriesFor(genre: Genre): string[] {
  const words = genre.name.split(/\s+/)
  const queries = words.map((_, i) => words.slice(i).join(' '))
  queries.push(CLUSTERS[genre.cluster].label)
  return [...new Set(queries)]
}

async function findPlaylist(genre: Genre): Promise<number | null> {
  for (const q of queriesFor(genre)) {
    const { data } = await get<{ data: DeezerPlaylist[] }>(
      `/search/playlist?q=${encodeURIComponent(q)}&limit=6`
    )
    const hit = data.find((p) => p.nb_tracks >= MIN_PLAYLIST_TRACKS)
    if (hit) return hit.id
  }
  return null
}

const toTrack = (t: DeezerTrack, artistMbid?: string): Track => ({
  id: t.id,
  title: t.title_short,
  artist: t.artist.name,
  cover: t.album.cover_medium,
  preview: t.preview,
  link: t.link,
  artistMbid,
  deezerArtistId: t.artist.id,
})

const playable = (t: DeezerTrack) => t.readable && Boolean(t.preview)

const simplify = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')

/** The artist's most popular playable track on Deezer. */
async function topTrackFor(artist: TopArtist): Promise<Track | null> {
  if (artist.deezerId) {
    const { data } = await get<{ data: DeezerTrack[] }>(`/artist/${artist.deezerId}/top?limit=5`)
    const hit = data.find(playable)
    if (hit) return toTrack(hit, artist.mbid)
  }
  const query = encodeURIComponent(`artist:"${artist.name.replace(/"/g, '')}"`)
  const { data } = await get<{ data: DeezerTrack[] }>(`/search?q=${query}&limit=10`)
  const name = simplify(artist.name)
  const hit = data.find((t) => playable(t) && simplify(t.artist.name) === name)
  return hit ? toTrack(hit, artist.mbid) : null
}

async function artistTracks(genre: Genre): Promise<Track[]> {
  const results: (Track | null)[] = []
  const queue = [...genre.topArtists]
  const worker = async () => {
    for (let artist = queue.shift(); artist; artist = queue.shift()) {
      results.push(await topTrackFor(artist).catch(() => null))
    }
  }
  await Promise.all(Array.from({ length: LOOKUP_CONCURRENCY }, worker))
  // Restore the genre's artist order, which the workers may have shuffled.
  const order = new Map(genre.topArtists.map((a, i) => [simplify(a.name), i]))
  return results
    .filter((t): t is Track => t != null)
    .sort((a, b) => (order.get(simplify(a.artist)) ?? 99) - (order.get(simplify(b.artist)) ?? 99))
}

async function playlistTracks(genre: Genre): Promise<Track[]> {
  const playlistId = await findPlaylist(genre)
  if (playlistId == null) return []
  const { data } = await get<{ data: DeezerTrack[] }>(`/playlist/${playlistId}/tracks?limit=60`)
  return data.filter(playable).map((t) => toTrack(t))
}

async function loadTracks(genre: Genre): Promise<Track[]> {
  let tracks = await artistTracks(genre)
  if (tracks.length < MIN_ARTIST_TRACKS) tracks = [...tracks, ...(await playlistTracks(genre).catch(() => []))]

  const seenArtists = new Set<string>()
  const seenTracks = new Set<number>()
  const byDeezer = new Map(genre.topArtists.filter((a) => a.deezerId && a.mbid).map((a) => [a.deezerId!, a.mbid]))
  const byName = new Map(genre.topArtists.filter((a) => a.mbid).map((a) => [simplify(a.name), a.mbid]))
  return tracks
    .filter((t) => {
      if (seenTracks.has(t.id) || seenArtists.has(t.artist)) return false
      seenTracks.add(t.id)
      seenArtists.add(t.artist)
      return true
    })
    .slice(0, TRACKS_PER_GENRE)
    .map((t) => ({
      ...t,
      artistMbid: (t.deezerArtistId != null ? byDeezer.get(t.deezerArtistId) : undefined) ?? byName.get(simplify(t.artist)) ?? t.artistMbid,
    }))
}

const cache = new Map<number, Promise<Track[]>>()

export interface DeezerArtist {
  id: number
  name: string
  picture_medium: string
}

export async function findDeezerArtist(name: string, deezerId?: number): Promise<DeezerArtist | null> {
  if (deezerId) {
    const a = await get<DeezerArtist>(`/artist/${deezerId}`).catch(() => null)
    if (a?.id) return a
  }
  const { data } = await get<{ data: DeezerArtist[] }>(`/search/artist?q=${encodeURIComponent(name)}&limit=8`)
  const exact = data.find((a) => simplify(a.name) === simplify(name))
  return exact ?? data[0] ?? null
}

export async function artistTopTracks(name: string, deezerId?: number, mbid?: string): Promise<Track[]> {
  const found = await findDeezerArtist(name, deezerId)
  if (!found) return []
  const { data } = await get<{ data: DeezerTrack[] }>(`/artist/${found.id}/top?limit=10`)
  return data.filter(playable).map((t) => toTrack(t, mbid)).slice(0, 8)
}

export function genreTracks(genre: Genre): Promise<Track[]> {
  let pending = cache.get(genre.id)
  if (!pending) {
    pending = loadTracks(genre)
    pending.catch(() => cache.delete(genre.id))
    cache.set(genre.id, pending)
  }
  return pending
}
