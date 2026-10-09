import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const USER_AGENT = 'GenreAtlas/0.1 (personal music map; https://github.com/)'

const CACHE_DIR = fileURLToPath(new URL('../cache/', import.meta.url))

/** Minimum gap between requests to the same host, per its published rate limits. */
const SPACING_MS: Record<string, number> = {
  'musicbrainz.org': 1100,
  'api.listenbrainz.org': 350,
  'labs.api.listenbrainz.org': 350,
  'api.deezer.com': 120,
}

const nextSlot = new Map<string, number>()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function waitTurn(host: string) {
  const now = Date.now()
  const slot = Math.max(now, nextSlot.get(host) ?? 0)
  nextSlot.set(host, slot + (SPACING_MS[host] ?? 250))
  if (slot > now) await sleep(slot - now)
}

function cachePath(url: string, body?: unknown) {
  const host = new URL(url).host
  const key = createHash('sha1')
    .update(url + (body ? JSON.stringify(body) : ''))
    .digest('hex')
  return join(CACHE_DIR, host, `${key}.json`)
}

/** GET (or POST with a JSON body), cached on disk forever. Retries rate limits and server errors. */
export async function fetchJson<T>(url: string, body?: unknown): Promise<T> {
  const path = cachePath(url, body)
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    // not cached yet
  }

  const host = new URL(url).host
  for (let attempt = 0; ; attempt++) {
    await waitTurn(host)
    const res = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }).catch((err: Error) => ({ ok: false, status: 0, err }) as const)

    if ('json' in res && res.ok) {
      const data = (await res.json()) as T
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, JSON.stringify(data))
      return data
    }

    const status = res.status
    const retryable = status === 0 || status === 429 || status >= 500
    if (!retryable || attempt >= 6) {
      throw new Error(`${status} for ${url}`)
    }
    const resetIn = 'headers' in res ? Number(res.headers.get('x-ratelimit-reset-in') ?? res.headers.get('retry-after')) : NaN
    const wait = Number.isFinite(resetIn) && resetIn > 0 ? resetIn * 1000 + 250 : 1000 * 2 ** attempt
    await sleep(wait)
  }
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

export function progress(label: string, done: number, total: number) {
  if (done === total || done % 25 === 0) process.stdout.write(`\r${label} ${done}/${total}   ${done === total ? '\n' : ''}`)
}
