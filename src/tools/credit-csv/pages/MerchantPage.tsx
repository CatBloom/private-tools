import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { TrendChartCard } from '../components/Charts'
import { MerchantMonthlyTable } from '../components/MerchantMonthlyTable'
import { StatusView } from '../components/StatusView'
import { SummaryStats } from '../components/SummaryStats'
import { usePersistedState } from '../hooks/usePersistedState'
import {
  buildMerchantTrendAll,
  buildMerchantTrendYear,
  compareTransactionDateAsc,
  summarizeMerchantByMonth,
  summarizePeriod
} from '../lib/selectors'
import type { AppData } from '../lib/types'
import { useAppDataContext } from '../state/AppDataContext'

type MerchantMode = 'all' | 'year'

const MerchantView = ({ data, merchant }: { data: AppData; merchant: string }) => {
  const [mode, setMode] = usePersistedState<MerchantMode>('credit-csv:merchant-mode', 'all')
  const [year, setYear] = usePersistedState('credit-csv:merchant-year', data.latestPeriod.year)
  const selectedYear = data.years.includes(year) ? year : data.latestPeriod.year

  const rows = useMemo(
    () =>
      data.transactions
        .filter((transaction) => transaction.merchantKey === merchant)
        .sort(compareTransactionDateAsc),
    [data.transactions, merchant]
  )

  const tableRows = mode === 'all' ? rows : rows.filter((transaction) => transaction.year === selectedYear)
  // サマリーは表示中の期間（全期間 or 選択年）に一致させる
  const summary = summarizePeriod(tableRows)
  const monthlyRows = summarizeMerchantByMonth(tableRows)
  const displayName = rows[0]?.merchantLabel ?? merchant
  const trend =
    mode === 'all'
      ? buildMerchantTrendAll(data.transactions, merchant)
      : buildMerchantTrendYear(data.transactions, merchant, selectedYear)

  return (
    <div className="ccsv-page-stack">
      <section className="ccsv-panel">
        <div className="ccsv-panel-header">
          <h1>{displayName}</h1>
        </div>
        <div className="ccsv-segmented">
          <button className={mode === 'all' ? 'active' : ''} type="button" onClick={() => setMode('all')}>
            全期間
          </button>
          <button className={mode === 'year' ? 'active' : ''} type="button" onClick={() => setMode('year')}>
            年指定
          </button>
          {mode === 'year' ? (
            <select value={selectedYear} onChange={(event) => setYear(event.target.value)}>
              {data.years.map((yearOption) => (
                <option key={yearOption} value={yearOption}>
                  {yearOption}年
                </option>
              ))}
            </select>
          ) : null}
        </div>
      </section>
      <SummaryStats totalAmount={summary.totalAmount} count={summary.count} />
      <TrendChartCard
        title={mode === 'all' ? '月ごとの金額推移' : `${selectedYear}年の月ごとの金額推移`}
        data={trend}
      />
      <MerchantMonthlyTable rows={monthlyRows} paginated={mode === 'all'} />
    </div>
  )
}

export const MerchantPage = () => {
  const { status } = useAppDataContext()
  const params = useParams()
  const merchant = params.merchant ? decodeURIComponent(params.merchant) : ''

  if (status.kind !== 'ready') {
    return <StatusView status={status} />
  }

  return <MerchantView data={status.data} merchant={merchant} />
}
