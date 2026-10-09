/**
 * Step 2: turn out/raw.json into the atlas the website loads.
 *
 * Genres are similar when the same artists carry them (weighted by tag votes and listener counts).
 * That similarity drives everything: clusters (Louvain), 3D positions (UMAP), and "related genres".
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import Graph from 'graphology'
import louvain from 'graphology-communities-louvain'
import { UMAP } from 'umap-js'
import { regionOf, type Region } from './regions.ts'
import type { RawArtist, RawData } from './types.ts'

const MIN_ARTISTS = 5
const MIN_LINK = 0.03
const KNN = 10
const TARGET_CLUSTERS = Number(process.env.CLUSTERS ?? 22)
const MIN_CLUSTER_SIZE = 15
const CLUSTER_RADIUS = 140
const SIMILAR_COUNT = 8
/** A region counts for a genre when at least this share of its located artists come from there. */
const REGION_SHARE = Number(process.env.REGION_SHARE ?? 0.2)
const DOMINANT_SHARE = 0.6
const TOP_ARTISTS = 10
/** Artists in the instant search index; anyone else is found through a live search later. */
const SEARCH_INDEX_SIZE = 20000
/** An artist is plotted in up to this many families, ranked by tag votes. */
const MAX_ARTIST_CLUSTERS = 3
const ARTISTS_OUTPUT = new URL('../../web/public/data/artists.json', import.meta.url)
/** MusicBrainz genres that aren't music. */
const NOT_MUSIC = new Set([
  'comedy', 'standup comedy', 'sketch comedy', 'spoken word', 'poetry', 'jazz poetry', 'beat poetry', 'slam poetry',
  'punk poetry', 'non-music', 'prank calls', 'nature sounds', 'asmr', 'audiobook', 'audio drama', 'radio drama',
  'field recording', 'sound effects', 'interview', 'podcast', 'guided meditation', 'stand-up comedy', 'futurism',
  'sound poetry', 'lecture', 'speech', 'educational', "children's music", 'christmas music', 'holiday',
])
const OUTPUT = new URL('../../web/src/data/atlas.json', import.meta.url)

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Vec3 = [number, number, number]

interface Membership {
  artist: RawArtist
  /** Share of the artist's genre votes that went to this genre. */
  share: number
  weight: number
}

interface GenreStats {
  name: string
  members: Membership[]
  score: number
}

const UPPER = new Set(['r&b', 'edm', 'idm', 'uk', 'mpb', 'dj', 'ebm', 'nwobhm', 'aor', 'lo-fi'])
const SPECIAL: Record<string, string> = { 'hip hop': 'Hip-Hop', 'k-pop': 'K-Pop', 'j-pop': 'J-Pop', 'c-pop': 'C-Pop' }
/** Cluster names that read better as the broader family than as their central genre. */
const CLUSTER_NAMES: Record<string, string> = { house: 'Electronic', samba: 'Brazilian', 'hardcore techno': 'Hardcore', 'indie rock': 'Rock' }

