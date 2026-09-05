import { useMemo } from 'react'
import { TrendChartCard } from '../components/Charts'
import { MerchantTotalsTable } from '../components/MerchantTotalsTable'
import { StatusView } from '../components/StatusView'
import { SummaryStats } from '../components/SummaryStats'
import { usePersistedState } from '../../../hooks/usePersistedState'
import { buildYearlyTrend, summarizeMerchants, summarizePeriod } from '../lib/selectors'
import type { AppData } from '../lib/types'
import { useAppDataContext } from '../state/AppDataContext'

const YearlyView = ({ data }: { data: AppData }) => {
  const [year, setYear] = usePersistedState('credit-csv:yearly-year', data.latestPeriod.year)
  const selectedYear = data.years.includes(year) ? year : data.latestPeriod.year

  const yearlyRows = useMemo(
    () => data.transactions.filter((transaction) => transaction.year === selectedYear),
    [data.transactions, selectedYear]
  )
  const summary = useMemo(() => summarizePeriod(yearlyRows), [yearlyRows])
  const trend = useMemo(() => buildYearlyTrend(data.transactions, selectedYear), [data.transactions, selectedYear])
  const merchantRows = useMemo(() => summarizeMerchants(yearlyRows), [yearlyRows])

  return (
    <div className="credit-csv-page-stack">
      <section className="credit-csv-panel">
        <div className="credit-csv-filters">
          <label>
            年
            <select value={selectedYear} onChange={(event) => setYear(event.target.value)}>
              {data.years.map((yearOption) => (
                <option key={yearOption} value={yearOption}>
                  {yearOption}年
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      <SummaryStats totalAmount={summary.totalAmount} count={summary.count} />
      <TrendChartCard title="月別合計" data={trend} />
      <MerchantTotalsTable rows={merchantRows} />
    </div>
  )
}

export const YearlyPage = () => {
  const { status } = useAppDataContext()

  if (status.kind !== 'ready') {
    return <StatusView status={status} />
  }

  return <YearlyView data={status.data} />
}
