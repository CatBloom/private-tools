import { Hono } from 'hono'
import { beforeEach, describe, expect, it } from 'vitest'
import { InMemoryBillManagerStorage } from '../../test/in-memory-storage.js'
import { createBillManagerRoutes } from './bill-manager.js'

const validEntry = { id: '1', name: '家賃', amount: 80000, variable: false, carryOver: true }

describe('bill-manager routes', () => {
  let app: Hono

  beforeEach(() => {
    app = createBillManagerRoutes(new InMemoryBillManagerStorage())
  })

  const request = (path: string, init?: RequestInit) => app.request(`http://localhost${path}`, init)

  it('returns an empty initial state when nothing is stored yet', async () => {
    const response = await request('/ledger')
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, data: { state: { months: {} } } })
  })

  it('puts state and returns it from a subsequent get', async () => {
    const state = { months: { '202401': [validEntry] } }
    const putResponse = await request('/ledger', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state }),
    })

    expect(putResponse.status).toBe(200)
    await expect(putResponse.json()).resolves.toEqual({ ok: true, data: { state } })

    const getResponse = await request('/ledger')
    await expect(getResponse.json()).resolves.toEqual({ ok: true, data: { state } })
  })

  it('accepts a null amount', async () => {
    const state = { months: { '202401': [{ ...validEntry, amount: null }] } }
    const response = await request('/ledger', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state }),
    })
    expect(response.status).toBe(200)
  })

  it('rejects a put without a JSON content type', async () => {
    const response = await request('/ledger', {
      method: 'PUT',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ state: { months: {} } }),
    })
    expect(response.status).toBe(415)
  })

  it('rejects malformed JSON on put', async () => {
    const response = await request('/ledger', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    })
    expect(response.status).toBe(400)
  })

  it('rejects a put whose state value is not an object', async () => {
    const response = await request('/ledger', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: 'nope' }),
    })
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ ok: false, error: { message: 'Invalid state payload.' } })
  })

  it('rejects a months value that is an array instead of a plain object', async () => {
    const response = await request('/ledger', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: { months: [] } }),
    })
    expect(response.status).toBe(400)
  })

  it('rejects an invalid month key', async () => {
    const response = await request('/ledger', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: { months: { '2024-01': [validEntry] } } }),
    })
    expect(response.status).toBe(400)
  })

  it('rejects a month key with an invalid month number', async () => {
    const response = await request('/ledger', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: { months: { '202413': [validEntry] } } }),
    })
    expect(response.status).toBe(400)
  })

  it('rejects an entry with a negative amount', async () => {
    const response = await request('/ledger', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: { months: { '202401': [{ ...validEntry, amount: -1 }] } } }),
    })
    expect(response.status).toBe(400)
  })

  it('rejects an entry with a non-integer amount', async () => {
    const response = await request('/ledger', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: { months: { '202401': [{ ...validEntry, amount: 100.5 }] } } }),
    })
    expect(response.status).toBe(400)
  })

  it('rejects an entry with an amount above the maximum', async () => {
    const response = await request('/ledger', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: { months: { '202401': [{ ...validEntry, amount: 1_000_000_001 }] } } }),
    })
    expect(response.status).toBe(400)
  })

  it('rejects an entry with an empty id', async () => {
    const response = await request('/ledger', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: { months: { '202401': [{ ...validEntry, id: '' }] } } }),
    })
    expect(response.status).toBe(400)
  })

  it('rejects an entry with a non-boolean variable field', async () => {
    const response = await request('/ledger', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: { months: { '202401': [{ ...validEntry, variable: 'no' }] } } }),
    })
    expect(response.status).toBe(400)
  })

  it('rejects a name longer than the maximum length', async () => {
    const response = await request('/ledger', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: { months: { '202401': [{ ...validEntry, name: 'x'.repeat(101) }] } } }),
    })
    expect(response.status).toBe(400)
  })

  it('rejects a payload with too many months', async () => {
    const months: Record<string, unknown> = {}
    for (let year = 2000; year < 2021; year += 1) {
      for (let month = 1; month <= 12; month += 1) {
        months[`${year}${String(month).padStart(2, '0')}`] = []
      }
    }
    const response = await request('/ledger', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: { months } }),
    })
    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: { message: 'Too many months or entries.' },
    })
  })

  it('rejects a month with too many entries', async () => {
    const entries = Array.from({ length: 51 }, (_, i) => ({ ...validEntry, id: String(i) }))
    const response = await request('/ledger', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: { months: { '202401': entries } } }),
    })
    expect(response.status).toBe(413)
  })

  it('rejects a put whose body exceeds the size limit', async () => {
    const response = await request('/ledger', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'content-length': String(5 * 1024 * 1024) },
      body: JSON.stringify({ state: { months: {} } }),
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
