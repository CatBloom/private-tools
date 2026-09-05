import { Link } from 'react-router-dom'
import { useSortableRows } from '../hooks/useSortableRows'
import { formatCurrency } from '../lib/format'
import type { MerchantSummary, ViewMode } from '../lib/types'
import { Pagination, usePaginatedRows } from './Pagination'
import { ViewModeToggle } from './ViewModeToggle'

type MerchantSummaryTableProps = {
  rows: MerchantSummary[]
  viewMode: ViewMode
  onViewModeChange: (value: ViewMode) => void
}

type SortKey = 'count' | 'totalAmount'

const compareRows = (left: MerchantSummary, right: MerchantSummary, key: SortKey) => left[key] - right[key]

export const MerchantSummaryTable = ({ rows, viewMode, onViewModeChange }: MerchantSummaryTableProps) => {
  const { sortedRows, sortIndicator, ariaSort, toggleSort } = useSortableRows<MerchantSummary, SortKey>(
    rows,
    'totalAmount',
    compareRows
  )

  const pagination = usePaginatedRows(sortedRows)

  return (
    <section className="credit-csv-panel">
      <div className="credit-csv-panel-header">
        <h2>月内合計</h2>
        <ViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
      </div>
      <div className="credit-csv-table-wrap">
        <table className="credit-csv-summary-table">
          <colgroup>
            <col className="credit-csv-col-merchant" />
            <col className="credit-csv-col-count" />
            <col className="credit-csv-col-amount" />
          </colgroup>
          <thead>
            <tr>
              <th>店名</th>
              <th className="credit-csv-cell-numeric" aria-sort={ariaSort('count')}>
                <button type="button" className="credit-csv-sort-button" onClick={() => toggleSort('count')}>
                  件数<span className="credit-csv-sort-indicator" aria-hidden="true">{sortIndicator('count')}</span>
                </button>
              </th>
              <th className="credit-csv-cell-numeric" aria-sort={ariaSort('totalAmount')}>
                <button type="button" className="credit-csv-sort-button" onClick={() => toggleSort('totalAmount')}>
                  合計金額<span className="credit-csv-sort-indicator" aria-hidden="true">{sortIndicator('totalAmount')}</span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {pagination.pageRows.map((row) => (
              <tr key={row.merchantKey}>
                <td className="credit-csv-cell-truncate">
                  <Link to={`/merchant/${encodeURIComponent(row.merchantKey)}`} title={row.merchant}>
                    {row.merchant}
                  </Link>
                </td>
                <td className="credit-csv-cell-numeric">{row.count.toLocaleString('ja-JP')}件</td>
                <td className="credit-csv-cell-numeric">{formatCurrency(row.totalAmount)}</td>
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
