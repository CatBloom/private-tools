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

// 実カード明細は使わない。合成データのみ（CLAUDE.md「テスト」節）。
const toBytes = (text: string): ArrayBuffer => {
  const buffer = new Uint8Array(text.length)
  for (let index = 0; index < text.length; index += 1) {
    buffer[index] = text.charCodeAt(index)
  }
  return buffer.buffer
}

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

  it('wraps each breakdown group (固定費/特殊/クレカ) in its own nowrap span so 円 cannot fall to the next line alone', async () => {
    vi.mocked(getLedger).mockResolvedValue({
      months: {
        202609: {
          ...createEmptyLedgerMonth(),
          entries: [{ id: 'e1', name: '家賃', amount: 47000, category: 'rent', variable: false, carryOver: true, excluded: false }],
        },
      },
    })
    renderPage('202609')

    await findEntryRow('家賃')
    const breakdown = await screen.findByText((_, element) => element?.className === 'bill-manager-summary-breakdown')
    const items = breakdown.querySelectorAll('.bill-manager-summary-breakdown-item')
    expect(items).toHaveLength(3)
    expect(items[0].textContent).toBe('固定費 47,000円')
    expect(items[1].textContent).toBe('特殊 0円')
    expect(items[2].textContent).toBe('クレカ 未取込')
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

  describe('editable months (翌々月以降は編集不可)', () => {
    beforeEach(() => {
      // Date だけを固定し setTimeout 等は実時間のまま進める（waitFor/findBy が内部で使う
      // 実タイマーを止めるとテストがタイムアウトするため）。
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 8, 15)) // 2026-09-15 → 今月=202609, 翌月=202610, 翌々月=202611
    })

    it('disables amount inputs and hides the ⋯ menu / add forms two months ahead (202611)', async () => {
      vi.mocked(getLedger).mockResolvedValue({
        months: {
          202611: {
            ...createEmptyLedgerMonth(),
            entries: [{ id: 'e1', name: '家賃', amount: 76000, category: 'rent', variable: false, carryOver: true, excluded: false }],
            specials: [{ id: 's1', amount: 825, memo: 'メロブ(paidy)' }],
          },
        },
      })
      renderPage('202611')

      const row = await findEntryRow('家賃')
      expect(within(row).getByLabelText('家賃の金額')).toBeDisabled()
      expect(within(row).queryByRole('button', { name: '操作メニュー' })).not.toBeInTheDocument()
      expect(screen.getByLabelText('給与')).toBeDisabled()
      expect(screen.queryAllByRole('button', { name: '操作メニュー' })).toHaveLength(0)
      expect(screen.queryByPlaceholderText('項目名')).not.toBeInTheDocument()
      expect(screen.queryByPlaceholderText('金額（任意）')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('特殊費用の金額')).not.toBeInTheDocument()
      expect(await screen.findByText('メロブ(paidy)')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'この特殊費用を削除' })).not.toBeInTheDocument()
      expect(await screen.findByText('翌々月以降は編集できません。前の記録月からの見込みを表示しています。')).toBeInTheDocument()
    })

    it('keeps 202610 (next month) editable', async () => {
      vi.mocked(getLedger).mockResolvedValue({
        months: {
          202610: {
            ...createEmptyLedgerMonth(),
            entries: [{ id: 'e1', name: '家賃', amount: 76000, category: 'rent', variable: false, carryOver: true, excluded: false }],
          },
        },
      })
      renderPage('202610')

      const row = await findEntryRow('家賃')
      expect(within(row).getByLabelText('家賃の金額')).not.toBeDisabled()
      expect(within(row).getByRole('button', { name: '操作メニュー' })).toBeInTheDocument()
      expect(screen.getByLabelText('給与')).not.toBeDisabled()
      expect(screen.getByPlaceholderText('項目名')).toBeInTheDocument()
      expect(screen.queryByText('翌々月以降は編集できません。前の記録月からの見込みを表示しています。')).not.toBeInTheDocument()
    })

    it('keeps a past month (202605) editable', async () => {
      vi.mocked(getLedger).mockResolvedValue({
        months: {
          202605: {
            ...createEmptyLedgerMonth(),
            entries: [{ id: 'e1', name: '家賃', amount: 76000, category: 'rent', variable: false, carryOver: true, excluded: false }],
          },
        },
      })
      renderPage('202605')

      const row = await findEntryRow('家賃')
      expect(within(row).getByLabelText('家賃の金額')).not.toBeDisabled()
      expect(within(row).getByRole('button', { name: '操作メニュー' })).toBeInTheDocument()
    })

    it('closes an open bonus form when navigating from an editable month into a non-editable one', async () => {
      renderPage('202609')

      fireEvent.click(await screen.findByRole('button', { name: '操作メニュー' }))
      fireEvent.click(screen.getByRole('menuitem', { name: '賞与' }))
      expect(screen.getByLabelText('賞与')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: '翌月' })) // 202609 -> 202610 (still editable)
      await screen.findByText('2026年10月')
      expect(screen.getByLabelText('賞与')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: '翌月' })) // 202610 -> 202611 (not editable)
      await screen.findByText('2026年11月')
      expect(screen.queryByLabelText('賞与')).not.toBeInTheDocument()
    })
  })

  describe('revalidate on tab return', () => {
    it('replaces state on window focus when the fetched ledger differs, without saving it back', async () => {
      renderPage('202609')
      expect(await screen.findByText('支払い項目がありません。')).toBeInTheDocument()

      vi.mocked(getLedger).mockResolvedValue({
        months: {
          202609: {
            ...createEmptyLedgerMonth(),
            entries: [{ id: 'e1', name: '家賃', amount: 76000, category: 'rent', variable: false, carryOver: true, excluded: false }],
          },
        },
      })

      window.dispatchEvent(new Event('focus'))

      expect(await findEntryRow('家賃')).toBeInTheDocument()
      expect(putLedger).not.toHaveBeenCalled()
    })

    it('does not re-fetch while a save is still in flight', async () => {
      let resolvePut: (state: LedgerState) => void = () => {}
      vi.mocked(putLedger).mockImplementationOnce(() => new Promise((resolve) => { resolvePut = resolve }))
      renderPage('202609')
      await screen.findByText('支払い項目がありません。')

      const nameInput = await screen.findByPlaceholderText('項目名')
      fireEvent.change(nameInput, { target: { value: '電気代' } })
      fireEvent.click(within(nameInput.closest('form')!).getByRole('button', { name: '追加' }))
      await findEntryRow('電気代')

      expect(getLedger).toHaveBeenCalledTimes(1)
      window.dispatchEvent(new Event('focus'))
      await new Promise((resolve) => setTimeout(resolve, 0))
      expect(getLedger).toHaveBeenCalledTimes(1)

      resolvePut({ months: {} })
    })

    it('re-fetches the credit amount on window focus and reflects it once another tab has uploaded the CSV', async () => {
      renderPage('202609')
      await screen.findByText('支払い項目がありません。')

      const initialNote = await screen.findByText(
        (_, element) => element?.className === 'bill-manager-note' && !!element.textContent?.includes('クレカ未取込'),
      )
      expect(initialNote).toBeInTheDocument()

      vi.mocked(fetchCreditCsvBytes).mockResolvedValue(toBytes("2026/8/1,Store A,x,x,,'26/09,1000,1000"))
      window.dispatchEvent(new Event('focus'))

      await waitFor(() => {
        const breakdown = screen.getByText((_, element) => element?.className === 'bill-manager-summary-breakdown')
        expect(breakdown.textContent).toContain('クレカ 1,000円')
      })
    })

    it('does not let a stale in-flight credit fetch overwrite the newer response from a focus revalidate', async () => {
      let resolveInitial: (bytes: ArrayBuffer | null) => void = () => {}
      vi.mocked(fetchCreditCsvBytes).mockImplementationOnce(
        () => new Promise((resolve) => { resolveInitial = resolve }),
      )

      renderPage('202609')
      await screen.findByText('支払い項目がありません。')
      // 初回のクレカ取得はまだ保留中（未解決）。

      let resolveRevalidate: (bytes: ArrayBuffer | null) => void = () => {}
      vi.mocked(fetchCreditCsvBytes).mockImplementationOnce(
        () => new Promise((resolve) => { resolveRevalidate = resolve }),
      )
      window.dispatchEvent(new Event('focus'))

      // タブ復帰による再取得（新しい要求）を先に解決する。
      resolveRevalidate(toBytes("2026/8/1,Store A,x,x,,'26/09,1000,1000"))
      await waitFor(() => {
        const breakdown = screen.getByText((_, element) => element?.className === 'bill-manager-summary-breakdown')
        expect(breakdown.textContent).toContain('クレカ 1,000円')
      })

      // 初回の（古い）保留中リクエストが後から解決しても、新しい結果を上書きしない。
      resolveInitial(null)
      await new Promise((resolve) => setTimeout(resolve, 0))
      const breakdown = screen.getByText((_, element) => element?.className === 'bill-manager-summary-breakdown')
      expect(breakdown.textContent).toContain('クレカ 1,000円')
    })

    it('does not show an error toast when a stale (superseded) credit fetch fails', async () => {
      let rejectInitial: (error: unknown) => void = () => {}
      vi.mocked(fetchCreditCsvBytes).mockImplementationOnce(
        () => new Promise((_resolve, reject) => { rejectInitial = reject }),
      )

      renderPage('202609')
      await screen.findByText('支払い項目がありません。')
      // 初回のクレカ取得はまだ保留中（未解決）。

      vi.mocked(fetchCreditCsvBytes).mockResolvedValueOnce(toBytes("2026/8/1,Store A,x,x,,'26/09,1000,1000"))
      window.dispatchEvent(new Event('focus'))

      await waitFor(() => {
        const breakdown = screen.getByText((_, element) => element?.className === 'bill-manager-summary-breakdown')
        expect(breakdown.textContent).toContain('クレカ 1,000円')
      })

      // 追い越された（古い世代の）要求が失敗しても、トーストは出さず新しい額のままにする。
      rejectInitial(new Error('boom'))
      await new Promise((resolve) => setTimeout(resolve, 0))

      const breakdown = screen.getByText((_, element) => element?.className === 'bill-manager-summary-breakdown')
      expect(breakdown.textContent).toContain('クレカ 1,000円')
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('applies the newest ledger response even when an older overlapping revalidation resolves first', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      try {
        renderPage('202609')
        await screen.findByText('支払い項目がありません。')

        let resolveFirst: (state: LedgerState) => void = () => {}
        vi.mocked(getLedger).mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
        window.dispatchEvent(new Event('focus'))

        // useRevalidateOnReturn の1秒デバウンスを越えてから2回目の再取得を発火する。
        await vi.advanceTimersByTimeAsync(1000)
        vi.mocked(getLedger).mockResolvedValueOnce({
          months: {
            202609: {
              ...createEmptyLedgerMonth(),
              entries: [{ id: 'e1', name: '家賃', amount: 76000, category: 'rent', variable: false, carryOver: true, excluded: false }],
            },
          },
        })
        window.dispatchEvent(new Event('focus'))
        expect(await findEntryRow('家賃')).toBeInTheDocument()

        // 1回目（古い一覧）が2回目より後に解決しても、2回目の結果を上書きしない。
        resolveFirst({ months: {} })
        await vi.advanceTimersByTimeAsync(0)

        expect(await findEntryRow('家賃')).toBeInTheDocument()
        expect(putLedger).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })

    it('does not roll back a ledger save that completed while a revalidate GET is still pending', async () => {
      vi.mocked(putLedger).mockImplementation(async (state) => state)
      renderPage('202609')
      await screen.findByText('支払い項目がありません。')

      // タブ復帰の再取得（GET はまだ保留中）。
      let resolveGet: (state: LedgerState) => void = () => {}
      vi.mocked(getLedger).mockImplementationOnce(() => new Promise((resolve) => { resolveGet = resolve }))
      window.dispatchEvent(new Event('focus'))

      // GET が解決する前に、項目を追加して保存を完了させる（hasPendingChanges は一度 true→false に戻る）。
      const nameInput = await screen.findByPlaceholderText('項目名')
      fireEvent.change(nameInput, { target: { value: '電気代' } })
      fireEvent.click(within(nameInput.closest('form')!).getByRole('button', { name: '追加' }))
      await waitFor(() => expect(putLedger).toHaveBeenCalledTimes(1))
      await findEntryRow('電気代')

      // 保留中だった GET が、保存前の古い内容（項目なし）で解決する。
      resolveGet({ months: {} })
      await new Promise((resolve) => setTimeout(resolve, 0))

      // 保存済みの「電気代」が消えず、巻き戻らない。
      expect(await findEntryRow('電気代')).toBeInTheDocument()
      expect(putLedger).toHaveBeenCalledTimes(1)
    })

    it('keeps credit generations monotonic across a failed refresh, so a stale still-pending response is ignored', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      try {
        let resolveGen1: (bytes: ArrayBuffer | null) => void = () => {}
        vi.mocked(fetchCreditCsvBytes).mockImplementationOnce(
          () => new Promise((resolve) => { resolveGen1 = resolve }),
        )

        renderPage('202609')
        await screen.findByText('支払い項目がありません。')
        // 初回（世代1）のクレカ取得はまだ保留中。

        let rejectGen2: (error: unknown) => void = () => {}
        vi.mocked(fetchCreditCsvBytes).mockImplementationOnce(
          () => new Promise((_resolve, reject) => { rejectGen2 = reject }),
        )
        window.dispatchEvent(new Event('focus'))
        rejectGen2(new Error('boom'))
        await vi.advanceTimersByTimeAsync(0)

        // useRevalidateOnReturn の1秒デバウンスを越えてから世代3の要求を発火する。
        await vi.advanceTimersByTimeAsync(1000)
        vi.mocked(fetchCreditCsvBytes).mockResolvedValueOnce(toBytes("2026/8/1,Store A,x,x,,'26/09,1000,1000"))
        window.dispatchEvent(new Event('focus'))

        await waitFor(() => {
          const breakdown = screen.getByText((_, element) => element?.className === 'bill-manager-summary-breakdown')
          expect(breakdown.textContent).toContain('クレカ 1,000円')
        })

        // 世代1の（ずっと保留中だった）応答が遅れて解決しても、世代3の結果を上書きしない
        // （失敗した世代2の後も世代番号は据え置かれず単調増加するため、世代1と衝突しない）。
        resolveGen1(null)
        await vi.advanceTimersByTimeAsync(0)
        const breakdown = screen.getByText((_, element) => element?.className === 'bill-manager-summary-breakdown')
        expect(breakdown.textContent).toContain('クレカ 1,000円')
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
