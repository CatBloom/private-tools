export type CloudflareKvConfig = {
  accountId: string
  namespaceId: string
  apiToken: string
}

// Thin wrapper over the Cloudflare Workers KV REST API. Every tool-specific
// KV storage (credit-csv, prompt words/history, todo) builds the same
// baseUrl/headers/request skeleton on top of this; only the key name, value
// shape, and serialization differ per tool.
export class CloudflareKvClient {
  private readonly baseUrl: string
  private readonly headers: Record<string, string>

  constructor(config: CloudflareKvConfig) {
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/storage/kv/namespaces/${config.namespaceId}`
    this.headers = { Authorization: `Bearer ${config.apiToken}` }
  }

  async request(path: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...this.headers, ...(init.headers as Record<string, string> | undefined) },
      })
    } catch (error) {
      throw new Error(`Cloudflare KV request failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  // Reads a whole key as JSON — the shape used by every tool that stores a
  // single key's worth of data (words/history/todos). credit-csv's multipart
  // value+metadata shape doesn't fit this and builds directly on request().
  async getJson<T>(key: string): Promise<T | null> {
    const response = await this.request(`/values/${key}`, { method: 'GET' })
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`Cloudflare KV get failed with status ${response.status}`)
    return JSON.parse(await response.text()) as T
  }

  async putJson(key: string, value: unknown): Promise<void> {
    const response = await this.request(`/values/${key}`, {
      method: 'PUT',
      body: JSON.stringify(value),
    })
    if (!response.ok) throw new Error(`Cloudflare KV put failed with status ${response.status}`)
  }
}
