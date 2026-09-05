import type { TodoState } from '../../tools/my-todo/shared/types.js'

export interface TodoStorage {
  getTodos(): Promise<TodoState | null>
  putTodos(state: TodoState): Promise<void>
}
