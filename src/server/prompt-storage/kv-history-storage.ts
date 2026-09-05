import type { HistoryEntry } from '../../tools/prompt-builder/shared/types.js'
import { CloudflareKvClient } from '../shared/kv-client.js'
import type { CloudflareKvConfig } from '../shared/kv-client.js'
import type { PromptHistoryStorage } from './history-storage.js'

const KV_KEY = 'history'

// Production backend, not yet wired up (Cloudflare KV namespace/token are not
// provisioned for this tool). Verified against a mocked fetch only.
export class CloudflareKvHistoryStorage implements PromptHistoryStorage {
  private readonly client: CloudflareKvClient

  constructor(config: CloudflareKvConfig) {
    this.client = new CloudflareKvClient(config)
  }

  async getHistory(): Promise<HistoryEntry[]> {
    return (await this.client.getJson<HistoryEntry[]>(KV_KEY)) ?? []
  }

  async putHistory(entries: HistoryEntry[]): Promise<HistoryEntry[]> {
    await this.client.putJson(KV_KEY, entries)
    return entries
  }
}
