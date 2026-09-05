import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
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
import { Spinner, useAlert, useConfirm } from '../../../components/feedback'
import { RowMenu } from '../../../components/RowMenu'
import { copyText } from '../../../lib/copyText'
import { getHistory, putHistory } from '../api'
import { SortableOutputItem } from '../components/SortableOutputItem'
import { useGroupedFilter } from '../hooks/useGroupedFilter'
import { buildOutput, clampWeight, reorder } from '../lib/notation'
import { readOutputItems, writeOutputItems } from '../lib/outputStorage'
import { formatLabel } from '../shared/labels'
import { PROMPT_TARGET_IDS, PROMPT_TARGET_LABELS, type PromptTargetId } from '../shared/targets'
import type { HistoryEntry, OutputItem } from '../shared/types'

type LoadStatus = 'loading' | 'ready' | 'error'
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
type CopyStatus = 'idle' | 'copied' | 'error'
type TargetFilter = PromptTargetId | 'ALL'

const getEntryTarget = (entry: HistoryEntry) => entry.target

const TargetOptions = () => (
  <>
    {PROMPT_TARGET_IDS.map((target) => (
      <option key={target} value={target}>
        {formatLabel(PROMPT_TARGET_LABELS[target])}
      </option>
    ))}
  </>
)

const formatHistoryDate = (isoDate: string) => {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return isoDate
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
}

