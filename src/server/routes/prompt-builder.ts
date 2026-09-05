import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { isPromptTargetId } from '../../tools/prompt-builder/shared/targets.js'
import { isPromptTagId } from '../../tools/prompt-builder/shared/tags.js'
import type { HistoryEntry, OutputItem, PromptWord } from '../../tools/prompt-builder/shared/types.js'
import { selectPromptHistoryStorage, selectPromptStorage } from '../prompt-storage/index.js'
import type { PromptHistoryStorage, PromptWordStorage } from '../prompt-storage/index.js'

const MAX_WORDS = 2000
const MAX_WORD_TEXT_LENGTH = 500
const MAX_WORD_DESCRIPTION_LENGTH = 2000
const MAX_HISTORY_ENTRIES = 200
const MAX_HISTORY_NAME_LENGTH = 200
const MAX_HISTORY_ITEMS_PER_ENTRY = 500
const MAX_OUTPUT_ITEM_TEXT_LENGTH = 500
// weight は復元時に applyNotation で String.repeat(|weight|) されるため、RangeError を防ぐ小さな上限にする。
const MAX_OUTPUT_ITEM_WEIGHT = 20
const MAX_BODY_BYTES = 4 * 1024 * 1024

const apiError = (message: string, status: 400 | 404 | 413 | 415) =>
  Response.json({ ok: false, error: { message } }, { status })

const isPromptWord = (value: unknown): value is PromptWord =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as PromptWord).id === 'string' &&
  typeof (value as PromptWord).text === 'string' &&
  typeof (value as PromptWord).description === 'string' &&
  (value as PromptWord).text.length <= MAX_WORD_TEXT_LENGTH &&
  (value as PromptWord).description.length <= MAX_WORD_DESCRIPTION_LENGTH &&
  typeof (value as PromptWord).tag === 'string' &&
  isPromptTagId((value as PromptWord).tag)

const isPromptWordArray = (value: unknown): value is PromptWord[] =>
  Array.isArray(value) && value.length <= MAX_WORDS && value.every(isPromptWord)

const isOutputItem = (value: unknown): value is OutputItem =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as OutputItem).id === 'string' &&
  ((value as OutputItem).wordId === null || typeof (value as OutputItem).wordId === 'string') &&
  typeof (value as OutputItem).text === 'string' &&
  (value as OutputItem).text.length <= MAX_OUTPUT_ITEM_TEXT_LENGTH &&
  Number.isInteger((value as OutputItem).weight) &&
  Math.abs((value as OutputItem).weight) <= MAX_OUTPUT_ITEM_WEIGHT

const isHistoryEntry = (value: unknown): value is HistoryEntry =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as HistoryEntry).id === 'string' &&
  typeof (value as HistoryEntry).name === 'string' &&
  (value as HistoryEntry).name.length <= MAX_HISTORY_NAME_LENGTH &&
  typeof (value as HistoryEntry).createdAt === 'string' &&
  typeof (value as HistoryEntry).target === 'string' &&
  isPromptTargetId((value as HistoryEntry).target) &&
  Array.isArray((value as HistoryEntry).items) &&
  (value as HistoryEntry).items.length <= MAX_HISTORY_ITEMS_PER_ENTRY &&
  (value as HistoryEntry).items.every(isOutputItem)

const isHistoryEntryArray = (value: unknown): value is HistoryEntry[] =>
  Array.isArray(value) && value.length <= MAX_HISTORY_ENTRIES && value.every(isHistoryEntry)

export const createPromptWordRoutes = (
  storage: PromptWordStorage = selectPromptStorage(),
  historyStorage: PromptHistoryStorage = selectPromptHistoryStorage(),
) => {
  const app = new Hono()

  app.get('/words', async (c) => {
    const words = await storage.getWords()
    return c.json({ ok: true, data: { words } })
  })

  app.put(
    '/words',
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

      const words = (body as { words?: unknown } | null)?.words
      if (!isPromptWordArray(words)) {
        if (Array.isArray(words) && words.length > MAX_WORDS) {
          return apiError('Too many words.', 413)
        }
        return apiError('Invalid words payload.', 400)
      }

      const saved = await storage.putWords(words)
      return c.json({ ok: true, data: { words: saved } })
    },
  )

  app.get('/history', async (c) => {
    const entries = await historyStorage.getHistory()
    return c.json({ ok: true, data: { entries } })
  })

  app.put(
    '/history',
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

      const entries = (body as { entries?: unknown } | null)?.entries
      if (!isHistoryEntryArray(entries)) {
        if (Array.isArray(entries) && entries.length > MAX_HISTORY_ENTRIES) {
          return apiError('Too many history entries.', 413)
        }
        return apiError('Invalid history payload.', 400)
      }

      const saved = await historyStorage.putHistory(entries)
      return c.json({ ok: true, data: { entries: saved } })
    },
  )

  app.notFound((c) => c.json({ ok: false, error: { message: 'Not found.' } }, 404))

  return app
}
