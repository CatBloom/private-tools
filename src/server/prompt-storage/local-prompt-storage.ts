import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PromptCategoryId } from '../../tools/prompt-builder/shared/categories.js'
import type { PromptWord } from '../../tools/prompt-builder/shared/types.js'
import { assertValidCategory } from './prompt-storage.js'
import type { PromptWordStorage } from './prompt-storage.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const defaultDir = join(repoRoot, '.data', 'prompt-builder')

const isNotFoundError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === 'ENOENT'

// Local development fallback for prompt word persistence, used until
// Cloudflare KV is configured for this tool. Stores each category as a plain
// JSON file under a gitignored directory.
export class LocalPromptStorage implements PromptWordStorage {
  private readonly dir: string

  constructor(dir: string = defaultDir) {
    this.dir = dir
  }

  async getWords(category: PromptCategoryId): Promise<PromptWord[]> {
    assertValidCategory(category)
    try {
      const content = await readFile(this.filePath(category), 'utf8')
      return JSON.parse(content) as PromptWord[]
    } catch (error) {
      if (isNotFoundError(error)) return []
      throw error
    }
  }

  async putWords(category: PromptCategoryId, words: PromptWord[]): Promise<PromptWord[]> {
    assertValidCategory(category)
    await mkdir(this.dir, { recursive: true })
    await writeFile(this.filePath(category), JSON.stringify(words))
    return words
  }

  private filePath(category: PromptCategoryId): string {
    return join(this.dir, `${category}.json`)
  }
}
