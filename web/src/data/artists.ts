import { fold } from '../lib/fold'

export interface IndexedArtist {
  name: string
  /** Plain spelling used for search: no accents, case, or punctuation. */
  folded: string
  mbid: string
  users: number
  deezerId?: number
  /** Home genre in the strongest family. */
  genreId?: number
  /** Home genres in up to three families, strongest family first. */
  genreIds: number[]
}

/** Current rows store genre homes as an array; older files stored a single id. */
type Row = [string, string, number, number, number | number[]]

let loaded: Promise<IndexedArtist[]> | null = null
let byMbid: Map<string, IndexedArtist> | null = null

/** A loaded index entry, once the search file has arrived. */
export function indexedArtist(mbid: string): IndexedArtist | undefined {
  return byMbid?.get(mbid)
}

function homesFrom(value: number | number[]): number[] {
  if (Array.isArray(value)) return value.filter((id) => id >= 0)
  return value >= 0 ? [value] : []
}

export function loadArtistIndex(): Promise<IndexedArtist[]> {
  if (!loaded) {
    loaded = fetch('/data/artists.json')
      .then((res) => {
        if (!res.ok) throw new Error('Could not load artists')
        return res.json() as Promise<Row[]>
      })
      .then((rows) => {
        const index = rows.map(([name, mbid, users, deezerId, homes]) => {
          const genreIds = homesFrom(homes)
          return {
            name,
            folded: fold(name),
            mbid,
            users,
            deezerId: deezerId || undefined,
            genreId: genreIds[0],
            genreIds,
          }
        })
        byMbid = new Map(index.map((a) => [a.mbid, a]))
        return index
      })
  }
  return loaded
}

export function searchArtists(index: IndexedArtist[], query: string, limit = 6): IndexedArtist[] {
  const q = fold(query)
  if (!q) return []
  return index
    .filter((a) => a.folded.includes(q))
    .sort((a, b) => Number(b.folded.startsWith(q)) - Number(a.folded.startsWith(q)) || b.users - a.users)
    .slice(0, limit)
}
