import { useState, type FormEvent } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Spinner } from '../../../components/feedback'
import { SortableTodoItem } from '../components/SortableTodoItem'
import { TodoSection } from '../components/TodoSection'
import { canPlaceInToday, countUnfinished } from '../lib/move'
import { useTodo } from '../state/TodoContext'
import { TODAY_LIMIT, type TodoItem, type TodoSectionId } from '../shared/types'

const SECTION_DROPPABLE_ID: Record<TodoSectionId, string> = {
  today: 'section-today',
  someday: 'section-someday',
}

const SECTION_LABEL: Record<TodoSectionId, string> = {
  today: 'Today',
  someday: 'Someday',
}

type SectionPageProps = {
  section: TodoSectionId
}

export const SectionPage = ({ section }: SectionPageProps) => {
  const {
    todoState,
    loadStatus,
    loadError,
    reloadTodos,
    saveStatus,
    saveError,
    addItem,
    toggleCompleted,
    editItem,
    deleteItem,
    moveToSection,
    reorderSection,
  } = useTodo()

  const [text, setText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const items = todoState[section]
  const todayUnfinishedCount = countUnfinished(todoState.today)
  const todayFull = !canPlaceInToday(todoState.today, false)
  const addDisabled = loadStatus !== 'ready' || (section === 'today' && todayFull)

  const handleAdd = (event: FormEvent) => {
    event.preventDefault()
    if (addDisabled || !text.trim()) return
    addItem(section, text)
    setText('')
  }

  const startEdit = (item: TodoItem) => {
    setEditingId(item.id)
    setEditText(item.text)
  }

  const cancelEdit = () => setEditingId(null)

  const commitEdit = (id: string) => {
    if (!editText.trim()) return
    editItem(section, id, editText)
    setEditingId(null)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const fromIndex = items.findIndex((item) => item.id === active.id)
    const toIndex = items.findIndex((item) => item.id === over.id)
    if (fromIndex === -1 || toIndex === -1) return
    reorderSection(section, fromIndex, toIndex)
  }

  const renderRow = (item: TodoItem) => {
    const targetSection: TodoSectionId = section === 'today' ? 'someday' : 'today'
    const moveDisabled = targetSection === 'today' && !canPlaceInToday(todoState.today, item.completed)

    return (
      <SortableTodoItem
        key={item.id}
        item={item}
        isEditing={editingId === item.id}
        editText={editText}
        onEditTextChange={setEditText}
        onStartEdit={() => startEdit(item)}
        onCommitEdit={() => commitEdit(item.id)}
        onCancelEdit={cancelEdit}
        onToggleCompleted={() => toggleCompleted(section, item.id)}
        onDelete={() => deleteItem(section, item.id)}
        onMove={() => moveToSection(section, item.id)}
        moveDisabled={moveDisabled}
        moveDisabledReason={moveDisabled ? `Todayは未完了${TODAY_LIMIT}件までです` : undefined}
      />
    )
  }

  return (
    <div className="my-todo-page-stack">
      {saveStatus === 'error' ? (
        <p className="my-todo-status-message my-todo-status-message-error" role="alert">
          {saveError}
        </p>
      ) : null}

      {loadStatus === 'loading' ? <Spinner label="読み込み中…" /> : null}
      {loadStatus === 'error' ? (
        <p className="my-todo-status-message my-todo-status-message-error" role="alert">
          {loadError}
          <button type="button" onClick={reloadTodos}>
            再読み込み
          </button>
        </p>
      ) : null}

      {loadStatus === 'ready' ? (
        <section className="my-todo-panel">
          <div className="my-todo-panel-header">
            <h1>{SECTION_LABEL[section]}</h1>
            <div className="my-todo-panel-header-status">
              {section === 'today' ? (
                <span className="my-todo-count-badge">
                  {todayUnfinishedCount}/{TODAY_LIMIT}
                </span>
              ) : null}
              {saveStatus === 'saving' ? <span className="my-todo-save-indicator">保存中…</span> : null}
            </div>
          </div>

          <form className="my-todo-add-form" onSubmit={handleAdd}>
            <input
              type="text"
              placeholder="タスクを追加"
              aria-label={`${SECTION_LABEL[section]}のタスク`}
              value={text}
              disabled={addDisabled}
              onChange={(event) => setText(event.target.value)}
            />
            <button type="submit" disabled={addDisabled || !text.trim()}>
              追加
            </button>
          </form>
          {section === 'today' && todayFull ? (
            <p className="my-todo-limit-reason">Todayは未完了{TODAY_LIMIT}件までです。Somedayへ追加してください。</p>
          ) : null}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((item) => item.id)} strategy={verticalListSortingStrategy}>
              <TodoSection id={SECTION_DROPPABLE_ID[section]}>
                {items.length === 0 ? <li className="my-todo-empty">タスクがありません。</li> : items.map(renderRow)}
              </TodoSection>
            </SortableContext>
          </DndContext>
        </section>
      ) : null}
    </div>
  )
}
