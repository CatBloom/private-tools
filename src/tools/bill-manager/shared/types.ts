// Bill Manager の react 非依存な型と定数。サーバー route からも import するため JSX を含めない。

/** 項目のカテゴリ。収入と特殊費用は別構造（LedgerMonth.income / specials）で持つ。 */
export const ENTRY_CATEGORIES = ['rent', 'insurance', 'telecom', 'loan', 'investment', 'utility', 'other'] as const
export type EntryCategory = (typeof ENTRY_CATEGORIES)[number]

export const ENTRY_CATEGORY_LABELS: Record<EntryCategory, string> = {
  rent: '家賃',
  insurance: '保険',
  telecom: '通信',
  loan: '残債',
  investment: '投資',
  utility: '光熱費',
  other: 'その他',
}

export const isEntryCategory = (value: unknown): value is EntryCategory =>
  typeof value === 'string' && (ENTRY_CATEGORIES as readonly string[]).includes(value)

/** 支払月ごとの固定費の1行。 */
export type LedgerEntry = {
  id: string
  /** 家賃・かんぽ生命・Nisa など。 */
  name: string
  /** null = 未入力（ユーザーが金額を空にした場合）。variable な行の翌月コピー直後は 0 になる。 */
  amount: number | null
  category: EntryCategory
  /** 「変動費」。true なら翌月へコピーする際に amount を 0 にする。 */
  variable: boolean
  /** false = 翌月へコピーしない（この月で終了）。過去月には残る。 */
  carryOver: boolean
  /** 「計上しない」。記録は残すが支出合計に含めない（例: 通信費はクレカ明細に含まれている）。 */
  excluded: boolean
}

/** 特殊費用。金額とメモだけの軽い記録。翌月へコピーしない。 */
export type SpecialExpense = {
  id: string
  amount: number
  memo: string
}

/** 支払月1か月分の記録。 */
export type LedgerMonth = {
  entries: LedgerEntry[]
  /** 給与。翌月へコピーする。 */
  income: number | null
  /** 賞与。翌月へコピーしない。 */
  bonus: number | null
  /** 臨時収入。細かく分けない1つの塊。翌月へコピーしない。 */
  extraIncome: number | null
  specials: SpecialExpense[]
}

/**
 * 支払月（YYYYMM）→ その月のスナップショット。
 * マスターは持たず、月ごとに独立して保存する。ある月を編集しても他の月には波及しない。
 * クレカ額はここに保存しない（表示時に credit-csv の CSV から算出する。手入力もしない）。
 */
export type LedgerState = {
  months: Record<string, LedgerMonth>
}

export const createEmptyLedgerMonth = (): LedgerMonth => ({
  entries: [],
  income: null,
  bonus: null,
  extraIncome: null,
  specials: [],
})
export const createEmptyLedgerState = (): LedgerState => ({ months: {} })

/** 支払月キー（YYYYMM、月は 01〜12）。 */
export const MONTH_KEY_PATTERN = /^\d{4}(0[1-9]|1[0-2])$/
export const isMonthKey = (value: string): boolean => MONTH_KEY_PATTERN.test(value)

// 構造的な上限。クライアントの先回りチェックとサーバーのバリデーションで同値を共有する。
export const MAX_MONTHS = 240
export const MAX_ENTRIES_PER_MONTH = 50
export const MAX_SPECIALS_PER_MONTH = 50
export const MAX_ENTRY_NAME_LENGTH = 100
export const MAX_MEMO_LENGTH = 200
/** 金額は 0 以上の整数（円）。 */
export const MAX_ENTRY_AMOUNT = 1_000_000_000
