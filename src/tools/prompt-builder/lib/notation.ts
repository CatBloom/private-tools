import type { OutputItem } from '../shared/types'

// weight の絶対値上限。これを超える強調は意味が薄れるため UI 側の +/- 操作をここでクランプする。
export const NOTATION_WEIGHT_LIMIT = 5

export const clampWeight = (weight: number): number => {
  if (weight > NOTATION_WEIGHT_LIMIT) return NOTATION_WEIGHT_LIMIT
  if (weight < -NOTATION_WEIGHT_LIMIT) return -NOTATION_WEIGHT_LIMIT
  return weight
}

// weight>0 は `{}` を、weight<0 は `[]` を weight の絶対値の段数だけ重ねる。0 は素のテキスト。
export const applyNotation = (text: string, weight: number): string => {
  const clamped = clampWeight(weight)
  if (clamped > 0) return `${'{'.repeat(clamped)}${text}${'}'.repeat(clamped)}`
  if (clamped < 0) return `${'['.repeat(-clamped)}${text}${']'.repeat(-clamped)}`
  return text
}

// テキストが空（トリム後）のアイテムは出力から除外する。
export const buildOutput = (items: OutputItem[]): string =>
  items
    .filter((item) => item.text.trim().length > 0)
    .map((item) => applyNotation(item.text, item.weight))
    .join(', ')

export const reorder = <T,>(items: T[], fromIndex: number, toIndex: number): T[] => {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
    return items
  }
  const next = items.slice()
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}
