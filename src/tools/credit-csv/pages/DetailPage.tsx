import { useEffect, useMemo } from 'react'
import { CompositionChartCard } from '../components/Charts'
import { FilterBar } from '../components/FilterBar'
import { MerchantSummaryTable } from '../components/MerchantSummaryTable'
import { StatusView } from '../components/StatusView'
import { SummaryStats } from '../components/SummaryStats'
import { TransactionsTable } from '../components/TransactionsTable'
import { usePersistedState } from '../hooks/usePersistedState'
import { buildPieData, filterTransactions, summarizeMerchants, summarizePeriod } from '../lib/selectors'
import type { AppData, ViewMode } from '../lib/types'
import { useAppDataContext } from '../state/AppDataContext'

const DetailView = ({ data }: { data: AppData }) => {
  const [year, setYear] = usePersistedState('credit-csv:detail-year', data.latestPeriod.year)
  const [month, setMonth] = usePersistedState('credit-csv:detail-month', data.latestPeriod.month)
  const [merchantFilter, setMerchantFilter] = usePersistedState('credit-csv:detail-merchant', '')
  const [viewMode, setViewMode] = usePersistedState<ViewMode>('credit-csv:detail-view-mode', 'detail')

  const selectedYear = data.years.includes(year) ? year : data.latestPeriod.year
  const months = data.monthsByYear[selectedYear] ?? []
  const selectedMonth = months.includes(month) ? month : (months.at(-1) ?? month)

  useEffect(() => {
    if (selectedYear !== year) setYear(selectedYear)
  }, [selectedYear, year, setYear])

  useEffect(() => {
    if (selectedMonth !== month) setMonth(selectedMonth)
  }, [selectedMonth, month, setMonth])

  const rows = useMemo(
    () => filterTransactions(data.transactions, selectedYear, selectedMonth, merchantFilter),
    [data.transactions, selectedYear, selectedMonth, merchantFilter]
  )
  const summary = useMemo(() => summarizePeriod(rows), [rows])
  const pieData = useMemo(() => buildPieData(rows), [rows])
  const monthlySummaryRows = useMemo(() => summarizeMerchants(rows), [rows])

  return (
    <div className="ccsv-page-stack">
      <FilterBar
        years={data.years}
        months={months}
        selectedYear={selectedYear}
        selectedMonth={selectedMonth}
        merchantFilter={merchantFilter}
        onYearChange={setYear}
        onMonthChange={setMonth}
        onMerchantChange={setMerchantFilter}
      />
      <SummaryStats totalAmount={summary.totalAmount} count={summary.count} />
      <CompositionChartCard title="月内の構成比" data={pieData} />
      {viewMode === 'detail' ? (
        <TransactionsTable rows={rows} viewMode={viewMode} onViewModeChange={setViewMode} />
      ) : (
        <MerchantSummaryTable rows={monthlySummaryRows} viewMode={viewMode} onViewModeChange={setViewMode} />
      )}
    </div>
  )
}

export const DetailPage = () => {
  const { status } = useAppDataContext()

  if (status.kind !== 'ready') {
    return <StatusView status={status} />
  }

  return <DetailView data={status.data} />
}
