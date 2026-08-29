import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useIsMobile } from '../hooks/useIsMobile'
import { formatCurrency, formatDisplayDate } from '../lib/format'
import type { Transaction, ViewMode } from '../lib/types'
import { Pagination, usePaginatedRows } from './Pagination'

type TransactionsTableProps = {
  rows: Transaction[]
  viewMode: ViewMode
  onViewModeChange: (value: ViewMode) => void
}

type SortKey = 'date' | 'amount'
type SortDirection = 'asc' | 'desc'

export const TransactionsTable = ({ rows, viewMode, onViewModeChange }: TransactionsTableProps) => {
  const isMobile = useIsMobile()
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const sortedRows = useMemo(() => {
    const factor = sortDirection === 'asc' ? 1 : -1
    return [...rows].sort((left, right) => {
      if (sortKey === 'amount') return (left.amount - right.amount) * factor
      return left.sortableDate.localeCompare(right.sortableDate) * factor
    })
  }, [rows, sortKey, sortDirection])

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDirection('desc')
    }
  }

  const sortIndicator = (key: SortKey) => (sortKey === key ? (sortDirection === 'asc' ? '▲' : '▼') : '')

  const pagination = usePaginatedRows(sortedRows)

  return (
    <section className="ccsv-panel">
      <div className="ccsv-panel-header">
        <h2>明細一覧</h2>
        <div className="ccsv-segmented">
          <button
            className={viewMode === 'detail' ? 'active' : ''}
            type="button"
            onClick={() => onViewModeChange('detail')}
          >
            明細
          </button>
          <button
            className={viewMode === 'monthly-summary' ? 'active' : ''}
            type="button"
            onClick={() => onViewModeChange('monthly-summary')}
          >
            月内合計
          </button>
        </div>
      </div>
      <div className="ccsv-table-wrap">
        <table className="ccsv-transactions-table">
          <colgroup>
            <col className="ccsv-col-date" />
            <col className="ccsv-col-merchant" />
            <col className="ccsv-col-amount" />
          </colgroup>
          <thead>
            <tr>
              <th aria-sort={sortKey === 'date' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <button type="button" className="ccsv-sort-button" onClick={() => toggleSort('date')}>
                  利用日<span className="ccsv-sort-indicator" aria-hidden="true">{sortIndicator('date')}</span>
                </button>
              </th>
              <th>店名</th>
              <th aria-sort={sortKey === 'amount' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <button type="button" className="ccsv-sort-button" onClick={() => toggleSort('amount')}>
                  金額<span className="ccsv-sort-indicator" aria-hidden="true">{sortIndicator('amount')}</span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {pagination.pageRows.map((row) => (
              <tr key={row.id}>
                <td>{isMobile ? formatDisplayDate(row.date) : row.sortableDate}</td>
                <td>
                  <Link to={`/merchant/${encodeURIComponent(row.merchantKey)}`} title={row.merchantLabel}>
                    {row.merchantLabel}
                  </Link>
                </td>
                <td>{formatCurrency(row.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination
        page={pagination.page}
        pageCount={pagination.pageCount}
        totalCount={rows.length}
        start={pagination.start}
        onPageChange={pagination.setPage}
      />
    </section>
  )
}
