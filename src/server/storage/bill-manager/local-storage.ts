import { join } from 'node:path'
import type { LedgerState } from '../../../tools/bill-manager/shared/types.js'
import { readJsonFile, resolveDataDir, writeJsonFile } from '../shared/local-fs.js'
import type { BillManagerStorage } from './types.js'

const defaultDir = resolveDataDir('bill-manager')

export class LocalBillManagerStorage implements BillManagerStorage {
  private readonly dir: string

  constructor(dir: string = defaultDir) {
    this.dir = dir
  }

  async getLedger(): Promise<LedgerState | null> {
    return readJsonFile<LedgerState | null>(this.filePath(), null)
  }

  async putLedger(state: LedgerState): Promise<void> {
    await writeJsonFile(this.filePath(), state)
  }

  private filePath(): string {
    return join(this.dir, 'ledger.json')
  }
}
