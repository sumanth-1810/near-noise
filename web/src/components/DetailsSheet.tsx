import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { indexedArtist } from '../data/artists'
import { GENRES, regionLabel } from '../data/atlas'
import { CLUSTERS } from '../data/space'
import { clusterColor } from '../lib/colors'
import { genreTracks, type Track } from '../lib/deezer'
import { decade } from '../lib/features'
import { FADE, SPRING } from '../lib/motion'
import { usePlayer } from '../player'
import { useAtlas } from '../store'
import type { Genre } from '../types'
import { ArtistDetails } from './ArtistSheet'
import { ChevronIcon, CloseIcon, PauseIcon, PlayIcon } from './icons'

const DISMISS_DISTANCE = 120
const DISMISS_VELOCITY = 500

export function DetailsSheet() {
  const reduceMotion = useReducedMotion()
  const { selectedId, select, artist, closeArtist } = useAtlas(
    useShallow((s) => ({ selectedId: s.selectedId, select: s.select, artist: s.artist, closeArtist: s.closeArtist })),
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.activeElement?.tagName === 'INPUT') return
      if (useAtlas.getState().artist) closeArtist()
      else select(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [select, closeArtist])

  const genre = selectedId != null ? GENRES[selectedId] : null
  const open = artist != null || genre != null
  const onDismiss = () => (artist ? closeArtist() : select(null))
  const hidden = reduceMotion ? { opacity: 0 } : { x: 'calc(100% + 24px)' }
  const shown = reduceMotion ? { opacity: 1 } : { x: 0 }

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          key="sheet"
          initial={hidden}
          animate={shown}
          exit={hidden}
          transition={reduceMotion ? FADE : SPRING}
          drag={reduceMotion ? false : 'x'}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={{ left: 0.04, right: 0.6 }}
          onDragEnd={(_, info) => {
            if (info.offset.x > DISMISS_DISTANCE || info.velocity.x > DISMISS_VELOCITY) onDismiss()
          }}
          className="glass-heavy absolute bottom-4 right-4 top-4 z-30 flex w-[22rem] flex-col overflow-hidden rounded-[24px]"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={artist ? artist.mbid : `genre-${genre!.id}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={FADE}
              className="flex min-h-0 flex-1 flex-col"
            >
              {artist ? (
                <ArtistDetails artist={artist} onClose={closeArtist} />
              ) : (
                <GenreDetails genre={genre!} onClose={() => select(null)} />
              )}
            </motion.div>
          </AnimatePresence>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

function GenreDetails({ genre, onClose }: { genre: Genre; onClose: () => void }) {
  const focusOn = useAtlas((s) => s.focusOn)
  const color = clusterColor(genre.cluster)
  const related = genre.similar.map((id) => GENRES[id])

  return (
    <>
      <header
        className="relative shrink-0 px-6 pb-5 pt-6"
        style={{ background: `radial-gradient(140% 100% at 0% 0%, ${color}40, transparent 70%)` }}
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="pressable absolute right-4 top-4 grid h-7 w-7 place-items-center rounded-full bg-fill text-fg-2 hover:bg-fill-2 hover:text-fg"
        >
          <CloseIcon width={14} height={14} />
        </button>
        <div className="flex items-center gap-1 text-[13px] text-fg-2">
          <span className="mr-1 h-2 w-2 rounded-full" style={{ background: color }} />
          {CLUSTERS[genre.cluster].label}
          <ChevronIcon width={12} height={12} className="text-fg-3" />
          {regionLabel(genre)}
        </div>
        <h2 className="mt-2 pr-8 font-serif text-[34px] leading-[1.02] tracking-[-0.022em]">{genre.name}</h2>

        <dl className="mt-5 flex gap-7">
          <Stat label="Popularity" value={String(genre.popularity)} />
          <Stat label="Era" value={genre.year != null ? decade(genre.year) : '—'} />
          <Stat label="Artists" value={genre.artistCount.toLocaleString()} />
        </dl>
      </header>

      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto px-6 pb-6 pt-1">
        <Listen genre={genre} />

        <section>
          <h3 className="mb-1.5 font-serif text-[20px] tracking-[-0.012em]">Related</h3>
          <ul className="-mx-2">
            {related.map((g) => (
              <li key={g.id}>
                <button
                  onClick={() => focusOn(g.id)}
                  className="pressable flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left text-[14px] hover:bg-fill"
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: clusterColor(g.cluster) }} />
                  <span className="min-w-0 flex-1 truncate">{g.name}</span>
                  <span className="shrink-0 text-[12px] text-fg-3">{CLUSTERS[g.cluster].label}</span>
                  <ChevronIcon width={12} height={12} className="shrink-0 text-fg-3" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}

type TracksState = { genreId: number; tracks: Track[] | null; failed: boolean }

function useGenreTracks(genre: Genre) {
  const [state, setState] = useState<TracksState>({ genreId: genre.id, tracks: null, failed: false })
  useEffect(() => {
    let live = true
    genreTracks(genre).then(
      (tracks) => live && setState({ genreId: genre.id, tracks, failed: false }),
      () => live && setState({ genreId: genre.id, tracks: null, failed: true }),
    )
    return () => {
      live = false
    }
  }, [genre])
  return state.genreId === genre.id ? state : { genreId: genre.id, tracks: null, failed: false }
}

function Listen({ genre }: { genre: Genre }) {
  const openArtist = useAtlas((s) => s.openArtist)
  const player = usePlayer(
    useShallow((s) => ({
      source: s.source,
      index: s.index,
      status: s.status,
      progress: s.progress,
      playGenre: s.playGenre,
      toggle: s.toggle,
    })),
  )
  const { tracks, failed } = useGenreTracks(genre)
  const isCurrent = player.source?.kind === 'genre' && player.source.id === genre.id
  const playing = isCurrent && player.status === 'playing'
  const loading = isCurrent && player.status === 'loading'
  const unavailable = failed || (tracks != null && tracks.length === 0)

  const onPrimary = () => (isCurrent && (playing || player.status === 'paused') ? player.toggle() : player.playGenre(genre.id))

  return (
    <section className="flex flex-col gap-3">
      <button
        onClick={onPrimary}
        disabled={unavailable}
        className="pressable flex h-10 items-center justify-center gap-2 rounded-full bg-fg text-[14px] font-medium text-bg hover:opacity-90 disabled:bg-fill disabled:text-fg-3 disabled:active:scale-100"
      >
        {playing ? <PauseIcon width={13} height={13} /> : <PlayIcon width={13} height={13} />}
        {unavailable ? 'No previews found' : playing ? 'Pause' : loading ? 'Loading…' : isCurrent ? 'Resume' : 'Listen'}
      </button>

      {tracks == null && !failed && (
        <ul className="-mx-2 flex flex-col">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="flex items-center gap-3 px-2 py-1.5">
              <span className="h-9 w-9 shrink-0 animate-pulse rounded-md bg-fill-2" />
              <span className="flex flex-1 flex-col gap-1.5">
                <span className="h-2.5 w-3/5 animate-pulse rounded-full bg-fill-2" />
                <span className="h-2 w-2/5 animate-pulse rounded-full bg-fill" />
              </span>
            </li>
          ))}
        </ul>
      )}

      {tracks != null && tracks.length > 0 && (
        <>
          <ul className="-mx-2 flex flex-col">
            {tracks.map((t, i) => {
              const current = isCurrent && player.index === i && player.status !== 'idle'
              return (
                <li key={t.id} className={`flex items-center rounded-xl ${current ? 'bg-fill' : ''}`}>
                  <button
                    onClick={() => (current ? player.toggle() : player.playGenre(genre.id, i))}
                    className="pressable group flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-fill"
                  >
                    <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md bg-fill-2">
                      <img src={t.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
                      <span
                        className={`absolute inset-0 grid place-items-center bg-black/35 text-white transition-opacity duration-150 ${
                          current ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}
                      >
                        {current && player.status === 'playing' ? (
                          <PauseIcon width={12} height={12} />
                        ) : (
                          <PlayIcon width={12} height={12} />
                        )}
                      </span>
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[14px] leading-snug">{t.title}</span>
                      {current && (
                        <span className="mt-1 h-0.5 overflow-hidden rounded-full bg-fill-2">
                          <span
                            className="block h-full rounded-full bg-fg transition-[width] duration-300 ease-linear"
                            style={{ width: `${player.progress * 100}%` }}
                          />
                        </span>
                      )}
                    </span>
                  </button>
                  {t.artistMbid ? (
                    <button
                      onClick={() => {
                        const known = indexedArtist(t.artistMbid!)
                        openArtist(
                          {
                            mbid: t.artistMbid!,
                            name: t.artist,
                            genreId: genre.id,
                            genreIds: known?.genreIds ?? [genre.id],
                            deezerId: known?.deezerId,
                          },
                          'genre',
                        )
                      }}
                      className="pressable mr-2 max-w-[7.5rem] shrink-0 truncate py-1 text-right text-[12px] text-fg-2 hover:text-fg hover:underline"
                    >
                      {t.artist}
                    </button>
                  ) : (
                    <span className="mr-2 max-w-[7.5rem] shrink-0 truncate py-1 text-right text-[12px] text-fg-2">{t.artist}</span>
                  )}
                </li>
              )
            })}
          </ul>
          <p className="text-[11px] text-fg-3">30-second previews</p>
        </>
      )}
    </section>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dd className="font-serif text-[24px] leading-tight tabular-nums tracking-[-0.015em]">{value}</dd>
      <dt className="text-[12px] text-fg-2">{label}</dt>
    </div>
  )
}
