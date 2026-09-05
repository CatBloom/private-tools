import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { TodoState } from '../../tools/my-todo/shared/types.js'
import type { TodoStorage } from './todo-storage.js'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const defaultDir = join(repoRoot, '.data', 'my-todo')

const isNotFoundError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === 'ENOENT'

export class LocalTodoStorage implements TodoStorage {
  private readonly dir: string

  constructor(dir: string = defaultDir) {
    this.dir = dir
  }

  async getTodos(): Promise<TodoState | null> {
    try {
      const content = await readFile(this.filePath(), 'utf8')
      return JSON.parse(content) as TodoState
    } catch (error) {
      if (isNotFoundError(error)) return null
      throw error
    }
  }

  async putTodos(state: TodoState): Promise<void> {
    await mkdir(this.dir, { recursive: true })
    await writeFile(this.filePath(), JSON.stringify(state))
  }

  private filePath(): string {
    return join(this.dir, 'todos.json')
  }
}
