import { useMemo } from 'react'

// getKey は再レンダーで参照が変わらないようモジュールスコープの関数を渡すこと。
export const useGroupedFilter = <T, K extends string>(
  items: T[],
  ids: readonly K[],
  getKey: (item: T) => K,
  filter: K | 'ALL',
) => {
  const visible = useMemo(
    () => (filter === 'ALL' ? items : items.filter((item) => getKey(item) === filter)),
    [items, filter, getKey],
  )

  const grouped = useMemo(
    () =>
      ids
        .map((id) => ({ id, items: items.filter((item) => getKey(item) === id) }))
        .filter((group) => group.items.length > 0),
    [items, ids, getKey],
  )

  return { visible, grouped }
}
