import { formatCurrency } from '../lib/format'
import type { MerchantMonthlySummary } from '../lib/types'
import { Pagination, usePaginatedRows } from './Pagination'

export const MerchantMonthlyTable = ({
  rows,
  paginated = true
}: {
  rows: MerchantMonthlySummary[]
  paginated?: boolean
}) => {
  const pagination = usePaginatedRows(rows)
  const displayedRows = paginated ? pagination.pageRows : rows

  return (
    <section className="credit-csv-panel">
      <div className="credit-csv-panel-header">
        <h2>月別合計</h2>
      </div>
      <div className="credit-csv-table-wrap">
        <table className="credit-csv-monthly-table">
          <colgroup>
            <col className="credit-csv-col-period" />
            <col className="credit-csv-col-amount" />
          </colgroup>
          <thead>
            <tr>
              <th>年月</th>
              <th className="credit-csv-cell-numeric">合計金額</th>
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
