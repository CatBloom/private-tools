import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { selectByEnv } from './select-storage'

const ENV_KEYS = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_KV_TEST_NAMESPACE_ID', 'CLOUDFLARE_KV_API_TOKEN'] as const

const withEnv = (values: Partial<Record<(typeof ENV_KEYS)[number], string>>, run: () => void) => {
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

describe('selectByEnv', () => {
  let logSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    logSpy.mockRestore()
  })

  type Result = { kind: 'kv'; config: { accountId: string; namespaceId: string; apiToken: string } } | { kind: 'local' }

  const options = {
    namespaceEnv: 'CLOUDFLARE_KV_TEST_NAMESPACE_ID',
    logPrefix: '[test-storage]',
    kvLabel: 'CloudflareKvTestStorage',
    localLabel: 'LocalTestStorage',
    kv: (config: { accountId: string; namespaceId: string; apiToken: string }): Result => ({ kind: 'kv', config }),
    local: (): Result => ({ kind: 'local' }),
  }

  it('picks kv() with the parsed config when all three env vars are set', () => {
    withEnv(
      { CLOUDFLARE_ACCOUNT_ID: 'a', CLOUDFLARE_KV_TEST_NAMESPACE_ID: 'b', CLOUDFLARE_KV_API_TOKEN: 'c' },
      () => {
        const result = selectByEnv<Result>(options)
        expect(result).toEqual({ kind: 'kv', config: { accountId: 'a', namespaceId: 'b', apiToken: 'c' } })
        expect(logSpy).toHaveBeenCalledWith('[test-storage] using CloudflareKvTestStorage')
      },
    )
  })

  it.each([{}, { CLOUDFLARE_ACCOUNT_ID: 'a' }, { CLOUDFLARE_ACCOUNT_ID: 'a', CLOUDFLARE_KV_TEST_NAMESPACE_ID: 'b' }])(
    'falls back to local() when env vars are incomplete: %j',
    (values) => {
      withEnv(values, () => {
        const result = selectByEnv<Result>(options)
        expect(result).toEqual({ kind: 'local' })
        expect(logSpy).toHaveBeenCalledWith(
          '[test-storage] using LocalTestStorage (Cloudflare KV env vars not set)',
        )
      })
    },
  )
})
