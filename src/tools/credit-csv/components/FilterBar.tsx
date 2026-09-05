import { formatMonthLabel } from '../lib/format'

type FilterBarProps = {
  years: string[]
  months: string[]
  selectedYear: string
  selectedMonth: string
  merchantFilter: string
  onYearChange: (value: string) => void
  onMonthChange: (value: string) => void
  onMerchantChange: (value: string) => void
}

export const FilterBar = ({
  years,
  months,
  selectedYear,
  selectedMonth,
  merchantFilter,
  onYearChange,
  onMonthChange,
  onMerchantChange
}: FilterBarProps) => (
  <section className="credit-csv-panel">
    <div className="credit-csv-filters">
      <label>
        年
        <select value={selectedYear} onChange={(event) => onYearChange(event.target.value)}>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}年
            </option>
          ))}
        </select>
      </label>

      <label>
        月
        <select value={selectedMonth} onChange={(event) => onMonthChange(event.target.value)}>
          {months.map((month) => (
            <option key={month} value={month}>
              {formatMonthLabel(month)}
            </option>
          ))}
        </select>
      </label>

      <label className="credit-csv-filter-wide">
        店名
        <input
          value={merchantFilter}
          onChange={(event) => onMerchantChange(event.target.value)}
          placeholder="部分一致で絞り込み"
        />
      </label>
    </div>
  </section>
)
