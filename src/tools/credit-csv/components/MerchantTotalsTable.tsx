import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatCurrency } from '../lib/format'
import type { MerchantSummary } from '../lib/types'
import { Pagination, usePaginatedRows } from './Pagination'

type SortKey = 'totalAmount'
type SortDirection = 'asc' | 'desc'

export const MerchantTotalsTable = ({ rows }: { rows: MerchantSummary[] }) => {
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
        <h2>店名別累計</h2>
      </div>
      <div className="ccsv-table-wrap">
        <table className="ccsv-totals-table">
          <colgroup>
            <col className="ccsv-col-merchant" />
            <col className="ccsv-col-amount" />
          </colgroup>
          <thead>
            <tr>
              <th>店名</th>
              <th
                aria-sort={sortKey === 'totalAmount' ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                <button type="button" className="ccsv-sort-button" onClick={() => toggleSort('totalAmount')}>
                  累計金額<span className="ccsv-sort-indicator" aria-hidden="true">{sortIndicator('totalAmount')}</span>
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
