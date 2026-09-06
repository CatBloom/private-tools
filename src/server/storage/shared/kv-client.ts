export type CloudflareKvConfig = {
  accountId: string
  namespaceId: string
  apiToken: string
}

// Cloudflare Workers KV REST API の薄いラッパー。ツール別 KV storage 共通の基盤。
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

  // 1キーに JSON をまるごと格納するツール（words/history/todos）向け。credit-csv の
  // multipart value+metadata はこの形に合わないため request() を直接使う。
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
