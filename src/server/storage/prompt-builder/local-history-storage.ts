import { join } from 'node:path'
import type { HistoryEntry } from '../../../tools/prompt-builder/shared/types.js'
import { readJsonFile, resolveDataDir, writeJsonFile } from '../shared/local-fs.js'
import type { PromptHistoryStorage } from './types.js'

const defaultDir = resolveDataDir('prompt-builder')

export class LocalPromptHistoryStorage implements PromptHistoryStorage {
  private readonly dir: string

  constructor(dir: string = defaultDir) {
    this.dir = dir
  }

  async getHistory(): Promise<HistoryEntry[]> {
    return readJsonFile<HistoryEntry[]>(this.filePath(), [])
  }

  async putHistory(entries: HistoryEntry[]): Promise<HistoryEntry[]> {
    await writeJsonFile(this.filePath(), entries)
    return entries
  }

  private filePath(): string {
    return join(this.dir, 'history.json')
  }
}
