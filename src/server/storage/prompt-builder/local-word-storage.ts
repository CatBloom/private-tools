import { join } from 'node:path'
import type { PromptWord } from '../../../tools/prompt-builder/shared/types.js'
import { readJsonFile, resolveDataDir, writeJsonFile } from '../shared/local-fs.js'
import type { PromptWordStorage } from './types.js'

const defaultDir = resolveDataDir('prompt-builder')

export class LocalPromptWordStorage implements PromptWordStorage {
  private readonly dir: string

  constructor(dir: string = defaultDir) {
    this.dir = dir
  }

  async getWords(): Promise<PromptWord[]> {
    return readJsonFile<PromptWord[]>(this.filePath(), [])
  }

  async putWords(words: PromptWord[]): Promise<PromptWord[]> {
    await writeJsonFile(this.filePath(), words)
    return words
  }

  private filePath(): string {
    return join(this.dir, 'words.json')
  }
}
