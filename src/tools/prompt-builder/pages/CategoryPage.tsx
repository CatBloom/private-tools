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
import { getHistory, getWords, putHistory, putWords } from '../api'
import { SortableOutputItem } from '../components/SortableOutputItem'
import { buildOutput, clampWeight, reorder } from '../lib/notation'
import { readOutputItems, writeOutputItems } from '../lib/outputStorage'
import type { PromptCategoryId } from '../shared/categories'
import type { HistoryEntry, OutputItem, PromptWord } from '../shared/types'

type LoadStatus = 'loading' | 'ready' | 'error'
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
type CopyStatus = 'idle' | 'copied' | 'error'
type PageTab = 'words' | 'output'

// ワード編集が止まってからこの時間だけアイドルしたら自動保存する（KV書き込み枠節約のためのデバウンス）
const AUTO_SAVE_DELAY_MS = 30_000

const createWord = (text: string, description: string): PromptWord => ({
  id: crypto.randomUUID(),
  text: text.trim(),
  description: description.trim(),
})

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

export const CategoryPage = ({ category }: { category: PromptCategoryId }) => {
  const { showAlert } = useAlert()
  const { confirm } = useConfirm()
  const [tab, setTab] = useState<PageTab>('words')
  const [words, setWords] = useState<PromptWord[]>([])
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  // 自動保存のタイマー発火時・アンマウント時の flush で最新値を参照するための ref（stale closure 対策）
  const wordsRef = useRef(words)
  wordsRef.current = words
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const saveStatusRef = useRef(saveStatus)
  saveStatusRef.current = saveStatus

  const [newText, setNewText] = useState('')
  const [newDescription, setNewDescription] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editDescription, setEditDescription] = useState('')

  const [outputItems, setOutputItems] = useState<OutputItem[]>(() => readOutputItems(category))
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle')
  const outputTextRef = useRef<HTMLParagraphElement>(null)

  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([])
  const [historyLoadStatus, setHistoryLoadStatus] = useState<LoadStatus>('loading')
  const [historyLoadError, setHistoryLoadError] = useState<string | null>(null)
  const [historyName, setHistoryName] = useState('')
  const [historySaveStatus, setHistorySaveStatus] = useState<SaveStatus>('idle')
  const [historySaveError, setHistorySaveError] = useState<string | null>(null)
  const historySaveStatusRef = useRef(historySaveStatus)
  historySaveStatusRef.current = historySaveStatus

  const loadWords = useCallback(async () => {
    setLoadStatus('loading')
    setLoadError(null)
    try {
      const data = await getWords(category)
      // 読み込み中にユーザーが編集し始めていたら（dirty）、その編集を初期データで上書きしない。
      if (!dirtyRef.current) {
        setWords(data)
        setSaveStatus('idle')
      }
      setLoadStatus('ready')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '読み込みに失敗しました。')
      setLoadStatus('error')
    }
  }, [category])

  useEffect(() => {
    loadWords()
  }, [loadWords])

  const loadHistory = useCallback(async () => {
    setHistoryLoadStatus('loading')
    setHistoryLoadError(null)
    try {
      const entries = await getHistory(category)
      // 読み込み中に保存/削除が走っていたら、その結果を初期データで上書きしない。
      if (historySaveStatusRef.current !== 'saving') {
        setHistoryEntries(entries)
      }
      setHistoryLoadStatus('ready')
    } catch (error) {
      setHistoryLoadError(error instanceof Error ? error.message : '読み込みに失敗しました。')
      setHistoryLoadStatus('error')
    }
  }, [category])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  useEffect(() => {
    writeOutputItems(category, outputItems)
  }, [category, outputItems])

  useEffect(() => {
    if (copyStatus === 'idle') return
    const timer = window.setTimeout(() => setCopyStatus('idle'), 2000)
    return () => window.clearTimeout(timer)
  }, [copyStatus])

  // ワードを変更したときに呼ぶ。未保存フラグを立て、直前の保存結果表示（'saved'/'error'）を
  // 'idle' に戻して自動保存を再アームする（保存中は触らない）。
  const markWordsDirty = () => {
    setDirty(true)
    setSaveStatus((current) => (current === 'saving' ? current : 'idle'))
  }

  const handleAddWord = (event: FormEvent) => {
    event.preventDefault()
    const text = newText.trim()
    if (!text) return

    setWords((current) => [...current, createWord(text, newDescription)])
    markWordsDirty()
    setNewText('')
    setNewDescription('')
    showAlert('success', '追加しました')
  }

  const startEdit = (word: PromptWord) => {
    setEditingId(word.id)
    setEditText(word.text)
    setEditDescription(word.description)
  }

  const cancelEdit = () => setEditingId(null)

  const commitEdit = (id: string) => {
    const text = editText.trim()
    if (!text) return

    setWords((current) =>
      current.map((word) => (word.id === id ? { ...word, text, description: editDescription.trim() } : word)),
    )
    markWordsDirty()
    setEditingId(null)
  }

  const deleteWord = async (id: string) => {
    const confirmed = await confirm('このワードを削除しますか？', { title: '削除', danger: true })
    if (!confirmed) return

    setWords((current) => current.filter((word) => word.id !== id))
    markWordsDirty()
    showAlert('success', '削除しました')
  }

  // notify=true（手動「保存」ボタン）のときだけ成功トーストを出す。自動保存(debounce)は
  // notify=false でバックグラウンド扱い（トーストを出さない）。
  const saveWords = useCallback(
    async ({ notify = false }: { notify?: boolean } = {}) => {
      // 保存対象の配列参照をこの時点で固定する。putWords は送った配列をそのまま返すだけなので、
      // レスポンスで setWords し直す必要はない（むしろ通信中に増えた編集を上書きしてしまう）。
      const snapshot = wordsRef.current
      setSaveStatus('saving')
      setSaveError(null)
      try {
        await putWords(category, snapshot)
        if (wordsRef.current === snapshot) {
          // 通信中に編集が無ければ保存完了。
          setDirty(false)
          setSaveStatus('saved')
        } else {
          // 通信中にユーザーが追加/編集/削除していた（参照が変わった）。新しい変更を消さず、
          // dirty のままにして次の debounce で再保存させる（'saving' を解除するだけ）。
          setSaveStatus('idle')
        }
        if (notify) showAlert('success', '保存しました')
      } catch (error) {
        setSaveError(error instanceof Error ? error.message : '保存に失敗しました。')
        setSaveStatus('error')
      }
    },
    [category, showAlert],
  )

  // 未保存の変更が AUTO_SAVE_DELAY_MS だけアイドルしたら自動保存する。編集が続く限り words の
  // 変化で毎回タイマーを張り直し（＝アイドル時間で発火）、保存中は張らない（手動保存が saveStatus を
  // 'saving' にした時点でも同じ理由で pending タイマーは破棄される＝二重送信しない）。
  // 直前の自動保存が失敗（'error'）したら、そのまま定期的に再送し続けると KV の書き込み
  // クォータを浪費するため自動リトライしない。次のワード編集が saveStatus を 'idle' に戻して
  // 再アームする（手動「保存」でも復帰できる）。
  useEffect(() => {
    if (!dirty || saveStatus === 'saving' || saveStatus === 'error') return
    const timer = window.setTimeout(() => {
      saveWords()
    }, AUTO_SAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [dirty, words, saveStatus, saveWords])

  // 分類切替（index.tsx が key={category} で本コンポーネントを再マウントする）で未保存の変更が
  // 失われないよう、アンマウント時に best-effort で1回だけ flush する。state 更新は行わない。
  useEffect(() => {
    return () => {
      if (dirtyRef.current && saveStatusRef.current !== 'saving') {
        putWords(category, wordsRef.current).catch(() => {})
      }
    }
  }, [category])

  const addToOutput = (word: PromptWord) => {
    if (outputItems.some((item) => item.wordId === word.id)) {
      showAlert('info', '既に追加されています')
      return
    }

    setOutputItems((current) => [...current, { id: crypto.randomUUID(), wordId: word.id, text: word.text, weight: 0 }])
    showAlert('success', '出力に追加しました')
  }

  const removeOutputItem = (id: string) => {
    setOutputItems((current) => current.filter((item) => item.id !== id))
  }

  const changeWeight = (id: string, delta: number) => {
    setOutputItems((current) =>
      current.map((item) => (item.id === id ? { ...item, weight: clampWeight(item.weight + delta) } : item)),
    )
  }

  const clearOutput = () => setOutputItems([])

  const handleSaveHistory = async (event: FormEvent) => {
    event.preventDefault()
    if (outputItems.length === 0) return

    const newEntry: HistoryEntry = {
      id: crypto.randomUUID(),
      name: historyName.trim(),
      createdAt: new Date().toISOString(),
      items: outputItems,
    }

    setHistorySaveStatus('saving')
    setHistorySaveError(null)
    try {
      const saved = await putHistory(category, [...historyEntries, newEntry])
      setHistoryEntries(saved)
      setHistoryName('')
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
  }

  const deleteHistoryEntry = async (id: string) => {
    const confirmed = await confirm('この履歴を削除しますか？', { title: '削除', danger: true })
    if (!confirmed) return

    const remaining = historyEntries.filter((entry) => entry.id !== id)
    setHistorySaveStatus('saving')
    setHistorySaveError(null)
    try {
      const saved = await putHistory(category, remaining)
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

  const handleCopy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(outputText)
      setCopyStatus('copied')
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
      <div className="pbuilder-tabs" role="tablist" aria-label="ワード・出力切替">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'words'}
          className={`pbuilder-tab-button${tab === 'words' ? ' is-active' : ''}`}
          onClick={() => setTab('words')}
        >
          ワード
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'output'}
          className={`pbuilder-tab-button${tab === 'output' ? ' is-active' : ''}`}
          onClick={() => setTab('output')}
        >
          出力{outputItems.length > 0 ? <span className="pbuilder-tab-badge">{outputItems.length}</span> : null}
        </button>
      </div>

      {tab === 'words' ? (
      <section className="pbuilder-panel">
        <div className="pbuilder-panel-header">
          <h1>ワード一覧</h1>
          <div className="pbuilder-save-controls">
            <button type="button" disabled={!dirty || saveStatus === 'saving'} onClick={() => saveWords({ notify: true })}>
              {saveStatus === 'saving' ? '保存中…' : '保存'}
            </button>
            {dirty && saveStatus !== 'saving' ? <span className="pbuilder-dirty-badge">未保存の変更あり</span> : null}
          </div>
        </div>

        {saveStatus === 'error' ? (
          <p className="pbuilder-status-message pbuilder-status-message-error" role="alert">
            {saveError}
          </p>
        ) : null}

        <form className="pbuilder-word-form" onSubmit={handleAddWord}>
          <input
            type="text"
            placeholder="ワード"
            aria-label="ワード"
            value={newText}
            onChange={(event) => setNewText(event.target.value)}
          />
          <input
            type="text"
            placeholder="説明（任意）"
            aria-label="説明"
            value={newDescription}
            onChange={(event) => setNewDescription(event.target.value)}
          />
          <button type="submit" disabled={!newText.trim()}>
            追加
          </button>
        </form>

        {loadStatus === 'loading' ? <Spinner label="読み込み中…" /> : null}
        {loadStatus === 'error' ? (
          <p className="pbuilder-status-message pbuilder-status-message-error" role="alert">
            {loadError}
            <button type="button" onClick={loadWords}>
              再読み込み
            </button>
          </p>
        ) : null}

        {loadStatus === 'ready' ? (
          <ul className="pbuilder-word-list">
            {words.map((word) =>
              editingId === word.id ? (
                <li key={word.id} className="pbuilder-word-row is-editing">
                  <input
                    type="text"
                    aria-label="ワード"
                    value={editText}
                    onChange={(event) => setEditText(event.target.value)}
                  />
                  <input
                    type="text"
                    aria-label="説明"
                    value={editDescription}
                    onChange={(event) => setEditDescription(event.target.value)}
                  />
                  <div className="pbuilder-word-row-actions">
                    <button type="button" disabled={!editText.trim()} onClick={() => commitEdit(word.id)}>
                      保存
                    </button>
                    <button type="button" onClick={cancelEdit}>
                      キャンセル
                    </button>
                  </div>
                </li>
              ) : (
                <li key={word.id} className="pbuilder-word-row">
                  <div className="pbuilder-word-row-text">
                    <span className="pbuilder-word-text">{word.text}</span>
                    {word.description ? <span className="pbuilder-word-description">{word.description}</span> : null}
                  </div>
                  <div className="pbuilder-word-row-actions">
                    <button type="button" onClick={() => addToOutput(word)}>
                      出力に追加
                    </button>
                    <div className="pbuilder-word-row-actions-secondary">
                      <button type="button" onClick={() => startEdit(word)}>
                        編集
                      </button>
                      <button type="button" className="pbuilder-danger-button" onClick={() => deleteWord(word.id)}>
                        削除
                      </button>
                    </div>
                  </div>
                </li>
              ),
            )}
            {words.length === 0 ? <li className="pbuilder-word-empty">ワードが登録されていません。</li> : null}
          </ul>
        ) : null}
      </section>
      ) : null}

      {tab === 'output' ? (
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
          <p className="pbuilder-empty">一覧のワードを選ぶとここに追加されます。</p>
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
            <input
              type="text"
              placeholder="名前（任意）"
              aria-label="履歴名"
              value={historyName}
              onChange={(event) => setHistoryName(event.target.value)}
            />
            <button type="submit" disabled={outputItems.length === 0 || historySaveStatus === 'saving'}>
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
            <ul className="pbuilder-history-list">
              {historyEntries.map((entry) => (
                <li key={entry.id} className="pbuilder-history-row">
                  <div className="pbuilder-history-label">
                    <span className="pbuilder-history-date">{formatHistoryDate(entry.createdAt)}</span>
                    {entry.name ? <span className="pbuilder-history-name">{entry.name}</span> : null}
                  </div>
                  <div className="pbuilder-history-row-actions">
                    <button type="button" onClick={() => restoreHistoryEntry(entry)}>
                      復元
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
              ))}
              {historyEntries.length === 0 ? <li className="pbuilder-word-empty">保存履歴はありません。</li> : null}
            </ul>
          ) : null}
        </div>
      </section>
      ) : null}
    </div>
  )
}
