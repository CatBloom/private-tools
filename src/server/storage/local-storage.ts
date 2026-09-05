import { mkdir, readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertValidFileName, isValidFileName } from './storage.js'
import type { Storage, StoredFileMeta } from './storage.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const defaultDir = join(repoRoot, '.data', 'credit-csv')

const isNotFoundError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === 'ENOENT'

export class LocalStorage implements Storage {
  private readonly dir: string

  constructor(dir: string = defaultDir) {
    this.dir = dir
  }

  async list(): Promise<StoredFileMeta[]> {
    await this.ensureDir()
    const entries = await readdir(this.dir)
    const metas = await Promise.all(
      entries
        .filter(isValidFileName)
        .map(async (name) => {
          const stats = await stat(join(this.dir, name))
          return { name, size: stats.size, uploadedAt: stats.mtime.toISOString() }
        }),
    )
    return metas.sort((a, b) => a.name.localeCompare(b.name))
  }

  async get(name: string): Promise<Uint8Array | null> {
    assertValidFileName(name)
    try {
      const buffer = await readFile(join(this.dir, name))
      return new Uint8Array(buffer)
    } catch (error) {
      if (isNotFoundError(error)) return null
      throw error
    }
  }

  async put(name: string, bytes: Uint8Array): Promise<StoredFileMeta> {
    assertValidFileName(name)
    await this.ensureDir()
    const filePath = join(this.dir, name)
    await writeFile(filePath, bytes)
    const stats = await stat(filePath)
    return { name, size: stats.size, uploadedAt: stats.mtime.toISOString() }
  }

  async delete(name: string): Promise<void> {
    assertValidFileName(name)
    try {
      await unlink(join(this.dir, name))
    } catch (error) {
      if (!isNotFoundError(error)) throw error
    }
  }

  private async ensureDir(): Promise<void> {
    await mkdir(this.dir, { recursive: true })
  }
}
