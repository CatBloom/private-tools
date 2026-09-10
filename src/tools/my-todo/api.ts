import { readResult } from '../../lib/api'
import type { TodoState } from './shared/types'

const API_BASE = '/tools/my-todo/api'

export const getTodos = async (): Promise<TodoState> => {
  const response = await fetch(`${API_BASE}/todos`)
  const data = await readResult<{ state: TodoState }>(response)
  return data.state
}

export const putTodos = async (state: TodoState): Promise<TodoState> => {
  const response = await fetch(`${API_BASE}/todos`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  })
  const data = await readResult<{ state: TodoState }>(response)
  return data.state
}
