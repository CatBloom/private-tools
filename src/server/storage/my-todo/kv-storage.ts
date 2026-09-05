import type { TodoState } from '../../../tools/my-todo/shared/types.js'
import { CloudflareKvClient } from '../shared/kv-client.js'
import type { CloudflareKvConfig } from '../shared/kv-client.js'
import type { MyTodoStorage } from './types.js'

const KV_KEY = 'todos'

export class CloudflareKvMyTodoStorage implements MyTodoStorage {
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
