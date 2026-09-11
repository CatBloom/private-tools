import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MerchantMonthlyTable } from './MerchantMonthlyTable'
import type { MerchantMonthlySummary } from '../../../lib/credit-csv/types'

const rows: MerchantMonthlySummary[] = [
  { key: '2026-02', periodLabel: '2026/02', totalAmount: 3000 },
  { key: '2026-04', periodLabel: '2026/04', totalAmount: 1000 },
  { key: '2026-03', periodLabel: '2026/03', totalAmount: 2000 }
]

afterEach(() => {
  cleanup()
})

describe('MerchantMonthlyTable', () => {
  it('defaults to period descending order (newest first)', () => {
    render(<MerchantMonthlyTable rows={rows} paginated={false} />)

    const periodCells = screen.getAllByRole('row').slice(1).map((row) => row.querySelector('td')?.textContent)
    expect(periodCells).toEqual(['2026/04', '2026/03', '2026/02'])

    expect(screen.getByRole('columnheader', { name: /年月/ })).toHaveAttribute('aria-sort', 'descending')
  })

  it('toggles period sort direction on repeated clicks', () => {
    render(<MerchantMonthlyTable rows={rows} paginated={false} />)

    fireEvent.click(screen.getByRole('button', { name: /年月/ }))

    const periodCells = screen.getAllByRole('row').slice(1).map((row) => row.querySelector('td')?.textContent)
    expect(periodCells).toEqual(['2026/02', '2026/03', '2026/04'])
    expect(screen.getByRole('columnheader', { name: /年月/ })).toHaveAttribute('aria-sort', 'ascending')
  })

  it('sorts by total amount when its header is clicked', () => {
    render(<MerchantMonthlyTable rows={rows} paginated={false} />)

    fireEvent.click(screen.getByRole('button', { name: /合計金額/ }))

    const periodCells = screen.getAllByRole('row').slice(1).map((row) => row.querySelector('td')?.textContent)
    expect(periodCells).toEqual(['2026/02', '2026/03', '2026/04'])
    expect(screen.getByRole('columnheader', { name: /合計金額/ })).toHaveAttribute('aria-sort', 'descending')
  })
})
