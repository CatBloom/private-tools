import type { KeyboardEvent } from 'react'
import { RowMenu } from '../../../components/RowMenu'
import type { LedgerEntry } from '../shared/types'

type LedgerRowProps = {
  entry: LedgerEntry
  isEditingName: boolean
  editName: string
  onEditNameChange: (value: string) => void
  onStartEditName: () => void
  onCommitEditName: () => void
  onCancelEditName: () => void
  onAmountCommit: (raw: string) => void
  onToggleVariable: () => void
  onToggleCarryOver: () => void
  onDelete: () => void
}

export const LedgerRow = ({
  entry,
  isEditingName,
  editName,
  onEditNameChange,
  onStartEditName,
  onCommitEditName,
  onCancelEditName,
  onAmountCommit,
  onToggleVariable,
  onToggleCarryOver,
  onDelete,
}: LedgerRowProps) => {
  // blur で確定するため、Enter は blur を発火させるだけにする。
  const handleAmountKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur()
  }

  if (isEditingName) {
    return (
      <li className="bill-manager-row is-editing">
        <input
          type="text"
          className="pt-input"
          aria-label="項目名（編集）"
          value={editName}
          onChange={(event) => onEditNameChange(event.target.value)}
        />
        <div className="bill-manager-row-actions">
          <button type="button" className="pt-button" disabled={!editName.trim()} onClick={onCommitEditName}>
            保存
          </button>
          <button type="button" className="pt-button" onClick={onCancelEditName}>
            キャンセル
          </button>
        </div>
      </li>
    )
  }

  return (
    <li className="bill-manager-row">
      <div className="bill-manager-row-main">
        <span className="bill-manager-row-name">{entry.name}</span>
        {entry.variable ? <span className="pt-badge">毎月変わる</span> : null}
        {!entry.carryOver ? <span className="pt-badge">この月で終了</span> : null}
        <RowMenu
          items={[
            { key: 'edit-name', label: '名前を編集', onClick: onStartEditName },
            {
              key: 'toggle-variable',
              label: entry.variable ? '毎月変わるをOFFにする' : '毎月変わるをONにする',
              onClick: onToggleVariable,
            },
            {
              key: 'toggle-carry-over',
              label: entry.carryOver ? 'この月で終了にする' : '翌月へ引き継ぐ',
              onClick: onToggleCarryOver,
            },
            { key: 'delete', label: '削除', onClick: onDelete, danger: true },
          ]}
        />
      </div>
      <input
        type="number"
        inputMode="numeric"
        className="pt-input bill-manager-row-amount"
        aria-label={`${entry.name}の金額`}
        defaultValue={entry.amount ?? ''}
        placeholder="未入力"
        onBlur={(event) => onAmountCommit(event.target.value)}
        onKeyDown={handleAmountKeyDown}
      />
    </li>
  )
}
