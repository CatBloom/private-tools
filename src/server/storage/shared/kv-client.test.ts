import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudflareKvClient } from './kv-client'

const config = { accountId: 'acc123', namespaceId: 'ns456', apiToken: 'secret-token' }
const baseUrl = 'https://api.cloudflare.com/client/v4/accounts/acc123/storage/kv/namespaces/ns456'

describe('CloudflareKvClient', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('request', () => {
    it('builds the URL from accountId/namespaceId and merges the auth header', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
      const client = new CloudflareKvClient(config)

      await client.request('/values/foo', { method: 'GET', headers: { 'X-Extra': '1' } })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe(`${baseUrl}/values/foo`)
      expect(init.method).toBe('GET')
      expect(init.headers.Authorization).toBe('Bearer secret-token')
      expect(init.headers['X-Extra']).toBe('1')
    })

    it('wraps a network failure without leaking the token', async () => {
      fetchMock.mockRejectedValue(new Error('secret-token leaked here? no.'))
      const client = new CloudflareKvClient(config)

      await expect(client.request('/values/foo', { method: 'GET' })).rejects.toThrow(
        'Cloudflare KV request failed',
      )
    })
  })

  describe('getJson', () => {
    it('parses the JSON body on a 2xx response', async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ a: 1 }), { status: 200 }))
      const client = new CloudflareKvClient(config)

      const result = await client.getJson<{ a: number }>('foo')

      expect(result).toEqual({ a: 1 })
      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe(`${baseUrl}/values/foo`)
      expect(init.method).toBe('GET')
    })

    it('returns null on a 404', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 404 }))
      const client = new CloudflareKvClient(config)
      expect(await client.getJson('foo')).toBeNull()
    })

    it('throws a clear error on a non-2xx response without leaking the token', async () => {
      fetchMock.mockResolvedValue(new Response('server error', { status: 500 }))
      const client = new CloudflareKvClient(config)

      let caught: unknown
      try {
        await client.getJson('foo')
      } catch (error) {
        caught = error
      }

      expect(caught).toBeInstanceOf(Error)
      expect((caught as Error).message).toContain('500')
      expect((caught as Error).message).not.toContain('secret-token')
    })
  })

  describe('putJson', () => {
    it('PUTs the JSON-serialized value', async () => {
      fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
      const client = new CloudflareKvClient(config)

      await client.putJson('foo', { a: 1 })

      const [url, init] = fetchMock.mock.calls[0]
      expect(url).toBe(`${baseUrl}/values/foo`)
      expect(init.method).toBe('PUT')
      expect(init.headers.Authorization).toBe('Bearer secret-token')
      expect(init.body).toBe(JSON.stringify({ a: 1 }))
    })

    it('throws when the response is not ok', async () => {
      fetchMock.mockResolvedValue(new Response('bad request', { status: 400 }))
      const client = new CloudflareKvClient(config)
      await expect(client.putJson('foo', {})).rejects.toThrow(/400/)
    })
  })
})
