// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalPromptStorage } from './local-prompt-storage'

describe('LocalPromptStorage', () => {
  let dir: string
  let storage: LocalPromptStorage

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'private-tools-prompt-storage-'))
    storage = new LocalPromptStorage(dir)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns an empty array when no words are stored yet', async () => {
    expect(await storage.getWords()).toEqual([])
  })

  it('round-trips putWords and getWords through real file I/O', async () => {
    const words = [{ id: '1', text: 'foo', description: 'a foo word', tag: 'others' as const }]

    const put = await storage.putWords(words)
    expect(put).toEqual(words)

    expect(await storage.getWords()).toEqual(words)
  })

  it('creates the storage directory on demand', async () => {
    const nestedStorage = new LocalPromptStorage(join(dir, 'nested', 'deep'))
    await nestedStorage.putWords([{ id: '1', text: 'x', description: '', tag: 'others' }])
    expect(await nestedStorage.getWords()).toHaveLength(1)
  })
})
