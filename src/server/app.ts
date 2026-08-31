import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, extname, join } from 'node:path'
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { TopPage } from '../ui/TopPage.js'
import { createCreditCsvRoutes } from './routes/credit-csv.js'
import { createPromptWordRoutes } from './routes/prompt-builder.js'
import type { Storage } from './storage/index.js'
import type { PromptHistoryStorage, PromptWordStorage } from './prompt-storage/index.js'

type AppOptions = {
  clientScript?: string
  themeScript?: string
  stylesAsset?: string | null
  assetOverrides?: Record<string, string | null>
  creditCsvStorage?: Storage
  promptWordStorage?: PromptWordStorage
  promptHistoryStorage?: PromptHistoryStorage
}

const CREDIT_CSV_PREFIX = '/tools/credit-csv'
const PROMPT_BUILDER_PREFIX = '/tools/prompt-builder'

const isCreditCsvPath = (path: string) => path === CREDIT_CSV_PREFIX || path.startsWith(`${CREDIT_CSV_PREFIX}/`)
const isPromptBuilderPath = (path: string) => path === PROMPT_BUILDER_PREFIX || path.startsWith(`${PROMPT_BUILDER_PREFIX}/`)

const staticAssetRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
const assetsDir = join(staticAssetRoot, 'assets')
const stylesFilePath = join(staticAssetRoot, 'styles.css')
const faviconFilePath = join(staticAssetRoot, 'favicon.ico')

// favicon.ico is binary, so it can't go through readCachedFile (utf8). Read the
// bytes once at module scope and reuse them.
let faviconCache: Uint8Array | null | undefined
const readFaviconBytes = (): Uint8Array | null => {
  if (faviconCache === undefined) {
    try {
      faviconCache = new Uint8Array(readFileSync(faviconFilePath))
    } catch {
      faviconCache = null
    }
  }
  return faviconCache
}

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

// includeBuiltCss は production のときだけ true。開発では抽出済み /assets/*.css は
// 存在せず（Vite が JS 経由で CSS を注入する）、リンクすると 404 になるため出さない。
const toolShellHtml = (title: string, clientScript: string, builtCssHref: string | null) =>
  `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><link rel="icon" href="/favicon.ico" sizes="any"><link rel="stylesheet" href="/styles.css">${builtCssHref ? `<link rel="stylesheet" href="${builtCssHref}">` : ''}</head><body><div id="root"><div class="tool-shell-loading" role="status" aria-label="読み込み中"><div class="tool-shell-spinner"></div></div></div><script type="module" src="${clientScript}"></script></body></html>`

export const createApp = (options: AppOptions = {}) => {
  const app = new Hono()
  const isProduction = process.env.NODE_ENV === 'production'
  const clientScript =
    options.clientScript ??
    (process.env.NODE_ENV === 'production' ? '/assets/client.js' : '/src/client.tsx')
  const promptBuilderClientScript =
    process.env.NODE_ENV === 'production' ? '/assets/client-prompt.js' : '/src/client-prompt.tsx'
  const themeScript =
    options.themeScript ??
    (process.env.NODE_ENV === 'production' ? '/assets/theme.js' : '/src/ui/theme.ts')

  const defaultSecureHeaders = buildSecureHeaders(["'self'"])
  // recharts（credit-csv）と @dnd-kit（prompt-builder）は共にインライン style
  // を使うため、同じ緩和ヘッダーを使い回す。
  const inlineStyleSecureHeaders = buildSecureHeaders(["'self'", "'unsafe-inline'"])

  app.use('*', (c, next) => {
    const path = c.req.path
    const middleware =
      isCreditCsvPath(path) || isPromptBuilderPath(path) ? inlineStyleSecureHeaders : defaultSecureHeaders
    return middleware(c, next)
  })

  app.route(`${CREDIT_CSV_PREFIX}/api`, createCreditCsvRoutes(options.creditCsvStorage))
  app.route(
    `${PROMPT_BUILDER_PREFIX}/api`,
    createPromptWordRoutes(options.promptWordStorage, options.promptHistoryStorage),
  )

  if (process.env.NODE_ENV === 'production') {
    // In development the Vite dev server serves /favicon.ico (see vite.config.ts);
    // in production Hono serves it from src/public/favicon.ico.
    app.get('/favicon.ico', (c) => {
      const bytes = readFaviconBytes()
      if (bytes === null) return c.notFound()
      return c.body(new Uint8Array(bytes), 200, {
        'Content-Type': 'image/x-icon',
        'Cache-Control': 'public, max-age=86400',
      })
    })

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
    return c.html(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Private Tools</title><link rel="icon" href="/favicon.ico" sizes="any"><link rel="stylesheet" href="/styles.css"></head><body>${page}<script type="module" src="${themeScript}"></script></body></html>`)
  })

  const creditCsvShell = () =>
    toolShellHtml('Credit CSV Viewer', clientScript, isProduction ? '/assets/client.css' : null)
  const promptBuilderShell = () =>
    toolShellHtml('Prompt Builder', promptBuilderClientScript, isProduction ? '/assets/client-prompt.css' : null)

  app.get(CREDIT_CSV_PREFIX, (c) => c.html(creditCsvShell()))
  app.get(`${CREDIT_CSV_PREFIX}/*`, (c) => {
    // app.route() flattens the API sub-app's routes into this router without
    // carrying over its own notFound handler, so unmatched API paths would
    // otherwise fall through to this wildcard shell instead of a JSON 404.
    if (c.req.path.startsWith(`${CREDIT_CSV_PREFIX}/api`)) {
      return c.json({ ok: false, error: { message: 'Not found.' } }, 404)
    }
    return c.html(creditCsvShell())
  })

  app.get(PROMPT_BUILDER_PREFIX, (c) => c.html(promptBuilderShell()))
  app.get(`${PROMPT_BUILDER_PREFIX}/*`, (c) => {
    if (c.req.path.startsWith(`${PROMPT_BUILDER_PREFIX}/api`)) {
      return c.json({ ok: false, error: { message: 'Not found.' } }, 404)
    }
    return c.html(promptBuilderShell())
  })

  app.notFound((c) => {
    if (c.req.path.startsWith('/api/')) {
      return c.json({ ok: false, error: { message: 'Not found.' } }, 404)
    }
    return c.html('<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>Not found</title></head><body><main><h1>Not found</h1></main></body></html>', 404)
  })

  // 未処理例外（例: ストレージ層の失敗）を汎用500で握りつぶさず、API パスでは
  // サニタイズ済みメッセージを JSON で返す（トークン等の秘密は storage 側で除外済み）。
  app.onError((err, c) => {
    const message = err instanceof Error ? err.message : 'Internal server error.'
    const path = c.req.path
    if (
      path.startsWith('/api/') ||
      path.startsWith(`${CREDIT_CSV_PREFIX}/api`) ||
      path.startsWith(`${PROMPT_BUILDER_PREFIX}/api`)
    ) {
      return c.json({ ok: false, error: { message } }, 500)
    }
    return c.html('<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>Error</title></head><body><main><h1>Server error</h1></main></body></html>', 500)
  })

  return app
}

const app = createApp()

export default app
