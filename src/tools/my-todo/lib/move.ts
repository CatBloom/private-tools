import { TODAY_LIMIT, type TodoItem, type TodoSectionId, type TodoState } from '../shared/types'

// Today の未完了アイテム数（TODAY_LIMIT は未完了のみカウントする）。
export const countUnfinished = (items: TodoItem[]): number => items.filter((item) => !item.completed).length

// Today に「未完了アイテム」を新たに置けるかの判定。完了済みアイテムの追加/移動は
// Today の未完了件数を増やさないため、常に許可する（itemCompleted=true なら無条件 true）。
// UI の追加ボタン disable 判定・DnD の移動ブロック判定・明示ボタンの移動ブロック判定は、
// すべてこの1関数に集約する（二重実装しない）。
export const canPlaceInToday = (todayItems: TodoItem[], itemCompleted: boolean): boolean =>
  itemCompleted || countUnfinished(todayItems) < TODAY_LIMIT

// セクション間移動の純粋関数。移動できない（対象が見つからない・同一セクション・Today が
// 満杯で未完了アイテムを移動できない）場合は state をそのまま返す（参照不変で no-op を表す）。
export const moveItem = (state: TodoState, itemId: string, from: TodoSectionId, to: TodoSectionId): TodoState => {
  if (from === to) return state

  const source = state[from]
  const index = source.findIndex((item) => item.id === itemId)
  if (index === -1) return state

  const item = source[index]
  if (to === 'today' && !canPlaceInToday(state.today, item.completed)) return state

  const nextSource = [...source.slice(0, index), ...source.slice(index + 1)]
  const nextTarget = [...state[to], item]
  return { ...state, [from]: nextSource, [to]: nextTarget }
}
