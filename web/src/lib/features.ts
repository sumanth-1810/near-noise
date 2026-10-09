const int = (v: number) => `${Math.round(v)}`

export const FEATURES = {
  popularity: { label: 'Popularity', min: 0, max: 100, step: 1, format: int },
  year: { label: 'Era', min: 1950, max: 2020, step: 1, format: int },
} as const

export const FILTER_KEYS = ['year', 'popularity'] as const
export type FilterKey = (typeof FILTER_KEYS)[number]

export const decade = (year: number) => `${Math.floor(year / 10) * 10}s`
