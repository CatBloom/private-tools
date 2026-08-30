import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, extname, join } from 'node:path'
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { TopPage } from '../ui/TopPage.js'
import { createCreditCsvRoutes } from './routes/credit-csv.js'
import type { Storage } from './storage/index.js'

type AppOptions = {
  clientScript?: string
  themeScript?: string
  stylesAsset?: string | null
  assetOverrides?: Record<string, string | null>
  creditCsvStorage?: Storage
}

const CREDIT_CSV_PREFIX = '/tools/credit-csv'

const isCreditCsvPath = (path: string) => path === CREDIT_CSV_PREFIX || path.startsWith(`${CREDIT_CSV_PREFIX}/`)

const staticAssetRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
const assetsDir = join(staticAssetRoot, 'assets')
const stylesFilePath = join(staticAssetRoot, 'styles.css')

const ASSET_CONTENT_TYPES: Record<string, string> = {
  '.js': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.map': 'application/json; charset=UTF-8',
}

const ASSET_FILENAME_PATTERN = /^[A-Za-z0-9._-]+$/

const staticFileCache = new Map<string, string | null>()

const readCachedFile = (filePath: string): string | null => {
  if (!staticFileCache.has(filePath)) {
    try {
      staticFileCache.set(filePath, readFileSync(filePath, 'utf8'))
    } catch {
      staticFileCache.set(filePath, null)
    }
  }
  return staticFileCache.get(filePath) ?? null
}

const buildSecureHeaders = (styleSrc: string[]) =>
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      imgSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      scriptSrc: ["'self'", ...(process.env.NODE_ENV === 'development' ? ["'unsafe-inline'"] : [])],
      styleSrc,
    },
    referrerPolicy: 'no-referrer',
    xContentTypeOptions: 'nosniff',
    xFrameOptions: 'DENY',
  })

// includeBuiltCss は production のときだけ true。開発では抽出済み /assets/client.css は
// 存在せず（Vite が JS 経由で CSS を注入する）、リンクすると 404 になるため出さない。
const creditCsvShellHtml = (clientScript: string, includeBuiltCss: boolean) =>
  `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Credit CSV Viewer</title><link rel="stylesheet" href="/styles.css">${includeBuiltCss ? '<link rel="stylesheet" href="/assets/client.css">' : ''}</head><body><div id="root">読み込み中…</div><script type="module" src="${clientScript}"></script></body></html>`

export const createApp = (options: AppOptions = {}) => {
  const app = new Hono()
  const isProduction = process.env.NODE_ENV === 'production'
  const clientScript =
    options.clientScript ??
    (process.env.NODE_ENV === 'production' ? '/assets/client.js' : '/src/client.tsx')
  const themeScript =
    options.themeScript ??
    (process.env.NODE_ENV === 'production' ? '/assets/theme.js' : '/src/ui/theme.ts')

  const defaultSecureHeaders = buildSecureHeaders(["'self'"])
  const creditCsvSecureHeaders = buildSecureHeaders(["'self'", "'unsafe-inline'"])

  app.use('*', (c, next) => {
    const middleware = isCreditCsvPath(c.req.path) ? creditCsvSecureHeaders : defaultSecureHeaders
    return middleware(c, next)
  })

  app.route(`${CREDIT_CSV_PREFIX}/api`, createCreditCsvRoutes(options.creditCsvStorage))

  if (process.env.NODE_ENV === 'production') {
    app.get('/styles.css', (c) => {
      const override = options.stylesAsset
      const content = override === undefined ? readCachedFile(stylesFilePath) : override
      if (content === null || content === undefined) return c.notFound()
      return c.body(content, 200, { 'Content-Type': 'text/css; charset=UTF-8' })
    })

    app.get('/assets/:filename', (c) => {
      const filename = c.req.param('filename')
      if (!ASSET_FILENAME_PATTERN.test(filename)) return c.notFound()

      const contentType = ASSET_CONTENT_TYPES[extname(filename)]
      if (!contentType) return c.notFound()

      const overrides = options.assetOverrides
      const override = overrides && Object.hasOwn(overrides, filename) ? overrides[filename] : undefined
      const content = override === undefined ? readCachedFile(join(assetsDir, filename)) : override
      if (content === null || content === undefined) return c.notFound()
      return c.body(content, 200, { 'Content-Type': contentType })
    })
  }

  app.get('/', (c) => {
    const page = renderToString(createElement(TopPage))
    return c.html(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Private Tools</title><link rel="stylesheet" href="/styles.css"></head><body>${page}<script type="module" src="${themeScript}"></script></body></html>`)
  })

  app.get(CREDIT_CSV_PREFIX, (c) => c.html(creditCsvShellHtml(clientScript, isProduction)))
  app.get(`${CREDIT_CSV_PREFIX}/*`, (c) => {
    // app.route() flattens the API sub-app's routes into this router without
    // carrying over its own notFound handler, so unmatched API paths would
    // otherwise fall through to this wildcard shell instead of a JSON 404.
    if (c.req.path.startsWith(`${CREDIT_CSV_PREFIX}/api`)) {
      return c.json({ ok: false, error: { message: 'Not found.' } }, 404)
    }
    return c.html(creditCsvShellHtml(clientScript, isProduction))
  })

  app.notFound((c) => {
    if (c.req.path.startsWith('/api/')) {
      return c.json({ ok: false, error: { message: 'Not found.' } }, 404)
    }
    return c.html('<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>Not found</title></head><body><main><h1>Not found</h1></main></body></html>', 404)
  })

  return app
}

const app = createApp()

export default app
