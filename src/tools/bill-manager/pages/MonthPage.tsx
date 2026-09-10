import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { Spinner, useAlert, useConfirm } from '../../../components/feedback'
import { RowMenu } from '../../../components/RowMenu'
import { MonthEntryRow } from '../components/MonthEntryRow'
import { SpecialRow } from '../components/SpecialRow'
import { parseAmountInput } from '../lib/amount'
import { formatYen } from '../lib/format'
import { currentMonthKey, formatMonthLabel, isMonthEditable, shiftMonth } from '../lib/monthKey'
import { summarizeMonth } from '../lib/summary'
import {
  ENTRY_CATEGORIES,
  ENTRY_CATEGORY_LABELS,
  isMonthKey,
  MAX_ENTRIES_PER_MONTH,
  MAX_ENTRY_NAME_LENGTH,
  MAX_MEMO_LENGTH,
  MAX_SPECIALS_PER_MONTH,
  type EntryCategory,
  type LedgerEntry,
} from '../shared/types'
import { useLedger } from '../state/LedgerContext'

// 給与に併記する臨時の収入2種。RowMenu・表示ともにこの順（賞与→臨時収入）で並べる。
type IncomeField = 'bonus' | 'extraIncome'
const INCOME_FIELD_LABELS: Record<IncomeField, string> = { bonus: '賞与', extraIncome: '臨時収入' }

