import { selectByEnv } from '../shared/select-storage.js'
import { CloudflareKvPromptWordStorage } from './kv-word-storage.js'
import { LocalPromptWordStorage } from './local-word-storage.js'
import { CloudflareKvPromptHistoryStorage } from './kv-history-storage.js'
import { LocalPromptHistoryStorage } from './local-history-storage.js'
import type { PromptWordStorage } from './word-storage.js'
import type { PromptHistoryStorage } from './history-storage.js'

export type { PromptWordStorage } from './word-storage.js'
export type { PromptHistoryStorage } from './history-storage.js'
export { CloudflareKvPromptWordStorage } from './kv-word-storage.js'
export { LocalPromptWordStorage } from './local-word-storage.js'
export { CloudflareKvPromptHistoryStorage } from './kv-history-storage.js'
export { LocalPromptHistoryStorage } from './local-history-storage.js'

const PROMPT_NAMESPACE_ENV = 'CLOUDFLARE_KV_PROMPT_NAMESPACE_ID'

export const selectPromptWordStorage = (): PromptWordStorage =>
  selectByEnv<PromptWordStorage>({
    namespaceEnv: PROMPT_NAMESPACE_ENV,
    logPrefix: '[prompt-builder]',
    kvLabel: 'CloudflareKvPromptWordStorage',
    localLabel: 'LocalPromptWordStorage',
    kv: (config) => new CloudflareKvPromptWordStorage(config),
    local: () => new LocalPromptWordStorage(),
  })

// selectPromptWordStorage() と同じ env vars で、KV キーだけ別（'history' vs 'words'）。
export const selectPromptHistoryStorage = (): PromptHistoryStorage =>
  selectByEnv<PromptHistoryStorage>({
    namespaceEnv: PROMPT_NAMESPACE_ENV,
    logPrefix: '[prompt-builder]',
    kvLabel: 'CloudflareKvPromptHistoryStorage',
    localLabel: 'LocalPromptHistoryStorage',
    kv: (config) => new CloudflareKvPromptHistoryStorage(config),
    local: () => new LocalPromptHistoryStorage(),
  })
