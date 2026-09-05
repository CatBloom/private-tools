// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalCreditCsvStorage } from './local-storage'

describe('LocalCreditCsvStorage', () => {
  let dir: string
  let storage: LocalCreditCsvStorage

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'private-tools-credit-csv-'))
    storage = new LocalCreditCsvStorage(dir)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('round-trips put, list, get, and delete through real file I/O', async () => {
    const bytes = new TextEncoder().encode('a,b,c\n1,2,3\n')

    const meta = await storage.put('202601.csv', bytes)
    expect(meta.name).toBe('202601.csv')
    expect(meta.size).toBe(bytes.byteLength)
    expect(new Date(meta.uploadedAt).toString()).not.toBe('Invalid Date')

    expect(await storage.list()).toEqual([meta])
    expect(await storage.get('202601.csv')).toEqual(bytes)

    await storage.delete('202601.csv')
    expect(await storage.get('202601.csv')).toBeNull()
    expect(await storage.list()).toEqual([])
  })

  it('returns null when getting a file that does not exist', async () => {
    expect(await storage.get('209912.csv')).toBeNull()
  })

  it('does not throw when deleting a file that does not exist', async () => {
    await expect(storage.delete('209912.csv')).resolves.toBeUndefined()
  })

  it('creates the storage directory on demand', async () => {
    const nestedStorage = new LocalCreditCsvStorage(join(dir, 'nested', 'deep'))
    await nestedStorage.put('202601.csv', new Uint8Array([1, 2, 3]))
    expect(await nestedStorage.list()).toHaveLength(1)
  })

  it.each(['../evil.csv', '2026.csv', '20261.csv', '2026013.csv', 'abcdef.csv', '202601.CSV', '202601.txt'])(
    'rejects the invalid file name %j',
    async (name) => {
      await expect(storage.put(name, new Uint8Array())).rejects.toThrow()
      await expect(storage.get(name)).rejects.toThrow()
      await expect(storage.delete(name)).rejects.toThrow()
    },
  )
})
