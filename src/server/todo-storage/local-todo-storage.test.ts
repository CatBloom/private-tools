// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalTodoStorage } from './local-todo-storage'

describe('LocalTodoStorage', () => {
  let dir: string
  let storage: LocalTodoStorage

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'private-tools-todo-storage-'))
    storage = new LocalTodoStorage(dir)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns null when no state is stored yet', async () => {
    expect(await storage.getTodos()).toBeNull()
  })

  it('round-trips putTodos and getTodos through real file I/O', async () => {
    const state = {
      today: [{ id: '1', text: 'foo', completed: false, createdAt: '2024-01-01T00:00:00.000Z' }],
      someday: [],
      lastRolloverDate: '2024-01-01',
    }

    await storage.putTodos(state)

    expect(await storage.getTodos()).toEqual(state)
  })

  it('creates the storage directory on demand', async () => {
    const nestedStorage = new LocalTodoStorage(join(dir, 'nested', 'deep'))
    const state = { today: [], someday: [], lastRolloverDate: null }
    await nestedStorage.putTodos(state)
    expect(await nestedStorage.getTodos()).toEqual(state)
  })
})
