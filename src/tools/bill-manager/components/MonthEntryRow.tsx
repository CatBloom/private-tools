import { useState, type KeyboardEvent } from 'react'
import { RowMenu } from '../../../components/RowMenu'
import { ENTRY_CATEGORIES, ENTRY_CATEGORY_LABELS, MAX_ENTRY_NAME_LENGTH, type EntryCategory, type LedgerEntry } from '../shared/types'

type MonthEntryRowProps = {
  entry: LedgerEntry
  onEdit: (patch: { name: string; category: EntryCategory }) => void
  onAmountCommit: (raw: string) => void
  onToggleVariable: () => void
  onToggleExcluded: () => void
  onToggleCarryOver: () => void
  onDelete: () => void
}

// 1項目1行のコンパクト表示。名前・カテゴリの編集はモバイルの横幅制約のため行全体を
// 一時的に入力欄（名前 input＋カテゴリ select）に差し替える単一の「編集」モードにまとめる
// （RowMenu はボタンの並びのみでセレクトを内包できないため）。
export const MonthEntryRow = ({ entry, onEdit, onAmountCommit, onToggleVariable, onToggleExcluded, onToggleCarryOver, onDelete }: MonthEntryRowProps) => {
  const [editing, setEditing] = useState(false)
  const [nameDraft, setNameDraft] = useState(entry.name)
  const [categoryDraft, setCategoryDraft] = useState<EntryCategory>(entry.category)

  const handleAmountKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur()
  }

  const startEdit = () => {
    setNameDraft(entry.name)
    setCategoryDraft(entry.category)
    setEditing(true)
  }
  const commitEdit = () => {
    const trimmed = nameDraft.trim()
    if (!trimmed) return
    onEdit({ name: trimmed, category: categoryDraft })
    setEditing(false)
  }

  if (editing) {
    return (
      <li className="bill-manager-entry-row is-editing">
        <div className="bill-manager-entry-row-edit-fields">
          <input
            type="text"
            className="pt-input"
            aria-label="項目名（編集）"
            value={nameDraft}
            maxLength={MAX_ENTRY_NAME_LENGTH}
            onChange={(event) => setNameDraft(event.target.value)}
            autoFocus
          />
          <select
            className="pt-input"
            aria-label="カテゴリ（編集）"
            value={categoryDraft}
            onChange={(event) => setCategoryDraft(event.target.value as EntryCategory)}
          >
            {ENTRY_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {ENTRY_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </div>
        <div className="bill-manager-entry-row-actions">
          <button type="button" className="pt-button" disabled={!nameDraft.trim()} onClick={commitEdit}>
            保存
          </button>
          <button type="button" className="pt-button" onClick={() => setEditing(false)}>
            キャンセル
          </button>
        </div>
      </li>
    )
  }

  return (
    <li className={`bill-manager-entry-row${entry.excluded ? ' is-excluded' : ''}`}>
      <div className="bill-manager-entry-row-content">
        <span className="bill-manager-entry-name" title={entry.name}>
          {entry.name}
        </span>
        {entry.variable ? <span className="pt-badge bill-manager-entry-status">変動費</span> : null}
        {!entry.carryOver ? <span className="pt-badge bill-manager-entry-status">終了</span> : null}
        <span className="pt-badge bill-manager-entry-category">{ENTRY_CATEGORY_LABELS[entry.category]}</span>
        <input
          type="number"
          inputMode="numeric"
          className="pt-input bill-manager-entry-amount bill-manager-amount"
          aria-label={`${entry.name}の金額`}
          defaultValue={entry.amount ?? ''}
          placeholder="未入力"
          onBlur={(event) => onAmountCommit(event.target.value)}
          onKeyDown={handleAmountKeyDown}
        />
      </div>
      <RowMenu
        items={[
          { key: 'edit', label: '編集', onClick: startEdit },
          { key: 'toggle-variable', label: '変動費', onClick: onToggleVariable },
          {
            key: 'toggle-excluded',
            label: 'クレカ払い',
            title: 'クレカ明細に含まれているため支出合計から除外します',
            onClick: onToggleExcluded,
          },
          { key: 'toggle-carry-over', label: '今月終了', onClick: onToggleCarryOver },
          { key: 'delete', label: '削除', onClick: onDelete, danger: true },
        ]}
      />
    </li>
  )
}
