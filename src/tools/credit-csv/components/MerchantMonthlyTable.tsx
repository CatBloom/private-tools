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
    <section className="ccsv-panel">
      <div className="ccsv-panel-header">
        <h2>月別合計</h2>
      </div>
      <div className="ccsv-table-wrap">
        <table className="ccsv-monthly-table">
          <colgroup>
            <col className="ccsv-col-period" />
            <col className="ccsv-col-amount" />
          </colgroup>
          <thead>
            <tr>
              <th>年月</th>
              <th className="ccsv-cell-numeric">合計金額</th>
            </tr>
          </thead>
          <tbody>
            {displayedRows.map((row) => (
              <tr key={row.key}>
                <td>{row.periodLabel}</td>
                <td className="ccsv-cell-numeric">{formatCurrency(row.totalAmount)}</td>
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
