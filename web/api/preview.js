const ALLOWED = [
  'cdnt-preview.dzcdn.net',
  'audio-ssl.itunes.apple.com',
]

function allowed(value) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && ALLOWED.includes(url.hostname)
  } catch {
    return false
  }
}

/** Fetch a 30-second preview from an allowed host. */
export async function fetchPreview(value) {
  if (!allowed(value)) return null
  const upstream = await fetch(value, { redirect: 'follow' })
  const host = new URL(value).hostname
  const contentType = host.endsWith('dzcdn.net') ? 'audio/mpeg' : 'audio/mp4'
  return {
    status: upstream.status,
    contentType: upstream.ok ? contentType : upstream.headers.get('content-type') || 'text/plain',
    body: Buffer.from(await upstream.arrayBuffer()),
  }
}

export default async function handler(req, res) {
  const target = new URL(req.url, 'https://near-noise.local').searchParams.get('u')
  const preview = target ? await fetchPreview(target) : null
  if (!preview) {
    res.status(404).end('Not found')
    return
  }
  res.setHeader('content-type', preview.contentType)
  res.setHeader('cache-control', 'public, max-age=300')
  res.status(preview.status).send(preview.body)
}
