import { CloudflareKvStorage } from './kv-storage.js'
import { LocalStorage } from './local-storage.js'
import type { Storage } from './storage.js'

export type { Storage, StoredFileMeta } from './storage.js'
export { CloudflareKvStorage } from './kv-storage.js'
export { LocalStorage } from './local-storage.js'

// Cloudflare KV is used only once its namespace/token are provisioned;
// until then every environment falls back to the local filesystem.
export const selectStorage = (): Storage => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const namespaceId = process.env.CLOUDFLARE_KV_CREDIT_NAMESPACE_ID
  const apiToken = process.env.CLOUDFLARE_KV_API_TOKEN

  if (accountId && namespaceId && apiToken) {
    console.log('[storage] using CloudflareKvStorage')
    return new CloudflareKvStorage({ accountId, namespaceId, apiToken })
  }

  console.log('[storage] using LocalStorage (Cloudflare KV env vars not set)')
  return new LocalStorage()
}
