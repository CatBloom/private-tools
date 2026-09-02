// 履歴の保存先ターゲット定義。ワードはこの分類を持たず共有プールで一括管理する（HistoryEntry.target で使う）。
export const PROMPT_TARGET_IDS = ['base', 'character', 'negative'] as const

export type PromptTargetId = (typeof PROMPT_TARGET_IDS)[number]

export const PROMPT_TARGET_LABELS: Record<PromptTargetId, string> = {
  base: 'base',
  character: 'character',
  negative: 'negative',
}

export const isPromptTargetId = (value: string): value is PromptTargetId =>
  (PROMPT_TARGET_IDS as readonly string[]).includes(value)
