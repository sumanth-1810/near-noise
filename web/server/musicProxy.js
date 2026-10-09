const origins = {
  'lb-labs': 'https://labs.api.listenbrainz.org',
  lb: 'https://api.listenbrainz.org',
  deezer: 'https://api.deezer.com',
}

async function readBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

/** Forward one music API, following redirects so the browser never leaves this site. */
export function musicProxy(service) {
  const origin = origins[service]
  return async function handler(req, res) {
    const url = new URL(req.url, `https://${req.headers.host}`)
    const prefix = `/api/${service}`
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
}
