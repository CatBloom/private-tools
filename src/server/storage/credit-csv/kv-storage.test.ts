import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudflareKvCreditCsvStorage } from './kv-storage'

const config = { accountId: 'acc123', namespaceId: 'ns456', apiToken: 'secret-token' }
const baseUrl = 'https://api.cloudflare.com/client/v4/accounts/acc123/storage/kv/namespaces/ns456'

describe('CloudflareKvCreditCsvStorage', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('gets a value with the expected URL, method, and auth header', async () => {
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
    const storage = new CloudflareKvCreditCsvStorage(config)

    const bytes = await storage.get('202601.csv')

    expect(bytes).toEqual(new Uint8Array([1, 2, 3]))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${baseUrl}/values/202601.csv`)
    expect(init.method).toBe('GET')
    expect(init.headers.Authorization).toBe('Bearer secret-token')
  })

  it('returns null on a 404 get', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }))
    const storage = new CloudflareKvCreditCsvStorage(config)
    expect(await storage.get('202601.csv')).toBeNull()
  })

  it('throws a clear error on a non-2xx response without leaking the token', async () => {
    fetchMock.mockResolvedValue(new Response('server error', { status: 500 }))
    const storage = new CloudflareKvCreditCsvStorage(config)

    let caught: unknown
    try {
      await storage.get('202601.csv')
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toContain('500')
    expect((caught as Error).message).not.toContain('secret-token')
  })

  it('puts a value with metadata and returns the resulting meta', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
    const storage = new CloudflareKvCreditCsvStorage(config)
    const bytes = new Uint8Array([1, 2, 3])

    const meta = await storage.put('202601.csv', bytes)

    expect(meta.name).toBe('202601.csv')
    expect(meta.size).toBe(3)
    expect(new Date(meta.uploadedAt).toString()).not.toBe('Invalid Date')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${baseUrl}/values/202601.csv`)
    expect(init.method).toBe('PUT')
    expect(init.headers.Authorization).toBe('Bearer secret-token')
    expect(init.body).toBeInstanceOf(FormData)
  })

  it('throws when a put response is not ok', async () => {
    fetchMock.mockResolvedValue(new Response('bad request', { status: 400 }))
    const storage = new CloudflareKvCreditCsvStorage(config)
    await expect(storage.put('202601.csv', new Uint8Array())).rejects.toThrow(/400/)
  })

  it('deletes a value', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }))
    const storage = new CloudflareKvCreditCsvStorage(config)

    await storage.delete('202601.csv')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${baseUrl}/values/202601.csv`)
    expect(init.method).toBe('DELETE')
  })

  it('treats a 404 delete as already-absent, not an error', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }))
    const storage = new CloudflareKvCreditCsvStorage(config)
    await expect(storage.delete('202601.csv')).resolves.toBeUndefined()
  })

  it('lists files built from valid key metadata, ignoring unrelated or incomplete keys', async () => {
    const body = {
      result: [
        { name: '202601.csv', metadata: { size: 10, uploadedAt: '2026-01-01T00:00:00.000Z' } },
        { name: 'not-a-csv-key', metadata: { size: 1, uploadedAt: '2026-01-01T00:00:00.000Z' } },
        { name: '202603.csv' },
      ],
      result_info: { list_complete: true },
    }
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))
    const storage = new CloudflareKvCreditCsvStorage(config)

    const listed = await storage.list()

    expect(listed).toEqual([{ name: '202601.csv', size: 10, uploadedAt: '2026-01-01T00:00:00.000Z' }])
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${baseUrl}/keys`)
    expect(init.method).toBe('GET')
  })

  it('paginates through the cursor until list_complete', async () => {
    const page1 = {
      result: [{ name: '202601.csv', metadata: { size: 1, uploadedAt: '2026-01-01T00:00:00.000Z' } }],
      result_info: { list_complete: false, cursor: 'abc' },
    }
    const page2 = {
      result: [{ name: '202602.csv', metadata: { size: 2, uploadedAt: '2026-02-01T00:00:00.000Z' } }],
      result_info: { list_complete: true },
    }
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(page1), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(page2), { status: 200 }))
    const storage = new CloudflareKvCreditCsvStorage(config)

    const listed = await storage.list()

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toBe(`${baseUrl}/keys?cursor=abc`)
    expect(listed.map((meta) => meta.name)).toEqual(['202601.csv', '202602.csv'])
  })

  it('rejects invalid file names before making a request', async () => {
    const storage = new CloudflareKvCreditCsvStorage(config)
    await expect(storage.get('not-valid')).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
