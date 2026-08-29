import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import devServer from '@hono/vite-dev-server'

const publicStylesheet = resolve('public/styles.css')

const servePublicStyles = () => ({
  name: 'serve-public-styles',
  configureServer(server: { middlewares: { use: (path: string, handler: (req: unknown, res: { setHeader: (name: string, value: string) => void; end: (body: string) => void }, next: () => void) => void) => void } }) {
    server.middlewares.use('/styles.css', (_req, res, next) => {
      try {
        res.setHeader('Content-Type', 'text/css; charset=UTF-8')
        res.end(readFileSync(publicStylesheet, 'utf8'))
      } catch {
        next()
      }
    })
  },
})

export default defineConfig({
  plugins: [react(), devServer({ entry: 'src/index.ts' }), servePublicStyles()],
  publicDir: false,
  build: {
    outDir: 'public',
    emptyOutDir: false,
    rollupOptions: {
      input: 'src/client.tsx',
      output: { entryFileNames: 'assets/client.js' },
    },
  },
})
