import { applyNotation } from './notation'
import type { ParsedPromptToken } from './parsePrompt'
import { DEFAULT_TAG, type PromptTagId } from '../shared/tags'
import type { OutputItem } from '../shared/types'

export type RowEdit = { text: string; tag: PromptTagId; description: string }

export type DecomposeRow = {
  key: string
  originalText: string
  weight: number
  text: string
  tag: PromptTagId
  description: string
}

// 元 text ＋ 同一 text 内の出現順をキーにする（テキスト編集後も引き継ぎ判定できるように）。
export const tokenKeys = (tokens: ParsedPromptToken[]): string[] => {
  const occurrenceCounts = new Map<string, number>()
  return tokens.map((token) => {
    const occurrence = occurrenceCounts.get(token.text) ?? 0
    occurrenceCounts.set(token.text, occurrence + 1)
    return `${token.text}#${occurrence}`
  })
}

export const buildDecomposeRows = (tokens: ParsedPromptToken[], edits: Map<string, RowEdit>): DecomposeRow[] => {
  const keys = tokenKeys(tokens)
  return tokens.map((token, index) => {
    const key = keys[index]
    const edit = edits.get(key)
    return {
      key,
      originalText: token.text,
      weight: token.weight,
      text: edit?.text ?? token.text,
      tag: edit?.tag ?? DEFAULT_TAG,
      description: edit?.description ?? '',
    }
  })
}

// 行を外すと後続の同 text の出現順が詰まりキーが変わるため、残る行の編集を新キーへ付け替える。
export const remapRowEdits = (edits: Map<string, RowEdit>, remaining: DecomposeRow[]): Map<string, RowEdit> => {
  const newKeys = tokenKeys(remaining.map((row) => ({ text: row.originalText, weight: row.weight })))
  const next = new Map<string, RowEdit>()
  remaining.forEach((row, index) => {
    const edit = edits.get(row.key)
    if (edit) next.set(newKeys[index], edit)
  })
  return next
}

export const setRowEdit = (
  edits: Map<string, RowEdit>,
  key: string,
  base: RowEdit,
  patch: Partial<RowEdit>,
): Map<string, RowEdit> => {
  const next = new Map(edits)
  next.set(key, { ...base, ...patch })
  return next
}

export const buildPrompt = (tokens: ParsedPromptToken[]): string =>
  tokens.map((token) => applyNotation(token.text, token.weight)).join(', ')

export const toOutputItems = (rows: Array<{ text: string; weight: number }>, createId: () => string): OutputItem[] =>
  rows.map((row) => ({ id: createId(), wordId: null, text: row.text.trim(), weight: row.weight }))
