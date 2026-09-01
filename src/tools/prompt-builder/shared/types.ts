import type { PromptTagId } from './tags'

export type PromptWord = {
  id: string
  text: string
  description: string
  tag: PromptTagId
}

// weight: 正=`{}` の重ね掛け段数、負=`[]` の段数、0=素。
export type OutputItem = {
  id: string
  wordId: string | null
  text: string
  weight: number
}

// 出力の保存履歴。分類ごとに複数件持てる名前付きスナップショット。
export type HistoryEntry = {
  id: string
  name: string
  createdAt: string
  items: OutputItem[]
}
