import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { secureHeaders } from 'hono/secure-headers'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { z } from 'zod'
import { App } from '../ui/App.js'

const MAX_BODY_BYTES = 16 * 1024

const helloRequestSchema = z
  .object({ name: z.string().trim().min(1).max(50) })
  .strict()

type AppOptions = { clientScript?: string; clientAsset?: string | null; stylesAsset?: string | null }

const clientAssetPath = resolve(process.cwd(), 'src/public/assets/client.js')
const stylesAssetPath = resolve(process.cwd(), 'src/public/styles.css')

const staticAssets = [
  { path: '/assets/client.js', contentType: 'application/javascript; charset=UTF-8', filePath: clientAssetPath, option: 'clientAsset' as const },
  { path: '/styles.css', contentType: 'text/css; charset=UTF-8', filePath: stylesAssetPath, option: 'stylesAsset' as const },
]

const isJsonContentType = (contentType: string | undefined) =>
  contentType?.toLowerCase().split(';', 1)[0] === 'application/json'

const apiError = (message: string, status: 400 | 404 | 413 | 415) =>
  Response.json({ ok: false, error: { message } }, { status })

export const createApp = (options: AppOptions = {}) => {
  const app = new Hono()
  const clientScript =
    options.clientScript ??
    (process.env.NODE_ENV === 'production' ? '/assets/client.js' : '/src/client.tsx')

  app.use(
    '*',
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
        styleSrc: ["'self'"],
      },
      referrerPolicy: 'no-referrer',
      xContentTypeOptions: 'nosniff',
      xFrameOptions: 'DENY',
    }),
  )

  app.get('/', (c) => {
    const page = renderToString(createElement(App))
    return c.html(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>検証用アプリ</title><link rel="stylesheet" href="/styles.css"></head><body><div id="root">${page}</div><script type="module" src="${clientScript}"></script></body></html>`)
  })

  if (process.env.NODE_ENV === 'production') {
    const staticCache = new Map<string, string | null>()

    for (const asset of staticAssets) {
      const override = options[asset.option]
      let content: string | null = override === undefined ? null : override
      if (override === undefined) {
        try {
          content = readFileSync(asset.filePath, 'utf8')
        } catch {
          content = null
        }
      }
      staticCache.set(asset.path, content)

      app.get(asset.path, (c) => {
        const content = staticCache.get(asset.path)
        if (content === null || content === undefined) return c.notFound()
        return c.body(content, 200, { 'Content-Type': asset.contentType })
      })
    }
  }

  app.post(
    '/api/hello',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: () => apiError('Request body is too large.', 413),
    }),
    async (c) => {
    if (!isJsonContentType(c.req.header('content-type'))) {
      return apiError('Unsupported media type.', 415)
    }

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      return apiError('Invalid request.', 400)
    }

    const parsed = helloRequestSchema.safeParse(body)
    if (!parsed.success) {
      return apiError('Invalid request.', 400)
    }

    return c.json({ ok: true, data: { message: `Hello, ${parsed.data.name}!` } })
    },
  )

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
