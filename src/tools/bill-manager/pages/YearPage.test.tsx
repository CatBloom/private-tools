import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AlertProvider, ConfirmProvider } from '../../../components/feedback'
import { getLedger } from '../api'
import { fetchCreditCsvBytes } from '../creditCsvApi'
import { createEmptyLedgerMonth, type LedgerState } from '../shared/types'
import { LedgerProvider } from '../state/LedgerContext'
import { MonthPage } from './MonthPage'
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

  it('shows a category row that sums its amount and carries it across derived months', async () => {
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

  it('does not show a category row with no entries in the year', async () => {
    vi.mocked(getLedger).mockResolvedValue({
      months: {
        202601: {
          ...createEmptyLedgerMonth(),
          entries: [{ id: 'e1', name: '家賃', amount: 47000, category: 'rent', variable: false, carryOver: true, excluded: false }],
        },
      },
    })
    renderPage('2026')

    await screen.findByText('家賃')
    expect(screen.queryByText('保険')).not.toBeInTheDocument()
  })

  it('shows a special expense row summing specials per month', async () => {
    vi.mocked(getLedger).mockResolvedValue({
      months: {
        202601: { ...createEmptyLedgerMonth(), specials: [{ id: 's1', amount: 825, memo: 'メモ' }] },
      },
    })
    renderPage('2026')

    const row = (await screen.findByText('特殊費用')).closest('tr')!
    const cells = within(row).getAllByRole('cell')
    expect(cells[0]).toHaveTextContent(fmt(825))
  })

  it('does not show a 固定費合計 row', async () => {
    renderPage('2026')
    await screen.findByText('1月')
    expect(screen.queryByText('固定費合計')).not.toBeInTheDocument()
  })

  it('marks 支出合計／収入／現金残高 as result rows with the summary classes', async () => {
    renderPage('2026')
    const expenseRow = (await screen.findByText('支出合計')).closest('tr')!
    const incomeRow = screen.getByText('収入').closest('tr')!
    const cashRow = screen.getByText('現金残高').closest('tr')!

    expect(expenseRow.className).toContain('bill-manager-year-result-row')
    expect(expenseRow.className).toContain('bill-manager-year-result-row-first')
    expect(incomeRow.className).toContain('bill-manager-year-result-row')
    expect(incomeRow.className).not.toContain('bill-manager-year-result-row-first')
    expect(cashRow.className).toContain('bill-manager-year-result-row')
    expect(cashRow.className).toContain('bill-manager-year-cash-row')
  })

  it('marks derived month headers with is-derived and does not render a 見込 tag', async () => {
    vi.mocked(getLedger).mockResolvedValue({
      months: { 202601: { ...createEmptyLedgerMonth(), entries: [] } },
    })
    renderPage('2026')

    const january = (await screen.findByText('1月')).closest('th')!
    expect(january.className).not.toContain('is-derived')
    const february = screen.getByText('2月').closest('th')!
    expect(february.className).toContain('is-derived')
    expect(screen.queryByText('見込')).not.toBeInTheDocument()
  })

  it('shows 未取込 in the クレカ row when the CSV has not been uploaded', async () => {
    renderPage('2026')
    const row = (await screen.findByText('クレカ')).closest('tr')!
    expect(within(row).getAllByText('未取込').length).toBeGreaterThan(0)
  })

  it('shows — in 支出合計・現金残高 cells for a 未取込 month, while 収入 keeps its own value', async () => {
    vi.mocked(getLedger).mockResolvedValue({
      months: { 202601: { ...createEmptyLedgerMonth(), income: 280000 } },
    })
    renderPage('2026')

    const expenseRow = (await screen.findByText('支出合計')).closest('tr')!
    const incomeRow = screen.getByText('収入').closest('tr')!
    const cashRow = screen.getByText('現金残高').closest('tr')!

    expect(within(expenseRow).getAllByRole('cell')[0]).toHaveTextContent('—')
    expect(within(cashRow).getAllByRole('cell')[0]).toHaveTextContent('—')
    expect(within(incomeRow).getAllByRole('cell')[0]).toHaveTextContent(fmt(280000))
  })

  it('excludes 未取込 months from the 支出合計／収入／現金残高 year totals and hatches their cells', async () => {
    vi.mocked(getLedger).mockResolvedValue({
      months: { 202601: { ...createEmptyLedgerMonth(), income: 280000 } },
    })
    renderPage('2026')

    // 全12か月がクレカ未取込（fetchCreditCsvBytes は常に null）なので年間合計は0になる。
    const cashRow = (await screen.findByText('現金残高')).closest('tr')!
    const cells = within(cashRow).getAllByRole('cell')
    expect(cells[12]).toHaveTextContent('0')
    // 注記は出さず、未取込月の列（見出しとセル）に is-credit-missing を付けて斜線で示す
    expect(screen.queryByText(/クレカ未取込の月を除いています/)).not.toBeInTheDocument()
    expect(cells[0]).toHaveClass('is-credit-missing')
    expect((await screen.findByText('1月')).closest('th')).toHaveClass('is-credit-missing')
  })

  it('links each month header to its month page', async () => {
    renderPage('2026')
    const link = (await screen.findByText('1月')).closest('a')!
    expect(link).toHaveAttribute('href', '/month/202601')
  })

  it('syncs the selected year to the currently selected month, so returning to /year (no explicit year) shows it', async () => {
    // /year/:year のように年が明示されない年間タブ（既定画面 `/`）を模した経路。
    const NavToYear = () => {
      const navigate = useNavigate()
      return (
        <button type="button" onClick={() => navigate('/year')}>
          年間へ
        </button>
      )
    }

    render(
      <MemoryRouter initialEntries={['/month/202512']}>
        <AlertProvider>
          <ConfirmProvider>
            <LedgerProvider>
              <NavToYear />
              <Routes>
                <Route path="/month/:month" element={<MonthPage />} />
                <Route path="/year" element={<YearPage />} />
              </Routes>
            </LedgerProvider>
          </ConfirmProvider>
        </AlertProvider>
      </MemoryRouter>,
    )

    await screen.findByText('2025年12月')

    fireEvent.click(screen.getByRole('button', { name: '年間へ' }))

    expect(await screen.findByText('2025年')).toBeInTheDocument()
  })
})
