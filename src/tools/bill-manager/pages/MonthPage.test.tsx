import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AlertProvider, ConfirmProvider } from '../../../components/feedback'
import { getLedger, putLedger } from '../api'
import { fetchCreditCsvBytes } from '../creditCsvApi'
import { createEmptyLedgerMonth, type LedgerState } from '../shared/types'
import { LedgerProvider } from '../state/LedgerContext'
import { MonthPage } from './MonthPage'

vi.mock('../api', () => ({
  getLedger: vi.fn(),
  putLedger: vi.fn(),
}))

// credit-csv への fetch はここではモックする（実 HTTP は通さない。金額の集計自体は
// lib/creditAmount.test.ts で純粋関数として検証済み）。
vi.mock('../creditCsvApi', () => ({
  fetchCreditCsvBytes: vi.fn(),
}))

const emptyState = (): LedgerState => ({ months: {} })

const renderPage = (month = '202609') =>
  render(
    <MemoryRouter initialEntries={[`/month/${month}`]}>
      <AlertProvider>
        <ConfirmProvider>
          <LedgerProvider>
            <Routes>
              <Route path="/month/:month" element={<MonthPage />} />
            </Routes>
          </LedgerProvider>
        </ConfirmProvider>
      </AlertProvider>
    </MemoryRouter>,
  )

// 項目一覧の中の1行を探す（名前は title 属性にも入るので、カテゴリ名との衝突を避けられる）。
const findEntryRow = async (name: string) => (await screen.findByTitle(name)).closest('li')!

