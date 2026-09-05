import type { CloudflareKvConfig } from './kv-client.js'

export type SelectByEnvOptions<T> = {
  namespaceEnv: string
  logPrefix: string
  kvLabel: string
  localLabel: string
  kv: (config: CloudflareKvConfig) => T
  local: () => T
}

// Every tool-specific select*Storage() applies the same rule: Cloudflare KV
// is used only once Account ID + its own namespace env + API Token are all
// set, otherwise every environment falls back to the local filesystem.
export const selectByEnv = <T>(options: SelectByEnvOptions<T>): T => {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const namespaceId = process.env[options.namespaceEnv]
  const apiToken = process.env.CLOUDFLARE_KV_API_TOKEN

  if (accountId && namespaceId && apiToken) {
    console.log(`${options.logPrefix} using ${options.kvLabel}`)
    return options.kv({ accountId, namespaceId, apiToken })
  }

  console.log(`${options.logPrefix} using ${options.localLabel} (Cloudflare KV env vars not set)`)
  return options.local()
}
