import { join } from 'node:path'
import type { TodoState } from '../../../tools/my-todo/shared/types.js'
import { readJsonFile, resolveDataDir, writeJsonFile } from '../shared/local-fs.js'
import type { MyTodoStorage } from './types.js'

const defaultDir = resolveDataDir('my-todo')

export class LocalMyTodoStorage implements MyTodoStorage {
  private readonly dir: string

  constructor(dir: string = defaultDir) {
    this.dir = dir
  }

  async getTodos(): Promise<TodoState | null> {
    return readJsonFile<TodoState | null>(this.filePath(), null)
  }

  async putTodos(state: TodoState): Promise<void> {
    await writeJsonFile(this.filePath(), state)
  }

  private filePath(): string {
    return join(this.dir, 'todos.json')
  }
}
