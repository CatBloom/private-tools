import { useState, type KeyboardEvent } from 'react'
import { RowMenu } from '../../../components/RowMenu'
import { ENTRY_CATEGORIES, ENTRY_CATEGORY_LABELS, MAX_ENTRY_NAME_LENGTH, type EntryCategory, type LedgerEntry } from '../shared/types'

type MonthEntryRowProps = {
  entry: LedgerEntry
  onRename: (name: string) => void
  onCategoryChange: (category: EntryCategory) => void
  onAmountCommit: (raw: string) => void
  onToggleVariable: () => void
  onToggleExcluded: () => void
  onToggleCarryOver: () => void
  onDelete: () => void
}

// 1項目1行のコンパクト表示。名前・カテゴリの編集はモバイルの横幅制約のため行全体を
// 一時的に入力欄に差し替える（RowMenu はボタンの並びのみでセレクトを内包できないため）。
export const MonthEntryRow = ({
  entry,
  onRename,
  onCategoryChange,
  onAmountCommit,
  onToggleVariable,
  onToggleExcluded,
  onToggleCarryOver,
  onDelete,
}: MonthEntryRowProps) => {
  const [mode, setMode] = useState<'name' | 'category' | null>(null)
  const [nameDraft, setNameDraft] = useState(entry.name)

  const handleAmountKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur()
  }

  const startEditName = () => {
    setNameDraft(entry.name)
    setMode('name')
  }
  const commitName = () => {
    if (nameDraft.trim()) onRename(nameDraft.trim())
    setMode(null)
  }

  if (mode === 'name') {
    return (
      <li className="bill-manager-entry-row is-editing">
        <input
          type="text"
          className="pt-input"
          aria-label="項目名（編集）"
          value={nameDraft}
          maxLength={MAX_ENTRY_NAME_LENGTH}
          onChange={(event) => setNameDraft(event.target.value)}
          autoFocus
        />
        <div className="bill-manager-entry-row-actions">
          <button type="button" className="pt-button" disabled={!nameDraft.trim()} onClick={commitName}>
            保存
          </button>
          <button type="button" className="pt-button" onClick={() => setMode(null)}>
            キャンセル
          </button>
        </div>
      </li>
    )
  }

  if (mode === 'category') {
    return (
      <li className="bill-manager-entry-row is-editing">
        <select
          className="pt-input"
          aria-label="カテゴリ（編集）"
          defaultValue={entry.category}
          onChange={(event) => {
            onCategoryChange(event.target.value as EntryCategory)
            setMode(null)
          }}
          autoFocus
        >
          {ENTRY_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {ENTRY_CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
        <button type="button" className="pt-button" onClick={() => setMode(null)}>
          キャンセル
        </button>
      </li>
    )
  }

  return (
    <li className={`bill-manager-entry-row${entry.excluded ? ' is-excluded' : ''}`}>
      <span className="bill-manager-entry-name" title={entry.name}>
        {entry.name}
      </span>
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
      <RowMenu
        items={[
          { key: 'edit-name', label: '名前を編集', onClick: startEditName },
          { key: 'edit-category', label: 'カテゴリ変更', onClick: () => setMode('category') },
          { key: 'toggle-variable', label: entry.variable ? '変動をOFFにする' : '変動をONにする', onClick: onToggleVariable },
          {
            key: 'toggle-excluded',
            label: entry.excluded ? '計上しないをOFFにする' : '計上しないをONにする',
            onClick: onToggleExcluded,
          },
          {
            key: 'toggle-carry-over',
            label: entry.carryOver ? 'この月で終了にする' : '翌月へ引き継ぐ',
            onClick: onToggleCarryOver,
          },
          { key: 'delete', label: '削除', onClick: onDelete, danger: true },
        ]}
      />
    </li>
  )
}
