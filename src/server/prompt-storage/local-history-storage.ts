import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PromptCategoryId } from '../../tools/prompt-builder/shared/categories.js'
import type { HistoryEntry } from '../../tools/prompt-builder/shared/types.js'
import { assertValidCategory } from './prompt-storage.js'
import type { PromptHistoryStorage } from './history-storage.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const defaultDir = join(repoRoot, '.data', 'prompt-builder')

const isNotFoundError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === 'ENOENT'

// Local development fallback for output history persistence, used until
// Cloudflare KV is configured for this tool. Stores each category as a plain
// JSON file under a gitignored directory.
export class LocalHistoryStorage implements PromptHistoryStorage {
  private readonly dir: string

  constructor(dir: string = defaultDir) {
    this.dir = dir
  }

  async getHistory(category: PromptCategoryId): Promise<HistoryEntry[]> {
    assertValidCategory(category)
    try {
      const content = await readFile(this.filePath(category), 'utf8')
      return JSON.parse(content) as HistoryEntry[]
    } catch (error) {
      if (isNotFoundError(error)) return []
      throw error
    }
  }

  async putHistory(category: PromptCategoryId, entries: HistoryEntry[]): Promise<HistoryEntry[]> {
    assertValidCategory(category)
    await mkdir(this.dir, { recursive: true })
    await writeFile(this.filePath(category), JSON.stringify(entries))
    return entries
  }

  private filePath(category: PromptCategoryId): string {
    return join(this.dir, `history-${category}.json`)
  }
}
