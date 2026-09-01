import { CloudflareKvPromptStorage } from './kv-prompt-storage.js'
import { LocalPromptStorage } from './local-prompt-storage.js'
import { CloudflareKvHistoryStorage } from './kv-history-storage.js'
import { LocalHistoryStorage } from './local-history-storage.js'
import type { PromptWordStorage } from './prompt-storage.js'
import type { PromptHistoryStorage } from './history-storage.js'

export type { PromptWordStorage } from './prompt-storage.js'
export type { PromptHistoryStorage } from './history-storage.js'
export { assertValidCategory } from './prompt-storage.js'
export { CloudflareKvPromptStorage } from './kv-prompt-storage.js'
export { LocalPromptStorage } from './local-prompt-storage.js'
export { CloudflareKvHistoryStorage } from './kv-history-storage.js'
export { LocalHistoryStorage } from './local-history-storage.js'

// Cloudflare KV is used only once its namespace/token are provisioned;
// until then every environment falls back to the local filesystem.
export const selectPromptStorage = (): PromptWordStorage => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const namespaceId = process.env.CLOUDFLARE_KV_PROMPT_NAMESPACE_ID
  const apiToken = process.env.CLOUDFLARE_KV_API_TOKEN

  if (accountId && namespaceId && apiToken) {
    console.log('[prompt-storage] using CloudflareKvPromptStorage')
    return new CloudflareKvPromptStorage({ accountId, namespaceId, apiToken })
  }

  console.log('[prompt-storage] using LocalPromptStorage (Cloudflare KV env vars not set)')
  return new LocalPromptStorage()
}

// Same Cloudflare KV env vars as selectPromptStorage(), just a separate key
// namespace (history:${category} vs words:${category}).
export const selectPromptHistoryStorage = (): PromptHistoryStorage => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const namespaceId = process.env.CLOUDFLARE_KV_PROMPT_NAMESPACE_ID
  const apiToken = process.env.CLOUDFLARE_KV_API_TOKEN

  if (accountId && namespaceId && apiToken) {
    console.log('[prompt-storage] using CloudflareKvHistoryStorage')
    return new CloudflareKvHistoryStorage({ accountId, namespaceId, apiToken })
  }

  console.log('[prompt-storage] using LocalHistoryStorage (Cloudflare KV env vars not set)')
  return new LocalHistoryStorage()
}
