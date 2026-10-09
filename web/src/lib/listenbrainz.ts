export interface SimilarArtist {
  mbid: string
  name: string
  score: number
  users: number
}

interface LabsSimilar {
  artist_mbid: string
  name: string
  score: number
}

interface LbMeta {
  artist_mbid: string
  name: string
  area?: string
  begin_year?: number
  rels?: Record<string, string>
  tag?: { artist?: { tag: string; count: number; genre_mbid?: string }[] }
}

const LB = '/api/lb'
const LABS = '/api/lb-labs'
const SIMILAR_ALGO =
  'session_based_days_7500_session_300_contribution_5_threshold_10_limit_100_filter_True_skip_30'

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`ListenBrainz ${res.status}`)
  return res.json() as Promise<T>
}

export async function artistMeta(mbid: string): Promise<LbMeta | null> {
  const data = await getJson<LbMeta[]>(`${LB}/1/metadata/artist?artist_mbids=${mbid}&inc=tag`)
  return data[0] ?? null
}

export async function artistUsers(mbids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!mbids.length) return out
  const res = await getJson<{ artist_mbid: string; total_user_count: number | null }[]>(`${LB}/1/popularity/artist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artist_mbids: mbids }),
  })
  for (const row of res) out.set(row.artist_mbid, row.total_user_count ?? 0)
  return out
}

export async function similarArtists(mbid: string): Promise<SimilarArtist[]> {
  const rows = await getJson<LabsSimilar[] | { error?: string }>(
    `${LABS}/similar-artists/json?artist_mbids=${mbid}&algorithm=${SIMILAR_ALGO}`,
  )
  if (!Array.isArray(rows)) return []
  const list = rows.filter((r) => r.artist_mbid !== mbid).slice(0, 80)
  const users = await artistUsers(list.map((r) => r.artist_mbid))
  return list.map((r) => ({ mbid: r.artist_mbid, name: r.name, score: r.score, users: users.get(r.artist_mbid) ?? 0 }))
}

export function deezerIdFromRels(rels?: Record<string, string>) {
  for (const url of Object.values(rels ?? {})) {
    const m = /deezer\.com\/(?:\w+\/)?artist\/(\d+)/.exec(url)
    if (m) return Number(m[1])
  }
  return undefined
}

/**
 * Mix well-known (0) to lesser-known (1) without collapsing every artist
 * to the global charts. Similarity is squared so a mega-star with a weak
 * overlap cannot outrank someone people actually listen to with this artist.
 */
export function rankSimilar(list: SimilarArtist[], deep: number, count = 12): SimilarArtist[] {
  if (!list.length) return []
  const maxScore = Math.max(...list.map((a) => a.score), 1)
  const fame = 0.32 * (1 - 2 * Math.min(1, Math.max(0, deep)))
  const value = (a: SimilarArtist) => {
    const sim = a.score / maxScore
    return sim * sim * (1 + a.users) ** fame
  }
  return [...list].sort((a, b) => value(b) - value(a) || b.score - a.score).slice(0, count)
}
