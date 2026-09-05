import { Link } from 'react-router-dom'
import { useSortableRows } from '../hooks/useSortableRows'
import { formatCurrency } from '../lib/format'
import type { MerchantSummary } from '../lib/types'
import { Pagination, usePaginatedRows } from './Pagination'

type SortKey = 'totalAmount'

const compareRows = (left: MerchantSummary, right: MerchantSummary, key: SortKey) => left[key] - right[key]

export const MerchantTotalsTable = ({ rows }: { rows: MerchantSummary[] }) => {
  const { sortedRows, sortIndicator, ariaSort, toggleSort } = useSortableRows<MerchantSummary, SortKey>(
    rows,
    'totalAmount',
    compareRows
  )

  const pagination = usePaginatedRows(sortedRows)

  return (
    <section className="credit-csv-panel">
      <div className="credit-csv-panel-header">
        <h2>店名別累計</h2>
      </div>
      <div className="credit-csv-table-wrap">
        <table className="credit-csv-totals-table">
          <colgroup>
            <col className="credit-csv-col-merchant" />
            <col className="credit-csv-col-amount" />
          </colgroup>
          <thead>
            <tr>
              <th>店名</th>
              <th className="credit-csv-cell-numeric" aria-sort={ariaSort('totalAmount')}>
                <button type="button" className="credit-csv-sort-button" onClick={() => toggleSort('totalAmount')}>
                  累計金額<span className="credit-csv-sort-indicator" aria-hidden="true">{sortIndicator('totalAmount')}</span>
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
