import type { HistoryEntry } from '../../tools/prompt-builder/shared/types.js'
import type { CloudflareKvPromptConfig } from './kv-prompt-storage.js'
import type { PromptHistoryStorage } from './history-storage.js'

const KV_KEY = 'history'

// Production backend, not yet wired up (Cloudflare KV namespace/token are not
// provisioned for this tool). Verified against a mocked fetch only.
export class CloudflareKvHistoryStorage implements PromptHistoryStorage {
  private readonly baseUrl: string
  private readonly headers: Record<string, string>

  constructor(config: CloudflareKvPromptConfig) {
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/storage/kv/namespaces/${config.namespaceId}`
    this.headers = { Authorization: `Bearer ${config.apiToken}` }
  }

  async getHistory(): Promise<HistoryEntry[]> {
    const response = await this.request(`/values/${KV_KEY}`, { method: 'GET' })
    if (response.status === 404) return []
    if (!response.ok) throw new Error(`Cloudflare KV get failed with status ${response.status}`)
    return JSON.parse(await response.text()) as HistoryEntry[]
  }

  async putHistory(entries: HistoryEntry[]): Promise<HistoryEntry[]> {
    const response = await this.request(`/values/${KV_KEY}`, {
      method: 'PUT',
      body: JSON.stringify(entries),
    })
    if (!response.ok) throw new Error(`Cloudflare KV put failed with status ${response.status}`)
    return entries
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...this.headers, ...(init.headers as Record<string, string> | undefined) },
      })
    } catch (error) {
      throw new Error(`Cloudflare KV request failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
