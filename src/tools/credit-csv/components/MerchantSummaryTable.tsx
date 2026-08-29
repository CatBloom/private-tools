import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatCurrency } from '../lib/format'
import type { MerchantSummary, ViewMode } from '../lib/types'
import { Pagination, usePaginatedRows } from './Pagination'

type MerchantSummaryTableProps = {
  rows: MerchantSummary[]
  viewMode: ViewMode
  onViewModeChange: (value: ViewMode) => void
}

type SortKey = 'count' | 'totalAmount'
type SortDirection = 'asc' | 'desc'

export const MerchantSummaryTable = ({ rows, viewMode, onViewModeChange }: MerchantSummaryTableProps) => {
  const [sortKey, setSortKey] = useState<SortKey>('totalAmount')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const sortedRows = useMemo(() => {
    const factor = sortDirection === 'asc' ? 1 : -1
    return [...rows].sort((left, right) => (left[sortKey] - right[sortKey]) * factor)
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
        <h2>月内合計</h2>
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
        <table className="ccsv-summary-table">
          <colgroup>
            <col className="ccsv-col-merchant" />
            <col className="ccsv-col-count" />
            <col className="ccsv-col-amount" />
          </colgroup>
          <thead>
            <tr>
              <th>店名</th>
              <th aria-sort={sortKey === 'count' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}>
                <button type="button" className="ccsv-sort-button" onClick={() => toggleSort('count')}>
                  件数<span className="ccsv-sort-indicator" aria-hidden="true">{sortIndicator('count')}</span>
                </button>
              </th>
              <th
                aria-sort={sortKey === 'totalAmount' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <button type="button" className="ccsv-sort-button" onClick={() => toggleSort('totalAmount')}>
                  合計金額<span className="ccsv-sort-indicator" aria-hidden="true">{sortIndicator('totalAmount')}</span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {pagination.pageRows.map((row) => (
              <tr key={row.merchantKey}>
                <td>
                  <Link to={`/merchant/${encodeURIComponent(row.merchantKey)}`} title={row.merchant}>
                    {row.merchant}
                  </Link>
                </td>
                <td>{row.count.toLocaleString('ja-JP')}件</td>
                <td>{formatCurrency(row.totalAmount)}</td>
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
