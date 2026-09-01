// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalHistoryStorage } from './local-history-storage'

describe('LocalHistoryStorage', () => {
  let dir: string
  let storage: LocalHistoryStorage

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'private-tools-history-storage-'))
    storage = new LocalHistoryStorage(dir)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns an empty array for a category with no history yet', async () => {
    expect(await storage.getHistory('base-prompt')).toEqual([])
  })

  it('round-trips putHistory and getHistory through real file I/O', async () => {
    const entries = [{ id: '1', name: 'snapshot', createdAt: '2024-01-01T00:00:00.000Z', items: [] }]

    const put = await storage.putHistory('character-prompt', entries)
    expect(put).toEqual(entries)

    expect(await storage.getHistory('character-prompt')).toEqual(entries)
    expect(await storage.getHistory('base-negative')).toEqual([])
  })

  it('creates the storage directory on demand', async () => {
    const nestedStorage = new LocalHistoryStorage(join(dir, 'nested', 'deep'))
    await nestedStorage.putHistory('base-prompt', [{ id: '1', name: '', createdAt: '2024-01-01T00:00:00.000Z', items: [] }])
    expect(await nestedStorage.getHistory('base-prompt')).toHaveLength(1)
  })

  it('rejects an invalid category', async () => {
    await expect(storage.getHistory('not-a-category' as never)).rejects.toThrow()
    await expect(storage.putHistory('not-a-category' as never, [])).rejects.toThrow()
  })
})
