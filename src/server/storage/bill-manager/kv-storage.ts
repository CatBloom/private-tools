import type { LedgerState } from '../../../tools/bill-manager/shared/types.js'
import { CloudflareKvClient } from '../shared/kv-client.js'
import type { CloudflareKvConfig } from '../shared/kv-client.js'
import type { BillManagerStorage } from './types.js'

const KV_KEY = 'ledger'

export class CloudflareKvBillManagerStorage implements BillManagerStorage {
  private readonly client: CloudflareKvClient

  constructor(config: CloudflareKvConfig) {
    this.client = new CloudflareKvClient(config)
  }

  async getLedger(): Promise<LedgerState | null> {
    return this.client.getJson<LedgerState>(KV_KEY)
  }

  async putLedger(state: LedgerState): Promise<void> {
    await this.client.putJson(KV_KEY, state)
  }
}
