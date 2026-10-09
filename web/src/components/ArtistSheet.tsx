import { useEffect, useMemo, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { indexedArtist } from '../data/artists'
import { GENRES } from '../data/atlas'
import { clusterColor } from '../lib/colors'
import { artistTopTracks, findDeezerArtist, type Track } from '../lib/deezer'
import { artistMeta, artistUsers, deezerIdFromRels, rankSimilar, similarArtists, type SimilarArtist } from '../lib/listenbrainz'
import { usePlayer } from '../player'
import { useAtlas, type ArtistRef } from '../store'
import { ChevronIcon, CloseIcon, PauseIcon, PlayIcon } from './icons'

function formatListeners(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n.toLocaleString()
}

interface Profile {
  name: string
  mbid: string
  area?: string
  year?: number
  users: number
  photo?: string
  deezerId?: number
  genreIds: number[]
}

const genreIdByName = new Map(GENRES.map((g) => [g.name, g.id]))

async function loadProfile(ref: ArtistRef): Promise<Profile> {
  const [meta, users, deezer] = await Promise.all([
    artistMeta(ref.mbid).catch(() => null),
    artistUsers([ref.mbid]).catch(() => new Map<string, number>()),
    findDeezerArtist(ref.name, ref.deezerId).catch(() => null),
  ])
  const deezerId = deezer?.id ?? deezerIdFromRels(meta?.rels)
  const tags = (meta?.tag?.artist ?? [])
    .filter((t) => t.count > 0 && genreIdByName.has(t.tag))
    .sort((a, b) => b.count - a.count)
  const genreIds = [...new Set(tags.map((t) => genreIdByName.get(t.tag)!))].slice(0, 6)
  if (ref.genreId != null && !genreIds.includes(ref.genreId)) genreIds.unshift(ref.genreId)
  return {
    name: meta?.name ?? ref.name,
    mbid: ref.mbid,
    area: meta?.area,
    year: meta?.begin_year,
    users: users.get(ref.mbid) ?? 0,
    photo: deezer?.picture_medium,
    deezerId,
    genreIds: genreIds.slice(0, 6),
  }
}

export function ArtistDetails({ artist, onClose }: { artist: ArtistRef; onClose: () => void }) {
  const { trail, jumpTrail, openArtist, focusOn } = useAtlas(
    useShallow((s) => ({
      trail: s.artistTrail,
      jumpTrail: s.jumpTrail,
      openArtist: s.openArtist,
      focusOn: s.focusOn,
    })),
  )
  const [profile, setProfile] = useState<Profile | null>(null)
  const [deep, setDeep] = useState(0.35)
  const [similar, setSimilar] = useState<SimilarArtist[] | null>(null)
  const color = artist.genreId != null ? clusterColor(GENRES[artist.genreId].cluster) : clusterColor(0)

  useEffect(() => {
    let live = true
    setProfile(null)
    setSimilar(null)
    loadProfile(artist).then((p) => live && setProfile(p), () => live && setProfile({ name: artist.name, mbid: artist.mbid, users: 0, genreIds: artist.genreId != null ? [artist.genreId] : [] }))
    similarArtists(artist.mbid).then((list) => live && setSimilar(list), () => live && setSimilar([]))
    return () => {
      live = false
    }
  }, [artist])

  const ranked = useMemo(() => (similar ? rankSimilar(similar, deep) : []), [similar, deep])

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
        {trail.length > 1 && (
          <div className="mb-3 flex min-w-0 items-center gap-1 overflow-hidden pr-8 text-[12px] text-fg-3">
            {trail.map((step, i) => (
              <span key={step.mbid + i} className="flex min-w-0 items-center gap-1">
                {i > 0 && <span className="shrink-0">›</span>}
                {i === trail.length - 1 ? (
                  <span className="truncate text-fg-2">{step.name}</span>
                ) : (
                  <button onClick={() => jumpTrail(i)} className="pressable truncate hover:text-fg">
                    {step.name}
                  </button>
                )}
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-4 pr-8">
          <span className="h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-2xl bg-fill-2">
            {profile?.photo && <img src={profile.photo} alt="" className="h-full w-full object-cover" />}
          </span>
          <div className="min-w-0">
            <h2 className="font-serif text-[34px] leading-[1.02] tracking-[-0.022em]">{artist.name}</h2>
            <p className="mt-1 truncate text-[13px] text-fg-2">
              {[profile?.area, profile?.year].filter(Boolean).join(' · ') || 'Artist'}
            </p>
          </div>
        </div>
        <dl className="mt-5 flex gap-7">
          <div>
            <dd className="font-serif text-[24px] leading-tight tabular-nums tracking-[-0.015em]">
              {profile ? formatListeners(profile.users) : '—'}
            </dd>
            <dt className="text-[12px] text-fg-2">Listeners</dt>
          </div>
        </dl>
      </header>

      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto px-6 pb-6 pt-1">
        {profile && profile.genreIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {profile.genreIds.map((id) => (
              <button
                key={id}
                onClick={() => focusOn(id)}
                className="pressable rounded-full bg-fill px-2.5 py-1 text-[12px] hover:bg-fill-2"
              >
                <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full" style={{ background: clusterColor(GENRES[id].cluster) }} />
                {GENRES[id].name}
              </button>
            ))}
          </div>
        )}

        <ArtistListen artist={artist} deezerId={profile?.deezerId ?? artist.deezerId} />

        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <h3 className="font-serif text-[20px] tracking-[-0.012em]">Fans also listen to</h3>
          </div>
          <label className="mb-4 flex flex-col gap-1.5">
            <div className="flex justify-between text-[12px] text-fg-3">
              <span>Familiar</span>
              <span>Deep cuts</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={deep}
              onChange={(e) => setDeep(Number(e.target.value))}
              onInput={(e) => setDeep(Number((e.target as HTMLInputElement).value))}
              aria-label="Familiar to deep cuts"
              className="w-full accent-[var(--accent)]"
            />
          </label>
          {similar == null && (
            <ul className="-mx-2 flex flex-col">
              {Array.from({ length: 6 }, (_, i) => (
                <li key={i} className="flex items-center gap-3 px-2 py-2">
                  <span className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-fill-2" />
                  <span className="h-2.5 w-2/5 animate-pulse rounded-full bg-fill-2" />
                </li>
              ))}
            </ul>
          )}
          {similar != null && similar.length === 0 && <p className="text-[13px] text-fg-3">No listening overlaps found yet.</p>}
          {ranked.length > 0 && (
            <ul className="-mx-2">
              {ranked.map((a) => (
                <li key={a.mbid} className="flex items-center rounded-xl hover:bg-fill">
                  <SimilarPlay mbid={a.mbid} name={a.name} />
                  <button
                    onClick={() => {
                      const known = indexedArtist(a.mbid)
                      openArtist(
                        { mbid: a.mbid, name: a.name, genreId: known?.genreId, genreIds: known?.genreIds, deezerId: known?.deezerId },
                        'similar',
                      )
                    }}
                    className="pressable flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2 pr-2 text-left"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[14px]">{a.name}</span>
                      <span className="text-[12px] text-fg-3">{a.users ? `${formatListeners(a.users)} listeners` : 'Few listeners'}</span>
                    </span>
                    <ChevronIcon width={12} height={12} className="shrink-0 text-fg-3" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-fg-3">From people who listen to {artist.name} on ListenBrainz</p>
        </section>
      </div>
    </>
  )
}

function SimilarPlay({ mbid, name }: { mbid: string; name: string }) {
  const player = usePlayer(useShallow((s) => ({ source: s.source, status: s.status, playArtist: s.playArtist, toggle: s.toggle })))
  const current = player.source?.kind === 'artist' && player.source.mbid === mbid
  return (
    <span
      role="button"
      aria-label={current && player.status === 'playing' ? `Pause ${name}` : `Play ${name}`}
      onClick={(e) => {
        e.stopPropagation()
        if (current && (player.status === 'playing' || player.status === 'paused')) player.toggle()
        else void player.playArtist(mbid, name)
      }}
      className="pressable ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-fg hover:bg-fill-2"
    >
      {current && player.status === 'playing' ? <PauseIcon width={11} height={11} /> : <PlayIcon width={11} height={11} />}
    </span>
  )
}

function ArtistListen({ artist, deezerId }: { artist: ArtistRef; deezerId?: number }) {
  const player = usePlayer(
    useShallow((s) => ({
      source: s.source,
      index: s.index,
      status: s.status,
      progress: s.progress,
      playArtist: s.playArtist,
      toggle: s.toggle,
    })),
  )
  const [tracks, setTracks] = useState<Track[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    artistTopTracks(artist.name, deezerId, artist.mbid).then(
      (t) => live && setTracks(t),
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [artist, deezerId])

  const isCurrent = player.source?.kind === 'artist' && player.source.mbid === artist.mbid
  const playing = isCurrent && player.status === 'playing'
  const unavailable = failed || (tracks != null && tracks.length === 0)

  return (
    <section className="flex flex-col gap-3">
      <button
        onClick={() =>
          isCurrent && (playing || player.status === 'paused') ? player.toggle() : player.playArtist(artist.mbid, artist.name, deezerId)
        }
        disabled={unavailable}
        className="pressable flex h-10 items-center justify-center gap-2 rounded-full bg-fg text-[14px] font-medium text-bg hover:opacity-90 disabled:bg-fill disabled:text-fg-3 disabled:active:scale-100"
      >
        {playing ? <PauseIcon width={13} height={13} /> : <PlayIcon width={13} height={13} />}
        {unavailable ? 'No previews found' : playing ? 'Pause' : isCurrent && player.status === 'loading' ? 'Loading…' : isCurrent ? 'Resume' : 'Listen'}
      </button>
      {tracks != null && tracks.length > 0 && (
        <ul className="-mx-2 flex flex-col">
          {tracks.map((t, i) => {
            const current = isCurrent && player.index === i && player.status !== 'idle'
            return (
              <li key={t.id}>
                <button
                  onClick={() => (current ? player.toggle() : player.playArtist(artist.mbid, artist.name, deezerId, i))}
                  className={`pressable flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left ${current ? 'bg-fill' : 'hover:bg-fill'}`}
                >
                  <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md bg-fill-2">
                    <img src={t.cover} alt="" loading="lazy" className="h-full w-full object-cover" />
                    <span className={`absolute inset-0 grid place-items-center bg-black/35 text-white ${current ? 'opacity-100' : 'opacity-0'}`}>
                      {current && player.status === 'playing' ? <PauseIcon width={12} height={12} /> : <PlayIcon width={12} height={12} />}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[14px]">{t.title}</span>
                  {current && (
                    <span className="h-0.5 w-10 overflow-hidden rounded-full bg-fill-2">
                      <span className="block h-full rounded-full bg-fg" style={{ width: `${player.progress * 100}%` }} />
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
