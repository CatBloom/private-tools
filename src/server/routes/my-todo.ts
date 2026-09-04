import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { TodoItem, TodoState } from '../../tools/my-todo/shared/types.js'
import { selectTodoStorage } from '../todo-storage/index.js'
import type { TodoStorage } from '../todo-storage/index.js'

// Generous ceiling on a single todo item's text, just to keep a malformed or
// abusive payload from growing a KV value without bound.
const MAX_ITEM_TEXT_LENGTH = 1000
// Same rationale, applied to the combined today+someday item count. This is a
// structural ceiling only — the UI-level "Today は5件まで" rule is not
// enforced server-side.
const MAX_TOTAL_ITEMS = 500
// Reject an oversized body before parsing it (mirrors the credit-csv upload
// guard; also stays under Vercel's ~4.5MB Serverless body ceiling).
const MAX_BODY_BYTES = 4 * 1024 * 1024

const EMPTY_STATE: TodoState = { today: [], someday: [], lastRolloverDate: null }

const apiError = (message: string, status: 400 | 404 | 413 | 415) =>
  Response.json({ ok: false, error: { message } }, { status })

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

export const createMyTodoRoutes = (storage: TodoStorage = selectTodoStorage()) => {
  const app = new Hono()

  app.get('/todos', async (c) => {
    const state = (await storage.getTodos()) ?? EMPTY_STATE
    return c.json({ ok: true, data: { state } })
  })

  app.put(
    '/todos',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: () => apiError('Request body is too large.', 413),
    }),
    async (c) => {
      const contentType = c.req.header('content-type')?.toLowerCase().split(';', 1)[0]
      if (contentType !== 'application/json') {
        return apiError('Unsupported media type.', 415)
      }

      let body: unknown
      try {
        body = await c.req.json()
      } catch {
        return apiError('Invalid request.', 400)
      }

      const state = (body as { state?: unknown } | null)?.state
      if (!isTodoState(state)) {
        if (isOversizedTodoState(state)) {
          return apiError('Too many todo items.', 413)
        }
        return apiError('Invalid state payload.', 400)
      }

      await storage.putTodos(state)
      return c.json({ ok: true, data: { state } })
    },
  )

  app.notFound((c) => c.json({ ok: false, error: { message: 'Not found.' } }, 404))

  return app
}
