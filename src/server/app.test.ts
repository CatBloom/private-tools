import { describe, expect, it } from 'vitest'
import app from '../index'
import { createApp } from './app'

const request = (path: string, init?: RequestInit) => app.request(`http://localhost${path}`, init)

describe('server application', () => {
  it('serves SSR through the Vercel entry with its development client and security headers', async () => {
    const response = await request('/')
    const html = await response.text()

    expect(response.status).toBe(200)
    expect(html).toContain('<title>検証用アプリ</title>')
    expect(html).toContain('<h1 id="page-title">検証用アプリ</h1>')
    expect(html).toContain('src="/src/client.tsx"')
    const csp = response.headers.get('content-security-policy')
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(csp).not.toContain("'unsafe-inline'")
  })

  it('allows the Vite React Refresh inline preamble only in development', async () => {
    const previousNodeEnv = process.env.NODE_ENV
    try {
      process.env.NODE_ENV = 'development'
      const response = await createApp().request('http://localhost/')
      const csp = response.headers.get('content-security-policy')

      expect(csp).toContain("script-src 'self' 'unsafe-inline'")
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV
      } else {
        process.env.NODE_ENV = previousNodeEnv
      }
    }
  })

  it('returns a trimmed greeting for valid JSON', async () => {
    const response = await request('/api/hello', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ name: '  Ada  ' }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, data: { message: 'Hello, Ada!' } })
  })

  it.each([{ name: '' }, { name: 'x'.repeat(51) }, { name: 'Ada', extra: true }, {}])(
    'rejects invalid input without exposing it',
    async (body) => {
      const response = await request('/api/hello', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({ ok: false, error: { message: 'Invalid request.' } })
    },
  )

  it('rejects malformed JSON', async () => {
    const response = await request('/api/hello', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    })

    expect(response.status).toBe(400)
  })

  it('requires JSON content type', async () => {
    const response = await request('/api/hello', { method: 'POST', body: 'name=Ada' })
    expect(response.status).toBe(415)
  })

  it('rejects request bodies over 16 KiB', async () => {
    const response = await request('/api/hello', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'x', padding: 'a'.repeat(16 * 1024) }),
    })
    expect(response.status).toBe(413)
  })

  it('rejects an oversized stream without a Content-Length header', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`{"name":"${'a'.repeat(16 * 1024)}"}`))
        controller.close()
      },
    })
    const requestWithStream = new Request(
      'http://localhost/api/hello',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        duplex: 'half',
      } as RequestInit & { duplex: 'half' },
    )

    expect(requestWithStream.headers.has('content-length')).toBe(false)
    const response = await app.request(requestWithStream)
    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toEqual({ ok: false, error: { message: 'Request body is too large.' } })
  })

  it('keeps API and HTML 404 responses separate', async () => {
    const [apiResponse, htmlResponse] = await Promise.all([request('/api/missing'), request('/missing')])

    expect(apiResponse.status).toBe(404)
    await expect(apiResponse.json()).resolves.toEqual({ ok: false, error: { message: 'Not found.' } })
    expect(htmlResponse.status).toBe(404)
    expect(htmlResponse.headers.get('content-type')).toContain('text/html')
  })
})
