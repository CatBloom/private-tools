import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudflareKvBillManagerStorage } from './kv-storage'

const config = { accountId: 'acc123', namespaceId: 'ns456', apiToken: 'secret-token' }
const baseUrl = 'https://api.cloudflare.com/client/v4/accounts/acc123/storage/kv/namespaces/ns456'

describe('CloudflareKvBillManagerStorage', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('gets the ledger with the expected URL, method, and auth header', async () => {
    const state = { months: {} }
    fetchMock.mockResolvedValue(new Response(JSON.stringify(state), { status: 200 }))
    const storage = new CloudflareKvBillManagerStorage(config)

    const result = await storage.getLedger()

    expect(result).toEqual(state)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${baseUrl}/values/ledger`)
    expect(init.method).toBe('GET')
    expect(init.headers.Authorization).toBe('Bearer secret-token')
  })

  it('returns null on a 404 get', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }))
    const storage = new CloudflareKvBillManagerStorage(config)
    expect(await storage.getLedger()).toBeNull()
  })

  it('throws a clear error on a non-2xx get response without leaking the token', async () => {
    fetchMock.mockResolvedValue(new Response('server error', { status: 500 }))
    const storage = new CloudflareKvBillManagerStorage(config)

    let caught: unknown
    try {
      await storage.getLedger()
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toContain('500')
    expect((caught as Error).message).not.toContain('secret-token')
  })

  it('puts the ledger with the expected URL, method, and body', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
    const storage = new CloudflareKvBillManagerStorage(config)
    const state = { months: {} }

    await storage.putLedger(state)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${baseUrl}/values/ledger`)
    expect(init.method).toBe('PUT')
    expect(init.headers.Authorization).toBe('Bearer secret-token')
    expect(init.body).toBe(JSON.stringify(state))
  })

  it('throws when a put response is not ok', async () => {
    fetchMock.mockResolvedValue(new Response('bad request', { status: 400 }))
    const storage = new CloudflareKvBillManagerStorage(config)
    await expect(storage.putLedger({ months: {} })).rejects.toThrow(/400/)
  })
})
