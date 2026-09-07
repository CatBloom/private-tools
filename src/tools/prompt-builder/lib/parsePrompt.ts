import { clampWeight } from './notation'

export type ParsedPromptToken = { text: string; weight: number }

const OPEN_CHARS = new Set(['{', '['])
const CLOSE_CHARS = new Set(['}', ']'])

// カンマ区切りのプロンプト文字列を、強調記法を解いたテキストと weight のトークン列に分解する。
// weight は先頭側のカッコの連続だけで決める（末尾側は剥がすのみで weight に影響しない）。
export const parsePrompt = (input: string): ParsedPromptToken[] => {
  const tokens: ParsedPromptToken[] = []

  for (const raw of input.split(',')) {
    const trimmed = raw.trim()
    if (trimmed.length === 0) continue

    let start = 0
    while (start < trimmed.length && OPEN_CHARS.has(trimmed[start])) start++

    let end = trimmed.length
    while (end > start && CLOSE_CHARS.has(trimmed[end - 1])) end--

    const text = trimmed.slice(start, end).trim()
    if (text.length === 0) continue

    let weight = 0
    if (start > 0) {
      const leading = trimmed.slice(0, start)
      if ([...leading].every((ch) => ch === '{')) weight = start
      else if ([...leading].every((ch) => ch === '[')) weight = -start
    }

    tokens.push({ text, weight: clampWeight(weight) })
  }

  return tokens
}
