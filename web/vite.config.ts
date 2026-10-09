import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin, type ProxyOptions } from 'vite'
import { fetchPreview } from './api/preview.js'

/** Serve the same preview route locally that Vercel serves in production. */
function previewApi(): Plugin {
  const handle = async (req: { url?: string }, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (body?: Buffer) => void }, next: () => void) => {
    if (!req.url?.startsWith('/api/preview')) return next()
    const target = new URL(req.url, 'http://localhost').searchParams.get('u')
    const preview = target ? await fetchPreview(target) : null
    if (!preview) {
      res.statusCode = 404
      res.end(Buffer.from('Not found'))
      return
    }
    res.statusCode = preview.status
    res.setHeader('content-type', preview.contentType)
    res.end(preview.body)
  }
  return {
    name: 'preview-api',
    configureServer(server) {
      server.middlewares.use(handle)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle)
    },
  }
}

// Deezer's public API sends no CORS headers, so the browser reaches it through this proxy.
const proxy: Record<string, ProxyOptions> = {
  '/api/deezer': {
    target: 'https://api.deezer.com',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/deezer/, ''),
  },
  '/api/lb-labs': {
    target: 'https://labs.api.listenbrainz.org',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/lb-labs/, ''),
  },
  '/api/lb': {
    target: 'https://api.listenbrainz.org',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api\/lb/, ''),
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss(), previewApi()],
  server: { proxy },
  preview: { proxy },
})
