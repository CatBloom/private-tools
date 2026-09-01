import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudflareKvPromptStorage } from './kv-prompt-storage'

const config = { accountId: 'acc123', namespaceId: 'ns456', apiToken: 'secret-token' }
const baseUrl = 'https://api.cloudflare.com/client/v4/accounts/acc123/storage/kv/namespaces/ns456'

describe('CloudflareKvPromptStorage', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('gets words with the expected URL, method, and auth header', async () => {
    const words = [{ id: '1', text: 'foo', description: '' }]
    fetchMock.mockResolvedValue(new Response(JSON.stringify(words), { status: 200 }))
    const storage = new CloudflareKvPromptStorage(config)

    const result = await storage.getWords('base-prompt')

    expect(result).toEqual(words)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${baseUrl}/values/words:base-prompt`)
    expect(init.method).toBe('GET')
    expect(init.headers.Authorization).toBe('Bearer secret-token')
  })

  it('returns an empty array on a 404 get', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }))
    const storage = new CloudflareKvPromptStorage(config)
    expect(await storage.getWords('base-prompt')).toEqual([])
  })

  it('throws a clear error on a non-2xx get response without leaking the token', async () => {
    fetchMock.mockResolvedValue(new Response('server error', { status: 500 }))
    const storage = new CloudflareKvPromptStorage(config)

    let caught: unknown
    try {
      await storage.getWords('base-prompt')
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toContain('500')
    expect((caught as Error).message).not.toContain('secret-token')
  })

  it('rejects an invalid category before making a request', async () => {
    const storage = new CloudflareKvPromptStorage(config)
    await expect(storage.getWords('not-a-category' as never)).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('puts words with the expected URL, method, and body', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
    const storage = new CloudflareKvPromptStorage(config)
    const words = [{ id: '1', text: 'foo', description: 'bar', tag: 'others' as const }]

    const result = await storage.putWords('character-negative', words)

    expect(result).toEqual(words)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${baseUrl}/values/words:character-negative`)
    expect(init.method).toBe('PUT')
    expect(init.headers.Authorization).toBe('Bearer secret-token')
    expect(init.body).toBe(JSON.stringify(words))
  })

  it('throws when a put response is not ok', async () => {
    fetchMock.mockResolvedValue(new Response('bad request', { status: 400 }))
    const storage = new CloudflareKvPromptStorage(config)
    await expect(storage.putWords('base-prompt', [])).rejects.toThrow(/400/)
  })
})
