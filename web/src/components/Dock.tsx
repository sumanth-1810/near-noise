import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type RefObject } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useArtistMap } from '../data/artistSpace'
import { GENRES, REGIONS } from '../data/atlas'
import { CLUSTERS } from '../data/space'
import { clusterColor } from '../lib/colors'
import { FEATURES, FILTER_KEYS } from '../lib/features'
import { useMatchMask } from '../lib/filter'
import { FADE, SPRING, SPRING_FAST } from '../lib/motion'
import { useAtlas } from '../store'
import { ShuffleIcon, SlidersIcon } from './icons'
import { NowPlaying } from './NowPlaying'
import { RangeSlider } from './RangeSlider'

export function Dock() {
  const s = useAtlas(
    useShallow((s) => ({
      regions: s.regions,
      ranges: s.ranges,
      clusterIndex: s.clusterIndex,
      mapLayer: s.mapLayer,
      goToCluster: s.goToCluster,
      focusOn: s.focusOn,
      openArtist: s.openArtist,
      resetFilters: s.resetFilters,
      hintDismissed: s.hintDismissed,
    })),
  )
  const { mask, count } = useMatchMask()
  const artists = useArtistMap()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const dockRef = useRef<HTMLDivElement>(null)

  const changedRanges = FILTER_KEYS.filter(
    (k) => s.ranges[k][0] !== FEATURES[k].min || s.ranges[k][1] !== FEATURES[k].max,
  ).length
  const hiddenFilterCount = s.regions.length + changedRanges
  const anyFilter = hiddenFilterCount > 0

  const surprise = () => {
    if (s.mapLayer === 'artists') {
      const matching = (artists?.byCluster[s.clusterIndex] ?? []).filter((a) => mask[a.genreId])
      const pick = matching[Math.floor(Math.random() * matching.length)]
      if (pick) s.openArtist({ mbid: pick.mbid, name: pick.name, genreId: pick.genreId, genreIds: pick.genreIds, deezerId: pick.deezerId }, 'map')
      return
    }
    const matching = GENRES.filter((g) => mask[g.id])
    if (matching.length) s.focusOn(matching[Math.floor(Math.random() * matching.length)].id)
  }

  return (
    <div className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2">
      <AnimatePresence mode="wait">
        {!s.hintDismissed && !anyFilter && !filtersOpen && (
          <motion.div
            key="hint"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={SPRING_FAST}
            className="glass rounded-full px-3.5 py-1.5 text-[13px] text-fg-2"
          >
            Scroll for the next cluster · Drag to rotate · Pinch to zoom
          </motion.div>
        )}
        {anyFilter && !filtersOpen && (
          <motion.div
            key="count"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={SPRING_FAST}
            className="glass flex items-center gap-3 rounded-full py-1 pl-3.5 pr-1 text-[13px]"
          >
            <span className="tabular-nums text-fg-2">
              <span className="font-medium text-fg">{count.toLocaleString()}</span> of {GENRES.length.toLocaleString()}{' '}
              genres
            </span>
            <button onClick={s.resetFilters} className="pressable rounded-full bg-fill px-2.5 py-1 font-medium hover:bg-fill-2">
              Clear
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={dockRef} className="relative">
        <AnimatePresence>
          {filtersOpen && (
            <FilterPopover
              anchor={dockRef}
              onClose={() => setFiltersOpen(false)}
              count={count}
              onClear={anyFilter ? s.resetFilters : undefined}
            />
          )}
        </AnimatePresence>
        <div className="glass flex items-center gap-1 rounded-full p-1.5">
          <NowPlaying />
          <div className="flex items-center" role="tablist" aria-label="Genre clusters">
            {CLUSTERS.map((c, i) => {
              const on = s.clusterIndex === i
              const color = clusterColor(i)
              return (
                <button
                  key={c.label}
                  role="tab"
                  aria-selected={on}
                  aria-label={c.label}
                  onClick={() => s.goToCluster(i)}
                  className="pressable group relative grid h-8 w-6 place-items-center rounded-full hover:bg-fill"
                >
                  <span
                    className="block rounded-full transition-all duration-200"
                    style={{
                      background: color,
                      width: on ? 14 : 10,
                      height: on ? 14 : 10,
                      boxShadow: on ? `0 0 0 3px var(--bg-center), 0 0 0 4.5px ${color}` : 'none',
                    }}
                  />
                  <span className="pointer-events-none absolute bottom-full mb-2.5 whitespace-nowrap rounded-lg bg-fg px-2 py-1 text-[12px] font-medium text-bg opacity-0 shadow-lg transition-opacity duration-100 group-hover:opacity-100">
                    {c.label}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="mx-1 h-5 w-px bg-hairline" />

          <button
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
            className={`pressable flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium ${
              filtersOpen ? 'bg-fill-2' : 'hover:bg-fill'
            }`}
          >
            <SlidersIcon />
            Filters
            {hiddenFilterCount > 0 && (
              <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent px-1 text-[11px] text-white">
                {hiddenFilterCount}
              </span>
            )}
          </button>

          <button
            onClick={surprise}
            aria-label="Surprise me"
            title="Surprise me"
            className="pressable grid h-8 w-8 place-items-center rounded-full hover:bg-fill"
          >
            <ShuffleIcon />
          </button>
        </div>
      </div>
    </div>
  )
}

interface FilterPopoverProps {
  anchor: RefObject<HTMLDivElement | null>
  onClose: () => void
  count: number
  onClear?: () => void
}

function FilterPopover({ anchor, onClose, count, onClear }: FilterPopoverProps) {
  const reduceMotion = useReducedMotion()
  const s = useAtlas(
    useShallow((s) => ({
      regions: s.regions,
      ranges: s.ranges,
      toggleRegion: s.toggleRegion,
      setRange: s.setRange,
    })),
  )

  useEffect(() => {
    const onPointer = (e: PointerEvent) => {
      if (!anchor.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [anchor, onClose])

  return (
    <motion.div
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 8 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 8 }}
      transition={reduceMotion ? FADE : SPRING}
      style={{ transformOrigin: '82% 100%' }}
      className="glass-heavy absolute bottom-full right-0 mb-3 w-80 rounded-[20px] p-4"
    >
      <div className="mb-2 text-[13px] font-medium">Region</div>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {REGIONS.map((r) => {
          const on = s.regions.includes(r)
          return (
            <button
              key={r}
              onClick={() => s.toggleRegion(r)}
              aria-pressed={on}
              className={`pressable rounded-full px-3 py-1.5 text-[13px] ${
                on ? 'bg-fg text-bg' : 'bg-fill text-fg hover:bg-fill-2'
              }`}
            >
              {r}
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-5">
        <RangeSlider
          {...FEATURES.year}
          value={s.ranges.year}
          onChange={(r) => s.setRange('year', r)}
          endLabels={['Before 1950', 'Now']}
        />
        <RangeSlider
          {...FEATURES.popularity}
          label="Popularity"
          value={s.ranges.popularity}
          onChange={(r) => s.setRange('popularity', r)}
          endLabels={['Niche', 'Mainstream']}
        />
      </div>

      <div className="mt-5 flex items-center justify-between border-t border-hairline pt-3 text-[13px]">
        <span className="tabular-nums text-fg-2">
          <span className="font-medium text-fg">{count.toLocaleString()}</span> of {GENRES.length.toLocaleString()} genres
        </span>
        {onClear && (
          <button onClick={onClear} className="pressable rounded-full px-2 py-1 font-medium text-accent hover:bg-fill">
            Clear all
          </button>
        )}
      </div>
    </motion.div>
  )
}
