import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AlertProvider, ConfirmProvider } from '../../../components/feedback'
import { getLedger, putLedger } from '../api'
import { fetchCreditCsvBytes } from '../creditCsvApi'
import { currentMonthKey, shiftMonth } from '../lib/monthKey'
import type { LedgerState } from '../shared/types'
import { LedgerProvider } from '../state/LedgerContext'
import { LedgerPage } from './LedgerPage'

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

const renderPage = () =>
  render(
    <AlertProvider>
      <ConfirmProvider>
        <LedgerProvider>
          <LedgerPage />
        </LedgerProvider>
      </ConfirmProvider>
    </AlertProvider>,
  )

describe('LedgerPage', () => {
  beforeEach(() => {
    vi.mocked(getLedger).mockResolvedValue(emptyState())
    vi.mocked(fetchCreditCsvBytes).mockResolvedValue(null)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    // フェイクタイマーのテストが失敗した場合でも以降のテストに漏れ出さないようにする。
    vi.useRealTimers()
  })

  it('renders entries stored for the current payment month', async () => {
    const month = currentMonthKey()
    vi.mocked(getLedger).mockResolvedValue({
      months: { [month]: [{ id: 'e1', name: '家賃', amount: 80000, variable: false, carryOver: true }] },
    })
    renderPage()

    expect(await screen.findByText('家賃')).toBeInTheDocument()
  })

  it('shows the derived-month note when copying entries from the most recent prior month', async () => {
    const month = currentMonthKey()
    const priorMonth = shiftMonth(month, -1)
    vi.mocked(getLedger).mockResolvedValue({
      months: { [priorMonth]: [{ id: 'e1', name: '家賃', amount: 80000, variable: false, carryOver: true }] },
    })
    renderPage()

    expect(await screen.findByText('前の記録月からコピーした内容です。編集すると保存されます。')).toBeInTheDocument()
  })

  it('shows the empty-state message when there is no record for any month', async () => {
    renderPage()
    expect(await screen.findByText('支払い項目がありません。')).toBeInTheDocument()
  })

  it('shows the credit amount as 未取込 when the CSV has not been uploaded yet', async () => {
    renderPage()
    expect(await screen.findByText('未取込')).toBeInTheDocument()
    expect(screen.getByText('クレカ明細が未取込のため合計に含まれません。')).toBeInTheDocument()
  })

  it('shows the summed credit amount when the CSV is available', async () => {
    const month = currentMonthKey()
    vi.mocked(getLedger).mockResolvedValue({
      months: { [month]: [{ id: 'e1', name: '家賃', amount: 80000, variable: false, carryOver: true }] },
    })
    const csv = "2026/8/1,Store A,x,x,,'26/09,1500,1500"
    vi.mocked(fetchCreditCsvBytes).mockResolvedValue(new TextEncoder().encode(csv).buffer)
    renderPage()

    expect(await screen.findByText('1,500円')).toBeInTheDocument()
    expect(await screen.findByText('81,500円')).toBeInTheDocument()
  })

  it('saves immediately (no debounce) after adding an entry', async () => {
    vi.mocked(putLedger).mockImplementation(async (state) => state)
    renderPage()

    const nameInput = await screen.findByPlaceholderText('項目名')
    fireEvent.change(nameInput, { target: { value: '電気代' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))

    await waitFor(() => expect(putLedger).toHaveBeenCalledTimes(1))
    const month = currentMonthKey()
    expect(vi.mocked(putLedger).mock.calls[0][0].months[month].map((entry) => entry.name)).toContain('電気代')
  })

  it('coalesces saves made while a request is in-flight into a single follow-up request', async () => {
    const resolvers: Array<() => void> = []
    vi.mocked(putLedger).mockImplementation(
      (state) =>
        new Promise((resolve) => {
          resolvers.push(() => resolve(state))
        }),
    )
    renderPage()

    const nameInput = await screen.findByPlaceholderText('項目名')
    const addButton = screen.getByRole('button', { name: '追加' })

    fireEvent.change(nameInput, { target: { value: 'first' } })
    fireEvent.click(addButton)
    await waitFor(() => expect(putLedger).toHaveBeenCalledTimes(1))

    fireEvent.change(nameInput, { target: { value: 'second' } })
    fireEvent.click(addButton)
    fireEvent.change(nameInput, { target: { value: 'third' } })
    fireEvent.click(addButton)
    expect(putLedger).toHaveBeenCalledTimes(1)

    resolvers[0]()
    await waitFor(() => expect(putLedger).toHaveBeenCalledTimes(2), { timeout: 2000 })
    const month = currentMonthKey()
    expect(vi.mocked(putLedger).mock.calls[1][0].months[month].map((entry) => entry.name)).toEqual([
      'first',
      'second',
      'third',
    ])

    resolvers[1]()
  })

  it('edits an entry name via the row overflow menu (⋯ → 名前を編集)', async () => {
    const month = currentMonthKey()
    vi.mocked(getLedger).mockResolvedValue({
      months: { [month]: [{ id: 'e1', name: '家賃', amount: 80000, variable: false, carryOver: true }] },
    })
    vi.mocked(putLedger).mockImplementation(async (state) => state)
    renderPage()

    await screen.findByText('家賃')
    fireEvent.click(screen.getByRole('button', { name: '操作メニュー' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '名前を編集' }))

    expect(screen.getByLabelText('項目名（編集）')).toHaveValue('家賃')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('disables the add button and shows a note once the entry limit is reached', async () => {
    const month = currentMonthKey()
    const entries = Array.from({ length: 50 }, (_, index) => ({
      id: `e${index}`,
      name: `項目${index}`,
      amount: 100,
      variable: false,
      carryOver: true,
    }))
    vi.mocked(getLedger).mockResolvedValue({ months: { [month]: entries } })
    renderPage()

    await screen.findByPlaceholderText('項目名')
    expect(screen.getByText('1か月あたり50件までです。')).toBeInTheDocument()

    const nameInput = screen.getByPlaceholderText('項目名')
    fireEvent.change(nameInput, { target: { value: '追加できないはず' } })
    expect(screen.getByRole('button', { name: '追加' })).toBeDisabled()
  })
})
