import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Spinner } from '../../../components/feedback'
import { formatAmountOrDash as formatAmount } from '../lib/format'
import { buildYearGrid, type YearGridMonth, type YearGridTotals } from '../lib/yearGrid'
import { ENTRY_CATEGORY_LABELS } from '../shared/types'
import { useLedger } from '../state/LedgerContext'

/** クレカ未取込の月で null になった値（支出合計・現金残高）の代替表示。 */
const CREDIT_MISSING_CELL = '—'

type SummaryRowSpec = {
  label: string
  field: keyof YearGridTotals
  missingLabel?: string
  resultRow?: boolean
  firstResultRow?: boolean
  emphasize?: boolean
}

const SUMMARY_ROWS: SummaryRowSpec[] = [
  { label: 'クレカ', field: 'credit', missingLabel: '未取込' },
  { label: '支出合計', field: 'expenseTotal', resultRow: true, firstResultRow: true },
  { label: '収入', field: 'income', resultRow: true },
  { label: '現金残高', field: 'cashRemaining', resultRow: true, emphasize: true },
]

const summaryRowClassName = ({ resultRow, firstResultRow, emphasize }: SummaryRowSpec): string => {
  let className = 'bill-manager-year-summary-row'
  if (resultRow) className += ' bill-manager-year-result-row'
  if (firstResultRow) className += ' bill-manager-year-result-row-first'
  if (emphasize) className += ' bill-manager-year-cash-row'
  return className
}

// 記録の無い月は is-derived（薄い表示のみ、タグは出さない）、クレカ未取込の月は is-credit-missing（列全体に斜線のハッチングを掛け、集計外と分かるようにする）。
const monthCellClassName = (month: YearGridMonth): string | undefined => {
  const classes: string[] = []
  if (month.source !== 'stored') classes.push('is-derived')
  if (month.summary.creditMissing) classes.push('is-credit-missing')
  return classes.length > 0 ? classes.join(' ') : undefined
}

// クレカ／収入は summary から、支出合計・現金残高は月ごとに null 化されたフィールドから読む
// （クレカ未取込の月は summary 側の値ではなく expenseTotal／cashRemaining が null になっている）。
const monthValue = (monthColumn: YearGridMonth, field: keyof YearGridTotals): number | null =>
  field === 'expenseTotal' || field === 'cashRemaining' ? monthColumn[field] : monthColumn.summary[field]

export const YearPage = () => {
  const { year: yearParam } = useParams<{ year: string }>()
  const navigate = useNavigate()
  const { loadStatus, loadError, reload, state, year, setYear, creditByMonth } = useLedger()

  useEffect(() => {
    const parsed = yearParam === undefined ? NaN : Number(yearParam)
    if (Number.isInteger(parsed)) setYear(parsed)
  }, [yearParam, setYear])

  const displayYear = yearParam !== undefined && Number.isInteger(Number(yearParam)) ? Number(yearParam) : year
  const grid = buildYearGrid(state, displayYear, creditByMonth as Record<string, number | null>)

  return (
    <div className="bill-manager-page-stack">
      {loadStatus === 'loading' ? <Spinner label="読み込み中…" /> : null}
      {loadStatus === 'error' ? (
        <p className="pt-status-message pt-status-message-error" role="alert">
          {loadError}
          <button type="button" className="pt-button" onClick={reload}>
            再読み込み
          </button>
        </p>
      ) : null}

      {loadStatus === 'ready' ? (
        <>
          <div className="bill-manager-nav">
            <button type="button" className="pt-button" onClick={() => navigate(`/year/${displayYear - 1}`)}>
              前年
            </button>
            <span className="bill-manager-nav-label">{displayYear}年</span>
            <button type="button" className="pt-button" onClick={() => navigate(`/year/${displayYear + 1}`)}>
              翌年
            </button>
          </div>

          <section className="pt-card bill-manager-year-card">
            <div className="bill-manager-year-table-wrap">
              <table className="pt-table bill-manager-year-table">
                <thead>
                  <tr>
                    <th className="bill-manager-year-sticky-col">項目</th>
                    {grid.months.map((monthColumn, index) => (
                      <th key={monthColumn.month} className={monthCellClassName(monthColumn)}>
                        <Link to={`/month/${monthColumn.month}`} className="bill-manager-year-month-link">
                          {index + 1}月
                        </Link>
                      </th>
                    ))}
                    <th>年間合計</th>
                  </tr>
                </thead>
                <tbody>
                  {grid.categoryRows.map((row) => (
                    <tr key={row.category}>
                      <th scope="row" className="bill-manager-year-sticky-col">
                        {ENTRY_CATEGORY_LABELS[row.category]}
                      </th>
                      {row.amounts.map((amount, index) => (
                        <td key={grid.months[index].month} className={monthCellClassName(grid.months[index])}>
                          {formatAmount(amount)}
                        </td>
                      ))}
                      <td>{formatAmount(row.yearTotal)}</td>
                    </tr>
                  ))}

                  <tr>
                    <th scope="row" className="bill-manager-year-sticky-col">
                      特殊費用
                    </th>
                    {grid.specialRow.amounts.map((amount, index) => (
                      <td key={grid.months[index].month} className={monthCellClassName(grid.months[index])}>
                        {formatAmount(amount)}
                      </td>
                    ))}
                    <td>{formatAmount(grid.specialRow.yearTotal)}</td>
                  </tr>

                  {SUMMARY_ROWS.map((spec) => (
                    <tr key={spec.field} className={summaryRowClassName(spec)}>
                      <th scope="row" className="bill-manager-year-sticky-col">
                        {spec.label}
                      </th>
                      {grid.months.map((monthColumn) => {
                        const value = monthValue(monthColumn, spec.field)
                        const text = value === null ? (spec.missingLabel ?? CREDIT_MISSING_CELL) : formatAmount(value)
                        return (
                          <td key={monthColumn.month} className={monthCellClassName(monthColumn)}>
                            {spec.emphasize ? <strong>{text}</strong> : text}
                          </td>
                        )
                      })}
                      <td>
                        {spec.emphasize ? (
                          <strong>{formatAmount(grid.totals[spec.field])}</strong>
                        ) : (
                          formatAmount(grid.totals[spec.field])
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
