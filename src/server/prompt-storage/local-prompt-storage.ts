import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PromptWord } from '../../tools/prompt-builder/shared/types.js'
import type { PromptWordStorage } from './prompt-storage.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const defaultDir = join(repoRoot, '.data', 'prompt-builder')

const isNotFoundError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === 'ENOENT'

export class LocalPromptStorage implements PromptWordStorage {
  private readonly dir: string

  constructor(dir: string = defaultDir) {
    this.dir = dir
  }

  async getWords(): Promise<PromptWord[]> {
    try {
      const content = await readFile(this.filePath(), 'utf8')
      return JSON.parse(content) as PromptWord[]
    } catch (error) {
      if (isNotFoundError(error)) return []
      throw error
    }
  }

  async putWords(words: PromptWord[]): Promise<PromptWord[]> {
    await mkdir(this.dir, { recursive: true })
    await writeFile(this.filePath(), JSON.stringify(words))
    return words
  }

  private filePath(): string {
    return join(this.dir, 'words.json')
  }
}
