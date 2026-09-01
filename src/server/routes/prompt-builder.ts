import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { isPromptCategoryId } from '../../tools/prompt-builder/shared/categories.js'
import { isPromptTagId } from '../../tools/prompt-builder/shared/tags.js'
import type { HistoryEntry, OutputItem, PromptWord } from '../../tools/prompt-builder/shared/types.js'
import { selectPromptHistoryStorage, selectPromptStorage } from '../prompt-storage/index.js'
import type { PromptHistoryStorage, PromptWordStorage } from '../prompt-storage/index.js'

// Generous ceiling on stored words per category, just to keep a malformed or
// abusive payload from growing a KV value without bound.
const MAX_WORDS_PER_CATEGORY = 2000
const MAX_WORD_TEXT_LENGTH = 500
const MAX_WORD_DESCRIPTION_LENGTH = 2000
// Same rationale as MAX_WORDS_PER_CATEGORY, applied to saved output snapshots.
const MAX_HISTORY_ENTRIES_PER_CATEGORY = 200
const MAX_HISTORY_NAME_LENGTH = 200
const MAX_HISTORY_ITEMS_PER_ENTRY = 500
const MAX_OUTPUT_ITEM_TEXT_LENGTH = 500
// weight は復元時に applyNotation で String.repeat(|weight|) される。巨大な値だと RangeError や
// 過大メモリ確保を招くため、有限整数かつ小さな絶対値に制限する（クライアントは ±5 にクランプ）。
const MAX_OUTPUT_ITEM_WEIGHT = 20
// Reject an oversized body before parsing it (mirrors the credit-csv upload
// guard; also stays under Vercel's ~4.5MB Serverless body ceiling).
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
  Array.isArray(value) && value.length <= MAX_WORDS_PER_CATEGORY && value.every(isPromptWord)

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
  Array.isArray((value as HistoryEntry).items) &&
  (value as HistoryEntry).items.length <= MAX_HISTORY_ITEMS_PER_ENTRY &&
  (value as HistoryEntry).items.every(isOutputItem)

const isHistoryEntryArray = (value: unknown): value is HistoryEntry[] =>
  Array.isArray(value) && value.length <= MAX_HISTORY_ENTRIES_PER_CATEGORY && value.every(isHistoryEntry)

export const createPromptWordRoutes = (
  storage: PromptWordStorage = selectPromptStorage(),
  historyStorage: PromptHistoryStorage = selectPromptHistoryStorage(),
) => {
  const app = new Hono()

  app.get('/words/:category', async (c) => {
    const category = c.req.param('category')
    if (!isPromptCategoryId(category)) {
      return apiError('Invalid category.', 400)
    }

    const words = await storage.getWords(category)
    return c.json({ ok: true, data: { words } })
  })

  app.put(
    '/words/:category',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: () => apiError('Request body is too large.', 413),
    }),
    async (c) => {
      const category = c.req.param('category')
      if (!isPromptCategoryId(category)) {
        return apiError('Invalid category.', 400)
      }

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
        if (Array.isArray(words) && words.length > MAX_WORDS_PER_CATEGORY) {
          return apiError('Too many words.', 413)
        }
        return apiError('Invalid words payload.', 400)
      }

      const saved = await storage.putWords(category, words)
      return c.json({ ok: true, data: { words: saved } })
    },
  )

  app.get('/history/:category', async (c) => {
    const category = c.req.param('category')
    if (!isPromptCategoryId(category)) {
      return apiError('Invalid category.', 400)
    }

    const entries = await historyStorage.getHistory(category)
    return c.json({ ok: true, data: { entries } })
  })

  app.put(
    '/history/:category',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: () => apiError('Request body is too large.', 413),
    }),
    async (c) => {
      const category = c.req.param('category')
      if (!isPromptCategoryId(category)) {
        return apiError('Invalid category.', 400)
      }

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
        if (Array.isArray(entries) && entries.length > MAX_HISTORY_ENTRIES_PER_CATEGORY) {
          return apiError('Too many history entries.', 413)
        }
        return apiError('Invalid history payload.', 400)
      }

      const saved = await historyStorage.putHistory(category, entries)
      return c.json({ ok: true, data: { entries: saved } })
    },
  )

  app.notFound((c) => c.json({ ok: false, error: { message: 'Not found.' } }, 404))

  return app
}
