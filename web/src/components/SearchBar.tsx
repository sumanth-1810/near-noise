import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { GENRES } from '../data/atlas'
import { indexedArtist, loadArtistIndex, searchArtists, type IndexedArtist } from '../data/artists'
import { CLUSTERS } from '../data/space'
import { clusterColor } from '../lib/colors'
import { fold } from '../lib/fold'
import { SPRING_FAST } from '../lib/motion'
import { useAtlas } from '../store'
import type { Genre } from '../types'
import { SearchIcon } from './icons'

type Hit = { kind: 'genre'; genre: Genre } | { kind: 'artist'; artist: IndexedArtist }

const HISTORY_KEY = 'atlas-search-history'
const HISTORY_LIMIT = 5

interface SearchHistory {
  artists: string[]
  genres: number[]
}

function readHistory(): SearchHistory {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '') as Partial<SearchHistory>
    return {
      artists: Array.isArray(raw.artists) ? raw.artists.filter((id) => typeof id === 'string').slice(0, HISTORY_LIMIT) : [],
      genres: Array.isArray(raw.genres) ? raw.genres.filter((id) => typeof id === 'number').slice(0, HISTORY_LIMIT) : [],
    }
  } catch {
    return { artists: [], genres: [] }
  }
}

function remember(history: SearchHistory, hit: Hit): SearchHistory {
  const next =
    hit.kind === 'artist'
      ? { ...history, artists: [hit.artist.mbid, ...history.artists.filter((id) => id !== hit.artist.mbid)].slice(0, HISTORY_LIMIT) }
      : { ...history, genres: [hit.genre.id, ...history.genres.filter((id) => id !== hit.genre.id)].slice(0, HISTORY_LIMIT) }
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
  return next
}

export function SearchBar() {
  const focusOn = useAtlas((s) => s.focusOn)
  const openArtist = useAtlas((s) => s.openArtist)
  const mapLayer = useAtlas((s) => s.mapLayer)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const [artists, setArtists] = useState<IndexedArtist[] | null>(null)
  const [history, setHistory] = useState<SearchHistory>(readHistory)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    void loadArtistIndex().then(setArtists).catch(() => setArtists([]))
  }, [])

  const reveal = () => {
    setHistory(readHistory())
    setOpen(true)
  }

  const hide = () => {
    requestAnimationFrame(() => {
      if (document.activeElement !== inputRef.current) setOpen(false)
    })
  }

  const results = useMemo(() => {
    const q = fold(query)
    if (!q) return [] as Hit[]
    const genres = GENRES.filter((g) => fold(g.name).includes(q))
      .sort((a, b) => Number(fold(b.name).startsWith(q)) - Number(fold(a.name).startsWith(q)) || b.popularity - a.popularity)
      .slice(0, 4)
      .map((genre): Hit => ({ kind: 'genre', genre }))
    const artistHits = artists ? searchArtists(artists, q, 6).map((artist): Hit => ({ kind: 'artist', artist })) : []
    return [...artistHits, ...genres].slice(0, 8)
  }, [query, artists])

  const artistByMbid = useMemo(() => new Map((artists ?? []).map((artist) => [artist.mbid, artist])), [artists])

  const recent = useMemo(() => {
    if (mapLayer === 'artists') {
      return history.artists
        .map((mbid) => artistByMbid.get(mbid) ?? indexedArtist(mbid))
        .filter((artist): artist is IndexedArtist => artist != null)
        .slice(0, HISTORY_LIMIT)
        .map((artist): Hit => ({ kind: 'artist', artist }))
    }
    return history.genres
      .map((id) => GENRES[id])
      .filter((genre) => genre != null)
      .slice(0, HISTORY_LIMIT)
      .map((genre): Hit => ({ kind: 'genre', genre }))
  }, [history, mapLayer, artistByMbid])

  const showingRecent = query.trim().length === 0
  const shown = showingRecent ? recent : results

  const pick = (hit: Hit) => {
    if (hit.kind === 'genre') focusOn(hit.genre.id)
    else
      openArtist(
        {
          mbid: hit.artist.mbid,
          name: hit.artist.name,
          genreId: hit.artist.genreId,
          genreIds: hit.artist.genreIds,
          deezerId: hit.artist.deezerId,
        },
        'search',
      )
    setHistory((prev) => remember(prev, hit))
    setQuery('')
    setOpen(false)
    inputRef.current?.blur()
  }

  const showPanel = open && (showingRecent ? recent.length > 0 : query.trim().length > 0)

  return (
    <div className="absolute left-1/2 top-4 z-20 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2">
      <label className="glass flex h-11 items-center gap-2.5 rounded-full pl-4 pr-2 text-fg-2 focus-within:text-fg">
        <SearchIcon className="shrink-0" />
        <input
          ref={inputRef}
          aria-label="Search artists and genres"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(0)
            setOpen(true)
          }}
          onPointerDown={reveal}
          onFocus={reveal}
          onBlur={hide}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(a + 1, shown.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Enter' && shown[active]) pick(shown[active])
            else if (e.key === 'Escape') inputRef.current?.blur()
          }}
          placeholder="Search artists and genres"
          className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-3"
        />
        <kbd className="rounded-md bg-fill px-1.5 py-0.5 font-sans text-[11px] text-fg-3">/</kbd>
      </label>

      <AnimatePresence>
        {showPanel && (
          <motion.ul
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={SPRING_FAST}
            style={{ transformOrigin: '50% 0%' }}
            className="glass-heavy absolute inset-x-0 top-full mt-2 overflow-hidden rounded-2xl p-1.5"
          >
            {showingRecent && <li className="px-3 pb-1 pt-1.5 text-[12px] text-fg-3">Recent</li>}
            {!showingRecent && shown.length === 0 && (
              <li className="px-3 py-2 text-[13px] text-fg-3">{artists == null ? 'Loading artists…' : 'No matches'}</li>
            )}
            {shown.map((hit, i) => (
              <li key={hit.kind === 'genre' ? `g-${hit.genre.id}` : hit.artist.mbid}>
                <button
                  onPointerDown={(e) => {
                    e.preventDefault()
                    pick(hit)
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-[15px] ${
                    i === active ? 'bg-fill-2' : ''
                  }`}
                >
                  {hit.kind === 'genre' ? (
                    <>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: clusterColor(hit.genre.cluster) }} />
                      <span className="truncate">{hit.genre.name}</span>
                      <span className="ml-auto shrink-0 text-[13px] text-fg-3">{CLUSTERS[hit.genre.cluster].label}</span>
                    </>
                  ) : (
                    <>
                      <span className="grid h-2.5 w-2.5 shrink-0 place-items-center rounded-full bg-fg-3/40 text-[8px] text-fg">♪</span>
                      <span className="truncate">{hit.artist.name}</span>
                      <span className="ml-auto shrink-0 text-[13px] text-fg-3">Artist</span>
                    </>
                  )}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
