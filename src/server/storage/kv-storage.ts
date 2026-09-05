import { CloudflareKvClient } from '../shared/kv-client.js'
import type { CloudflareKvConfig } from '../shared/kv-client.js'
import { assertValidFileName, isValidFileName } from './storage.js'
import type { Storage, StoredFileMeta } from './storage.js'

export type { CloudflareKvConfig } from '../shared/kv-client.js'

type KvListKey = {
  name: string
  metadata?: { size?: number; uploadedAt?: string }
}

type KvListResponse = {
  result: KvListKey[]
  result_info: { cursor?: string; list_complete?: boolean }
}

// Production backend, not yet wired up (Cloudflare KV namespace/token are not
// provisioned). Verified against a mocked fetch only.
//
// Metadata storage choice: Cloudflare's "write value" endpoint accepts
// metadata alongside the value in the same multipart request, and the "list
// keys" endpoint returns that metadata inline with each key. That keeps one
// KV key per CSV file (no separate meta key to keep in sync, no extra
// round-trip on put or delete) at the cost of an O(n) scan over key metadata
// for list — an acceptable trade-off given at most a few hundred YYYYMM
// files.
export class CloudflareKvStorage implements Storage {
  private readonly client: CloudflareKvClient

  constructor(config: CloudflareKvConfig) {
    this.client = new CloudflareKvClient(config)
  }

  async list(): Promise<StoredFileMeta[]> {
    const metas: StoredFileMeta[] = []
    let cursor: string | undefined
    do {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
      const response = await this.client.request(`/keys${query}`, { method: 'GET' })
      if (!response.ok) throw new Error(`Cloudflare KV list failed with status ${response.status}`)
      const body = (await response.json()) as KvListResponse
      for (const key of body.result) {
        const { size, uploadedAt } = key.metadata ?? {}
        if (isValidFileName(key.name) && typeof size === 'number' && typeof uploadedAt === 'string') {
          metas.push({ name: key.name, size, uploadedAt })
        }
      }
      cursor = body.result_info.list_complete ? undefined : body.result_info.cursor
    } while (cursor)
    return metas.sort((a, b) => a.name.localeCompare(b.name))
  }

  async get(name: string): Promise<Uint8Array | null> {
    assertValidFileName(name)
    const response = await this.client.request(`/values/${name}`, { method: 'GET' })
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`Cloudflare KV get failed with status ${response.status}`)
    return new Uint8Array(await response.arrayBuffer())
  }

  async put(name: string, bytes: Uint8Array): Promise<StoredFileMeta> {
    assertValidFileName(name)
    const meta: StoredFileMeta = { name, size: bytes.byteLength, uploadedAt: new Date().toISOString() }
    const form = new FormData()
    form.append('value', new Blob([new Uint8Array(bytes)]), name)
    form.append('metadata', JSON.stringify({ size: meta.size, uploadedAt: meta.uploadedAt }))
    const response = await this.client.request(`/values/${name}`, { method: 'PUT', body: form })
    if (!response.ok) throw new Error(`Cloudflare KV put failed with status ${response.status}`)
    return meta
  }

  async delete(name: string): Promise<void> {
    assertValidFileName(name)
    const response = await this.client.request(`/values/${name}`, { method: 'DELETE' })
    if (!response.ok && response.status !== 404) {
      throw new Error(`Cloudflare KV delete failed with status ${response.status}`)
    }
  }
}
