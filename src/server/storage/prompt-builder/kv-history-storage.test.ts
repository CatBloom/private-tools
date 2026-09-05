import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudflareKvPromptHistoryStorage } from './kv-history-storage'

const config = { accountId: 'acc123', namespaceId: 'ns456', apiToken: 'secret-token' }
const baseUrl = 'https://api.cloudflare.com/client/v4/accounts/acc123/storage/kv/namespaces/ns456'

describe('CloudflareKvPromptHistoryStorage', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('gets history with the expected URL, method, and auth header', async () => {
    const entries = [{ id: '1', name: 'snapshot', createdAt: '2024-01-01T00:00:00.000Z', items: [], target: 'base' }]
    fetchMock.mockResolvedValue(new Response(JSON.stringify(entries), { status: 200 }))
    const storage = new CloudflareKvPromptHistoryStorage(config)

    const result = await storage.getHistory()

    expect(result).toEqual(entries)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${baseUrl}/values/history`)
    expect(init.method).toBe('GET')
    expect(init.headers.Authorization).toBe('Bearer secret-token')
  })

  it('returns an empty array on a 404 get', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }))
    const storage = new CloudflareKvPromptHistoryStorage(config)
    expect(await storage.getHistory()).toEqual([])
  })

  it('throws a clear error on a non-2xx get response without leaking the token', async () => {
    fetchMock.mockResolvedValue(new Response('server error', { status: 500 }))
    const storage = new CloudflareKvPromptHistoryStorage(config)

    let caught: unknown
    try {
      await storage.getHistory()
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toContain('500')
    expect((caught as Error).message).not.toContain('secret-token')
  })

  it('puts history with the expected URL, method, and body', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
    const storage = new CloudflareKvPromptHistoryStorage(config)
    const entries = [{ id: '1', name: '', createdAt: '2024-01-01T00:00:00.000Z', items: [], target: 'negative' as const }]

    const result = await storage.putHistory(entries)

    expect(result).toEqual(entries)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${baseUrl}/values/history`)
    expect(init.method).toBe('PUT')
    expect(init.headers.Authorization).toBe('Bearer secret-token')
    expect(init.body).toBe(JSON.stringify(entries))
  })

  it('throws when a put response is not ok', async () => {
    fetchMock.mockResolvedValue(new Response('bad request', { status: 400 }))
    const storage = new CloudflareKvPromptHistoryStorage(config)
    await expect(storage.putHistory([])).rejects.toThrow(/400/)
  })
})
