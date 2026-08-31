import { Hono } from 'hono'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PromptCategoryId } from '../../tools/prompt-builder/shared/categories.js'
import type { HistoryEntry, PromptWord } from '../../tools/prompt-builder/shared/types.js'
import type { PromptHistoryStorage, PromptWordStorage } from '../prompt-storage/index.js'
import { createPromptWordRoutes } from './prompt-builder.js'

class InMemoryPromptStorage implements PromptWordStorage {
  private words = new Map<PromptCategoryId, PromptWord[]>()

  async getWords(category: PromptCategoryId): Promise<PromptWord[]> {
    return this.words.get(category) ?? []
  }

  async putWords(category: PromptCategoryId, words: PromptWord[]): Promise<PromptWord[]> {
    this.words.set(category, words)
    return words
  }
}

class InMemoryHistoryStorage implements PromptHistoryStorage {
  private entries = new Map<PromptCategoryId, HistoryEntry[]>()

  async getHistory(category: PromptCategoryId): Promise<HistoryEntry[]> {
    return this.entries.get(category) ?? []
  }

  async putHistory(category: PromptCategoryId, entries: HistoryEntry[]): Promise<HistoryEntry[]> {
    this.entries.set(category, entries)
    return entries
  }
}

describe('prompt word routes', () => {
  let app: Hono

  beforeEach(() => {
    app = createPromptWordRoutes(new InMemoryPromptStorage(), new InMemoryHistoryStorage())
  })

  const request = (path: string, init?: RequestInit) => app.request(`http://localhost${path}`, init)

  it('returns an empty list for a category with no words yet', async () => {
    const response = await request('/words/base-prompt')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, data: { words: [] } })
  })

  it('rejects an invalid category on get', async () => {
    const response = await request('/words/not-a-category')
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ ok: false, error: { message: 'Invalid category.' } })
  })

  it('puts words and returns them from a subsequent get', async () => {
    const words = [{ id: '1', text: 'foo', description: 'a foo word' }]
    const putResponse = await request('/words/character-prompt', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ words }),
    })

    expect(putResponse.status).toBe(200)
    await expect(putResponse.json()).resolves.toEqual({ ok: true, data: { words } })

    const getResponse = await request('/words/character-prompt')
    await expect(getResponse.json()).resolves.toEqual({ ok: true, data: { words } })
  })

  it('rejects an invalid category on put', async () => {
    const response = await request('/words/not-a-category', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ words: [] }),
    })
    expect(response.status).toBe(400)
  })

  it('rejects a put without a JSON content type', async () => {
    const response = await request('/words/base-prompt', {
      method: 'PUT',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ words: [] }),
    })
    expect(response.status).toBe(415)
  })

  it('rejects a put with an invalid words payload', async () => {
    const response = await request('/words/base-prompt', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ words: [{ id: '1', text: 'foo' }] }),
    })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ ok: false, error: { message: 'Invalid words payload.' } })
  })

  it('rejects a put whose words value is not an array', async () => {
    const response = await request('/words/base-prompt', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ words: 'nope' }),
    })
    expect(response.status).toBe(400)
  })

  it('rejects malformed JSON on put', async () => {
    const response = await request('/words/base-prompt', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    })
    expect(response.status).toBe(400)
  })

  it('rejects a payload with too many words', async () => {
    const words = Array.from({ length: 2001 }, (_, i) => ({ id: String(i), text: 'x', description: '' }))
    const response = await request('/words/base-prompt', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ words }),
    })
    expect(response.status).toBe(413)
  })

  it('rejects a put whose body exceeds the size limit', async () => {
    const response = await request('/words/base-prompt', {
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

  it('returns an empty list for a category with no history yet', async () => {
    const response = await request('/history/base-prompt')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, data: { entries: [] } })
  })

  it('rejects an invalid category on history get', async () => {
    const response = await request('/history/not-a-category')
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ ok: false, error: { message: 'Invalid category.' } })
  })

  it('puts history entries and returns them from a subsequent get', async () => {
    const entries = [
      {
        id: 'h1',
        name: 'snapshot',
        createdAt: '2024-01-01T00:00:00.000Z',
        items: [{ id: 'i1', wordId: 'w1', text: 'foo', weight: 1 }],
      },
    ]
    const putResponse = await request('/history/character-prompt', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries }),
    })

    expect(putResponse.status).toBe(200)
    await expect(putResponse.json()).resolves.toEqual({ ok: true, data: { entries } })

    const getResponse = await request('/history/character-prompt')
    await expect(getResponse.json()).resolves.toEqual({ ok: true, data: { entries } })
  })

  it('rejects an invalid category on history put', async () => {
    const response = await request('/history/not-a-category', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries: [] }),
    })
    expect(response.status).toBe(400)
  })

  it('rejects a history put without a JSON content type', async () => {
    const response = await request('/history/base-prompt', {
      method: 'PUT',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ entries: [] }),
    })
    expect(response.status).toBe(415)
  })

  it('rejects a history put with an invalid entry payload', async () => {
    const response = await request('/history/base-prompt', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries: [{ id: '1', name: 'x' }] }),
    })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ ok: false, error: { message: 'Invalid history payload.' } })
  })

  it('rejects a history put whose entries value is not an array', async () => {
    const response = await request('/history/base-prompt', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries: 'nope' }),
    })
    expect(response.status).toBe(400)
  })

  it('rejects malformed JSON on history put', async () => {
    const response = await request('/history/base-prompt', {
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
    }))
    const response = await request('/history/base-prompt', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ entries }),
    })
    expect(response.status).toBe(413)
  })

  it('rejects a history put whose body exceeds the size limit', async () => {
    const response = await request('/history/base-prompt', {
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
