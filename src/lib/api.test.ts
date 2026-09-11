import { describe, expect, it } from 'vitest'
import { keepaliveInit, readResult } from './api'

const jsonResponse = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status })

describe('readResult', () => {
  it('returns data when ok:true', async () => {
    const response = jsonResponse({ ok: true, data: { value: 1 } })
    await expect(readResult<{ value: number }>(response)).resolves.toEqual({ value: 1 })
  })

  it('throws the server error message when ok:false', async () => {
    const response = jsonResponse({ ok: false, error: { message: '不正なリクエストです。' } })
    await expect(readResult(response)).rejects.toThrow('不正なリクエストです。')
  })

  it('throws a status-based message when the body is not valid JSON', async () => {
    const response = new Response('not json', { status: 500 })
    await expect(readResult(response)).rejects.toThrow('サーバーとの通信に失敗しました。(status: 500)')
  })
})

describe('keepaliveInit', () => {
  it('includes keepalive:true for a body at or under the 60KiB limit', () => {
    const body = 'a'.repeat(60 * 1024)
    expect(keepaliveInit(body)).toEqual({ keepalive: true })
  })

  it('omits keepalive for a body over the 60KiB limit', () => {
    const body = 'a'.repeat(60 * 1024 + 1)
    expect(keepaliveInit(body)).toEqual({})
  })
})
