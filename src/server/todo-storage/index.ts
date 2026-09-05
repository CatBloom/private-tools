import { selectByEnv } from '../shared/select-storage.js'
import { CloudflareKvTodoStorage } from './kv-todo-storage.js'
import { LocalTodoStorage } from './local-todo-storage.js'
import type { TodoStorage } from './todo-storage.js'

export type { TodoStorage } from './todo-storage.js'
export { CloudflareKvTodoStorage } from './kv-todo-storage.js'
export { LocalTodoStorage } from './local-todo-storage.js'

export const selectTodoStorage = (): TodoStorage =>
  selectByEnv<TodoStorage>({
    namespaceEnv: 'CLOUDFLARE_KV_TODO_NAMESPACE_ID',
    logPrefix: '[todo-storage]',
    kvLabel: 'CloudflareKvTodoStorage',
    localLabel: 'LocalTodoStorage',
    kv: (config) => new CloudflareKvTodoStorage(config),
    local: () => new LocalTodoStorage(),
  })
