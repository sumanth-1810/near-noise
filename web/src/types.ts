export interface TopArtist {
  name: string
  mbid?: string
  deezerId?: number
}

export interface Genre {
  id: number
  name: string
  cluster: number
  /** Regions with a real share of the genre's artists, strongest first. "Global" when none dominates. */
  regions: string[]
  /** Position within its cluster, centered on the cluster. */
  x: number
  y: number
  z: number
  /** Weighted median year the genre's artists started out. */
  year: number | null
  /** Percentile of listening among all genres, 1–100. */
  popularity: number
  artistCount: number
  /** Ids of the most similar genres, most similar first. */
  similar: number[]
  topArtists: TopArtist[]
}
