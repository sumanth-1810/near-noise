import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { GENRES } from '../data/atlas'
import { useAtlas } from '../store'
import { FEATURES, FILTER_KEYS } from './features'

/** 1 for genres that pass every active filter, 0 otherwise. Indexed by genre id. */
export function useMatchMask() {
  const { regions, ranges } = useAtlas(useShallow((s) => ({ regions: s.regions, ranges: s.ranges })))

  return useMemo(() => {
    const mask = new Uint8Array(GENRES.length)
    let count = 0
    for (const g of GENRES) {
      if (regions.length && !g.regions.some((r) => regions.includes(r))) continue
      const outside = FILTER_KEYS.some((k) => {
        const [lo, hi] = ranges[k]
        const v = g[k]
        // Genres without a known year only drop out once the era filter is narrowed.
        if (v == null) return lo !== FEATURES[k].min || hi !== FEATURES[k].max
        return (v < lo && lo !== FEATURES[k].min) || (v > hi && hi !== FEATURES[k].max)
      })
      if (outside) continue
      mask[g.id] = 1
      count++
    }
    return { mask, count }
  }, [regions, ranges])
}
