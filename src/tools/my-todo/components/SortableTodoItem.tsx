import type { CSSProperties } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { RowMenu } from '../../../components/RowMenu'
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
      <li ref={setNodeRef} style={style} className="my-todo-item is-editing">
        <input
          type="text"
          aria-label="タスク"
          value={editText}
          onChange={(event) => onEditTextChange(event.target.value)}
        />
        <div className="my-todo-item-actions">
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
      className={`my-todo-item${isDragging ? ' is-dragging' : ''}${item.completed ? ' is-completed' : ''}`}
    >
      <button type="button" className="my-todo-drag-handle" aria-label="並べ替え" {...attributes} {...listeners}>
        ⠿
      </button>

      <label className="my-todo-item-checkbox-label">
        <input
          type="checkbox"
          className="my-todo-item-checkbox-input"
          aria-label="完了"
          checked={item.completed}
          onChange={onToggleCompleted}
        />
        <span className="my-todo-item-text">{item.text}</span>
      </label>

      <div className="my-todo-item-actions">
        <RowMenu
          items={[
            {
              key: 'move',
              label: '移動',
              onClick: onMove,
              disabled: moveDisabled,
              title: moveDisabled ? moveDisabledReason : undefined,
            },
            { key: 'edit', label: '編集', onClick: onStartEdit },
            { key: 'delete', label: '削除', onClick: onDelete, danger: true },
          ]}
        />
      </div>
    </li>
  )
}
