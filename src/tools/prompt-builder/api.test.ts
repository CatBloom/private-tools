import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { putWords } from './api'
import type { PromptWord } from './shared/types'

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('prompt-builder api client', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('passes keepalive:true when the body is within the fetch keepalive limit', async () => {
    const words: PromptWord[] = [{ id: 'w1', text: 'small', description: '', tag: 'others' }]
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: { words } }))

    await putWords(words, { keepalive: true })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.keepalive).toBe(true)
  })

  it('omits keepalive when the body would exceed the fetch keepalive limit', async () => {
    const words: PromptWord[] = [{ id: 'w1', text: 'x'.repeat(70 * 1024), description: '', tag: 'others' }]
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, data: { words } }))

    await putWords(words, { keepalive: true })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.keepalive).toBeUndefined()
  })
})
