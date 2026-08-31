import { readJson, writeJson } from '../../../lib/storage'
import type { PromptCategoryId } from '../shared/categories'
import type { OutputItem } from '../shared/types'

// 分類ごとに独立したキーで保存する（カテゴリ横断の1キーだと切替時に状態が混ざるため）。
const outputStorageKey = (category: PromptCategoryId): string => `prompt-builder:output:${category}`

export const readOutputItems = (category: PromptCategoryId): OutputItem[] =>
  readJson<OutputItem[]>(outputStorageKey(category), [])

export const writeOutputItems = (category: PromptCategoryId, items: OutputItem[]): void => {
  writeJson(outputStorageKey(category), items)
}
