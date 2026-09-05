import type { CSSProperties } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { applyNotation } from '../lib/notation'
import type { OutputItem } from '../shared/types'

type SortableOutputItemProps = {
  item: OutputItem
  onRemove: (id: string) => void
  onWeightChange: (id: string, delta: number) => void
}

export const SortableOutputItem = ({ item, onRemove, onWeightChange }: SortableOutputItemProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id })

  // @dnd-kit/utilities は package.json の直接依存に含めていないため、transform は自前で CSS 文字列化する。
  const style: CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition: transition ?? undefined,
  }

  return (
    <li ref={setNodeRef} style={style} className={`prompt-builder-output-item${isDragging ? ' is-dragging' : ''}`}>
      <button
        type="button"
        className="prompt-builder-drag-handle"
        aria-label="並べ替え"
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>

      <span className="prompt-builder-output-item-preview">{applyNotation(item.text, item.weight)}</span>

      <div className="prompt-builder-weight-controls">
        <button type="button" aria-label="弱める" onClick={() => onWeightChange(item.id, -1)}>
          −
        </button>
        <span className="prompt-builder-weight-value">{item.weight}</span>
        <button type="button" aria-label="強める" onClick={() => onWeightChange(item.id, 1)}>
          +
        </button>
      </div>

      <button
        type="button"
        className="prompt-builder-icon-button"
        aria-label="出力から削除"
        title="削除"
        onClick={() => onRemove(item.id)}
      >
        ×
      </button>
    </li>
  )
}
