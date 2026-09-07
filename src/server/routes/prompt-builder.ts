import { Hono } from 'hono'
import { MAX_WORDS } from '../../tools/prompt-builder/shared/limits.js'
import { isPromptTargetId } from '../../tools/prompt-builder/shared/targets.js'
import { isPromptTagId } from '../../tools/prompt-builder/shared/tags.js'
import type { HistoryEntry, OutputItem, PromptWord } from '../../tools/prompt-builder/shared/types.js'
import { selectPromptHistoryStorage, selectPromptWordStorage } from '../storage/prompt-builder/index.js'
import type { PromptHistoryStorage, PromptWordStorage } from '../storage/prompt-builder/index.js'
import { apiError, apiOk, jsonBodyLimit, notFoundJson, readJsonBody } from './shared.js'

const MAX_WORD_TEXT_LENGTH = 500
const MAX_WORD_DESCRIPTION_LENGTH = 2000
const MAX_HISTORY_ENTRIES = 200
const MAX_HISTORY_NAME_LENGTH = 200
const MAX_HISTORY_ITEMS_PER_ENTRY = 500
const MAX_OUTPUT_ITEM_TEXT_LENGTH = 500
// weight は復元時に applyNotation で String.repeat(|weight|) されるため、RangeError を防ぐ小さな上限にする。
const MAX_OUTPUT_ITEM_WEIGHT = 20
const MAX_BODY_BYTES = 4 * 1024 * 1024

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
  (value as HistoryEntry).name.trim().length > 0 &&
  (value as HistoryEntry).name.length <= MAX_HISTORY_NAME_LENGTH &&
  typeof (value as HistoryEntry).createdAt === 'string' &&
  typeof (value as HistoryEntry).target === 'string' &&
  isPromptTargetId((value as HistoryEntry).target) &&
  Array.isArray((value as HistoryEntry).items) &&
  (value as HistoryEntry).items.length <= MAX_HISTORY_ITEMS_PER_ENTRY &&
  (value as HistoryEntry).items.every(isOutputItem)

const isHistoryEntryArray = (value: unknown): value is HistoryEntry[] =>
  Array.isArray(value) && value.length <= MAX_HISTORY_ENTRIES && value.every(isHistoryEntry)

export const createPromptBuilderRoutes = (
  storage: PromptWordStorage = selectPromptWordStorage(),
  historyStorage: PromptHistoryStorage = selectPromptHistoryStorage(),
) => {
  const app = new Hono()

  app.get('/words', async (c) => {
    const words = await storage.getWords()
    return apiOk(c, { words })
  })

  app.put('/words', jsonBodyLimit(MAX_BODY_BYTES), async (c) => {
    const body = await readJsonBody(c)
    if (!body.ok) return body.response

    const words = (body.value as { words?: unknown } | null)?.words
    if (!isPromptWordArray(words)) {
      if (Array.isArray(words) && words.length > MAX_WORDS) {
        return apiError(c, 413, 'Too many words.')
      }
      return apiError(c, 400, 'Invalid words payload.')
    }

    const saved = await storage.putWords(words)
    return apiOk(c, { words: saved })
  })

  app.get('/history', async (c) => {
    const entries = await historyStorage.getHistory()
    return apiOk(c, { entries })
  })

  app.put('/history', jsonBodyLimit(MAX_BODY_BYTES), async (c) => {
    const body = await readJsonBody(c)
    if (!body.ok) return body.response

    const entries = (body.value as { entries?: unknown } | null)?.entries
    if (!isHistoryEntryArray(entries)) {
      if (Array.isArray(entries) && entries.length > MAX_HISTORY_ENTRIES) {
        return apiError(c, 413, 'Too many history entries.')
      }
      return apiError(c, 400, 'Invalid history payload.')
    }

    const saved = await historyStorage.putHistory(entries)
    return apiOk(c, { entries: saved })
  })

  app.notFound(notFoundJson)

  return app
}
