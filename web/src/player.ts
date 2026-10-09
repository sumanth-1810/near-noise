import { create } from 'zustand'
import { GENRES } from './data/atlas'
import { artistTopTracks, genreTracks, type Track } from './lib/deezer'

export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'empty' | 'error'

export type PlaySource = { kind: 'genre'; id: number } | { kind: 'artist'; mbid: string; name: string }

interface PlayerState {
  source: PlaySource | null
  tracks: Track[]
  index: number
  status: PlayerStatus
  progress: number

  playGenre: (genreId: number, index?: number) => Promise<void>
  playArtist: (mbid: string, name: string, deezerId?: number, index?: number) => Promise<void>
  toggle: () => void
  next: () => void
  previous: () => void
  stop: () => void
}

const FADE_IN_MS = 350
const FADE_OUT_MS = 160

const audio = new Audio()
audio.preload = 'auto'

let fadeFrame = 0
function fadeTo(target: number, ms: number): Promise<void> {
  cancelAnimationFrame(fadeFrame)
  const from = audio.volume
  const start = performance.now()
  return new Promise((resolve) => {
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / ms)
      audio.volume = from + (target - from) * t
      if (t < 1) fadeFrame = requestAnimationFrame(step)
      else resolve()
    }
    fadeFrame = requestAnimationFrame(step)
  })
}

let request = 0

const sameSource = (a: PlaySource | null, b: PlaySource) => {
  if (!a || a.kind !== b.kind) return false
  return a.kind === 'genre' && b.kind === 'genre' ? a.id === b.id : a.kind === 'artist' && b.kind === 'artist' && a.mbid === b.mbid
}

export const usePlayer = create<PlayerState>((set, get) => {
  async function start(index: number) {
    const track = get().tracks[index]
    if (!track) return
    const token = ++request
    if (!audio.paused) await fadeTo(0, FADE_OUT_MS)
    if (token !== request) return
    set({ index, status: 'loading', progress: 0 })
    if (!track.preview) {
      set({ status: 'error' })
      return
    }
    // The phone loads the clip from this site. Deezer and Apple answer the listener's country differently.
    audio.src = `/api/preview?u=${encodeURIComponent(track.preview)}`
    audio.volume = 0
    try {
      await audio.play()
      if (token !== request) return
      set({ status: 'playing' })
      await fadeTo(1, FADE_IN_MS)
    } catch (err) {
      if (token !== request) return
      set({ status: (err as DOMException).name === 'NotAllowedError' ? 'paused' : 'error' })
    }
  }

  audio.addEventListener('timeupdate', () => {
    if (audio.duration) set({ progress: audio.currentTime / audio.duration })
  })
  audio.addEventListener('ended', () => {
    const { index, tracks } = get()
    if (index + 1 < tracks.length) void start(index + 1)
    else set({ status: 'paused', progress: 0 })
  })

  async function load(source: PlaySource, loadTracks: () => Promise<Track[]>, index: number) {
    const s = get()
    if (sameSource(s.source, source) && s.tracks.length) {
      if (s.index === index && s.status === 'paused') return get().toggle()
      return start(index)
    }
    const token = ++request
    if (!audio.paused) void fadeTo(0, FADE_OUT_MS).then(() => token === request && audio.pause())
    set({ source, tracks: [], index, status: 'loading', progress: 0 })
    try {
      const tracks = await loadTracks()
      if (token !== request) return
      set({ tracks, status: tracks.length ? 'loading' : 'empty' })
      if (tracks.length) await start(Math.min(index, tracks.length - 1))
    } catch {
      if (token === request) set({ status: 'error' })
    }
  }

  return {
    source: null,
    tracks: [],
    index: 0,
    status: 'idle',
    progress: 0,

    playGenre: (genreId, index = 0) => load({ kind: 'genre', id: genreId }, () => genreTracks(GENRES[genreId]), index),

    playArtist: (mbid, name, deezerId, index = 0) =>
      load({ kind: 'artist', mbid, name }, () => artistTopTracks(name, deezerId, mbid), index),

    toggle: () => {
      const { status, tracks, index } = get()
      if (status === 'playing') {
        ++request
        set({ status: 'paused' })
        void fadeTo(0, FADE_OUT_MS).then(() => audio.pause())
      } else if (status === 'paused' && tracks.length) {
        if (!audio.src) return void start(index)
        ++request
        set({ status: 'playing' })
        audio
          .play()
          .then(() => fadeTo(1, FADE_IN_MS))
          .catch(() => set({ status: 'paused' }))
      }
    },

    next: () => {
      const { index, tracks } = get()
      if (tracks.length) void start((index + 1) % tracks.length)
    },

    previous: () => {
      const { index, tracks } = get()
      if (!tracks.length) return
      if (audio.currentTime > 3) {
        audio.currentTime = 0
        return
      }
      void start((index - 1 + tracks.length) % tracks.length)
    },

    stop: () => {
      ++request
      void fadeTo(0, FADE_OUT_MS).then(() => {
        audio.pause()
        audio.removeAttribute('src')
      })
      set({ source: null, tracks: [], index: 0, status: 'idle', progress: 0 })
    },
  }
})
