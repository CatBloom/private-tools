import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')

// 各ツールの Local ストレージ実装から呼ぶ。`.data/<toolId>` を返す。
export const resolveDataDir = (toolId: string): string => join(repoRoot, '.data', toolId)

export const isNotFoundError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === 'ENOENT'

// JSON を1ファイルにまるごと読み書きするストレージ（word/history/todo）向け。
export const readJsonFile = async <T>(path: string, fallback: T): Promise<T> => {
  try {
    const content = await readFile(path, 'utf8')
    return JSON.parse(content) as T
  } catch (error) {
    if (isNotFoundError(error)) return fallback
    throw error
  }
}

export const writeJsonFile = async (path: string, value: unknown): Promise<void> => {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(value))
}
