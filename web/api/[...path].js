export const config = { runtime: 'edge' }

const routes = [
  ['/api/lb-labs', 'https://labs.api.listenbrainz.org'],
  ['/api/lb', 'https://api.listenbrainz.org'],
  ['/api/deezer', 'https://api.deezer.com'],
]

/** Proxy Deezer and ListenBrainz, following their redirects so the browser stays on this site. */
export default async function handler(request) {
  const url = new URL(request.url)
  const route = routes.find(([prefix]) => url.pathname === prefix || url.pathname.startsWith(`${prefix}/`))
  if (!route) return new Response('Not found', { status: 404 })

  const [prefix, origin] = route
  const target = origin + url.pathname.slice(prefix.length) + url.search
  const headers = new Headers()
  const contentType = request.headers.get('content-type')
  if (contentType) headers.set('content-type', contentType)

  const res = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'follow',
  })

  const out = new Headers()
  const type = res.headers.get('content-type')
  if (type) out.set('content-type', type)
  return new Response(res.body, { status: res.status, headers: out })
}
