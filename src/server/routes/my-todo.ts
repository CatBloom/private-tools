import { Hono } from 'hono'
import type { TodoItem, TodoState } from '../../tools/my-todo/shared/types.js'
import { selectMyTodoStorage } from '../storage/my-todo/index.js'
import type { MyTodoStorage } from '../storage/my-todo/index.js'
import { apiError, apiOk, jsonBodyLimit, notFoundJson, readJsonBody } from './shared.js'

const MAX_ITEM_TEXT_LENGTH = 1000
// 構造的な上限のみ。UI 側の「Today は5件まで」はサーバーでは強制しない。
const MAX_TOTAL_ITEMS = 500
const MAX_BODY_BYTES = 4 * 1024 * 1024

const EMPTY_STATE: TodoState = { today: [], someday: [], lastRolloverDate: null }

const isTodoItem = (value: unknown): value is TodoItem =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as TodoItem).id === 'string' &&
  typeof (value as TodoItem).text === 'string' &&
  (value as TodoItem).text.length <= MAX_ITEM_TEXT_LENGTH &&
  typeof (value as TodoItem).completed === 'boolean' &&
  typeof (value as TodoItem).createdAt === 'string'

const isTodoItemArray = (value: unknown): value is TodoItem[] => Array.isArray(value) && value.every(isTodoItem)

const isTodoState = (value: unknown): value is TodoState =>
  typeof value === 'object' &&
  value !== null &&
  isTodoItemArray((value as TodoState).today) &&
  isTodoItemArray((value as TodoState).someday) &&
  ((value as TodoState).today.length + (value as TodoState).someday.length <= MAX_TOTAL_ITEMS) &&
  ((value as TodoState).lastRolloverDate === null || typeof (value as TodoState).lastRolloverDate === 'string')

const isOversizedTodoState = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  Array.isArray((value as TodoState).today) &&
  Array.isArray((value as TodoState).someday) &&
  (value as TodoState).today.length + (value as TodoState).someday.length > MAX_TOTAL_ITEMS

export const createMyTodoRoutes = (storage: MyTodoStorage = selectMyTodoStorage()) => {
  const app = new Hono()

  app.get('/todos', async (c) => {
    const state = (await storage.getTodos()) ?? EMPTY_STATE
    return apiOk(c, { state })
  })

  app.put('/todos', jsonBodyLimit(MAX_BODY_BYTES), async (c) => {
    const body = await readJsonBody(c)
    if (!body.ok) return body.response

    const state = (body.value as { state?: unknown } | null)?.state
    if (!isTodoState(state)) {
      if (isOversizedTodoState(state)) {
        return apiError(c, 413, 'Too many todo items.')
      }
      return apiError(c, 400, 'Invalid state payload.')
    }

    await storage.putTodos(state)
    return apiOk(c, { state })
  })

  app.notFound(notFoundJson)

  return app
}
