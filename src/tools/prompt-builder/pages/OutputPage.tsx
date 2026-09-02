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
// 履歴一覧の絞り込み。'ALL' は全件表示（既定）、それ以外はその target のみ表示。永続化しない。
type TargetFilter = PromptTargetId | 'ALL'

const getEntryTarget = (entry: HistoryEntry) => entry.target

// 編集・保存フォーム・絞り込みの各 target セレクトで共通の選択肢（ワード側の TagOptions と同じパターン）。
// プレースホルダや ALL は各 select 側で持つ。
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
  // 月日・時分秒を2桁ゼロ埋めして各行の桁を揃える（例: 2026/08/31 02:22:27）
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

  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([])
  const [historyLoadStatus, setHistoryLoadStatus] = useState<LoadStatus>('loading')
  const [historyLoadError, setHistoryLoadError] = useState<string | null>(null)
  const [historyName, setHistoryName] = useState('')
  // プレースホルダ（未選択）を許すため '' を含む。保存時に '' なら送信させない（後述 handleSaveHistory）。
  const [historyTarget, setHistoryTarget] = useState<PromptTargetId | ''>('')
  const [historySaveStatus, setHistorySaveStatus] = useState<SaveStatus>('idle')
  const [historySaveError, setHistorySaveError] = useState<string | null>(null)
  const historySaveStatusRef = useRef(historySaveStatus)
  historySaveStatusRef.current = historySaveStatus

  // 履歴の名前とターゲットをインライン編集する（historyName/historyTarget は新規保存フォーム用なので別 state）。
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null)
  const [editHistoryName, setEditHistoryName] = useState('')
  const [editHistoryTarget, setEditHistoryTarget] = useState<PromptTargetId>(PROMPT_TARGET_IDS[0])

  // 履歴一覧の絞り込み。既定は全件表示。
  const [historyFilterTarget, setHistoryFilterTarget] = useState<TargetFilter>('ALL')

  const loadHistory = useCallback(async () => {
    setHistoryLoadStatus('loading')
    setHistoryLoadError(null)
    try {
      const entries = await getHistory()
      // 読み込み中に保存/削除が走っていたら、その結果を初期データで上書きしない。
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
    // 履歴の初回ロードが終わるまでは保存させない。未取得（historyEntries=[]）のまま PUT すると
    // KV 上の既存履歴を新規1件で丸ごと置き換えてしまうため。
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

  const restoreHistoryEntry = (entry: HistoryEntry) => {
    setOutputItems(entry.items)
    showAlert('success', '復元しました')
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

    // name と target を書き換える。items/createdAt/id はそのまま維持する。
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

  // 絞り込みと ALL 表示用の target 別グループ化（並び順は PROMPT_TARGET_IDS の固定順・0件 target は除外）。
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

  // 履歴一行の描画。ALL 表示（ターゲットグループ内）と特定ターゲット絞り込み（フラット表示）の
  // 両方で使う（ワード一覧の renderWordRow と同じ構造）。
  const renderHistoryRow = (entry: HistoryEntry) =>
    editingHistoryId === entry.id ? (
      <li key={entry.id} className="pbuilder-history-row is-editing">
        <div className="pbuilder-word-form-row">
          <input
            type="text"
            aria-label="履歴名"
            value={editHistoryName}
            onChange={(event) => setEditHistoryName(event.target.value)}
          />
          <select
            aria-label="保存先"
            className="pbuilder-tag-select"
            value={editHistoryTarget}
            onChange={(event) => setEditHistoryTarget(event.target.value as PromptTargetId)}
          >
            <TargetOptions />
          </select>
        </div>
        <div className="pbuilder-history-row-actions">
          <button type="button" disabled={historySaveStatus === 'saving'} onClick={() => commitHistoryEdit(entry.id)}>
            保存
          </button>
          <button type="button" onClick={cancelEditHistory}>
            キャンセル
          </button>
        </div>
      </li>
    ) : (
      <li key={entry.id} className="pbuilder-history-row">
        <div className="pbuilder-history-label">
          <span className="pbuilder-history-date">{formatHistoryDate(entry.createdAt)}</span>
          {entry.name ? <span className="pbuilder-history-name">{entry.name}</span> : null}
        </div>
        <div className="pbuilder-history-row-actions">
          <button type="button" onClick={() => restoreHistoryEntry(entry)}>
            復元
          </button>
          <button type="button" disabled={historySaveStatus === 'saving'} onClick={() => startEditHistory(entry)}>
            編集
          </button>
          <button
            type="button"
            className="pbuilder-danger-button"
            disabled={historySaveStatus === 'saving'}
            onClick={() => deleteHistoryEntry(entry.id)}
          >
            削除
          </button>
        </div>
      </li>
    )

  const handleCopy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(outputText)
      showAlert('success', 'コピーしました')
    } catch {
      // クリップボード API が使えない環境では、選択状態にしてユーザーが手動コピーできるようにする
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
  }

  return (
    <div className="pbuilder-page-stack">
      <section className="pbuilder-panel">
        <div className="pbuilder-panel-header">
          <h2>出力欄</h2>
          <button type="button" disabled={outputItems.length === 0} onClick={clearOutput}>
            クリア
          </button>
        </div>

        {/* 出力結果とコピーボタンを一番上に置き、下の並べ替えリストを見なくてもコピーできるようにする。 */}
        <div className="pbuilder-output-preview">
          <p className="pbuilder-output-text" ref={outputTextRef}>
            {outputText || '（出力はまだありません）'}
          </p>
          <div className="pbuilder-output-preview-actions">
            <button
              type="button"
              className="pbuilder-copy-button"
              disabled={outputItems.length === 0}
              onClick={handleCopy}
            >
              コピー
            </button>
            {copyStatus === 'error' ? (
              <span className="pbuilder-copy-feedback pbuilder-copy-feedback-error" role="alert">
                コピーできませんでした。選択済みのテキストを手動でコピーしてください。
              </span>
            ) : null}
          </div>
        </div>

        {outputItems.length === 0 ? (
          <p className="pbuilder-empty">ワード一覧から選ぶとここに追加されます。</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={outputItems.map((item) => item.id)} strategy={verticalListSortingStrategy}>
              <ul className="pbuilder-output-list">
                {outputItems.map((item) => (
                  <SortableOutputItem key={item.id} item={item} onRemove={removeOutputItem} onWeightChange={changeWeight} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}

        <div className="pbuilder-history">
          <h3>保存履歴</h3>

          <form className="pbuilder-history-form" onSubmit={handleSaveHistory}>
            <div className="pbuilder-word-form-row">
              <input
                type="text"
                placeholder="名前（任意）"
                aria-label="履歴名"
                value={historyName}
                onChange={(event) => setHistoryName(event.target.value)}
              />
              <select
                aria-label="保存先"
                className="pbuilder-tag-select"
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
                historyTarget === ''
              }
            >
              履歴に保存
            </button>
          </form>

          {historySaveStatus === 'error' ? (
            <p className="pbuilder-status-message pbuilder-status-message-error" role="alert">
              {historySaveError}
            </p>
          ) : null}

          {historyLoadStatus === 'loading' ? <Spinner label="読み込み中…" /> : null}
          {historyLoadStatus === 'error' ? (
            <p className="pbuilder-status-message pbuilder-status-message-error" role="alert">
              {historyLoadError}
              <button type="button" onClick={loadHistory}>
                再読み込み
              </button>
            </p>
          ) : null}

          {historyLoadStatus === 'ready' ? (
            <>
              <div className="pbuilder-word-filter">
                <select
                  aria-label="保存先で絞り込み"
                  className="pbuilder-tag-filter-select"
                  value={historyFilterTarget}
                  onChange={(event) => setHistoryFilterTarget(event.target.value as TargetFilter)}
                >
                  <option value="ALL">ALL</option>
                  <TargetOptions />
                </select>
              </div>

              {historyFilterTarget === 'ALL' ? (
                groupedHistoryEntries.length === 0 ? (
                  <p className="pbuilder-word-empty">保存履歴はありません。</p>
                ) : (
                  <div className="pbuilder-tag-groups">
                    {groupedHistoryEntries.map((group) => (
                      <div key={group.id} className="pbuilder-tag-group">
                        <div className="pbuilder-tag-group-header">
                          <h3>{formatLabel(PROMPT_TARGET_LABELS[group.id])}</h3>
                        </div>
                        <ul className="pbuilder-history-list">{group.items.map((entry) => renderHistoryRow(entry))}</ul>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <ul className="pbuilder-history-list">
                  {visibleHistoryEntries.map((entry) => renderHistoryRow(entry))}
                  {visibleHistoryEntries.length === 0 ? (
                    <li className="pbuilder-word-empty">該当する履歴がありません。</li>
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
