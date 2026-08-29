import { Link } from 'react-router-dom'
import { useIsMobile } from '../hooks/useIsMobile'
import { useSortableRows } from '../hooks/useSortableRows'
import { formatCurrency, formatDisplayDate } from '../lib/format'
import type { Transaction, ViewMode } from '../lib/types'
import { Pagination, usePaginatedRows } from './Pagination'
import { ViewModeToggle } from './ViewModeToggle'

type TransactionsTableProps = {
  rows: Transaction[]
  viewMode: ViewMode
  onViewModeChange: (value: ViewMode) => void
}

type SortKey = 'date' | 'amount'

const compareRows = (left: Transaction, right: Transaction, key: SortKey) => {
  if (key === 'amount') return left.amount - right.amount
  return left.sortableDate.localeCompare(right.sortableDate)
}

export const TransactionsTable = ({ rows, viewMode, onViewModeChange }: TransactionsTableProps) => {
  const isMobile = useIsMobile()
  const { sortedRows, sortIndicator, ariaSort, toggleSort } = useSortableRows<Transaction, SortKey>(
    rows,
    'date',
    compareRows
  )

  const pagination = usePaginatedRows(sortedRows)

  return (
    <section className="ccsv-panel">
      <div className="ccsv-panel-header">
        <h2>明細一覧</h2>
        <ViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
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
              <th aria-sort={ariaSort('date')}>
                <button type="button" className="ccsv-sort-button" onClick={() => toggleSort('date')}>
                  利用日<span className="ccsv-sort-indicator" aria-hidden="true">{sortIndicator('date')}</span>
                </button>
              </th>
              <th>店名</th>
              <th className="ccsv-cell-numeric" aria-sort={ariaSort('amount')}>
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
                <td className="ccsv-cell-truncate">
                  <Link to={`/merchant/${encodeURIComponent(row.merchantKey)}`} title={row.merchantLabel}>
                    {row.merchantLabel}
                  </Link>
                </td>
                <td className="ccsv-cell-numeric">{formatCurrency(row.amount)}</td>
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
