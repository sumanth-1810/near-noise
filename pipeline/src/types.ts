export interface RawGenre {
  mbid: string
  name: string
}

export interface RawArtist {
  mbid: string
  name: string
  /** ISO 3166-1 alpha-2, when MusicBrainz knows it. */
  country?: string
  /** Free-form area name (a country, region or city). */
  area?: string
  beginYear?: number
  /** Genre name → tag votes. Only official MusicBrainz genres with positive votes. */
  tags: Record<string, number>
  listens?: number
  users?: number
  /** 0 means "looked up, none found". */
  deezerId?: number
}

export interface RawData {
  fetchedAt: string
  genres: RawGenre[]
  searchCounts: Record<string, number>
  artists: RawArtist[]
}
