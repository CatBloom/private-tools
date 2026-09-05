import type { CSSProperties } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { RowMenu } from './RowMenu'
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

      {/* 実 checkbox は視覚的に隠すだけでDOMには残し、キーボード操作・aria を維持する
          （見た目のチェック四角は完了時の行ディム＋打ち消し線と冗長なため廃止済み。
          キーボードでのフォーカス可視化は隣接テキストの :focus-visible ~ で行う）。
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
        <span className="mytodo-item-text">{item.text}</span>
      </label>

      {/* 行に個別ボタンを並べるとモバイルでタスクテキストの表示幅が狭くなるため、
          移動・編集・削除は「⋯」オーバーフローメニューに集約する。 */}
      <div className="mytodo-item-actions">
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
