import { selectByEnv } from '../shared/select-storage.js'
import { CloudflareKvMyTodoStorage } from './kv-storage.js'
import { LocalMyTodoStorage } from './local-storage.js'
import type { MyTodoStorage } from './types.js'

export type { MyTodoStorage } from './types.js'
export { CloudflareKvMyTodoStorage } from './kv-storage.js'
export { LocalMyTodoStorage } from './local-storage.js'

export const selectMyTodoStorage = (): MyTodoStorage =>
  selectByEnv<MyTodoStorage>({
    namespaceEnv: 'CLOUDFLARE_KV_TODO_NAMESPACE_ID',
    logPrefix: '[my-todo]',
    kvLabel: 'CloudflareKvMyTodoStorage',
    localLabel: 'LocalMyTodoStorage',
    kv: (config) => new CloudflareKvMyTodoStorage(config),
    local: () => new LocalMyTodoStorage(),
  })
