import { selectByEnv } from '../shared/select-storage.js'
import { CloudflareKvStorage } from './kv-storage.js'
import { LocalStorage } from './local-storage.js'
import type { Storage } from './storage.js'

export type { Storage, StoredFileMeta } from './storage.js'
export { CloudflareKvStorage } from './kv-storage.js'
export { LocalStorage } from './local-storage.js'

export const selectStorage = (): Storage =>
  selectByEnv<Storage>({
    namespaceEnv: 'CLOUDFLARE_KV_CREDIT_NAMESPACE_ID',
    logPrefix: '[storage]',
    kvLabel: 'CloudflareKvStorage',
    localLabel: 'LocalStorage',
    kv: (config) => new CloudflareKvStorage(config),
    local: () => new LocalStorage(),
  })
