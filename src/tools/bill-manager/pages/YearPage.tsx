import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Spinner } from '../../../components/feedback'
import { buildYearGrid, type YearGridMonth, type YearGridTotals } from '../lib/yearGrid'
import { useLedger } from '../state/LedgerContext'

const yenFormatter = new Intl.NumberFormat('ja-JP')
const formatAmount = (value: number | null): string => (value === null ? '–' : yenFormatter.format(value))

type SummaryRowSpec = {
  label: string
  field: keyof YearGridTotals
  missingLabel?: string
  emphasize?: boolean
}

const SUMMARY_ROWS: SummaryRowSpec[] = [
  { label: '特殊費用', field: 'specialTotal' },
  { label: '固定費合計', field: 'fixedTotal' },
  { label: 'クレカ', field: 'credit', missingLabel: '未取込' },
  { label: '支出合計', field: 'expenseTotal' },
  { label: '収入', field: 'income' },
  { label: '現金残', field: 'cashRemaining', emphasize: true },
]

const monthCellClassName = (month: YearGridMonth): string | undefined => (month.source !== 'stored' ? 'is-derived' : undefined)

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
        <p className="bill-manager-status-message bill-manager-status-message-error" role="alert">
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
                      <th key={monthColumn.month}>
                        <Link to={`/month/${monthColumn.month}`} className="bill-manager-year-month-link">
                          {index + 1}月
                          {monthColumn.source !== 'stored' ? (
                            <span className="bill-manager-year-derived-tag">見込</span>
                          ) : null}
                        </Link>
                      </th>
                    ))}
                    <th>年間合計</th>
                  </tr>
                </thead>
                <tbody>
                  {grid.rows.length === 0 ? (
                    <tr>
                      <td className="bill-manager-year-sticky-col" colSpan={14}>
                        支払い項目がありません。
                      </td>
                    </tr>
                  ) : (
                    grid.rows.map((row) => (
                      <tr key={row.name} className={row.excluded ? 'is-excluded' : undefined}>
                        <th scope="row" className="bill-manager-year-sticky-col">
                          {row.name}
                        </th>
                        {row.amounts.map((amount, index) => (
                          <td key={grid.months[index].month} className={monthCellClassName(grid.months[index])}>
                            {formatAmount(amount)}
                          </td>
                        ))}
                        <td>{formatAmount(row.yearTotal)}</td>
                      </tr>
                    ))
                  )}

                  {SUMMARY_ROWS.map(({ label, field, missingLabel, emphasize }) => (
                    <tr
                      key={field}
                      className={`bill-manager-year-summary-row${emphasize ? ' bill-manager-year-cash-row' : ''}`}
                    >
                      <th scope="row" className="bill-manager-year-sticky-col">
                        {label}
                      </th>
                      {grid.months.map((monthColumn) => {
                        const value = monthColumn.summary[field]
                        const text = value === null && missingLabel ? missingLabel : formatAmount(value)
                        return (
                          <td key={monthColumn.month} className={monthCellClassName(monthColumn)}>
                            {emphasize ? <strong>{text}</strong> : text}
                          </td>
                        )
                      })}
                      <td>{emphasize ? <strong>{formatAmount(grid.totals[field])}</strong> : formatAmount(grid.totals[field])}</td>
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
