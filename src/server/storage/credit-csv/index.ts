import { selectByEnv } from '../shared/select-storage.js'
import { CloudflareKvCreditCsvStorage } from './kv-storage.js'
import { LocalCreditCsvStorage } from './local-storage.js'
import type { CreditCsvStorage } from './types.js'

export type { CreditCsvStorage, StoredFileMeta } from './types.js'
export { CloudflareKvCreditCsvStorage } from './kv-storage.js'
export { LocalCreditCsvStorage } from './local-storage.js'

export const selectCreditCsvStorage = (): CreditCsvStorage =>
  selectByEnv<CreditCsvStorage>({
    namespaceEnv: 'CLOUDFLARE_KV_CREDIT_NAMESPACE_ID',
    logPrefix: '[credit-csv]',
    kvLabel: 'CloudflareKvCreditCsvStorage',
    localLabel: 'LocalCreditCsvStorage',
    kv: (config) => new CloudflareKvCreditCsvStorage(config),
    local: () => new LocalCreditCsvStorage(),
  })
