import type { PromptCategoryId } from '../../tools/prompt-builder/shared/categories.js'
import type { PromptWord } from '../../tools/prompt-builder/shared/types.js'
import { assertValidCategory } from './prompt-storage.js'
import type { PromptWordStorage } from './prompt-storage.js'

export type CloudflareKvPromptConfig = {
  accountId: string
  namespaceId: string
  apiToken: string
}

const kvKey = (category: PromptCategoryId) => `words:${category}`

// Production backend, not yet wired up (Cloudflare KV namespace/token are not
// provisioned for this tool). Verified against a mocked fetch only.
export class CloudflareKvPromptStorage implements PromptWordStorage {
  private readonly baseUrl: string
  private readonly headers: Record<string, string>

  constructor(config: CloudflareKvPromptConfig) {
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/storage/kv/namespaces/${config.namespaceId}`
    this.headers = { Authorization: `Bearer ${config.apiToken}` }
  }

  async getWords(category: PromptCategoryId): Promise<PromptWord[]> {
    assertValidCategory(category)
    const response = await this.request(`/values/${kvKey(category)}`, { method: 'GET' })
    if (response.status === 404) return []
    if (!response.ok) throw new Error(`Cloudflare KV get failed with status ${response.status}`)
    return JSON.parse(await response.text()) as PromptWord[]
  }

  async putWords(category: PromptCategoryId, words: PromptWord[]): Promise<PromptWord[]> {
    assertValidCategory(category)
    const response = await this.request(`/values/${kvKey(category)}`, {
      method: 'PUT',
      body: JSON.stringify(words),
    })
    if (!response.ok) throw new Error(`Cloudflare KV put failed with status ${response.status}`)
    return words
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