function titleCase(name: string) {
  if (SPECIAL[name]) return SPECIAL[name]
  return name
    .split(' ')
    .map((w) => (UPPER.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

function genreStats(artists: RawArtist[]): GenreStats[] {
  const byName = new Map<string, GenreStats>()
  for (const artist of artists) {
    const users = artist.users ?? 0
    if (users <= 0) continue
    const total = Object.values(artist.tags).reduce((s, c) => s + c, 0)
    for (const [name, count] of Object.entries(artist.tags)) {
      const share = count / total
      let g = byName.get(name)
      if (!g) byName.set(name, (g = { name, members: [], score: 0 }))
      g.members.push({ artist, share, weight: share * Math.log1p(users) })
      g.score += share * users
    }
  }
  return [...byName.values()].filter((g) => g.members.length >= MIN_ARTISTS && !NOT_MUSIC.has(g.name))
}

/** Cosine similarity between genres' artist vectors, as a dense N×N matrix. */
function similarity(genres: GenreStats[]) {
  const n = genres.length
  const S = new Float64Array(n * n)
  const perArtist = new Map<string, [number, number][]>()
  genres.forEach((g, i) => {
    for (const m of g.members) {
      const list = perArtist.get(m.artist.mbid) ?? []
      list.push([i, m.weight])
      perArtist.set(m.artist.mbid, list)
    }
  })
  for (const list of perArtist.values()) {
    for (const [i, wi] of list) for (const [j, wj] of list) S[i * n + j] += wi * wj
  }
  const norm = Array.from({ length: n }, (_, i) => Math.sqrt(S[i * n + i]))
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) S[i * n + j] /= norm[i] * norm[j] || 1
  return S
}

function subMatrix(S: Float64Array, n: number, keep: number[]) {
  const m = keep.length
  const out = new Float64Array(m * m)
  keep.forEach((a, i) => keep.forEach((b, j) => (out[i * m + j] = S[a * n + b])))
  return out
}

function embed(S: Float64Array, n: number, seed: number, minDist = 0.45): Vec3[] {
  const umap = new UMAP({
    nComponents: 3,
    nNeighbors: Math.min(15, n - 1),
    minDist,
    spread: 1.2,
    random: mulberry32(seed),
    distanceFn: (a, b) => 1 - S[a[0] * n + b[0]],
  })
  return umap.fit(Array.from({ length: n }, (_, i) => [i])) as Vec3[]
}

function cluster(S: Float64Array, n: number): number[] {
  const graph = new Graph({ type: 'undirected' })
  for (let i = 0; i < n; i++) graph.addNode(i)
  for (let i = 0; i < n; i++) {
    const neighbors = Array.from({ length: n }, (_, j) => j)
      .filter((j) => j !== i && S[i * n + j] > 0)
      .sort((a, b) => S[i * n + b] - S[i * n + a])
      .slice(0, KNN)
    for (const j of neighbors) if (!graph.hasEdge(i, j)) graph.addEdge(i, j, { weight: S[i * n + j] })
  }

  let best: { assignment: number[]; error: number } | null = null
  for (let resolution = 0.3; resolution <= 2.0; resolution += 0.05) {
    const communities = louvain(graph, { resolution, rng: mulberry32(7), getEdgeWeight: 'weight' })
    const assignment = Array.from({ length: n }, (_, i) => communities[i])
    const sizes = new Map<number, number>()
    for (const c of assignment) sizes.set(c, (sizes.get(c) ?? 0) + 1)
    const big = [...sizes.values()].filter((s) => s >= MIN_CLUSTER_SIZE).length
    const error = Math.abs(big - TARGET_CLUSTERS)
    if (!best || error < best.error) best = { assignment, error }
  }
  const assignment = best!.assignment

  const sizes = new Map<number, number>()
  for (const c of assignment) sizes.set(c, (sizes.get(c) ?? 0) + 1)
  const isBig = (c: number) => (sizes.get(c) ?? 0) >= MIN_CLUSTER_SIZE
  return assignment.map((c, i) => {
    if (isBig(c)) return c
    const pull = new Map<number, number>()
    for (let j = 0; j < n; j++) if (isBig(assignment[j])) pull.set(assignment[j], (pull.get(assignment[j]) ?? 0) + S[i * n + j])
    return [...pull.entries()].sort((a, b) => b[1] - a[1])[0][0]
  })
}

/** How strongly an artist represents a genre: big artists only count if the genre is a real part of their tags. */
const relevance = (m: Membership) => m.share * (m.artist.users ?? 0)

function weightedMedian(values: [number, number][]) {
  if (!values.length) return undefined
  values.sort((a, b) => a[0] - b[0])
  const half = values.reduce((s, [, w]) => s + w, 0) / 2
  let acc = 0
  for (const [v, w] of values) if ((acc += w) >= half) return v
  return values[values.length - 1][0]
}

/**
 * Every region that makes up a real share of a genre's artists, strongest first.
 * "Global" is added when no single region dominates.
 */
function regionsFor(members: Membership[]): string[] {
  const votes = new Map<Region, number>()
  let total = 0
  let known = 0
  for (const m of members) {
    total += m.weight
    const region = regionOf(m.artist.country, m.artist.area)
    if (!region) continue
    known += m.weight
    votes.set(region, (votes.get(region) ?? 0) + m.weight)
  }
  if (known < total * 0.3) return ['Global']
  const ranked = [...votes.entries()].sort((a, b) => b[1] - a[1])
  const regions: string[] = ranked.filter(([, w]) => w >= known * REGION_SHARE).map(([r]) => r)
  if (ranked[0][1] < known * DOMINANT_SHARE) regions.push('Global')
  return regions
}

function normalizeCluster(points: Vec3[]): Vec3[] {
  const c = points.reduce<Vec3>((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]).map((v) => v / points.length) as Vec3
  const centered = points.map((p) => [p[0] - c[0], p[1] - c[1], p[2] - c[2]] as Vec3)
  const radii = centered.map((p) => Math.hypot(...p)).sort((a, b) => a - b)
  const scale = CLUSTER_RADIUS / (radii[Math.floor(radii.length * 0.95)] || 1)
  return centered.map((p) => p.map((v) => Math.round(v * scale * 10) / 10) as Vec3)
}

async function main() {
  const raw = JSON.parse(await readFile(new URL('../out/raw.json', import.meta.url), 'utf8')) as RawData
  let genres = genreStats(raw.artists)
  let S = similarity(genres)
  let n = genres.length

  const linked = genres.map((_, i) => i).filter((i) => genres.some((_, j) => j !== i && S[i * n + j] >= MIN_LINK))
  S = subMatrix(S, n, linked)
  genres = linked.map((i) => genres[i])
  n = genres.length
  console.log(`${n} genres with at least ${MIN_ARTISTS} listened artists`)

  const global = embed(S, n, 1)
  const assignment = cluster(S, n)
  const clusterIds = [...new Set(assignment)]
  console.log(`${clusterIds.length} clusters`)

  const centroidOf = (c: number) => {
    const pts = global.filter((_, i) => assignment[i] === c)
    return pts.reduce<Vec3>((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]).map((v) => v / pts.length) as Vec3
  }
  const centroids = new Map(clusterIds.map((c) => [c, centroidOf(c)]))
  const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

  // Order clusters as a short path through similarity space, so scrolling moves between neighbors.
  const greedyPath = (start: number) => {
    const path = [start]
    let length = 0
    while (path.length < clusterIds.length) {
      const last = centroids.get(path[path.length - 1])!
      const next = clusterIds
        .filter((c) => !path.includes(c))
        .reduce((a, b) => (dist(centroids.get(a)!, last) < dist(centroids.get(b)!, last) ? a : b))
      length += dist(centroids.get(next)!, last)
      path.push(next)
    }
    return { path, length }
  }
  const order = clusterIds.map(greedyPath).reduce((a, b) => (b.length < a.length ? b : a)).path

  const positions: Vec3[] = new Array(n)
  for (const c of order) {
    const idx = genres.map((_, i) => i).filter((i) => assignment[i] === c)
    const local = idx.length >= 8 ? embed(subMatrix(S, n, idx), idx.length, 3 + c, 0.6) : idx.map((i) => global[i])
    normalizeCluster(local).forEach((p, k) => (positions[idx[k]] = p))
  }

  const ranked = [...genres.keys()].sort((a, b) => genres[a].score - genres[b].score)
  const popularity = new Array<number>(n)
  ranked.forEach((gi, rank) => (popularity[gi] = Math.max(1, Math.round(((rank + 1) / n) * 100))))

  // Final ordering: by cluster journey, then most popular first. Ids are positions in this list.
  const finalOrder = order.flatMap((c) => genres.map((_, i) => i).filter((i) => assignment[i] === c).sort((a, b) => genres[b].score - genres[a].score))
  const newId = new Map(finalOrder.map((gi, id) => [gi, id]))

  // Name each cluster after whichever of its most popular genres best represents the rest of it.
  const clusters = order.map((c) => {
    const members = finalOrder.filter((i) => assignment[i] === c)
    const centrality = (i: number) => members.reduce((sum, j) => sum + S[i * n + j], 0)
    const label = members.slice(0, 5).reduce((a, b) => (centrality(b) > centrality(a) ? b : a))
    return { label: CLUSTER_NAMES[genres[label].name] ?? titleCase(genres[label].name), size: members.length }
  })

  const out = finalOrder.map((gi) => {
    const g = genres[gi]
    const years = g.members.filter((m) => m.artist.beginYear).map((m) => [m.artist.beginYear!, m.weight] as [number, number])
    const similar = [...genres.keys()]
      .filter((j) => j !== gi)
      .sort((a, b) => S[gi * n + b] - S[gi * n + a])
      .slice(0, SIMILAR_COUNT)
      .map((j) => newId.get(j)!)
    const top = [...g.members]
      .sort((a, b) => relevance(b) - relevance(a))
      .slice(0, TOP_ARTISTS)
      .map((m) => [m.artist.name, m.artist.mbid, m.artist.deezerId || 0])
    const [x, y, z] = positions[gi]
    return {
      name: g.name,
      cluster: order.indexOf(assignment[gi]),
      regions: regionsFor(g.members),
      x,
      y,
      z,
      year: weightedMedian(years) ?? null,
      popularity: popularity[gi],
      artists: g.members.length,
      similar,
      top,
    }
  })

  const atlasIdByName = new Map(finalOrder.map((gi, id) => [genres[gi].name, id]))
  const clusterOf = out.map((g) => g.cluster)

  /** Strongest genre in each of the artist's top clusters, strongest family first. */
  const genreHomes = (tags: Record<string, number>) => {
    const clusterVotes = new Map<number, number>()
    const bestInCluster = new Map<number, { genreId: number; votes: number }>()
    for (const [tag, votes] of Object.entries(tags)) {
      const genreId = atlasIdByName.get(tag)
      if (genreId == null) continue
      const cluster = clusterOf[genreId]
      clusterVotes.set(cluster, (clusterVotes.get(cluster) ?? 0) + votes)
      const best = bestInCluster.get(cluster)
      if (!best || votes > best.votes) bestInCluster.set(cluster, { genreId, votes })
    }
    return [...clusterVotes.entries()]
      .sort((a, b) => b[1] - a[1] || bestInCluster.get(b[0])!.votes - bestInCluster.get(a[0])!.votes)
      .slice(0, MAX_ARTIST_CLUSTERS)
      .map(([cluster]) => bestInCluster.get(cluster)!.genreId)
  }

  const searchIndex = raw.artists
    .filter((a) => (a.users ?? 0) > 0)
    .sort((a, b) => (b.users ?? 0) - (a.users ?? 0))
    .slice(0, SEARCH_INDEX_SIZE)
    .map((a) => [a.name, a.mbid, a.users ?? 0, a.deezerId || 0, genreHomes(a.tags)])

  await mkdir(new URL('.', ARTISTS_OUTPUT), { recursive: true })
  await writeFile(ARTISTS_OUTPUT, JSON.stringify(searchIndex))
  await writeFile(
    OUTPUT,
    JSON.stringify({ generatedAt: new Date().toISOString(), fetchedAt: raw.fetchedAt, clusters, genres: out }),
  )
  console.log('Clusters:', clusters.map((c) => `${c.label} (${c.size})`).join(', '))
  console.log(`Wrote ${fileURLToPath(OUTPUT)}`)
  console.log(`Wrote ${fileURLToPath(ARTISTS_OUTPUT)} (${searchIndex.length} artists)`)
}

await main()
