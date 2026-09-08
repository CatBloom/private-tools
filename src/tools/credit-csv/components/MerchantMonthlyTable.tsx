import { useSortableRows } from '../hooks/useSortableRows'
import { formatCurrency } from '../../../lib/credit-csv/format'
import type { MerchantMonthlySummary } from '../../../lib/credit-csv/types'
import { Pagination, usePaginatedRows } from './Pagination'

type SortKey = 'period' | 'totalAmount'

const compareRows = (left: MerchantMonthlySummary, right: MerchantMonthlySummary, key: SortKey) => {
  if (key === 'totalAmount') return left.totalAmount - right.totalAmount
  return left.key.localeCompare(right.key)
}

export const MerchantMonthlyTable = ({
  rows,
  paginated = true
}: {
  rows: MerchantMonthlySummary[]
  paginated?: boolean
}) => {
  const { sortedRows, sortIndicator, ariaSort, toggleSort } = useSortableRows<MerchantMonthlySummary, SortKey>(
    rows,
    'period',
    compareRows
  )

  const pagination = usePaginatedRows(sortedRows)
  const displayedRows = paginated ? pagination.pageRows : sortedRows

  return (
    <section className="pt-card credit-csv-panel">
      <div className="credit-csv-panel-header">
        <h2>月別合計</h2>
      </div>
      <div className="credit-csv-table-wrap">
        <table className="pt-table credit-csv-monthly-table">
          <colgroup>
            <col className="credit-csv-col-period" />
            <col className="credit-csv-col-amount" />
          </colgroup>
          <thead>
            <tr>
              <th aria-sort={ariaSort('period')}>
                <button type="button" className="credit-csv-sort-button" onClick={() => toggleSort('period')}>
                  年月<span className="credit-csv-sort-indicator" aria-hidden="true">{sortIndicator('period')}</span>
                </button>
              </th>
              <th className="credit-csv-cell-numeric" aria-sort={ariaSort('totalAmount')}>
                <button type="button" className="credit-csv-sort-button" onClick={() => toggleSort('totalAmount')}>
                  合計金額
                  <span className="credit-csv-sort-indicator" aria-hidden="true">{sortIndicator('totalAmount')}</span>
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {displayedRows.map((row) => (
              <tr key={row.key}>
                <td>{row.periodLabel}</td>
                <td className="credit-csv-cell-numeric">{formatCurrency(row.totalAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {paginated ? (
        <Pagination
          page={pagination.page}
          pageCount={pagination.pageCount}
          totalCount={rows.length}
          start={pagination.start}
          onPageChange={pagination.setPage}
        />
      ) : null}
    </section>
  )
}
