// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalBillManagerStorage } from './local-storage'

describe('LocalBillManagerStorage', () => {
  let dir: string
  let storage: LocalBillManagerStorage

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'private-tools-bill-manager-'))
    storage = new LocalBillManagerStorage(dir)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('returns null when no state is stored yet', async () => {
    expect(await storage.getLedger()).toBeNull()
  })

  it('round-trips putLedger and getLedger through real file I/O', async () => {
    const state = {
      months: {
        '202401': [{ id: '1', name: '家賃', amount: 80000, variable: false, carryOver: true }],
      },
    }

    await storage.putLedger(state)

    expect(await storage.getLedger()).toEqual(state)
  })

  it('creates the storage directory on demand', async () => {
    const nestedStorage = new LocalBillManagerStorage(join(dir, 'nested', 'deep'))
    const state = { months: {} }
    await nestedStorage.putLedger(state)
    expect(await nestedStorage.getLedger()).toEqual(state)
  })
})
