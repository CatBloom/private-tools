import type { CSSProperties } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { TabMoveIcon } from './icons'
import type { TodoItem } from '../shared/types'

type SortableTodoItemProps = {
  item: TodoItem
  isEditing: boolean
  editText: string
  onEditTextChange: (value: string) => void
  onStartEdit: () => void
  onCommitEdit: () => void
  onCancelEdit: () => void
  onToggleCompleted: () => void
  onDelete: () => void
  onMove: () => void
  moveLabel: string
  // true なら Someday→Today（左向き＝逆矢印）。アイコンの向きだけを左右させる。
  moveFlipped: boolean
  moveDisabled: boolean
  moveDisabledReason?: string
}

export const SortableTodoItem = ({
  item,
  isEditing,
  editText,
  onEditTextChange,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  onToggleCompleted,
  onDelete,
  onMove,
  moveLabel,
  moveFlipped,
  moveDisabled,
  moveDisabledReason,
}: SortableTodoItemProps) => {
  // @dnd-kit/utilities は依存に入れないため transform は自前で translate3d(...) の CSS 文字列にする。
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  const style: CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition: transition ?? undefined,
  }

  if (isEditing) {
    return (
      <li ref={setNodeRef} style={style} className="mytodo-item is-editing">
        <input
          type="text"
          aria-label="タスク"
          value={editText}
          onChange={(event) => onEditTextChange(event.target.value)}
        />
        <div className="mytodo-item-actions">
          <button type="button" disabled={!editText.trim()} onClick={onCommitEdit}>
            保存
          </button>
          <button type="button" onClick={onCancelEdit}>
            キャンセル
          </button>
        </div>
      </li>
    )
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`mytodo-item${isDragging ? ' is-dragging' : ''}${item.completed ? ' is-completed' : ''}`}
    >
      <button type="button" className="mytodo-drag-handle" aria-label="並べ替え" {...attributes} {...listeners}>
        ⠿
      </button>

      {/* 実 checkbox は視覚的に隠すだけでDOMには残し、キーボード操作・aria を維持する。
          チェック時の見た目は隣接する .mytodo-item-checkbox-box を :checked + で描く。
          label にタスクテキストまで含めて flex:1 にすることで、テキストや行の余白をクリック
          してもトグルできる標準的な label-wraps-input 構造にする（ドラッグハンドル・移動/編集/
          削除ボタンは label の外＝トグル対象外）。 */}
      <label className="mytodo-item-checkbox-label">
        <input
          type="checkbox"
          className="mytodo-item-checkbox-input"
          aria-label="完了"
          checked={item.completed}
          onChange={onToggleCompleted}
        />
        <span className="mytodo-item-checkbox-box" aria-hidden="true" />
        <span className="mytodo-item-text">{item.text}</span>
      </label>

      <div className="mytodo-item-actions">
        <button
          type="button"
          className="mytodo-move-button"
          disabled={moveDisabled}
          title={moveDisabled ? moveDisabledReason : moveLabel}
          aria-label={moveLabel}
          onClick={onMove}
        >
          <TabMoveIcon flipped={moveFlipped} />
        </button>
        <button type="button" onClick={onStartEdit}>
          編集
        </button>
        <button type="button" className="mytodo-danger-button" onClick={onDelete}>
          削除
        </button>
      </div>
    </li>
  )
}
