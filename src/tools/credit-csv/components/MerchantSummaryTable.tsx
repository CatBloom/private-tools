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
    <section className="ccsv-panel">
      <div className="ccsv-panel-header">
        <h2>月内合計</h2>
        <ViewModeToggle viewMode={viewMode} onViewModeChange={onViewModeChange} />
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
              <th className="ccsv-cell-numeric" aria-sort={ariaSort('count')}>
                <button type="button" className="ccsv-sort-button" onClick={() => toggleSort('count')}>
                  件数<span className="ccsv-sort-indicator" aria-hidden="true">{sortIndicator('count')}</span>
                </button>
              </th>
              <th className="ccsv-cell-numeric" aria-sort={ariaSort('totalAmount')}>
                <button type="button" className="ccsv-sort-button" onClick={() => toggleSort('totalAmount')}>
                  合計金額<span className="ccsv-sort-indicator" aria-hidden="true">{sortIndicator('totalAmount')}</span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {pagination.pageRows.map((row) => (
              <tr key={row.merchantKey}>
                <td className="ccsv-cell-truncate">
                  <Link to={`/merchant/${encodeURIComponent(row.merchantKey)}`} title={row.merchant}>
                    {row.merchant}
                  </Link>
                </td>
                <td className="ccsv-cell-numeric">{row.count.toLocaleString('ja-JP')}件</td>
                <td className="ccsv-cell-numeric">{formatCurrency(row.totalAmount)}</td>
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
