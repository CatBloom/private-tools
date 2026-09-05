import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, extname, join } from 'node:path'
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { TopPage } from '../ui/TopPage.js'
import { TOOLS } from '../tools/registry.js'
import { createCreditCsvRoutes } from './routes/credit-csv.js'
import { createPromptWordRoutes } from './routes/prompt-builder.js'
import { createMyTodoRoutes } from './routes/my-todo.js'
import type { Storage } from './storage/index.js'
import type { PromptHistoryStorage, PromptWordStorage } from './prompt-storage/index.js'
import type { TodoStorage } from './todo-storage/index.js'

type AppOptions = {
  clientScript?: string
  themeScript?: string
  stylesAsset?: string | null
  assetOverrides?: Record<string, string | null>
  creditCsvStorage?: Storage
  promptWordStorage?: PromptWordStorage
  promptHistoryStorage?: PromptHistoryStorage
  todoStorage?: TodoStorage
}

const CREDIT_CSV_PREFIX = '/tools/credit-csv'
const PROMPT_BUILDER_PREFIX = '/tools/prompt-builder'
const MY_TODO_PREFIX = '/tools/my-todo'

const inlineStylePrefixes = TOOLS.filter((tool) => tool.inlineStyle).map((tool) => tool.path)
const isInlineStylePath = (path: string) =>
  inlineStylePrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
const toolApiPrefixes = TOOLS.map((tool) => `${tool.path}/api`)

const staticAssetRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
const assetsDir = join(staticAssetRoot, 'assets')
const stylesFilePath = join(staticAssetRoot, 'styles.css')
const faviconFilePath = join(staticAssetRoot, 'favicon.ico')

// バイナリなので utf8 の readCachedFile は使えない。モジュールスコープで1度だけ読む。
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

// builtCssHref は production のときだけ渡す（開発では /assets/*.css が存在せず 404 になる）。
const toolShellHtml = (title: string, clientScript: string, builtCssHref: string | null) =>
  `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><link rel="icon" href="/favicon.ico" sizes="any"><link rel="stylesheet" href="/styles.css">${builtCssHref ? `<link rel="stylesheet" href="${builtCssHref}">` : ''}</head><body><div id="root"><div class="tool-shell-loading" role="status" aria-label="読み込み中"><div class="tool-shell-spinner"></div></div></div><script type="module" src="${clientScript}"></script></body></html>`

export const createApp = (options: AppOptions = {}) => {
  const app = new Hono()
  const isProduction = process.env.NODE_ENV === 'production'
  const clientScriptFor = (tool: (typeof TOOLS)[number]) =>
    isProduction ? tool.clientScript.prod : tool.clientScript.dev
  const clientScript = options.clientScript ?? clientScriptFor(TOOLS.find((tool) => tool.id === 'credit-csv')!)
  const promptBuilderClientScript = clientScriptFor(TOOLS.find((tool) => tool.id === 'prompt-builder')!)
  const myTodoClientScript = clientScriptFor(TOOLS.find((tool) => tool.id === 'my-todo')!)
  const themeScript =
    options.themeScript ??
    (process.env.NODE_ENV === 'production' ? '/assets/theme.js' : '/src/ui/theme.ts')

  const defaultSecureHeaders = buildSecureHeaders(["'self'"])
  const inlineStyleSecureHeaders = buildSecureHeaders(["'self'", "'unsafe-inline'"])

  app.use('*', (c, next) => {
    const path = c.req.path
    const middleware = isInlineStylePath(path) ? inlineStyleSecureHeaders : defaultSecureHeaders
    return middleware(c, next)
  })

  app.route(`${CREDIT_CSV_PREFIX}/api`, createCreditCsvRoutes(options.creditCsvStorage))
  app.route(
    `${PROMPT_BUILDER_PREFIX}/api`,
    createPromptWordRoutes(options.promptWordStorage, options.promptHistoryStorage),
  )
  app.route(`${MY_TODO_PREFIX}/api`, createMyTodoRoutes(options.todoStorage))

  if (process.env.NODE_ENV === 'production') {
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

  const clientScriptById: Record<string, string> = {
    'credit-csv': clientScript,
    'prompt-builder': promptBuilderClientScript,
    'my-todo': myTodoClientScript,
  }

  for (const tool of TOOLS) {
    const shell = () => toolShellHtml(tool.name, clientScriptById[tool.id], isProduction ? tool.css.prod : null)

    app.get(tool.path, (c) => c.html(shell()))
    app.get(`${tool.path}/*`, (c) => {
      // app.route() は sub-app の notFound を引き継がないため、未マッチの API パスを明示的に振り分ける。
      if (c.req.path.startsWith(`${tool.path}/api`)) {
        return c.json({ ok: false, error: { message: 'Not found.' } }, 404)
      }
      return c.html(shell())
    })
  }

  app.notFound((c) => {
    if (c.req.path.startsWith('/api/')) {
      return c.json({ ok: false, error: { message: 'Not found.' } }, 404)
    }
    return c.html('<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>Not found</title></head><body><main><h1>Not found</h1></main></body></html>', 404)
  })

  app.onError((err, c) => {
    const message = err instanceof Error ? err.message : 'Internal server error.'
    const path = c.req.path
    if (path.startsWith('/api/') || toolApiPrefixes.some((prefix) => path.startsWith(prefix))) {
      return c.json({ ok: false, error: { message } }, 500)
    }
    return c.html('<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>Error</title></head><body><main><h1>Server error</h1></main></body></html>', 500)
  })

  return app
}

const app = createApp()

export default app
