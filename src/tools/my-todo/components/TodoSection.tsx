import type { ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'

type TodoSectionProps = {
  id: string
  children: ReactNode
}

// リスト本体を droppable にする。空リスト（アイテム0件）にもドロップできるよう、
// アイテムの useSortable とは別に <ul> 自体を useDroppable でラップする。
export const TodoSection = ({ id, children }: TodoSectionProps) => {
  const { setNodeRef } = useDroppable({ id })

  return (
    <ul ref={setNodeRef} className="my-todo-item-list">
      {children}
    </ul>
  )
}
