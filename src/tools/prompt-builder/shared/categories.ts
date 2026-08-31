export const PROMPT_CATEGORY_IDS = ['base-prompt', 'base-negative', 'character-prompt', 'character-negative'] as const

export type PromptCategoryId = (typeof PROMPT_CATEGORY_IDS)[number]

export const PROMPT_CATEGORY_LABELS: Record<PromptCategoryId, string> = {
  'base-prompt': 'base prompt',
  'base-negative': 'base negative',
  'character-prompt': 'character prompt',
  'character-negative': 'character negative',
}

export const isPromptCategoryId = (value: string): value is PromptCategoryId =>
  (PROMPT_CATEGORY_IDS as readonly string[]).includes(value)
