import { describe, expect, it } from 'vitest'
import { CloudflareKvCreditCsvStorage } from './kv-storage'
import { LocalCreditCsvStorage } from './local-storage'
import { selectCreditCsvStorage } from './index'

const ENV_KEYS = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_KV_CREDIT_NAMESPACE_ID', 'CLOUDFLARE_KV_API_TOKEN'] as const

const withEnv = async (values: Partial<Record<(typeof ENV_KEYS)[number], string>>, run: () => void) => {
  const previous: Partial<Record<string, string | undefined>> = {}
  for (const key of ENV_KEYS) previous[key] = process.env[key]
  try {
    for (const key of ENV_KEYS) {
      const value = values[key]
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    run()
  } finally {
    for (const key of ENV_KEYS) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  }
}

describe('selectCreditCsvStorage', () => {
  it('returns CloudflareKvCreditCsvStorage when all Cloudflare env vars are set', async () => {
    await withEnv(
      { CLOUDFLARE_ACCOUNT_ID: 'a', CLOUDFLARE_KV_CREDIT_NAMESPACE_ID: 'b', CLOUDFLARE_KV_API_TOKEN: 'c' },
      () => {
        expect(selectCreditCsvStorage()).toBeInstanceOf(CloudflareKvCreditCsvStorage)
      },
    )
  })

  it.each([{}, { CLOUDFLARE_ACCOUNT_ID: 'a' }, { CLOUDFLARE_ACCOUNT_ID: 'a', CLOUDFLARE_KV_CREDIT_NAMESPACE_ID: 'b' }])(
    'falls back to LocalCreditCsvStorage when Cloudflare env vars are incomplete: %j',
    async (values) => {
      await withEnv(values, () => {
        expect(selectCreditCsvStorage()).toBeInstanceOf(LocalCreditCsvStorage)
      })
    },
  )
})
