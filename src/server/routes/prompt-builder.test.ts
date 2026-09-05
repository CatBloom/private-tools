import { Hono } from 'hono'
import { beforeEach, describe, expect, it } from 'vitest'
import type { HistoryEntry, PromptWord } from '../../tools/prompt-builder/shared/types.js'
import type { PromptHistoryStorage, PromptWordStorage } from '../storage/prompt-builder/index.js'
import { createPromptBuilderRoutes } from './prompt-builder.js'

class InMemoryPromptStorage implements PromptWordStorage {
  private words: PromptWord[] = []

  async getWords(): Promise<PromptWord[]> {
    return this.words
  }

  async putWords(words: PromptWord[]): Promise<PromptWord[]> {
    this.words = words
    return words
  }
}

class InMemoryHistoryStorage implements PromptHistoryStorage {
  private entries: HistoryEntry[] = []

  async getHistory(): Promise<HistoryEntry[]> {
    return this.entries
  }

  async putHistory(entries: HistoryEntry[]): Promise<HistoryEntry[]> {
    this.entries = entries
    return entries
  }
}

describe('prompt word routes', () => {
  let app: Hono

  beforeEach(() => {
    app = createPromptBuilderRoutes(new InMemoryPromptStorage(), new InMemoryHistoryStorage())
  })

  const request = (path: string, init?: RequestInit) => app.request(`http://localhost${path}`, init)

  it('returns an empty list when no words are stored yet', async () => {
    const response = await request('/words')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, data: { words: [] } })
  })

  it('puts words and returns them from a subsequent get', async () => {
    const words = [{ id: '1', text: 'foo', description: 'a foo word', tag: 'quality' }]
    const putResponse = await request('/words', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ words }),
    })

    expect(putResponse.status).toBe(200)
    await expect(putResponse.json()).resolves.toEqual({ ok: true, data: { words } })

    const getResponse = await request('/words')
    await expect(getResponse.json()).resolves.toEqual({ ok: true, data: { words } })
  })

  it('rejects a put without a JSON content type', async () => {
    const response = await request('/words', {
      method: 'PUT',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ words: [] }),
    })
    expect(response.status).toBe(415)
  })

  it('rejects a put with an invalid words payload', async () => {
    const response = await request('/words', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ words: [{ id: '1', text: 'foo' }] }),
    })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ ok: false, error: { message: 'Invalid words payload.' } })
  })

  it('rejects a word with no tag', async () => {
    const response = await request('/words', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ words: [{ id: '1', text: 'foo', description: '' }] }),
    })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ ok: false, error: { message: 'Invalid words payload.' } })
  })

  it('rejects a word with an invalid tag', async () => {
    const response = await request('/words', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ words: [{ id: '1', text: 'foo', description: '', tag: 'not-a-tag' }] }),
    })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ ok: false, error: { message: 'Invalid words payload.' } })
  })

  it('accepts a word with a valid tag', async () => {
    const words = [{ id: '1', text: 'foo', description: '', tag: 'expression' }]
    const response = await request('/words', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ words }),
    })
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, data: { words } })
  })

  it('rejects a put whose words value is not an array', async () => {
    const response = await request('/words', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ words: 'nope' }),
    })
    expect(response.status).toBe(400)
  })

  it('rejects malformed JSON on put', async () => {
    const response = await request('/words', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    })
    expect(response.status).toBe(400)
  })

  it('rejects a payload with too many words', async () => {
    const words = Array.from({ length: 2001 }, (_, i) => ({ id: String(i), text: 'x', description: '' }))
    const response = await request('/words', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ words }),
    })
    expect(response.status).toBe(413)
  })

  it('rejects a put whose body exceeds the size limit', async () => {
    const response = await request('/words', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'content-length': String(5 * 1024 * 1024) },
      body: JSON.stringify({ words: [] }),
    })
    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: { message: 'Request body is too large.' },
    })
  })

  it('returns an empty list when no history is stored yet', async () => {
    const response = await request('/history')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, data: { entries: [] } })
  })

  it('puts history entries and returns them from a subsequent get', async () => {
    const entries = [
      {
        id: 'h1',
        name: 'snapshot',
        createdAt: '2024-01-01T00:00:00.000Z',
        items: [{ id: 'i1', wordId: 'w1', text: 'foo', weight: 1 }],
        target: 'character',
      },
    ]
    const putResponse = await request('/history', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries }),
    })

    expect(putResponse.status).toBe(200)
    await expect(putResponse.json()).resolves.toEqual({ ok: true, data: { entries } })

    const getResponse = await request('/history')
    await expect(getResponse.json()).resolves.toEqual({ ok: true, data: { entries } })
  })

  it('rejects a history put without a JSON content type', async () => {
    const response = await request('/history', {
      method: 'PUT',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ entries: [] }),
    })
    expect(response.status).toBe(415)
  })

  it('rejects a history put with an invalid entry payload', async () => {
    const response = await request('/history', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries: [{ id: '1', name: 'x' }] }),
    })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ ok: false, error: { message: 'Invalid history payload.' } })
  })

  it('rejects a history entry with an empty name', async () => {
    const entries = [
      {
        id: 'h1',
        name: '  ',
        createdAt: '2024-01-01T00:00:00.000Z',
        items: [],
        target: 'base',
      },
    ]
    const response = await request('/history', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries }),
    })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ ok: false, error: { message: 'Invalid history payload.' } })
  })

  it('rejects a history entry with no target', async () => {
    const entries = [
      {
        id: 'h1',
        name: 'no target',
        createdAt: '2024-01-01T00:00:00.000Z',
        items: [],
      },
    ]
    const response = await request('/history', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries }),
    })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ ok: false, error: { message: 'Invalid history payload.' } })
  })

  it('rejects a history entry with an invalid target', async () => {
    const entries = [
      {
        id: 'h1',
        name: 'bad target',
        createdAt: '2024-01-01T00:00:00.000Z',
        items: [],
        target: 'not-a-target',
      },
    ]
    const response = await request('/history', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries }),
    })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ ok: false, error: { message: 'Invalid history payload.' } })
  })

  it('rejects a history entry whose output item weight is out of range', async () => {
    // 巨大な weight は復元時に applyNotation の String.repeat で RangeError を招くため弾く
    const entries = [
      {
        id: 'h1',
        name: 'boom',
        createdAt: '2024-01-01T00:00:00.000Z',
        items: [{ id: 'i1', wordId: null, text: 'x', weight: 1e9 }],
        target: 'base',
      },
    ]
    const response = await request('/history', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries }),
    })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ ok: false, error: { message: 'Invalid history payload.' } })
  })

  it('rejects a history put whose entries value is not an array', async () => {
    const response = await request('/history', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries: 'nope' }),
    })
    expect(response.status).toBe(400)
  })

  it('rejects malformed JSON on history put', async () => {
    const response = await request('/history', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    })
    expect(response.status).toBe(400)
  })

  it('rejects a history payload with too many entries', async () => {
    const entries = Array.from({ length: 201 }, (_, i) => ({
      id: String(i),
      name: '',
      createdAt: '2024-01-01T00:00:00.000Z',
      items: [],
      target: 'base',
    }))
    const response = await request('/history', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries }),
    })
    expect(response.status).toBe(413)
  })

  it('rejects a history put whose body exceeds the size limit', async () => {
    const response = await request('/history', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'content-length': String(5 * 1024 * 1024) },
      body: JSON.stringify({ entries: [] }),
    })
    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: { message: 'Request body is too large.' },
    })
  })

  it('returns a JSON 404 for unknown routes', async () => {
    const response = await request('/unknown')
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ ok: false, error: { message: 'Not found.' } })
  })
})
