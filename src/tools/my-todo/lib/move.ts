import { TODAY_LIMIT, type TodoItem, type TodoSectionId, type TodoState } from '../shared/types'

export const countUnfinished = (items: TodoItem[]): number => items.filter((item) => !item.completed).length

// 完了済みアイテムは Today の未完了件数を増やさないため常に配置を許可する。
export const canPlaceInToday = (todayItems: TodoItem[], itemCompleted: boolean): boolean =>
  itemCompleted || countUnfinished(todayItems) < TODAY_LIMIT

// 移動できない場合は state をそのまま返す（参照不変で no-op を表す）。
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
