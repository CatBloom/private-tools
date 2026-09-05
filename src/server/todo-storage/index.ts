import { CloudflareKvTodoStorage } from './kv-todo-storage.js'
import { LocalTodoStorage } from './local-todo-storage.js'
import type { TodoStorage } from './todo-storage.js'

export type { TodoStorage } from './todo-storage.js'
export { CloudflareKvTodoStorage } from './kv-todo-storage.js'
export { LocalTodoStorage } from './local-todo-storage.js'

// Cloudflare KV is used only once its namespace/token are provisioned;
// until then every environment falls back to the local filesystem.
export const selectTodoStorage = (): TodoStorage => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const namespaceId = process.env.CLOUDFLARE_KV_TODO_NAMESPACE_ID
  const apiToken = process.env.CLOUDFLARE_KV_API_TOKEN

  if (accountId && namespaceId && apiToken) {
    console.log('[todo-storage] using CloudflareKvTodoStorage')
    return new CloudflareKvTodoStorage({ accountId, namespaceId, apiToken })
  }

  console.log('[todo-storage] using LocalTodoStorage (Cloudflare KV env vars not set)')
  return new LocalTodoStorage()
}
