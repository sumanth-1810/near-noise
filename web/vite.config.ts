import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type ProxyOptions } from 'vite'

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
  plugins: [react(), tailwindcss()],
  server: { proxy },
  preview: { proxy },
})
