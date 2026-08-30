import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { CompositionChartCard } from './Charts'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Pie: () => null,
  Cell: () => null,
  Tooltip: () => null
}))

const data = Array.from({ length: 8 }, (_, index) => ({ name: `M${index + 1}`, value: (8 - index) * 100 }))

const setMatchMedia = (matches: boolean) => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  )
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('CompositionChartCard', () => {
  it('collapses to the top 5 merchants plus その他 on mobile', () => {
    setMatchMedia(true)
    render(<CompositionChartCard title="構成比" data={data} />)

    expect(screen.getByText('M1')).toBeInTheDocument()
    expect(screen.getByText('M5')).toBeInTheDocument()
    expect(screen.getByText('その他')).toBeInTheDocument()
    // 6 件目以降は「その他」に集約され、個別には表示されない
    expect(screen.queryByText('M6')).not.toBeInTheDocument()
  })

  it('shows every merchant on desktop', () => {
    setMatchMedia(false)
    render(<CompositionChartCard title="構成比" data={data} />)

    expect(screen.getByText('M6')).toBeInTheDocument()
    expect(screen.getByText('M8')).toBeInTheDocument()
    expect(screen.queryByText('その他')).not.toBeInTheDocument()
  })
})
