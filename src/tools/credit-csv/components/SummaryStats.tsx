import { formatCurrency } from '../lib/format'

type SummaryStatsProps = {
  totalAmount: number
  count: number
}

export const SummaryStats = ({ totalAmount, count }: SummaryStatsProps) => (
  <section className="ccsv-summary-grid">
    <article className="ccsv-summary-card">
      <span>件数</span>
      <strong>{count.toLocaleString('ja-JP')}件</strong>
    </article>
    <article className="ccsv-summary-card">
      <span>合計金額</span>
      <strong>{formatCurrency(totalAmount)}</strong>
    </article>
  </section>
)
