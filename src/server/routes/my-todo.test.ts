import { Hono } from 'hono'
import { beforeEach, describe, expect, it } from 'vitest'
import type { TodoState } from '../../tools/my-todo/shared/types.js'
import type { TodoStorage } from '../todo-storage/index.js'
import { createMyTodoRoutes } from './my-todo.js'

class InMemoryTodoStorage implements TodoStorage {
  private state: TodoState | null = null

  async getTodos(): Promise<TodoState | null> {
    return this.state
  }

  async putTodos(state: TodoState): Promise<void> {
    this.state = state
  }
}

describe('my-todo routes', () => {
  let app: Hono

  beforeEach(() => {
    app = createMyTodoRoutes(new InMemoryTodoStorage())
  })

  const request = (path: string, init?: RequestInit) => app.request(`http://localhost${path}`, init)

  it('returns an empty initial state when nothing is stored yet', async () => {
    const response = await request('/todos')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { state: { today: [], someday: [], lastRolloverDate: null } },
    })
  })

  it('puts state and returns it from a subsequent get', async () => {
    const state = {
      today: [{ id: '1', text: 'foo', completed: false, createdAt: '2024-01-01T00:00:00.000Z' }],
      someday: [],
      lastRolloverDate: '2024-01-01',
    }
    const putResponse = await request('/todos', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state }),
    })

    expect(putResponse.status).toBe(200)
    await expect(putResponse.json()).resolves.toEqual({ ok: true, data: { state } })

    const getResponse = await request('/todos')
    await expect(getResponse.json()).resolves.toEqual({ ok: true, data: { state } })
  })

  it('rejects a put without a JSON content type', async () => {
    const response = await request('/todos', {
      method: 'PUT',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ state: { today: [], someday: [], lastRolloverDate: null } }),
    })
    expect(response.status).toBe(415)
  })

  it('rejects a put with an invalid state payload', async () => {
    const response = await request('/todos', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: { today: 'nope', someday: [], lastRolloverDate: null } }),
    })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ ok: false, error: { message: 'Invalid state payload.' } })
  })

  it('rejects a todo item missing required fields', async () => {
    const response = await request('/todos', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        state: { today: [{ id: '1', text: 'foo' }], someday: [], lastRolloverDate: null },
      }),
    })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ ok: false, error: { message: 'Invalid state payload.' } })
  })

  it('rejects a state with an invalid lastRolloverDate type', async () => {
    const response = await request('/todos', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: { today: [], someday: [], lastRolloverDate: 123 } }),
    })
    expect(response.status).toBe(400)
  })

  it('rejects a put whose state value is not an object', async () => {
    const response = await request('/todos', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: 'nope' }),
    })
    expect(response.status).toBe(400)
  })

  it('rejects malformed JSON on put', async () => {
    const response = await request('/todos', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    })
    expect(response.status).toBe(400)
  })

  it('rejects a payload with too many total items', async () => {
    const today = Array.from({ length: 501 }, (_, i) => ({
      id: String(i),
      text: 'x',
      completed: false,
      createdAt: '2024-01-01T00:00:00.000Z',
    }))
    const response = await request('/todos', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: { today, someday: [], lastRolloverDate: null } }),
    })
    expect(response.status).toBe(413)
  })

  it('rejects a put whose body exceeds the size limit', async () => {
    const response = await request('/todos', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'content-length': String(5 * 1024 * 1024) },
      body: JSON.stringify({ state: { today: [], someday: [], lastRolloverDate: null } }),
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
