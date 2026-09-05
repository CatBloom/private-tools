import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import devServer from '@hono/vite-dev-server'

const publicStylesheet = resolve('src/public/styles.css')
const publicFavicon = resolve('src/public/favicon.ico')

type DevServer = {
  middlewares: {
    use: (
      path: string,
      handler: (
        req: unknown,
        res: { setHeader: (name: string, value: string) => void; end: (body: string | Uint8Array) => void },
        next: () => void,
      ) => void,
    ) => void
  }
}

const servePublicStyles = () => ({
  name: 'serve-public-styles',
  configureServer(server: DevServer) {
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

// publicDir is false, so Vite does not serve src/public in dev. Serve the
// favicon ourselves (binary), mirroring the production Hono route.
const servePublicFavicon = () => ({
  name: 'serve-public-favicon',
  configureServer(server: DevServer) {
    server.middlewares.use('/favicon.ico', (_req, res, next) => {
      try {
        res.setHeader('Content-Type', 'image/x-icon')
        res.end(readFileSync(publicFavicon))
      } catch {
        next()
      }
    })
  },
})

export default defineConfig({
  plugins: [react(), devServer({ entry: 'src/index.ts' }), servePublicStyles(), servePublicFavicon()],
  publicDir: false,
  build: {
    outDir: 'src/public',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        client: 'src/client.tsx',
        'client-prompt': 'src/client-prompt.tsx',
        'client-todo': 'src/client-todo.tsx',
        theme: 'src/ui/theme.ts',
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return
          // pnpm の仮想ストアは node_modules/.pnpm/<pkg>@<ver>/node_modules/<pkg>/... と
          // 二重に node_modules を挟むため、最後の node_modules 以降の先頭セグメントで
          // パッケージ名を判定する。
          const afterNodeModules = id.split('node_modules/').at(-1)!
          const pkg = afterNodeModules.startsWith('@')
            ? afterNodeModules.split('/').slice(0, 2).join('/')
            : afterNodeModules.split('/')[0]
          if (pkg === 'react' || pkg === 'react-dom' || pkg === 'scheduler') return 'vendor-react'
          if (pkg === 'react-router' || pkg === 'react-router-dom') return 'vendor-router'
          if (pkg.startsWith('@dnd-kit/')) return 'vendor-dnd'
          if (
            pkg === 'recharts' ||
            pkg === 'recharts-scale' ||
            pkg === 'victory-vendor' ||
            pkg === 'react-smooth' ||
            pkg === 'react-transition-group' ||
            pkg === 'dom-helpers' ||
            pkg === 'decimal.js' ||
            pkg === 'decimal.js-light' ||
            pkg === 'eventemitter3' ||
            pkg === 'fast-equals' ||
            pkg === 'tiny-invariant' ||
            pkg === 'react-is' ||
            pkg.startsWith('d3-')
          ) {
            return 'vendor-recharts'
          }
        },
      },
    },
  },
})
