/**
 * Step 1: gather raw data from MusicBrainz and ListenBrainz into out/raw.json.
 * Every response is cached in cache/, so re-running is cheap and resumable.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { chunk, fetchJson, progress } from './http.ts'
import type { RawArtist, RawData, RawGenre } from './types.ts'

const MB = 'https://musicbrainz.org/ws/2'
const LB = 'https://api.listenbrainz.org/1'

/** MusicBrainz search pages (100 artists each) to read per genre. */
const SEARCH_PAGES = Number(process.env.SEARCH_PAGES ?? 1)
const SITEWIDE_RANGES = ['all_time', 'year', 'quarter', 'month']
const TOP_ARTISTS_PER_GENRE = 10

interface MbGenrePage {
  'genre-count': number
  genres: { id: string; name: string }[]
}

interface MbArtist {
  id: string
  name: string
  country?: string
  area?: { name: string }
  'life-span'?: { begin?: string }
  tags?: { name: string; count: number }[]
}

interface LbArtistMeta {
  artist_mbid: string
  name: string
  area?: string
  begin_year?: number
  rels?: Record<string, string>
  tag?: { artist?: { tag: string; count: number; genre_mbid?: string }[] }
}

async function fetchGenres(): Promise<RawGenre[]> {
  const first = await fetchJson<MbGenrePage>(`${MB}/genre/all?limit=100&offset=0&fmt=json`)
  const genres = [...first.genres]
  for (let offset = 100; offset < first['genre-count']; offset += 100) {
    const page = await fetchJson<MbGenrePage>(`${MB}/genre/all?limit=100&offset=${offset}&fmt=json`)
    genres.push(...page.genres)
  }
  return genres.map((g) => ({ mbid: g.id, name: g.name.toLowerCase() }))
}

function addArtist(artists: Map<string, RawArtist>, a: RawArtist) {
  const existing = artists.get(a.mbid)
  if (!existing) return artists.set(a.mbid, a)
  for (const [tag, count] of Object.entries(a.tags)) existing.tags[tag] = Math.max(existing.tags[tag] ?? 0, count)
  existing.country ??= a.country
  existing.area ??= a.area
  existing.beginYear ??= a.beginYear
}

function genreTags(tags: { name: string; count: number }[] | undefined, genreNames: Set<string>) {
  const out: Record<string, number> = {}
  for (const t of tags ?? []) {
    const name = t.name.toLowerCase()
    if (t.count > 0 && genreNames.has(name)) out[name] = t.count
  }
  return out
}

