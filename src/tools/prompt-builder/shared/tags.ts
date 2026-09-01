// アルファベット順、ただし others だけ常に最下（絞り込み・ALLグループ表示・各セレクトの並びに反映される）。
export const PROMPT_TAG_IDS = [
  'angle',
  'composition',
  'expression',
  'illustrator',
  'pose',
  'quality',
  'situation',
  'others',
] as const

export type PromptTagId = (typeof PROMPT_TAG_IDS)[number]

export const PROMPT_TAG_LABELS: Record<PromptTagId, string> = {
  angle: 'angle',
  composition: 'composition',
  expression: 'expression',
  illustrator: 'illustrator',
  pose: 'pose',
  quality: 'quality',
  situation: 'situation',
  others: 'others',
}

export const isPromptTagId = (value: string): value is PromptTagId =>
  (PROMPT_TAG_IDS as readonly string[]).includes(value)

export const DEFAULT_TAG: PromptTagId = 'others'

// タグ無し／不正なタグのワード（旧データ）を安全側の既定タグへ寄せる。
export const normalizeTag = (value: unknown): PromptTagId =>
  typeof value === 'string' && isPromptTagId(value) ? value : DEFAULT_TAG
