import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { GENRES } from '../data/atlas'
import { SPRING } from '../lib/motion'
import { usePlayer } from '../player'
import { useAtlas } from '../store'
import { CloseIcon, NextIcon, PauseIcon, PlayIcon } from './icons'

const isTyping = (el: Element | null) =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement | null)?.isContentEditable

function useSpaceToPlay() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ' ' || e.repeat || isTyping(document.activeElement)) return
      const player = usePlayer.getState()
      const { selectedId, artist } = useAtlas.getState()
      e.preventDefault()
      if (player.source) {
        if (player.source.kind === 'artist' && artist?.mbid === player.source.mbid) return player.toggle()
        if (player.source.kind === 'genre' && selectedId === player.source.id) return player.toggle()
      }
      if (artist) void player.playArtist(artist.mbid, artist.name, artist.deezerId)
      else if (selectedId != null) void player.playGenre(selectedId)
      else player.toggle()
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [])
}

export function NowPlaying() {
  useSpaceToPlay()
  const p = usePlayer(
    useShallow((s) => ({
      source: s.source,
      track: s.tracks[s.index],
      status: s.status,
      progress: s.progress,
      toggle: s.toggle,
      next: s.next,
      stop: s.stop,
    })),
  )
  const focusOn = useAtlas((s) => s.focusOn)
  const openArtist = useAtlas((s) => s.openArtist)
  const visible = p.source != null && p.status !== 'idle'
  const genre = p.source?.kind === 'genre' ? GENRES[p.source.id] : null
  const context = p.source?.kind === 'artist' ? p.source.name : genre?.name

  return (
    <AnimatePresence initial={false}>
      {visible && context && (
        <motion.div
          key="now-playing"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 'auto', opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={SPRING}
          className="flex items-center overflow-hidden"
        >
          <div className="flex items-center gap-1 pr-1">
            <button
              onClick={p.toggle}
              disabled={!p.track}
              aria-label={p.status === 'playing' ? 'Pause' : 'Play'}
              className="pressable relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-fill-2"
            >
              {p.track && <img src={p.track.cover} alt="" className="h-full w-full object-cover" />}
              <span className="absolute inset-0 grid place-items-center bg-black/30 text-white">
                {p.status === 'loading' ? (
                  <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-white/40 border-t-white" />
                ) : p.status === 'playing' ? (
                  <PauseIcon width={11} height={11} />
                ) : (
                  <PlayIcon width={11} height={11} />
                )}
              </span>
            </button>

            <button
              onClick={() => {
                if (p.source?.kind === 'artist') openArtist({ mbid: p.source.mbid, name: p.source.name }, 'search')
                else if (genre) focusOn(genre.id)
              }}
              title={p.source?.kind === 'artist' ? `Go to ${p.source.name}` : `Go to ${genre?.name}`}
              className="pressable flex w-40 min-w-0 flex-col rounded-lg px-1.5 py-0.5 text-left hover:bg-fill"
            >
              <span className="truncate text-[13px] font-medium leading-tight">
                {p.track?.title ?? (p.status === 'empty' ? 'No previews found' : p.status === 'error' ? "Couldn't load" : 'Finding tracks…')}
              </span>
              <span className="truncate text-[11px] leading-tight text-fg-2">
                {p.track ? `${p.track.artist} · ${context}` : context}
              </span>
              <span className="mt-1 h-0.5 overflow-hidden rounded-full bg-fill-2">
                <span
                  className="block h-full rounded-full bg-fg transition-[width] duration-300 ease-linear"
                  style={{ width: `${p.progress * 100}%` }}
                />
              </span>
            </button>

            <button
              onClick={p.next}
              disabled={!p.track}
              aria-label="Next track"
              className="pressable grid h-8 w-7 shrink-0 place-items-center rounded-full hover:bg-fill disabled:opacity-40"
            >
              <NextIcon width={13} height={13} />
            </button>
            <button
              onClick={p.stop}
              aria-label="Stop"
              className="pressable grid h-8 w-7 shrink-0 place-items-center rounded-full text-fg-2 hover:bg-fill hover:text-fg"
            >
              <CloseIcon width={12} height={12} />
            </button>
            <div className="ml-1 h-5 w-px shrink-0 bg-hairline" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