async function searchArtists(genres: RawGenre[], genreNames: Set<string>, artists: Map<string, RawArtist>) {
  const searchCounts: Record<string, number> = {}
  let done = 0
  for (const genre of genres) {
    const phrase = genre.name.replace(/(["\\])/g, '\\$1')
    for (let page = 0; page < SEARCH_PAGES; page++) {
      const query = encodeURIComponent(`tag:"${phrase}"`)
      const res = await fetchJson<{ count: number; artists: MbArtist[] }>(
        `${MB}/artist?query=${query}&limit=100&offset=${page * 100}&fmt=json`,
      )
      if (page === 0) searchCounts[genre.name] = res.count
      for (const a of res.artists) {
        addArtist(artists, {
          mbid: a.id,
          name: a.name,
          country: a.country,
          area: a.area?.name,
          beginYear: parseYear(a['life-span']?.begin),
          tags: genreTags(a.tags, genreNames),
        })
      }
      if ((page + 1) * 100 >= res.count) break
    }
    progress('MusicBrainz artist search', ++done, genres.length)
  }
  return searchCounts
}

function parseYear(date?: string) {
  const y = date ? Number(date.slice(0, 4)) : NaN
  return Number.isFinite(y) && y > 1000 ? y : undefined
}

async function lbMetadata(mbids: string[]): Promise<LbArtistMeta[]> {
  const out: LbArtistMeta[] = []
  const batches = chunk(mbids, 60)
  let done = 0
  for (const batch of batches) {
    out.push(...(await fetchJson<LbArtistMeta[]>(`${LB}/metadata/artist/?artist_mbids=${batch.join(',')}&inc=tag`)))
    progress('ListenBrainz metadata', ++done, batches.length)
  }
  return out
}

async function sitewideArtists(genreNames: Set<string>, artists: Map<string, RawArtist>) {
  const mbids = new Set<string>()
  for (const range of SITEWIDE_RANGES) {
    const res = await fetchJson<{ payload: { artists: { artist_mbid?: string }[] } }>(
      `${LB}/stats/sitewide/artists?count=1000&offset=0&range=${range}`,
    )
    for (const a of res.payload.artists) if (a.artist_mbid) mbids.add(a.artist_mbid)
  }
  const meta = await lbMetadata([...mbids])
  for (const m of meta) {
    addArtist(artists, {
      mbid: m.artist_mbid,
      name: m.name,
      area: m.area,
      beginYear: m.begin_year,
      tags: genreTags(
        m.tag?.artist?.map((t) => ({ name: t.tag, count: t.count })),
        genreNames,
      ),
      deezerId: deezerIdFrom(m.rels),
    })
  }
  return mbids.size
}

function deezerIdFrom(rels?: Record<string, string>) {
  for (const url of Object.values(rels ?? {})) {
    const m = /deezer\.com\/(?:\w+\/)?artist\/(\d+)/.exec(url)
    if (m) return Number(m[1])
  }
  return undefined
}

async function popularity(artists: Map<string, RawArtist>) {
  const tagged = [...artists.values()].filter((a) => Object.keys(a.tags).length > 0)
  const batches = chunk(
    tagged.map((a) => a.mbid),
    400,
  )
  let done = 0
  for (const batch of batches) {
    const res = await fetchJson<{ artist_mbid: string; total_listen_count: number | null; total_user_count: number | null }[]>(
      `${LB}/popularity/artist`,
      { artist_mbids: batch },
    )
    for (const r of res) {
      const a = artists.get(r.artist_mbid)
      if (!a) continue
      a.listens = r.total_listen_count ?? 0
      a.users = r.total_user_count ?? 0
    }
    progress('ListenBrainz popularity', ++done, batches.length)
  }
}

/** Deezer links for each genre's most-listened artists, so previews come from the genre's own artists. */
async function deezerLinks(genres: RawGenre[], artists: Map<string, RawArtist>) {
  const byGenre = new Map<string, { artist: RawArtist; relevance: number }[]>()
  for (const a of artists.values()) {
    const total = Object.values(a.tags).reduce((s, c) => s + c, 0)
    for (const [tag, count] of Object.entries(a.tags)) {
      if (!byGenre.has(tag)) byGenre.set(tag, [])
      byGenre.get(tag)!.push({ artist: a, relevance: (count / total) * (a.users ?? 0) })
    }
  }
  const wanted = new Set<string>()
  for (const g of genres) {
    const top = (byGenre.get(g.name) ?? []).filter((m) => m.relevance > 0).sort((a, b) => b.relevance - a.relevance)
    for (const { artist } of top.slice(0, TOP_ARTISTS_PER_GENRE)) if (artist.deezerId == null) wanted.add(artist.mbid)
  }
  const meta = await lbMetadata([...wanted])
  for (const m of meta) {
    const a = artists.get(m.artist_mbid)
    if (a) a.deezerId = deezerIdFrom(m.rels) ?? 0
  }
}

async function main() {
  console.log('MusicBrainz genres…')
  const genres = await fetchGenres()
  const genreNames = new Set(genres.map((g) => g.name))
  console.log(`${genres.length} genres`)

  const artists = new Map<string, RawArtist>()
  const limit = Number(process.env.GENRE_LIMIT ?? Infinity)
  const searchCounts = await searchArtists(genres.slice(0, limit), genreNames, artists)
  const sitewide = await sitewideArtists(genreNames, artists)
  console.log(`${artists.size} artists (${sitewide} from ListenBrainz top charts)`)

  await popularity(artists)
  await deezerLinks(genres, artists)

  const data: RawData = {
    fetchedAt: new Date().toISOString(),
    genres,
    searchCounts,
    artists: [...artists.values()].filter((a) => Object.keys(a.tags).length > 0),
  }
  await mkdir(new URL('../out/', import.meta.url), { recursive: true })
  await writeFile(new URL('../out/raw.json', import.meta.url), JSON.stringify(data))
  console.log(`Wrote out/raw.json with ${data.artists.length} tagged artists`)
}

await main()
