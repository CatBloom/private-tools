import { useMemo, useState } from 'react'

export type SortDirection = 'asc' | 'desc'

export const useSortableRows = <Row, Key extends string>(
  rows: Row[],
  initialKey: Key,
  compare: (left: Row, right: Row, key: Key) => number,
  initialDirection: SortDirection = 'desc'
) => {
  const [sortKey, setSortKey] = useState<Key>(initialKey)
  const [sortDirection, setSortDirection] = useState<SortDirection>(initialDirection)

  const sortedRows = useMemo(() => {
    const factor = sortDirection === 'asc' ? 1 : -1
    return [...rows].sort((left, right) => compare(left, right, sortKey) * factor)
  }, [rows, sortKey, sortDirection, compare])

  const toggleSort = (key: Key) => {
    if (key === sortKey) {
      setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDirection('desc')
    }
  }

  const sortIndicator = (key: Key) => (sortKey === key ? (sortDirection === 'asc' ? '▲' : '▼') : '')

  const ariaSort = (key: Key): 'ascending' | 'descending' | 'none' =>
    sortKey === key ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'

  return { sortedRows, sortKey, sortDirection, toggleSort, sortIndicator, ariaSort }
}
