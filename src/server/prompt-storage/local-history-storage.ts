import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { HistoryEntry } from '../../tools/prompt-builder/shared/types.js'
import type { PromptHistoryStorage } from './history-storage.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const defaultDir = join(repoRoot, '.data', 'prompt-builder')

const isNotFoundError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === 'ENOENT'

export class LocalHistoryStorage implements PromptHistoryStorage {
  private readonly dir: string

  constructor(dir: string = defaultDir) {
    this.dir = dir
  }

  async getHistory(): Promise<HistoryEntry[]> {
    try {
      const content = await readFile(this.filePath(), 'utf8')
      return JSON.parse(content) as HistoryEntry[]
    } catch (error) {
      if (isNotFoundError(error)) return []
      throw error
    }
  }

  async putHistory(entries: HistoryEntry[]): Promise<HistoryEntry[]> {
    await mkdir(this.dir, { recursive: true })
    await writeFile(this.filePath(), JSON.stringify(entries))
    return entries
  }

  private filePath(): string {
    return join(this.dir, 'history.json')
  }
}
