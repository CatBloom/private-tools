import { selectByEnv } from '../shared/select-storage.js'
import { CloudflareKvBillManagerStorage } from './kv-storage.js'
import { LocalBillManagerStorage } from './local-storage.js'
import type { BillManagerStorage } from './types.js'

export type { BillManagerStorage } from './types.js'
export { CloudflareKvBillManagerStorage } from './kv-storage.js'
export { LocalBillManagerStorage } from './local-storage.js'

export const selectBillManagerStorage = (): BillManagerStorage =>
  selectByEnv<BillManagerStorage>({
    namespaceEnv: 'CLOUDFLARE_KV_BILL_NAMESPACE_ID',
    logPrefix: '[bill-manager]',
    kvLabel: 'CloudflareKvBillManagerStorage',
    localLabel: 'LocalBillManagerStorage',
    kv: (config) => new CloudflareKvBillManagerStorage(config),
    local: () => new LocalBillManagerStorage(),
  })
