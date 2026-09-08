import { useEffect, useState, type FormEvent } from 'react'
import { Spinner, useAlert, useConfirm } from '../../../components/feedback'
import { LedgerRow } from '../components/LedgerRow'
import { fetchCreditCsvBytes } from '../creditCsvApi'
import { creditUsageMonth, sumCreditCsv } from '../lib/creditAmount'
import { formatMonthLabel } from '../lib/monthKey'
import { summarizeEntries } from '../lib/summary'
import { MAX_ENTRIES_PER_MONTH, type LedgerEntry } from '../shared/types'
import { useLedger } from '../state/LedgerContext'

type CreditAmountState =
  | { status: 'loading' }
  | { status: 'ready'; amount: number | null }
  | { status: 'error'; message: string }

const yenFormatter = new Intl.NumberFormat('ja-JP')
const formatYen = (value: number) => `${yenFormatter.format(value)}円`

const parseAmountInput = (raw: string): number | null => {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null
}

export const LedgerPage = () => {
  const {
    loadStatus,
    loadError,
    reload,
    saveStatus,
    saveError,
    month,
    goPrevMonth,
    goNextMonth,
    entries,
    entriesSource,
    addEntry,
    updateEntry,
    removeEntry,
  } = useLedger()
  const { showAlert } = useAlert()
  const { confirm } = useConfirm()

  const [creditAmount, setCreditAmount] = useState<CreditAmountState>({ status: 'loading' })
  const [addName, setAddName] = useState('')
  const [addAmount, setAddAmount] = useState('')
  const [addVariable, setAddVariable] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  // クレカ額は KV に保存せず、支払月を切り替えるたびに毎回 credit-csv の CSV から算出する。
  useEffect(() => {
    let cancelled = false
    setCreditAmount({ status: 'loading' })
    const usageMonth = creditUsageMonth(month)

    fetchCreditCsvBytes(usageMonth)
      .then((bytes) => {
        if (cancelled) return
        setCreditAmount({
          status: 'ready',
          amount: bytes === null ? null : sumCreditCsv(`${usageMonth}.csv`, bytes),
        })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setCreditAmount({
          status: 'error',
          message: error instanceof Error ? error.message : 'クレカ明細の取得に失敗しました。',
        })
      })

    return () => {
      cancelled = true
    }
  }, [month])

  const { fixedTotal, missingCount } = summarizeEntries(entries)
  const creditTotal = creditAmount.status === 'ready' ? creditAmount.amount : null
  const grandTotal = fixedTotal + (creditTotal ?? 0)
  const atLimit = entries.length >= MAX_ENTRIES_PER_MONTH
  const addDisabled = loadStatus !== 'ready' || !addName.trim() || atLimit

  const handleAdd = (event: FormEvent) => {
    event.preventDefault()
    if (addDisabled) return

    const added = addEntry({ name: addName, amount: parseAmountInput(addAmount), variable: addVariable })
    if (!added) {
      showAlert('info', `1か月あたり${MAX_ENTRIES_PER_MONTH}件までです`)
      return
    }
    setAddName('')
    setAddAmount('')
    setAddVariable(false)
  }

  const startEditName = (entry: LedgerEntry) => {
    setEditingId(entry.id)
    setEditName(entry.name)
  }
  const cancelEditName = () => setEditingId(null)
  const commitEditName = (id: string) => {
    if (!editName.trim()) return
    updateEntry(id, { name: editName.trim() })
    setEditingId(null)
  }

  const handleDelete = async (entry: LedgerEntry) => {
    const confirmed = await confirm(`「${entry.name}」を削除しますか？`, { title: '削除', danger: true })
    if (!confirmed) return
    removeEntry(entry.id)
    showAlert('success', '削除しました')
  }

  return (
    <div className="bill-manager-page-stack">
      {saveStatus === 'error' ? (
        <p className="bill-manager-status-message bill-manager-status-message-error" role="alert">
          {saveError}
        </p>
      ) : null}

      {loadStatus === 'loading' ? <Spinner label="読み込み中…" /> : null}
      {loadStatus === 'error' ? (
        <p className="bill-manager-status-message bill-manager-status-message-error" role="alert">
          {loadError}
          <button type="button" className="pt-button" onClick={reload}>
            再読み込み
          </button>
        </p>
      ) : null}

      {loadStatus === 'ready' ? (
        <>
          <div className="bill-manager-month-nav">
            <button type="button" className="pt-button" onClick={goPrevMonth}>
              前月
            </button>
            <span className="bill-manager-month-label">{formatMonthLabel(month)}</span>
            <button type="button" className="pt-button" onClick={goNextMonth}>
              翌月
            </button>
          </div>

          <section className="pt-card bill-manager-summary">
            <div className="bill-manager-summary-row">
              <span>固定費合計</span>
              <strong>{formatYen(fixedTotal)}</strong>
            </div>
            <div className="bill-manager-summary-row">
              <span>クレカ額</span>
              <strong>
                {creditAmount.status === 'loading' ? '読み込み中…' : null}
                {creditAmount.status === 'error' ? creditAmount.message : null}
                {creditAmount.status === 'ready' ? (creditTotal === null ? '未取込' : formatYen(creditTotal)) : null}
              </strong>
            </div>
            <div className="bill-manager-summary-row bill-manager-summary-total">
              <span>合計</span>
              <strong>{formatYen(grandTotal)}</strong>
            </div>
            {creditAmount.status === 'ready' && creditTotal === null ? (
              <p className="bill-manager-note">クレカ明細が未取込のため合計に含まれません。</p>
            ) : null}
            {missingCount > 0 ? <p className="bill-manager-note">未入力の行があります。</p> : null}
          </section>

          <section className="pt-card bill-manager-panel">
            {entriesSource === 'derived' ? (
              <p className="bill-manager-note">前の記録月からコピーした内容です。編集すると保存されます。</p>
            ) : null}

            <ul className="bill-manager-row-list">
              {entries.length === 0 ? (
                <li className="bill-manager-empty">支払い項目がありません。</li>
              ) : (
                entries.map((entry) => (
                  <LedgerRow
                    key={entry.id}
                    entry={entry}
                    isEditingName={editingId === entry.id}
                    editName={editName}
                    onEditNameChange={setEditName}
                    onStartEditName={() => startEditName(entry)}
                    onCommitEditName={() => commitEditName(entry.id)}
                    onCancelEditName={cancelEditName}
                    onAmountCommit={(raw) => updateEntry(entry.id, { amount: parseAmountInput(raw) })}
                    onToggleVariable={() => updateEntry(entry.id, { variable: !entry.variable })}
                    onToggleCarryOver={() => updateEntry(entry.id, { carryOver: !entry.carryOver })}
                    onDelete={() => handleDelete(entry)}
                  />
                ))
              )}
            </ul>

            <form className="bill-manager-add-form" onSubmit={handleAdd}>
              <input
                type="text"
                className="pt-input"
                placeholder="項目名"
                aria-label="項目名"
                value={addName}
                onChange={(event) => setAddName(event.target.value)}
              />
              <input
                type="number"
                inputMode="numeric"
                className="pt-input"
                placeholder="金額（任意）"
                aria-label="金額"
                value={addAmount}
                onChange={(event) => setAddAmount(event.target.value)}
              />
              <label className="bill-manager-add-form-variable">
                <input
                  type="checkbox"
                  checked={addVariable}
                  onChange={(event) => setAddVariable(event.target.checked)}
                />
                毎月変わる
              </label>
              <button type="submit" className="pt-button pt-button-accent" disabled={addDisabled}>
                追加
              </button>
            </form>
            {atLimit ? <p className="bill-manager-note">1か月あたり{MAX_ENTRIES_PER_MONTH}件までです。</p> : null}
          </section>
        </>
      ) : null}
    </div>
  )
}
