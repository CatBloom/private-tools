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

  it('reflects extra income in the summary card income line', async () => {
    vi.mocked(getLedger).mockResolvedValue({
      months: { 202609: { ...createEmptyLedgerMonth(), income: 280000, extraIncome: 50000 } },
    })
    renderPage('202609')

    expect(await screen.findByText('＋臨時収入 50,000円')).toBeInTheDocument()
    const incomeLabel = await screen.findByText(
      (text, element) => text === '収入' && element?.parentElement?.className === 'bill-manager-summary-row',
    )
    const incomeRow = incomeLabel.closest<HTMLElement>('.bill-manager-summary-row')!
    expect(within(incomeRow).getByText('330,000円')).toBeInTheDocument()
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

  it('shows status badges (変動／終了／除外) next to the entry name', async () => {
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
    expect(within(row).getByText('変動')).toBeInTheDocument()
    expect(within(row).getByText('終了')).toBeInTheDocument()
    expect(within(row).getByText('除外')).toBeInTheDocument()
  })

  it('shows short ON/OFF style labels in the row overflow menu', async () => {
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
    expect(screen.getByRole('menuitem', { name: '変動 ON' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '計上 OFF' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '今月終了' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: '削除' })).toBeInTheDocument()
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
})
