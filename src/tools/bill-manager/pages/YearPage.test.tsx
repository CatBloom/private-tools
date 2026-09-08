import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AlertProvider, ConfirmProvider } from '../../../components/feedback'
import { getLedger } from '../api'
import { fetchCreditCsvBytes } from '../creditCsvApi'
import { createEmptyLedgerMonth, type LedgerState } from '../shared/types'
import { LedgerProvider } from '../state/LedgerContext'
import { YearPage } from './YearPage'

vi.mock('../api', () => ({
  getLedger: vi.fn(),
  putLedger: vi.fn(),
}))

vi.mock('../creditCsvApi', () => ({
  fetchCreditCsvBytes: vi.fn(),
}))

const emptyState = (): LedgerState => ({ months: {} })
const fmt = (value: number) => new Intl.NumberFormat('ja-JP').format(value)

const renderPage = (year = '2026') =>
  render(
    <MemoryRouter initialEntries={[`/year/${year}`]}>
      <AlertProvider>
        <ConfirmProvider>
          <LedgerProvider>
            <Routes>
              <Route path="/year/:year" element={<YearPage />} />
            </Routes>
          </LedgerProvider>
        </ConfirmProvider>
      </AlertProvider>
    </MemoryRouter>,
  )

describe('YearPage', () => {
  beforeEach(() => {
    vi.mocked(getLedger).mockResolvedValue(emptyState())
    vi.mocked(fetchCreditCsvBytes).mockResolvedValue(null)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders 12 month columns and a year total column', async () => {
    renderPage('2026')
    expect(await screen.findByText('1月')).toBeInTheDocument()
    expect(screen.getByText('12月')).toBeInTheDocument()
    expect(screen.getByText('年間合計')).toBeInTheDocument()
  })

  it('shows an item row that carries its amount across derived months', async () => {
    vi.mocked(getLedger).mockResolvedValue({
      months: {
        202601: {
          ...createEmptyLedgerMonth(),
          entries: [{ id: 'e1', name: '家賃', amount: 47000, category: 'rent', variable: false, carryOver: true, excluded: false }],
        },
      },
    })
    renderPage('2026')

    const row = (await screen.findByText('家賃')).closest('tr')!
    const cells = within(row).getAllByRole('cell')
    // 1〜12月の12セル＋年間合計セル。
    expect(cells).toHaveLength(13)
    expect(cells[0]).toHaveTextContent(fmt(47000))
    expect(cells[11]).toHaveTextContent(fmt(47000))
    expect(cells[12]).toHaveTextContent(fmt(47000 * 12))
  })

  it('marks a month header as 見込 when the month has no stored record', async () => {
    vi.mocked(getLedger).mockResolvedValue({
      months: { 202601: { ...createEmptyLedgerMonth(), entries: [] } },
    })
    renderPage('2026')

    await screen.findByText('1月')
    expect(screen.getAllByText('見込')).toHaveLength(11)
  })

  it('shows 未取込 in the クレカ row when the CSV has not been uploaded', async () => {
    renderPage('2026')
    const row = (await screen.findByText('クレカ')).closest('tr')!
    expect(within(row).getAllByText('未取込').length).toBeGreaterThan(0)
  })

  it('shows the cash remaining total across the year', async () => {
    vi.mocked(getLedger).mockResolvedValue({
      months: { 202601: { ...createEmptyLedgerMonth(), income: 280000 } },
    })
    renderPage('2026')

    const row = (await screen.findByText('現金残')).closest('tr')!
    const cells = within(row).getAllByRole('cell')
    expect(cells[12]).toHaveTextContent(fmt(280000 * 12))
  })

  it('links each month header to its month page', async () => {
    renderPage('2026')
    const link = (await screen.findByText('1月')).closest('a')!
    expect(link).toHaveAttribute('href', '/month/202601')
  })
})
