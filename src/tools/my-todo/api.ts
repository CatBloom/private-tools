import type { TodoState } from './shared/types'

type ApiResult<T> = { ok: true; data: T } | { ok: false; error: { message: string } }

const API_BASE = '/tools/my-todo/api'

const readResult = async <T>(response: Response): Promise<T> => {
  let body: ApiResult<T>
  try {
    body = (await response.json()) as ApiResult<T>
  } catch {
    throw new Error(`サーバーとの通信に失敗しました。(status: ${response.status})`)
  }

  if (!body.ok) {
    throw new Error(body.error.message)
  }

  return body.data
}

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
