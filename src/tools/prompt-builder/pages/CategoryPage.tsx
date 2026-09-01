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
import { DEFAULT_TAG, PROMPT_TAG_IDS, PROMPT_TAG_LABELS, normalizeTag, type PromptTagId } from '../shared/tags'
import type { HistoryEntry, OutputItem, PromptWord } from '../shared/types'

type LoadStatus = 'loading' | 'ready' | 'error'
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
type CopyStatus = 'idle' | 'copied' | 'error'
type PageTab = 'words' | 'output'
// '' = 未選択（一覧を隠す）、'ALL' = 全ワード表示、それ以外 = そのタグのみ表示。永続化しない。
type TagFilter = PromptTagId | 'ALL' | ''

// ワード編集が止まってからこの時間だけアイドルしたら自動保存する（KV書き込み枠節約のためのデバウンス）
const AUTO_SAVE_DELAY_MS = 30_000

const createWord = (text: string, description: string, tag: PromptTagId): PromptWord => ({
  id: crypto.randomUUID(),
  text: text.trim(),
  description: description.trim(),
  tag,
})

// 登録・編集・絞り込みの各タグセレクトで共通の選択肢。プレースホルダや ALL は各 select 側で持つ。
const TagOptions = () => (
  <>
    {PROMPT_TAG_IDS.map((tag) => (
      <option key={tag} value={tag}>
        {PROMPT_TAG_LABELS[tag]}
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
  // プレースホルダ（未選択）を許すため '' を含む。登録時に '' なら弾く（後述 handleAddWord）。
  const [newTag, setNewTag] = useState<PromptTagId | ''>('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editTag, setEditTag] = useState<PromptTagId>(DEFAULT_TAG)

  // タグでの絞り込み。永続化しない（リロードのたびに未選択＝一覧非表示に戻る）。
  const [filterTag, setFilterTag] = useState<TagFilter>('')

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

  // 履歴の名前だけをインライン編集する（historyName は新規保存フォーム用なので別 state）。
  const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null)
  const [editHistoryName, setEditHistoryName] = useState('')

  const loadWords = useCallback(async () => {
    setLoadStatus('loading')
    setLoadError(null)
    try {
      const data = await getWords(category)
      // 読み込み中にユーザーが編集し始めていたら（dirty）、その編集を初期データで上書きしない。
      if (!dirtyRef.current) {
        // タグ無し（旧データ）を安全側の既定タグへ寄せてから state に入れる。
        setWords(data.map((word) => ({ ...word, tag: normalizeTag(word.tag) })))
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
    // 初回ロードが完了するまでは編集させない。空/未取得の一覧に追加すると、その後の保存で
    // KV 上の既存ワードを「追加した1件だけ」で丸ごと置き換えてしまうため。
    if (loadStatus !== 'ready') return
    const text = newText.trim()
    if (!text) return
    if (newTag === '') {
      showAlert('error', 'タグを選択してください')
      return
    }

    setWords((current) => [...current, createWord(text, newDescription, newTag)])
    markWordsDirty()
    setNewText('')
    setNewDescription('')
    setNewTag('')
    showAlert('success', '追加しました')
  }

  const startEdit = (word: PromptWord) => {
    setEditingId(word.id)
    setEditText(word.text)
    setEditDescription(word.description)
    setEditTag(word.tag)
  }

  const cancelEdit = () => setEditingId(null)

  const commitEdit = (id: string) => {
    const text = editText.trim()
    if (!text) return

    setWords((current) =>
      current.map((word) => (word.id === id ? { ...word, text, description: editDescription.trim(), tag: editTag } : word)),
    )
    markWordsDirty()
    setEditingId(null)
  }

  // フィルタ選択に応じて表示するワードを絞り込む。未選択（''）は一覧を隠すシグナルとして null を返す。
  const visibleWords = useMemo(() => {
    if (filterTag === '') return null
    if (filterTag === 'ALL') return words
    return words.filter((word) => word.tag === filterTag)
  }, [words, filterTag])

  // ALL 表示専用: タグごとにグループ化する（並び順は PROMPT_TAG_IDS の固定順、並び替えなし）。
  // 0件のタグは描画しないのでここで除外しておく。
  const groupedWords = useMemo(
    () =>
      PROMPT_TAG_IDS.map((tag) => ({ tag, words: words.filter((word) => word.tag === tag) })).filter(
        (group) => group.words.length > 0,
      ),
    [words],
  )

  const deleteWord = async (id: string) => {
    const confirmed = await confirm('このワードを削除しますか？', { title: '削除', danger: true })
    if (!confirmed) return

    setWords((current) => current.filter((word) => word.id !== id))
    markWordsDirty()
    showAlert('success', '削除しました')
  }

  const saveWords = useCallback(async () => {
    // 保存対象の配列参照をこの時点で固定する。putWords は送った配列をそのまま返すだけなので、
    // レスポンスで setWords し直す必要はない（むしろ通信中に増えた編集を上書きしてしまう）。
    const snapshot = wordsRef.current
    setSaveStatus('saving')
    setSaveError(null)
    try {
      await putWords(category, snapshot)
      if (wordsRef.current === snapshot) {
        // 通信中に編集が無ければ保存完了。手動・自動どちらの保存でも成功トーストを出す。
        setDirty(false)
        setSaveStatus('saved')
        showAlert('success', '保存しました')
      } else {
        // 通信中にユーザーが追加/編集/削除していた（参照が変わった）。新しい変更を消さず、
        // dirty のままにして次の debounce で再保存させる（'saving' を解除するだけ・通知なし）。
        setSaveStatus('idle')
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存に失敗しました。')
      setSaveStatus('error')
    }
  }, [category, showAlert])

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
    // 履歴の初回ロードが終わるまでは保存させない。未取得（historyEntries=[]）のまま PUT すると
    // KV 上の既存履歴を新規1件で丸ごと置き換えてしまうため。
    if (historyLoadStatus !== 'ready') return

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

  const startEditHistory = (entry: HistoryEntry) => {
    if (historyLoadStatus !== 'ready') return
    setEditingHistoryId(entry.id)
    setEditHistoryName(entry.name)
  }

  const cancelEditHistory = () => setEditingHistoryId(null)

  const renameHistoryEntry = async (id: string) => {
    if (historyLoadStatus !== 'ready') return

    // name のみ書き換える。items/createdAt/id はそのまま維持する。
    const updated = historyEntries.map((entry) =>
      entry.id === id ? { ...entry, name: editHistoryName.trim() } : entry,
    )
    setHistorySaveStatus('saving')
    setHistorySaveError(null)
    try {
      const saved = await putHistory(category, updated)
      setHistoryEntries(saved)
      setEditingHistoryId(null)
      setHistorySaveStatus('idle')
      showAlert('success', '名前を変更しました')
    } catch (error) {
      const message = error instanceof Error ? error.message : '名前の変更に失敗しました。'
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

  // ワード一行の描画。ALL 表示（タググループ内）と単一タグ絞り込み（フラット表示）の両方で使う。
  const renderWordRow = (word: PromptWord) =>
    editingId === word.id ? (
      <li key={word.id} className="pbuilder-word-row is-editing">
        <input
          type="text"
          aria-label="ワード"
          value={editText}
          onChange={(event) => setEditText(event.target.value)}
        />
        <div className="pbuilder-word-form-row">
          <input
            type="text"
            aria-label="説明"
            value={editDescription}
            onChange={(event) => setEditDescription(event.target.value)}
          />
          <select
            aria-label="タグ"
            className="pbuilder-tag-select"
            value={editTag}
            onChange={(event) => setEditTag(event.target.value as PromptTagId)}
          >
            <TagOptions />
          </select>
        </div>
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
    )

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
            <button type="button" disabled={!dirty || saveStatus === 'saving'} onClick={() => saveWords()}>
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
            disabled={loadStatus !== 'ready'}
            onChange={(event) => setNewText(event.target.value)}
          />
          <div className="pbuilder-word-form-row">
            <input
              type="text"
              placeholder="説明（任意）"
              aria-label="説明"
              value={newDescription}
              disabled={loadStatus !== 'ready'}
              onChange={(event) => setNewDescription(event.target.value)}
            />
            <select
              aria-label="タグ"
              className="pbuilder-tag-select"
              value={newTag}
              disabled={loadStatus !== 'ready'}
              onChange={(event) => setNewTag(event.target.value as PromptTagId | '')}
            >
              <option value="" disabled>
                タグを選択してください
              </option>
              <TagOptions />
            </select>
          </div>
          <button type="submit" disabled={loadStatus !== 'ready' || !newText.trim()}>
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
          <>
            <div className="pbuilder-word-filter">
              <select
                aria-label="タグで絞り込み"
                className="pbuilder-tag-filter-select"
                value={filterTag}
                onChange={(event) => setFilterTag(event.target.value as TagFilter)}
              >
                <option value="">タグで絞り込み</option>
                <option value="ALL">ALL</option>
                <TagOptions />
              </select>
            </div>

            {visibleWords === null ? (
              <p className="pbuilder-word-empty">タグを選択してください。</p>
            ) : filterTag === 'ALL' ? (
              groupedWords.length === 0 ? (
                <p className="pbuilder-word-empty">ワードが登録されていません。</p>
              ) : (
                <div className="pbuilder-tag-groups">
                  {groupedWords.map((group) => (
                    <div key={group.tag} className="pbuilder-tag-group">
                      <div className="pbuilder-tag-group-header">
                        <h3>{PROMPT_TAG_LABELS[group.tag]}</h3>
                      </div>
                      <ul className="pbuilder-word-list">{group.words.map((word) => renderWordRow(word))}</ul>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <ul className="pbuilder-word-list">
                {visibleWords.map((word) => renderWordRow(word))}
                {visibleWords.length === 0 ? (
                  <li className="pbuilder-word-empty">該当するワードがありません。</li>
                ) : null}
              </ul>
            )}
          </>
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
            <button
              type="submit"
              disabled={outputItems.length === 0 || historySaveStatus === 'saving' || historyLoadStatus !== 'ready'}
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
            <ul className="pbuilder-history-list">
              {historyEntries.map((entry) =>
                editingHistoryId === entry.id ? (
                  <li key={entry.id} className="pbuilder-history-row is-editing">
                    <input
                      type="text"
                      aria-label="履歴名"
                      value={editHistoryName}
                      onChange={(event) => setEditHistoryName(event.target.value)}
                    />
                    <div className="pbuilder-history-row-actions">
                      <button type="button" disabled={historySaveStatus === 'saving'} onClick={() => renameHistoryEntry(entry.id)}>
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
                      <button
                        type="button"
                        disabled={historySaveStatus === 'saving'}
                        onClick={() => startEditHistory(entry)}
                      >
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
                ),
              )}
              {historyEntries.length === 0 ? <li className="pbuilder-word-empty">保存履歴はありません。</li> : null}
            </ul>
          ) : null}
        </div>
      </section>
      ) : null}
    </div>
  )
}
