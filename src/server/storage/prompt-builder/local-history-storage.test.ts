// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalPromptHistoryStorage } from './local-history-storage'

describe('LocalPromptHistoryStorage', () => {
  let dir: string
  let storage: LocalPromptHistoryStorage

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'private-tools-prompt-builder-'))
    storage = new LocalPromptHistoryStorage(dir)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns an empty array when no history is stored yet', async () => {
    expect(await storage.getHistory()).toEqual([])
  })

  it('round-trips putHistory and getHistory through real file I/O', async () => {
    const entries = [
      { id: '1', name: 'snapshot', createdAt: '2024-01-01T00:00:00.000Z', items: [], target: 'character' as const },
    ]

    const put = await storage.putHistory(entries)
    expect(put).toEqual(entries)

    expect(await storage.getHistory()).toEqual(entries)
  })

  it('creates the storage directory on demand', async () => {
    const nestedStorage = new LocalPromptHistoryStorage(join(dir, 'nested', 'deep'))
    await nestedStorage.putHistory([
      { id: '1', name: '', createdAt: '2024-01-01T00:00:00.000Z', items: [], target: 'base' },
    ])
    expect(await nestedStorage.getHistory()).toHaveLength(1)
  })
})
