import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteFile, fetchFileBytes, listFiles, uploadFile } from './api'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('credit-csv api client', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists uploaded files from the full API path', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: true,
        data: { files: [{ name: '202604.csv', size: 12, uploadedAt: '2026-04-01T00:00:00.000Z' }] }
      })
    )

    const files = await listFiles()

    expect(fetchMock).toHaveBeenCalledWith('/tools/credit-csv/api/files')
    expect(files).toEqual([{ name: '202604.csv', size: 12, uploadedAt: '2026-04-01T00:00:00.000Z' }])
  })

  it('uploads a file as multipart form data under field name "file"', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: true, data: { file: { name: '202604.csv', size: 3, uploadedAt: '2026-04-01T00:00:00.000Z' } } })
    )

    const file = new File(['abc'], '202604.csv', { type: 'text/csv' })
    const result = await uploadFile(file)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/tools/credit-csv/api/files')
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get('file')).toBe(file)
    expect(result.name).toBe('202604.csv')
  })

  it('deletes a file by url-encoded name', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: { deleted: 'a b.csv' } }))

    await deleteFile('a b.csv')

    expect(fetchMock).toHaveBeenCalledWith('/tools/credit-csv/api/files/a%20b.csv', { method: 'DELETE' })
  })

  it('fetches raw file bytes', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    fetchMock.mockResolvedValue(new Response(bytes, { status: 200 }))

    const buffer = await fetchFileBytes('202604.csv')

    expect(new Uint8Array(buffer)).toEqual(bytes)
  })

  it('throws the server error message when the API reports failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: false, error: { message: '不正なファイル名です。' } }, 400))

    await expect(deleteFile('bad')).rejects.toThrow('不正なファイル名です。')
  })
})
