// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalCreditCsvStorage } from '../storage/credit-csv/local-storage.js'
import { createCreditCsvRoutes } from './credit-csv.js'

describe('credit CSV routes', () => {
  let dir: string
  let app: Hono

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'private-tools-credit-csv-'))
    app = new Hono()
    app.route('/', createCreditCsvRoutes(new LocalCreditCsvStorage(dir)))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  const request = (path: string, init?: RequestInit) => app.request(`http://localhost${path}`, init)

  const uploadFormData = (name: string, bytes: Uint8Array) => {
    const formData = new FormData()
    formData.set('file', new File([new Uint8Array(bytes)], name))
    return formData
  }

  it('returns an empty list when no files have been uploaded', async () => {
    const response = await request('/files')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, data: { files: [] } })
  })

  it('uploads a file and shows it in the list', async () => {
    const bytes = new TextEncoder().encode('a,b,c\n1,2,3\n')
    const uploadResponse = await request('/files', { method: 'POST', body: uploadFormData('202601.csv', bytes) })

    expect(uploadResponse.status).toBe(200)
    const uploadBody = await uploadResponse.json()
    expect(uploadBody.ok).toBe(true)
    expect(uploadBody.data.file).toMatchObject({ name: '202601.csv', size: bytes.byteLength })

    const listResponse = await request('/files')
    await expect(listResponse.json()).resolves.toEqual({ ok: true, data: { files: [uploadBody.data.file] } })
  })

  it.each(['2026.csv', '../x.csv', 'abc.csv'])('rejects an invalid file name %j on upload', async (name) => {
    const response = await request('/files', {
      method: 'POST',
      body: uploadFormData(name, new Uint8Array([1, 2, 3])),
    })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ ok: false, error: { message: 'Invalid file name.' } })
  })

  it('rejects an upload over 4 MiB', async () => {
    const bytes = new Uint8Array(4 * 1024 * 1024 + 1)
    const response = await request('/files', { method: 'POST', body: uploadFormData('202601.csv', bytes) })
    expect(response.status).toBe(413)
  })

  it('rejects an upload without a multipart content type', async () => {
    const response = await request('/files', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ file: 'nope' }),
    })
    expect(response.status).toBe(415)
  })

  it('returns the raw bytes of an uploaded file', async () => {
    const bytes = new Uint8Array([0x82, 0xa0, 0x0d, 0x0a]) // Shift_JIS bytes, not decoded
    await request('/files', { method: 'POST', body: uploadFormData('202602.csv', bytes) })

    const response = await request('/files/202602.csv')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/csv; charset=shift_jis')
    const body = new Uint8Array(await response.arrayBuffer())
    expect(body).toEqual(bytes)
  })

  it('returns 404 for a file that does not exist', async () => {
    const response = await request('/files/209912.csv')
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ ok: false, error: { message: 'Not found.' } })
  })

  it('rejects an invalid file name on get and delete', async () => {
    const getResponse = await request('/files/2026.csv')
    expect(getResponse.status).toBe(400)

    const deleteResponse = await request('/files/2026.csv', { method: 'DELETE' })
    expect(deleteResponse.status).toBe(400)
  })

  it('deletes a file and removes it from the list', async () => {
    await request('/files', { method: 'POST', body: uploadFormData('202603.csv', new Uint8Array([1, 2, 3])) })

    const deleteResponse = await request('/files/202603.csv', { method: 'DELETE' })
    expect(deleteResponse.status).toBe(200)
    await expect(deleteResponse.json()).resolves.toEqual({ ok: true, data: { deleted: '202603.csv' } })

    const listResponse = await request('/files')
    await expect(listResponse.json()).resolves.toEqual({ ok: true, data: { files: [] } })
  })
})
