// react 非依存の純粋な型定義。サーバー route からも import されるため JSX を含めない。
export type TodoSectionId = 'today' | 'someday'

export type TodoItem = {
  id: string
  text: string
  completed: boolean
  createdAt: string
}

export type TodoState = {
  today: TodoItem[]
  someday: TodoItem[]
  lastRolloverDate: string | null
}

// Today に置ける未完了アイテムの上限（完了済みはカウントしない）。
export const TODAY_LIMIT = 5
