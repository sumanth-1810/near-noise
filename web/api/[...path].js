const routes = [
  ['/api/lb-labs', 'https://labs.api.listenbrainz.org'],
  ['/api/lb', 'https://api.listenbrainz.org'],
  ['/api/deezer', 'https://api.deezer.com'],
]

async function readBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

/** Proxy Deezer and ListenBrainz, following their redirects so the browser stays on this site. */
export default async function handler(req, res) {
  const url = new URL(req.url, `https://${req.headers.host}`)
  const route = routes.find(([prefix]) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))
  if (!route) {
    res.status(404).send('Not found')
    return
  }

  const [prefix, origin] = route
  const target = origin + url.pathname.slice(prefix.length) + url.search
  const headers = {}
  if (req.headers['content-type']) headers['content-type'] = req.headers['content-type']

  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body: await readBody(req),
    redirect: 'follow',
  })

  const type = upstream.headers.get('content-type')
  if (type) res.setHeader('content-type', type)
  res.status(upstream.status).send(Buffer.from(await upstream.arrayBuffer()))
}
