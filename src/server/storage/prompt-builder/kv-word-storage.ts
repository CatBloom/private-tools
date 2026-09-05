import type { PromptWord } from '../../../tools/prompt-builder/shared/types.js'
import { CloudflareKvClient } from '../shared/kv-client.js'
import type { CloudflareKvConfig } from '../shared/kv-client.js'
import type { PromptWordStorage } from './word-storage.js'

const KV_KEY = 'words'

export class CloudflareKvPromptWordStorage implements PromptWordStorage {
  private readonly client: CloudflareKvClient

  constructor(config: CloudflareKvConfig) {
    this.client = new CloudflareKvClient(config)
  }

  async getWords(): Promise<PromptWord[]> {
    return (await this.client.getJson<PromptWord[]>(KV_KEY)) ?? []
  }

  async putWords(words: PromptWord[]): Promise<PromptWord[]> {
    await this.client.putJson(KV_KEY, words)
    return words
  }
}