export const MonthPage = () => {
  const { month: monthParam } = useParams<{ month: string }>()
  const validMonth = monthParam !== undefined && isMonthKey(monthParam)
  const month = validMonth ? (monthParam as string) : currentMonthKey()

  const {
    loadStatus,
    loadError,
    reload,
    saveStatus,
    saveError,
    month: selectedMonth,
    setMonth,
    currentMonth,
    currentMonthSource,
    creditByMonth,
    addEntry,
    updateEntry,
    removeEntry,
    setIncome,
    setBonus,
    setExtraIncome,
    addSpecial,
    removeSpecial,
  } = useLedger()
  const { showAlert } = useAlert()
  const { confirm } = useConfirm()
  const navigate = useNavigate()

  const [addName, setAddName] = useState('')
  const [addAmount, setAddAmount] = useState('')
  const [addCategory, setAddCategory] = useState<EntryCategory>('other')
  const [editingIncomeField, setEditingIncomeField] = useState<IncomeField | null>(null)
  const [incomeFieldDraft, setIncomeFieldDraft] = useState('')
  const [specialAmount, setSpecialAmount] = useState('')
  const [specialMemo, setSpecialMemo] = useState('')

  useEffect(() => {
    setMonth(month)
  }, [month, setMonth])

  const editable = isMonthEditable(month, currentMonthKey())

  // 編集不可の月に入ったら、開いたままの賞与／臨時収入の編集フォームを閉じる
  // （月を切り替えても editingIncomeField は保持されるため）。
  useEffect(() => {
    if (!editable) setEditingIncomeField(null)
  }, [editable])

  const credit = creditByMonth[month] ?? null
  const summary = summarizeMonth(currentMonth, credit)
  const notes: string[] = []
  if (summary.missingCount > 0) notes.push('未入力の項目があります')
  if (summary.creditMissing) notes.push('クレカ未取込')
  if (summary.incomeMissing) notes.push('収入未入力')

  const handleAddEntry = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = addName.trim()
    if (!trimmed || loadStatus !== 'ready') return

    const added = addEntry({ name: trimmed, amount: parseAmountInput(addAmount), category: addCategory, variable: false })
    if (!added) {
      showAlert('info', `1か月あたり${MAX_ENTRIES_PER_MONTH}件までです`)
      return
    }
    setAddName('')
    setAddAmount('')
    setAddCategory('other')
  }

  const handleDeleteEntry = async (entry: LedgerEntry) => {
    const confirmed = await confirm(`「${entry.name}」を削除しますか？`, { title: '削除', danger: true })
    if (!confirmed) return
    removeEntry(entry.id)
    showAlert('success', '削除しました')
  }

  const startEditIncomeField = (field: IncomeField) => {
    const current = field === 'bonus' ? currentMonth.bonus : currentMonth.extraIncome
    setIncomeFieldDraft(current === null ? '' : String(current))
    setEditingIncomeField(field)
  }
  const commitIncomeField = (event: FormEvent) => {
    event.preventDefault()
    if (editingIncomeField === null) return
    const value = parseAmountInput(incomeFieldDraft)
    if (editingIncomeField === 'bonus') setBonus(month, value)
    else setExtraIncome(month, value)
    setEditingIncomeField(null)
  }

  const handleAddSpecial = (event: FormEvent) => {
    event.preventDefault()
    if (loadStatus !== 'ready') return
    const amount = parseAmountInput(specialAmount)
    if (amount === null) return

    const added = addSpecial(month, { amount, memo: specialMemo })
    if (!added) {
      showAlert('info', `特殊費用は1か月あたり${MAX_SPECIALS_PER_MONTH}件までです`)
      return
    }
    setSpecialAmount('')
    setSpecialMemo('')
  }

  const handleDeleteSpecial = async (specialId: string, memo: string) => {
    const confirmed = await confirm(`${memo ? `「${memo}」` : 'この特殊費用'}を削除しますか？`, { title: '削除', danger: true })
    if (!confirmed) return
    removeSpecial(month, specialId)
    showAlert('success', '削除しました')
  }

  if (!validMonth) return <Navigate to="/month" replace />

  return (
    <div className="bill-manager-page-stack">
      {saveStatus === 'error' ? (
        <p className="pt-status-message pt-status-message-error" role="alert">
          {saveError}
        </p>
      ) : null}

      {loadStatus === 'loading' ? <Spinner label="読み込み中…" /> : null}
      {loadStatus === 'error' ? (
        <p className="pt-status-message pt-status-message-error" role="alert">
          {loadError}
          <button type="button" className="pt-button" onClick={reload}>
            再読み込み
          </button>
        </p>
      ) : null}

      {loadStatus === 'ready' ? (
        <>
          <div className="bill-manager-nav">
            <button type="button" className="pt-button" onClick={() => navigate(`/month/${shiftMonth(month, -1)}`)}>
              前月
            </button>
            <span className="bill-manager-nav-label">{formatMonthLabel(month)}</span>
            <button type="button" className="pt-button" onClick={() => navigate(`/month/${shiftMonth(month, 1)}`)}>
              翌月
            </button>
          </div>

          <section className="pt-card bill-manager-summary">
            <div className="bill-manager-summary-row">
              <span>収入合計</span>
              <strong>{formatYen(summary.income)}</strong>
            </div>
            <div className="bill-manager-summary-row">
              <span>支出合計</span>
              <strong>{formatYen(summary.expenseTotal)}</strong>
            </div>
            <p className="bill-manager-summary-breakdown">
              固定費 {formatYen(summary.fixedTotal)}／特殊 {formatYen(summary.specialTotal)}／クレカ{' '}
              {summary.creditMissing ? '未取込' : formatYen(summary.credit ?? 0)}
            </p>
            <div className="bill-manager-summary-row bill-manager-summary-cash">
              <span>現金残高</span>
              <strong>{formatYen(summary.cashRemaining)}</strong>
            </div>
            {notes.length > 0 ? <p className="bill-manager-note">{notes.join('／')}</p> : null}
          </section>

          {!editable ? (
            <p className="bill-manager-note">翌々月以降は編集できません。前の記録月からの見込みを表示しています。</p>
          ) : currentMonthSource === 'derived' ? (
            <p className="bill-manager-note">前の記録月からコピーした内容です。編集すると保存されます。</p>
          ) : null}

          <section className="pt-card bill-manager-panel">
            <h2 className="bill-manager-section-title">収入</h2>
            <div className="bill-manager-income-row">
              <span className="bill-manager-income-label">
                給与
                {currentMonth.bonus !== null ? (
                  <span className="bill-manager-income-extra">＋賞与 {formatYen(currentMonth.bonus)}</span>
                ) : null}
                {currentMonth.extraIncome !== null ? (
                  <span className="bill-manager-income-extra">＋臨時収入 {formatYen(currentMonth.extraIncome)}</span>
                ) : null}
              </span>
              <input
                key={selectedMonth}
                type="number"
                inputMode="numeric"
                className="pt-input bill-manager-income-amount bill-manager-amount"
                aria-label="給与"
                defaultValue={currentMonth.income ?? ''}
                placeholder="未入力"
                disabled={!editable}
                onBlur={(event) => setIncome(month, parseAmountInput(event.target.value))}
              />
              {editable ? (
                <RowMenu
                  items={[
                    { key: 'bonus', label: '賞与', onClick: () => startEditIncomeField('bonus') },
                    { key: 'extra-income', label: '臨時収入', onClick: () => startEditIncomeField('extraIncome') },
                  ]}
                />
              ) : null}
            </div>
            {editable && editingIncomeField !== null ? (
              <form className="bill-manager-extra-income-form" onSubmit={commitIncomeField}>
                <input
                  type="number"
                  inputMode="numeric"
                  className="pt-input bill-manager-amount"
                  aria-label={INCOME_FIELD_LABELS[editingIncomeField]}
                  placeholder={INCOME_FIELD_LABELS[editingIncomeField]}
                  value={incomeFieldDraft}
                  onChange={(event) => setIncomeFieldDraft(event.target.value)}
                  autoFocus
                />
                <button type="submit" className="pt-button">
                  保存
                </button>
                <button type="button" className="pt-button" onClick={() => setEditingIncomeField(null)}>
                  キャンセル
                </button>
              </form>
            ) : null}
          </section>

          <section className="pt-card bill-manager-panel">
            <h2 className="bill-manager-section-title">項目</h2>
            {/* 金額 input は非制御（defaultValue・blur で確定）。派生コピーや取込データでは同じ id の項目が月をまたぐため、
                key にコンテキストの選択月（selectedMonth。currentMonth と同じ描画で切り替わる）を含めて月の切替で必ず作り直す。
                URL 由来の month は currentMonth より1描画早く変わるため key には使わない。給与 input も同様。 */}
            <ul className="bill-manager-entry-list">
              {currentMonth.entries.length === 0 ? (
                <li className="pt-empty">支払い項目がありません。</li>
              ) : (
                currentMonth.entries.map((entry) => (
                  <MonthEntryRow
                    key={`${selectedMonth}:${entry.id}`}
                    entry={entry}
                    editable={editable}
                    onEdit={(patch) => updateEntry(entry.id, patch)}
                    onAmountCommit={(raw) => updateEntry(entry.id, { amount: parseAmountInput(raw) })}
                    onToggleVariable={() => updateEntry(entry.id, { variable: !entry.variable })}
                    onToggleExcluded={() => updateEntry(entry.id, { excluded: !entry.excluded })}
                    onToggleCarryOver={() => updateEntry(entry.id, { carryOver: !entry.carryOver })}
                    onDelete={() => handleDeleteEntry(entry)}
                  />
                ))
              )}
            </ul>

            {editable ? (
              <>
                <form className="bill-manager-add-form" onSubmit={handleAddEntry}>
                  <input
                    type="text"
                    className="pt-input"
                    placeholder="項目名"
                    aria-label="項目名"
                    value={addName}
                    maxLength={MAX_ENTRY_NAME_LENGTH}
                    onChange={(event) => setAddName(event.target.value)}
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    className="pt-input bill-manager-amount"
                    placeholder="金額（任意）"
                    aria-label="金額"
                    value={addAmount}
                    onChange={(event) => setAddAmount(event.target.value)}
                  />
                  <select
                    className="pt-input"
                    aria-label="カテゴリ"
                    value={addCategory}
                    onChange={(event) => setAddCategory(event.target.value as EntryCategory)}
                  >
                    {ENTRY_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {ENTRY_CATEGORY_LABELS[category]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="pt-button pt-button-accent"
                    disabled={!addName.trim() || currentMonth.entries.length >= MAX_ENTRIES_PER_MONTH}
                  >
                    追加
                  </button>
                </form>
                {currentMonth.entries.length >= MAX_ENTRIES_PER_MONTH ? (
                  <p className="bill-manager-note">1か月あたり{MAX_ENTRIES_PER_MONTH}件までです。</p>
                ) : null}
              </>
            ) : null}
          </section>

          <section className="pt-card bill-manager-panel">
            <h2 className="bill-manager-section-title">特殊費用</h2>
            <ul className="bill-manager-special-list">
              {currentMonth.specials.length === 0 ? (
                <li className="pt-empty">特殊費用はありません。</li>
              ) : (
                currentMonth.specials.map((special) => (
                  <SpecialRow
                    key={special.id}
                    special={special}
                    editable={editable}
                    onDelete={() => handleDeleteSpecial(special.id, special.memo)}
                  />
                ))
              )}
            </ul>
            {editable ? (
              <>
                <form className="bill-manager-add-form" onSubmit={handleAddSpecial}>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="pt-input bill-manager-amount"
                    placeholder="金額"
                    aria-label="特殊費用の金額"
                    value={specialAmount}
                    onChange={(event) => setSpecialAmount(event.target.value)}
                  />
                  <input
                    type="text"
                    className="pt-input"
                    placeholder="メモ（任意）"
                    aria-label="特殊費用のメモ"
                    value={specialMemo}
                    maxLength={MAX_MEMO_LENGTH}
                    onChange={(event) => setSpecialMemo(event.target.value)}
                  />
                  <button
                    type="submit"
                    className="pt-button pt-button-accent"
                    disabled={parseAmountInput(specialAmount) === null || currentMonth.specials.length >= MAX_SPECIALS_PER_MONTH}
                  >
                    追加
                  </button>
                </form>
                {currentMonth.specials.length >= MAX_SPECIALS_PER_MONTH ? (
                  <p className="bill-manager-note">特殊費用は1か月あたり{MAX_SPECIALS_PER_MONTH}件までです。</p>
                ) : null}
              </>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  )
}