export const OutputPage = () => {
  const { showAlert } = useAlert()
  const { confirm } = useConfirm()

  const [outputItems, setOutputItems] = useState<OutputItem[]>(() => readOutputItems())
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  const outputTextRef = useRef<HTMLParagraphElement>(null)
  const outputSectionRef = useRef<HTMLDivElement>(null)

  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([])
  const [historyLoadStatus, setHistoryLoadStatus] = useState<LoadStatus>('loading')
  const [historyLoadError, setHistoryLoadError] = useState<string | null>(null)
  const [historyName, setHistoryName] = useState('')
  const [historyTarget, setHistoryTarget] = useState<PromptTargetId | ''>('')
  const [historySaveStatus, setHistorySaveStatus] = useState<SaveStatus>('idle')
  const [historySaveError, setHistorySaveError] = useState<string | null>(null)
  const historySaveStatusRef = useRef(historySaveStatus)
  historySaveStatusRef.current = historySaveStatus

  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null)
  const [editHistoryName, setEditHistoryName] = useState('')
  const [editHistoryTarget, setEditHistoryTarget] = useState<PromptTargetId>(PROMPT_TARGET_IDS[0])

  const [historyFilterTarget, setHistoryFilterTarget] = useState<TargetFilter>('ALL')

  const loadHistory = useCallback(async () => {
    setHistoryLoadStatus('loading')
    setHistoryLoadError(null)
    try {
      const entries = await getHistory()
      // 読み込み中に保存/削除が走っていたら初期データで上書きしない。
      if (historySaveStatusRef.current !== 'saving') {
        setHistoryEntries(entries)
      }
      setHistoryLoadStatus('ready')
    } catch (error) {
      setHistoryLoadError(error instanceof Error ? error.message : '読み込みに失敗しました。')
      setHistoryLoadStatus('error')
    }
  }, [])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  useEffect(() => {
    writeOutputItems(outputItems)
  }, [outputItems])

  useEffect(() => {
    if (copyStatus === 'idle') return
    const timer = window.setTimeout(() => setCopyStatus('idle'), 2000)
    return () => window.clearTimeout(timer)
  }, [copyStatus])

  const removeOutputItem = (id: string) => {
    setOutputItems((current) => current.filter((item) => item.id !== id))
  }

  const changeWeight = (id: string, delta: number) => {
    setOutputItems((current) =>
      current.map((item) => (item.id === id ? { ...item, weight: clampWeight(item.weight + delta) } : item)),
    )
  }

  const clearOutput = async () => {
    const confirmed = await confirm('出力をクリアしますか？', { title: 'クリア', danger: true })
    if (!confirmed) return

    setOutputItems([])
    showAlert('success', '出力がクリアされました')
  }

  const handleSaveHistory = async (event: FormEvent) => {
    event.preventDefault()
    if (outputItems.length === 0) return
    // 初回ロード完了前に保存すると、未取得のまま PUT して KV 上の既存履歴を置き換えてしまう。
    if (historyLoadStatus !== 'ready') return
    if (historyTarget === '') return

    const newEntry: HistoryEntry = {
      id: crypto.randomUUID(),
      name: historyName.trim(),
      createdAt: new Date().toISOString(),
      items: outputItems,
      target: historyTarget,
    }

    setHistorySaveStatus('saving')
    setHistorySaveError(null)
    try {
      const saved = await putHistory([...historyEntries, newEntry])
      setHistoryEntries(saved)
      setHistoryName('')
      setHistoryTarget('')
      setHistorySaveStatus('saved')
      showAlert('success', '履歴に保存しました')
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存に失敗しました。'
      setHistorySaveError(message)
      setHistorySaveStatus('error')
      showAlert('error', message)
    }
  }

  const restoreHistoryEntry = async (entry: HistoryEntry) => {
    // 置き換えるものが無い（出力が空の）ときは確認不要で即時復元する。
    if (outputItems.length > 0) {
      const confirmed = await confirm('この履歴を復元しますか？ 現在の出力は置き換わります', {
        title: '復元',
        confirmLabel: '復元',
      })
      if (!confirmed) return
    }

    setOutputItems(entry.items)
    showAlert('success', '復元しました')
    outputSectionRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  const deleteHistoryEntry = async (id: string) => {
    const confirmed = await confirm('この履歴を削除しますか？', { title: '削除', danger: true })
    if (!confirmed) return

    const remaining = historyEntries.filter((entry) => entry.id !== id)
    setHistorySaveStatus('saving')
    setHistorySaveError(null)
    try {
      const saved = await putHistory(remaining)
      setHistoryEntries(saved)
      setHistorySaveStatus('idle')
      showAlert('success', '削除しました')
    } catch (error) {
      const message = error instanceof Error ? error.message : '削除に失敗しました。'
      setHistorySaveError(message)
      setHistorySaveStatus('error')
      showAlert('error', message)
    }
  }

  const startEditHistory = (entry: HistoryEntry) => {
    if (historyLoadStatus !== 'ready') return
    setEditingHistoryId(entry.id)
    setEditHistoryName(entry.name)
    setEditHistoryTarget(entry.target)
  }

  const cancelEditHistory = () => setEditingHistoryId(null)

  const commitHistoryEdit = async (id: string) => {
    if (historyLoadStatus !== 'ready') return

    const updated = historyEntries.map((entry) =>
      entry.id === id ? { ...entry, name: editHistoryName.trim(), target: editHistoryTarget } : entry,
    )
    setHistorySaveStatus('saving')
    setHistorySaveError(null)
    try {
      const saved = await putHistory(updated)
      setHistoryEntries(saved)
      setEditingHistoryId(null)
      setHistorySaveStatus('idle')
      showAlert('success', '履歴を更新しました')
    } catch (error) {
      const message = error instanceof Error ? error.message : '更新に失敗しました。'
      setHistorySaveError(message)
      setHistorySaveStatus('error')
      showAlert('error', message)
    }
  }

  const { visible: visibleHistoryEntries, grouped: groupedHistoryEntries } = useGroupedFilter(
    historyEntries,
    PROMPT_TARGET_IDS,
    getEntryTarget,
    historyFilterTarget,
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setOutputItems((current) => {
      const fromIndex = current.findIndex((item) => item.id === active.id)
      const toIndex = current.findIndex((item) => item.id === over.id)
      if (fromIndex === -1 || toIndex === -1) return current
      return reorder(current, fromIndex, toIndex)
    })
  }

  const outputText = useMemo(() => buildOutput(outputItems), [outputItems])

  const renderHistoryRow = (entry: HistoryEntry) =>
    editingHistoryId === entry.id ? (
      <li key={entry.id} className="prompt-builder-row prompt-builder-history-row is-editing">
        <div className="prompt-builder-word-form-row">
          <input
            type="text"
            aria-label="履歴名"
            value={editHistoryName}
            onChange={(event) => setEditHistoryName(event.target.value)}
          />
          <select
            aria-label="保存先"
            className="prompt-builder-tag-select"
            value={editHistoryTarget}
            onChange={(event) => setEditHistoryTarget(event.target.value as PromptTargetId)}
          >
            <TargetOptions />
          </select>
        </div>
        <div className="prompt-builder-word-row-actions">
          <button
            type="button"
            disabled={historySaveStatus === 'saving' || editHistoryName.trim() === ''}
            onClick={() => commitHistoryEdit(entry.id)}
          >
            保存
          </button>
          <button type="button" onClick={cancelEditHistory}>
            キャンセル
          </button>
        </div>
      </li>
    ) : (
      <li key={entry.id} className="prompt-builder-row prompt-builder-history-row">
        <button
          type="button"
          className="prompt-builder-word-row-text prompt-builder-word-row-button"
          aria-label={`${entry.name}を復元`}
          onClick={() => restoreHistoryEntry(entry)}
        >
          <span className="prompt-builder-word-text">{entry.name}</span>
          <span className="prompt-builder-word-description">{formatHistoryDate(entry.createdAt)}</span>
        </button>
        <div className="prompt-builder-word-row-actions">
          <RowMenu
            items={[
              { key: 'edit', label: '編集', onClick: () => startEditHistory(entry), disabled: historySaveStatus === 'saving' },
              {
                key: 'delete',
                label: '削除',
                onClick: () => deleteHistoryEntry(entry.id),
                danger: true,
                disabled: historySaveStatus === 'saving',
              },
            ]}
          />
        </div>
      </li>
    )

  const handleCopy = async () => {
    if (await copyText(outputText)) {
      setCopyStatus('idle')
      showAlert('success', 'コピーしました')
      return
    }

    // コピー手段が無い環境ではテキストを選択状態にして手動コピーできるようにする
    const node = outputTextRef.current
    const selection = typeof window.getSelection === 'function' ? window.getSelection() : null
    if (node && selection) {
      const range = document.createRange()
      range.selectNodeContents(node)
      selection.removeAllRanges()
      selection.addRange(range)
    }
    setCopyStatus('error')
  }

  return (
    <div className="prompt-builder-page-stack">
      <section className="prompt-builder-panel">
        <div className="prompt-builder-panel-header">
          <h2>出力欄</h2>
          <button type="button" disabled={outputItems.length === 0} onClick={clearOutput}>
            クリア
          </button>
        </div>

        <div className="prompt-builder-output-preview" ref={outputSectionRef}>
          <p className="prompt-builder-output-text" ref={outputTextRef}>
            {outputText || '（出力はまだありません）'}
          </p>
          <div className="prompt-builder-output-preview-actions">
            <button
              type="button"
              className="prompt-builder-copy-button"
              disabled={outputItems.length === 0}
              onClick={handleCopy}
            >
              コピー
            </button>
            {copyStatus === 'error' ? (
              <span className="prompt-builder-copy-feedback prompt-builder-copy-feedback-error" role="alert">
                コピーできませんでした。選択済みのテキストを手動でコピーしてください。
              </span>
            ) : null}
          </div>
        </div>

        {outputItems.length === 0 ? (
          <p className="prompt-builder-empty">ワード一覧から選ぶとここに追加されます。</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={outputItems.map((item) => item.id)} strategy={verticalListSortingStrategy}>
              <ul className="prompt-builder-output-list">
                {outputItems.map((item) => (
                  <SortableOutputItem key={item.id} item={item} onRemove={removeOutputItem} onWeightChange={changeWeight} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}

        <div className="prompt-builder-history">
          <h3>保存履歴</h3>

          <form className="prompt-builder-history-form" onSubmit={handleSaveHistory}>
            <div className="prompt-builder-word-form-row">
              <input
                type="text"
                placeholder="名前"
                aria-label="履歴名"
                value={historyName}
                onChange={(event) => setHistoryName(event.target.value)}
              />
              <select
                aria-label="保存先"
                className="prompt-builder-tag-select"
                value={historyTarget}
                onChange={(event) => setHistoryTarget(event.target.value as PromptTargetId | '')}
              >
                <option value="" disabled>
                  保存先を選択してください
                </option>
                <TargetOptions />
              </select>
            </div>
            <button
              type="submit"
              disabled={
                outputItems.length === 0 ||
                historySaveStatus === 'saving' ||
                historyLoadStatus !== 'ready' ||
                historyTarget === '' ||
                historyName.trim() === ''
              }
            >
              履歴に保存
            </button>
          </form>

          {historySaveStatus === 'error' ? (
            <p className="prompt-builder-status-message prompt-builder-status-message-error" role="alert">
              {historySaveError}
            </p>
          ) : null}

          {historyLoadStatus === 'loading' ? <Spinner label="読み込み中…" /> : null}
          {historyLoadStatus === 'error' ? (
            <p className="prompt-builder-status-message prompt-builder-status-message-error" role="alert">
              {historyLoadError}
              <button type="button" onClick={loadHistory}>
                再読み込み
              </button>
            </p>
          ) : null}

          {historyLoadStatus === 'ready' ? (
            <>
              <div className="prompt-builder-word-filter">
                <select
                  aria-label="保存先で絞り込み"
                  className="prompt-builder-tag-filter-select"
                  value={historyFilterTarget}
                  onChange={(event) => setHistoryFilterTarget(event.target.value as TargetFilter)}
                >
                  <option value="ALL">ALL</option>
                  <TargetOptions />
                </select>
              </div>

              {historyFilterTarget === 'ALL' ? (
                groupedHistoryEntries.length === 0 ? (
                  <p className="prompt-builder-word-empty">保存履歴はありません。</p>
                ) : (
                  <div className="prompt-builder-tag-groups">
                    {groupedHistoryEntries.map((group) => (
                      <div key={group.id} className="prompt-builder-tag-group">
                        <div className="prompt-builder-tag-group-header">
                          <h3>{formatLabel(PROMPT_TARGET_LABELS[group.id])}</h3>
                        </div>
                        <ul className="prompt-builder-history-list">{group.items.map((entry) => renderHistoryRow(entry))}</ul>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <ul className="prompt-builder-history-list">
                  {visibleHistoryEntries.map((entry) => renderHistoryRow(entry))}
                  {visibleHistoryEntries.length === 0 ? (
                    <li className="prompt-builder-word-empty">該当する履歴がありません。</li>
                  ) : null}
                </ul>
              )}
            </>
          ) : null}
        </div>
      </section>
    </div>
  )
}