describe('MonthPage', () => {
  beforeEach(() => {
    vi.mocked(getLedger).mockResolvedValue(emptyState())
    vi.mocked(fetchCreditCsvBytes).mockResolvedValue(null)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('renders entries stored for the requested payment month', async () => {
    vi.mocked(getLedger).mockResolvedValue({
      months: {
        202609: {
          ...createEmptyLedgerMonth(),
          entries: [{ id: 'e1', name: '家賃', amount: 76000, category: 'rent', variable: false, carryOver: true, excluded: false }],
        },
      },
    })
    renderPage('202609')

    expect(await findEntryRow('家賃')).toBeInTheDocument()
  })

  it('shows the derived-month note when copying from the most recent prior month', async () => {
    vi.mocked(getLedger).mockResolvedValue({
      months: {
        202608: {
          ...createEmptyLedgerMonth(),
          entries: [{ id: 'e1', name: '家賃', amount: 76000, category: 'rent', variable: false, carryOver: true, excluded: false }],
        },
      },
    })
    renderPage('202609')

    expect(await screen.findByText('前の記録月からコピーした内容です。編集すると保存されます。')).toBeInTheDocument()
  })

  it('shows the empty-state message when there is no record for any month', async () => {
    renderPage('202609')
    expect(await screen.findByText('支払い項目がありません。')).toBeInTheDocument()
  })

  it('excludes entries marked excluded from the fixed total shown in the summary card', async () => {
    vi.mocked(getLedger).mockResolvedValue({
      months: {
        202609: {
          ...createEmptyLedgerMonth(),
          entries: [
            { id: 'e1', name: '家賃', amount: 47000, category: 'rent', variable: false, carryOver: true, excluded: false },
            { id: 'e2', name: '通信費', amount: 7700, category: 'telecom', variable: false, carryOver: true, excluded: true },
          ],
        },
      },
    })
    renderPage('202609')

    await findEntryRow('通信費')
    const breakdown = await screen.findByText((_, element) => element?.className === 'bill-manager-summary-breakdown')
    expect(breakdown.textContent?.replace(/\s+/g, ' ')).toBe('固定費 47,000円／特殊 0円／クレカ 未取込')
  })

  it('shows 未取込 for a missing credit CSV and reflects it in the note', async () => {
    renderPage('202609')
    const note = await screen.findByText((_, element) => element?.className === 'bill-manager-note' && !!element.textContent?.includes('クレカ未取込'))
    expect(note).toBeInTheDocument()
  })

  it('reflects bonus and extra income, in that order, in the income label and summary card total', async () => {
    vi.mocked(getLedger).mockResolvedValue({
      months: { 202609: { ...createEmptyLedgerMonth(), income: 280000, bonus: 200000, extraIncome: 50000 } },
    })
    const { container } = renderPage('202609')

    const bonusSpan = await screen.findByText('＋賞与 200,000円')
    const extraIncomeSpan = screen.getByText('＋臨時収入 50,000円')
    const incomeLabel = container.querySelector('.bill-manager-income-label')!
    expect(Array.from(incomeLabel.children)).toEqual([bonusSpan, extraIncomeSpan])

    const incomeSummaryLabel = await screen.findByText(
      (text, element) => text === '収入合計' && element?.parentElement?.className === 'bill-manager-summary-row',
    )
    const incomeRow = incomeSummaryLabel.closest<HTMLElement>('.bill-manager-summary-row')!
    expect(within(incomeRow).getByText('530,000円')).toBeInTheDocument()
  })

  it('opens the bonus form from the row menu (⋯ → 賞与) and saves it separately from extra income', async () => {
    vi.mocked(putLedger).mockImplementation(async (state) => state)
    renderPage('202609')

    fireEvent.click(await screen.findByRole('button', { name: '操作メニュー' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '賞与' }))

    const input = screen.getByLabelText('賞与')
    fireEvent.change(input, { target: { value: '200000' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByText('＋賞与 200,000円')).toBeInTheDocument()
    expect(screen.queryByText('＋臨時収入', { exact: false })).not.toBeInTheDocument()
    await waitFor(() => expect(putLedger).toHaveBeenCalledTimes(1))
    expect(vi.mocked(putLedger).mock.calls[0][0].months['202609'].bonus).toBe(200000)
    expect(vi.mocked(putLedger).mock.calls[0][0].months['202609'].extraIncome).toBeNull()
  })

  it('saves immediately (no debounce) after adding an entry', async () => {
    vi.mocked(putLedger).mockImplementation(async (state) => state)
    renderPage('202609')

    const nameInput = await screen.findByPlaceholderText('項目名')
    fireEvent.change(nameInput, { target: { value: '電気代' } })
    fireEvent.click(within(nameInput.closest('form')!).getByRole('button', { name: '追加' }))

    await waitFor(() => expect(putLedger).toHaveBeenCalledTimes(1))
    expect(vi.mocked(putLedger).mock.calls[0][0].months['202609'].entries.map((entry) => entry.name)).toContain('電気代')
  })

  it('edits an entry name and category via the row overflow menu (⋯ → 編集)', async () => {
    vi.mocked(getLedger).mockResolvedValue({
      months: {
        202609: {
          ...createEmptyLedgerMonth(),
          entries: [{ id: 'e1', name: '家賃', amount: 80000, category: 'rent', variable: false, carryOver: true, excluded: false }],
        },
      },
    })
    vi.mocked(putLedger).mockImplementation(async (state) => state)
    renderPage('202609')

    const row = await findEntryRow('家賃')
    fireEvent.click(within(row).getByRole('button', { name: '操作メニュー' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '編集' }))

    expect(screen.getByLabelText('項目名（編集）')).toHaveValue('家賃')
    expect(screen.getByLabelText('カテゴリ（編集）')).toHaveValue('rent')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('項目名（編集）'), { target: { value: '家賃（更新）' } })
    fireEvent.change(screen.getByLabelText('カテゴリ（編集）'), { target: { value: 'utility' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(await screen.findByTitle('家賃（更新）')).toBeInTheDocument()
    await waitFor(() => expect(putLedger).toHaveBeenCalledTimes(1))
    const savedEntry = vi.mocked(putLedger).mock.calls[0][0].months['202609'].entries[0]
    expect(savedEntry).toMatchObject({ name: '家賃（更新）', category: 'utility' })
  })

  it('shows status badges (変動費／終了), in that order, before the category badge, and never shows an 除外 badge', async () => {
    vi.mocked(getLedger).mockResolvedValue({
      months: {
        202609: {
          ...createEmptyLedgerMonth(),
          entries: [
            { id: 'e1', name: '通信費', amount: 7700, category: 'telecom', variable: true, carryOver: false, excluded: true },
          ],
        },
      },
    })
    renderPage('202609')

    const row = await findEntryRow('通信費')
    const badges = within(row)
      .getAllByText((_, element) => element?.classList.contains('pt-badge') ?? false)
      .map((badge) => badge.textContent)
    expect(badges).toEqual(['変動費', '終了', '通信'])
    expect(within(row).queryByText('除外')).not.toBeInTheDocument()
  })

  it('shows fixed (non-toggle-worded) labels in the row overflow menu', async () => {
    vi.mocked(getLedger).mockResolvedValue({
      months: {
        202609: {
          ...createEmptyLedgerMonth(),
          entries: [{ id: 'e1', name: '家賃', amount: 80000, category: 'rent', variable: false, carryOver: true, excluded: false }],
        },
      },
    })
    renderPage('202609')

    const row = await findEntryRow('家賃')
    fireEvent.click(within(row).getByRole('button', { name: '操作メニュー' }))

    expect(screen.getByRole('menuitem', { name: '編集' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '変動費' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'クレカ払い' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '今月終了' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '削除' })).toBeInTheDocument()
  })

  it('does not include a 変動 checkbox in the add form (variable is toggled later via the row menu)', async () => {
    renderPage('202609')
    await screen.findByPlaceholderText('項目名')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByText('変動')).not.toBeInTheDocument()
  })

  it('shows 0 (not blank) for a variable entry copied into a derived month', async () => {
    vi.mocked(getLedger).mockResolvedValue({
      months: {
        202608: {
          ...createEmptyLedgerMonth(),
          entries: [{ id: 'e1', name: '電気代', amount: 5000, category: 'utility', variable: true, carryOver: true, excluded: false }],
        },
      },
    })
    renderPage('202609')

    const row = await findEntryRow('電気代')
    expect(within(row).getByLabelText('電気代の金額')).toHaveValue(0)
  })

  it('disables the add button and shows a note once the entry limit is reached', async () => {
    const entries = Array.from({ length: 50 }, (_, index) => ({
      id: `e${index}`,
      name: `項目${index}`,
      amount: 100,
      category: 'other' as const,
      variable: false,
      carryOver: true,
      excluded: false,
    }))
    vi.mocked(getLedger).mockResolvedValue({ months: { 202609: { ...createEmptyLedgerMonth(), entries } } })
    renderPage('202609')

    const nameInput = await screen.findByPlaceholderText('項目名')
    expect(screen.getByText('1か月あたり50件までです。')).toBeInTheDocument()

    fireEvent.change(nameInput, { target: { value: '追加できないはず' } })
    expect(within(nameInput.closest('form')!).getByRole('button', { name: '追加' })).toBeDisabled()
  })

  it('adds a special expense', async () => {
    vi.mocked(putLedger).mockImplementation(async (state) => state)
    renderPage('202609')

    const amountInput = await screen.findByPlaceholderText('金額')
    const specialForm = amountInput.closest('form')!
    fireEvent.change(amountInput, { target: { value: '825' } })
    fireEvent.change(screen.getByPlaceholderText('メモ（任意）'), { target: { value: 'メロブ(paidy)' } })
    fireEvent.click(within(specialForm).getByRole('button', { name: '追加' }))

    const specialList = await screen.findByText('メロブ(paidy)')
    expect(within(specialList.closest('ul')!).getByText('825円')).toBeInTheDocument()
    await waitFor(() => expect(putLedger).toHaveBeenCalledTimes(1))
    expect(vi.mocked(putLedger).mock.calls[0][0].months['202609'].specials).toEqual([
      { id: expect.any(String), amount: 825, memo: 'メロブ(paidy)' },
    ])
  })

  it('shows the amounts of the new month after moving to 翌月 even when entry ids are shared across months', async () => {
    // 派生コピーや取込データでは同じ id の項目が月をまたいで並ぶ。非制御 input（defaultValue）が
    // 同じ key で再利用されると前の月の値が残るため、月を切り替えたら入力欄も差し替わることを確認する。
    vi.mocked(getLedger).mockResolvedValue({
      months: {
        202605: { ...createEmptyLedgerMonth(), income: 298664, entries: [{ id: 'e1', name: '家賃', amount: 47000, category: 'rent', variable: false, carryOver: true, excluded: false }] },
        202606: { ...createEmptyLedgerMonth(), income: 292218, entries: [{ id: 'e1', name: '家賃', amount: 76000, category: 'rent', variable: false, carryOver: true, excluded: false }] },
      },
    })
    renderPage('202605')

    expect(await screen.findByLabelText('家賃の金額')).toHaveValue(47000)
    expect(screen.getByLabelText('給与')).toHaveValue(298664)

    fireEvent.click(screen.getByRole('button', { name: '翌月' }))

    await screen.findByText('2026年6月')
    await waitFor(() => expect(screen.getByLabelText('家賃の金額')).toHaveValue(76000))
    expect(screen.getByLabelText('給与')).toHaveValue(292218)
  })
})
