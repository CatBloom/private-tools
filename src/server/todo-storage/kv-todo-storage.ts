import type { TodoState } from '../../tools/my-todo/shared/types.js'
import type { TodoStorage } from './todo-storage.js'

export type CloudflareKvTodoConfig = {
  accountId: string
  namespaceId: string
  apiToken: string
}

const KV_KEY = 'todos'

// Production backend, not yet wired up (Cloudflare KV namespace/token are not
// provisioned for this tool). Verified against a mocked fetch only.
export class CloudflareKvTodoStorage implements TodoStorage {
  private readonly baseUrl: string
  private readonly headers: Record<string, string>

  constructor(config: CloudflareKvTodoConfig) {
    this.baseUrl = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/storage/kv/namespaces/${config.namespaceId}`
    this.headers = { Authorization: `Bearer ${config.apiToken}` }
  }

  async getTodos(): Promise<TodoState | null> {
    const response = await this.request(`/values/${KV_KEY}`, { method: 'GET' })
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`Cloudflare KV get failed with status ${response.status}`)
    return JSON.parse(await response.text()) as TodoState
  }

  async putTodos(state: TodoState): Promise<void> {
    const response = await this.request(`/values/${KV_KEY}`, {
      method: 'PUT',
      body: JSON.stringify(state),
    })
    if (!response.ok) throw new Error(`Cloudflare KV put failed with status ${response.status}`)
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
