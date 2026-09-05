import type { TodoState } from '../../tools/my-todo/shared/types.js'
import { CloudflareKvClient } from '../shared/kv-client.js'
import type { CloudflareKvConfig } from '../shared/kv-client.js'
import type { TodoStorage } from './todo-storage.js'

const KV_KEY = 'todos'

// Production backend, not yet wired up (Cloudflare KV namespace/token are not
// provisioned for this tool). Verified against a mocked fetch only.
export class CloudflareKvTodoStorage implements TodoStorage {
  private readonly client: CloudflareKvClient

  constructor(config: CloudflareKvConfig) {
    this.client = new CloudflareKvClient(config)
  }

  async getTodos(): Promise<TodoState | null> {
    return this.client.getJson<TodoState>(KV_KEY)
  }

  async putTodos(state: TodoState): Promise<void> {
    await this.client.putJson(KV_KEY, state)
  }
}
