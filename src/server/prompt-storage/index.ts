import { selectByEnv } from '../shared/select-storage.js'
import { CloudflareKvPromptStorage } from './kv-prompt-storage.js'
import { LocalPromptStorage } from './local-prompt-storage.js'
import { CloudflareKvHistoryStorage } from './kv-history-storage.js'
import { LocalHistoryStorage } from './local-history-storage.js'
import type { PromptWordStorage } from './prompt-storage.js'
import type { PromptHistoryStorage } from './history-storage.js'

export type { PromptWordStorage } from './prompt-storage.js'
export type { PromptHistoryStorage } from './history-storage.js'
export { CloudflareKvPromptStorage } from './kv-prompt-storage.js'
export { LocalPromptStorage } from './local-prompt-storage.js'
export { CloudflareKvHistoryStorage } from './kv-history-storage.js'
export { LocalHistoryStorage } from './local-history-storage.js'

const PROMPT_NAMESPACE_ENV = 'CLOUDFLARE_KV_PROMPT_NAMESPACE_ID'

// Cloudflare KV is used only once its namespace/token are provisioned;
// until then every environment falls back to the local filesystem.
export const selectPromptStorage = (): PromptWordStorage =>
  selectByEnv<PromptWordStorage>({
    namespaceEnv: PROMPT_NAMESPACE_ENV,
    logPrefix: '[prompt-storage]',
    kvLabel: 'CloudflareKvPromptStorage',
    localLabel: 'LocalPromptStorage',
    kv: (config) => new CloudflareKvPromptStorage(config),
    local: () => new LocalPromptStorage(),
  })

// Same Cloudflare KV env vars as selectPromptStorage(), just a separate key
// namespace ('history' vs 'words').
export const selectPromptHistoryStorage = (): PromptHistoryStorage =>
  selectByEnv<PromptHistoryStorage>({
    namespaceEnv: PROMPT_NAMESPACE_ENV,
    logPrefix: '[prompt-storage]',
    kvLabel: 'CloudflareKvHistoryStorage',
    localLabel: 'LocalHistoryStorage',
    kv: (config) => new CloudflareKvHistoryStorage(config),
    local: () => new LocalHistoryStorage(),
  })
