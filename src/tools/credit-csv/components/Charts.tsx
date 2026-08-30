import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatCurrency } from '../lib/format'
import { collapseTopN } from '../lib/selectors'
import { useIsMobile } from '../hooks/useIsMobile'

// スマホでは円グラフを見やすくするため上位 N 件＋「その他」に折りたたむ
const MOBILE_MAX_SLICES = 5

const PIE_COLORS = [
  '#0f766e',
  '#1d4ed8',
  '#b45309',
  '#be123c',
  '#4338ca',
  '#047857',
  '#334155',
  '#7c2d12',
  '#4c1d95',
  '#9a3412',
  '#525252'
]

export const TrendChartCard = ({
  title,
  data
}: {
  title: string
  data: Array<{ label: string; amount: number }>
}) => (
  <section className="ccsv-panel ccsv-chart-panel">
    <div className="ccsv-panel-header">
      <h2>{title}</h2>
    </div>
    <div className="ccsv-chart-wrap">
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
          <XAxis
            dataKey="label"
            interval="preserveStartEnd"
            minTickGap={12}
            angle={-35}
            textAnchor="end"
            height={56}
            tick={{ fontSize: 11 }}
            padding={{ left: 8, right: 8 }}
          />
          <YAxis
            width={40}
            tick={{ fontSize: 11 }}
            tickFormatter={(value: number) => `${Math.round(value / 1000)}k`}
          />
          <Tooltip formatter={(value: number) => formatCurrency(value)} />
          <Line type="monotone" dataKey="amount" stroke="#ea580c" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  </section>
)

export const CompositionChartCard = ({
  title,
  data
}: {
  title: string
  data: Array<{ name: string; value: number; merchantKey?: string }>
}) => {
  const isMobile = useIsMobile()

  const displayData = useMemo(() => {
    if (!isMobile || data.length <= MOBILE_MAX_SLICES + 1) return data
    return collapseTopN(data, MOBILE_MAX_SLICES)
  }, [data, isMobile])

  return (
  <section className="ccsv-panel ccsv-chart-panel">
    <div className="ccsv-panel-header">
      <h2>{title}</h2>
    </div>
    <div className="ccsv-chart-wrap ccsv-chart-wrap-pie">
      <div className="ccsv-pie-canvas">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={displayData} dataKey="value" nameKey="name" outerRadius={122} innerRadius={66} paddingAngle={2}>
              {displayData.map((entry, index) => (
                <Cell key={`${entry.name}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number) => formatCurrency(value)} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="ccsv-legend-list">
        {displayData.map((entry) => (
          <div key={entry.name} className="ccsv-legend-row">
            {entry.merchantKey ? (
              <Link to={`/merchant/${encodeURIComponent(entry.merchantKey)}`} title={entry.name}>
                {entry.name}
              </Link>
            ) : (
              <span>{entry.name}</span>
            )}
            <strong>{formatCurrency(entry.value)}</strong>
          </div>
        ))}
      </div>
    </div>
  </section>
  )
}
