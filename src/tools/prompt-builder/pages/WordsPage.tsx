import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Spinner, useAlert, useConfirm } from '../../../components/feedback'
import { RowMenu } from '../../../components/RowMenu'
import { getWords, putWords } from '../api'
import { useGroupedFilter } from '../hooks/useGroupedFilter'
import { readOutputItems, writeOutputItems } from '../lib/outputStorage'
import { formatLabel } from '../shared/labels'
import { DEFAULT_TAG, PROMPT_TAG_IDS, PROMPT_TAG_LABELS, normalizeTag, type PromptTagId } from '../shared/tags'
import type { PromptWord } from '../shared/types'

type LoadStatus = 'loading' | 'ready' | 'error'
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
type TagFilter = PromptTagId | 'ALL'

// KV書き込み枠節約のためのデバウンス間隔（編集停止からこの時間で自動保存）
const AUTO_SAVE_DELAY_MS = 30_000

const createWord = (text: string, description: string, tag: PromptTagId): PromptWord => ({
  id: crypto.randomUUID(),
  text: text.trim(),
  description: description.trim(),
  tag,
})

const getWordTag = (word: PromptWord) => word.tag

const TagOptions = () => (
  <>
    {PROMPT_TAG_IDS.map((tag) => (
      <option key={tag} value={tag}>
        {formatLabel(PROMPT_TAG_LABELS[tag])}
      </option>
    ))}
  </>
)

export const WordsPage = () => {
  const { showAlert } = useAlert()
  const { confirm } = useConfirm()
  const [words, setWords] = useState<PromptWord[]>([])
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)

  // タイマー発火時・アンマウント時の flush から最新値を参照するための ref（stale closure 対策）
  const wordsRef = useRef(words)
  wordsRef.current = words
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  // putWords に成功した直近のスナップショット参照。アンマウント flush が未保存かを参照比較で判定する。
  const lastSentRef = useRef<PromptWord[] | null>(null)
  // 実行中の putWords。アンマウント flush をこの後ろに直列化し、古い保存が後着で最新を上書きしないようにする。
  const inFlightRef = useRef<Promise<unknown> | null>(null)

  const [newText, setNewText] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newTag, setNewTag] = useState<PromptTagId | ''>('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editTag, setEditTag] = useState<PromptTagId>(DEFAULT_TAG)

  const [filterTag, setFilterTag] = useState<TagFilter>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  const loadWords = useCallback(async () => {
    setLoadStatus('loading')
    setLoadError(null)
    try {
      const data = await getWords()
      // 読み込み中に編集が始まっていたら（dirty）、初期データで上書きしない。
      if (!dirtyRef.current) {
        setWords(data.map((word) => ({ ...word, tag: normalizeTag(word.tag) })))
        setSaveStatus('idle')
      }
      setLoadStatus('ready')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '読み込みに失敗しました。')
      setLoadStatus('error')
    }
  }, [])

  useEffect(() => {
    loadWords()
  }, [loadWords])

  const markWordsDirty = () => {
    setDirty(true)
    setSaveStatus((current) => (current === 'saving' ? current : 'idle'))
  }

  const handleAddWord = (event: FormEvent) => {
    event.preventDefault()
    // 初回ロード完了前に追加すると、保存時に KV 上の既存ワードを「追加した1件だけ」で置き換えてしまう。
    if (loadStatus !== 'ready') return
    const text = newText.trim()
    if (!text) return
    if (newTag === '') return

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

  const searchedWords = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return words
    return words.filter(
      (word) => word.text.toLowerCase().includes(query) || word.description.toLowerCase().includes(query),
    )
  }, [words, searchQuery])

  const { visible: visibleWords, grouped: groupedWords } = useGroupedFilter(
    searchedWords,
    PROMPT_TAG_IDS,
    getWordTag,
    filterTag,
  )

  const deleteWord = async (id: string) => {
    const confirmed = await confirm('このワードを削除しますか？', { title: '削除', danger: true })
    if (!confirmed) return

    setWords((current) => current.filter((word) => word.id !== id))
    markWordsDirty()
    showAlert('success', '削除しました')
  }

  const saveWords = useCallback(async () => {
    // 送信後に増えた編集で上書きしないよう、送信対象の参照をここで固定する。
    const snapshot = wordsRef.current
    setSaveStatus('saving')
    setSaveError(null)
    const request = putWords(snapshot)
    inFlightRef.current = request
    try {
      await request
      lastSentRef.current = snapshot
      if (wordsRef.current === snapshot) {
        setDirty(false)
        setSaveStatus('saved')
        showAlert('success', '保存しました')
      } else {
        // 送信中に編集されていた（参照が変わった）。dirty のままにして次の debounce で再保存させる。
        setSaveStatus('idle')
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存に失敗しました。')
      setSaveStatus('error')
    } finally {
      if (inFlightRef.current === request) inFlightRef.current = null
    }
  }, [showAlert])

  // 保存失敗後は自動リトライしない（放置すると KV 書き込みクォータを浪費する）。次の編集が
  // saveStatus を 'idle' に戻して再アームする。
  useEffect(() => {
    if (!dirty || saveStatus === 'saving' || saveStatus === 'error') return
    const timer = window.setTimeout(() => {
      saveWords()
    }, AUTO_SAVE_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [dirty, words, saveStatus, saveWords])

  // ページ切替時に未保存分を失わないよう、アンマウント時に best-effort で1回だけ flush する。
  useEffect(() => {
    return () => {
      if (dirtyRef.current && wordsRef.current !== lastSentRef.current) {
        const pending = inFlightRef.current
        if (pending) {
          // in-flight の保存確定後に送ることで、古い保存が後着で最新を上書きするレースを避ける。
          pending.catch(() => {}).then(() => {
            if (wordsRef.current !== lastSentRef.current) putWords(wordsRef.current).catch(() => {})
          })
        } else {
          putWords(wordsRef.current).catch(() => {})
        }
      }
    }
  }, [])

  const addToOutput = (word: PromptWord) => {
    const current = readOutputItems()
    if (current.some((item) => item.wordId === word.id)) {
      showAlert('info', '既に追加されています')
      return
    }

    writeOutputItems([...current, { id: crypto.randomUUID(), wordId: word.id, text: word.text, weight: 0 }])
    showAlert('success', '出力に追加しました')
  }

  const renderWordRow = (word: PromptWord) =>
    editingId === word.id ? (
      <li key={word.id} className="prompt-builder-row prompt-builder-word-row is-editing">
        <input
          type="text"
          aria-label="ワード"
          value={editText}
          onChange={(event) => setEditText(event.target.value)}
        />
        <div className="prompt-builder-word-form-row">
          <input
            type="text"
            aria-label="説明"
            value={editDescription}
            onChange={(event) => setEditDescription(event.target.value)}
          />
          <select
            aria-label="タグ"
            className="prompt-builder-tag-select"
            value={editTag}
            onChange={(event) => setEditTag(event.target.value as PromptTagId)}
          >
            <TagOptions />
          </select>
        </div>
        <div className="prompt-builder-word-row-actions">
          <button type="button" disabled={!editText.trim()} onClick={() => commitEdit(word.id)}>
            保存
          </button>
          <button type="button" onClick={cancelEdit}>
            キャンセル
          </button>
        </div>
      </li>
    ) : (
      <li key={word.id} className="prompt-builder-row prompt-builder-word-row">
        <button
          type="button"
          className="prompt-builder-word-row-text prompt-builder-word-row-button"
          aria-label={`${word.text}を出力に追加`}
          onClick={() => addToOutput(word)}
        >
          <span className="prompt-builder-word-text">{word.text}</span>
          {word.description ? <span className="prompt-builder-word-description">{word.description}</span> : null}
        </button>
        <div className="prompt-builder-word-row-actions">
          <RowMenu
            items={[
              { key: 'edit', label: '編集', onClick: () => startEdit(word) },
              { key: 'delete', label: '削除', onClick: () => deleteWord(word.id), danger: true },
            ]}
          />
        </div>
      </li>
    )

  return (
    <div className="prompt-builder-page-stack">
      <section className="prompt-builder-panel">
        <div className="prompt-builder-panel-header">
          <h1>ワード一覧</h1>
          <div className="prompt-builder-save-controls">
            <button type="button" disabled={!dirty || saveStatus === 'saving'} onClick={() => saveWords()}>
              {saveStatus === 'saving' ? '保存中…' : '保存'}
            </button>
            {dirty && saveStatus !== 'saving' ? <span className="prompt-builder-dirty-badge">未保存の変更あり</span> : null}
          </div>
        </div>

        {saveStatus === 'error' ? (
          <p className="prompt-builder-status-message prompt-builder-status-message-error" role="alert">
            {saveError}
          </p>
        ) : null}

        <form className="prompt-builder-word-form" onSubmit={handleAddWord}>
          <input
            type="text"
            placeholder="ワード"
            aria-label="ワード"
            value={newText}
            disabled={loadStatus !== 'ready'}
            onChange={(event) => setNewText(event.target.value)}
          />
          <div className="prompt-builder-word-form-row">
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
              className="prompt-builder-tag-select"
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
          <button type="submit" disabled={loadStatus !== 'ready' || !newText.trim() || newTag === ''}>
            追加
          </button>
        </form>

        {loadStatus === 'loading' ? <Spinner label="読み込み中…" /> : null}
        {loadStatus === 'error' ? (
          <p className="prompt-builder-status-message prompt-builder-status-message-error" role="alert">
            {loadError}
            <button type="button" onClick={loadWords}>
              再読み込み
            </button>
          </p>
        ) : null}

        {loadStatus === 'ready' ? (
          <>
            <div className="prompt-builder-word-filter prompt-builder-word-filter-search">
              <select
                aria-label="タグで絞り込み"
                className="prompt-builder-tag-filter-select"
                value={filterTag}
                onChange={(event) => setFilterTag(event.target.value as TagFilter)}
              >
                <option value="ALL">ALL</option>
                <TagOptions />
              </select>
              <input
                type="text"
                className="prompt-builder-word-search"
                aria-label="名前・説明で検索"
                placeholder="名前・説明で検索"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </div>

            {filterTag === 'ALL' ? (
              groupedWords.length === 0 ? (
                <p className="prompt-builder-word-empty">
                  {words.length === 0 ? 'ワードが登録されていません。' : '該当するワードがありません。'}
                </p>
              ) : (
                <div className="prompt-builder-tag-groups">
                  {groupedWords.map((group) => (
                    <div key={group.id} className="prompt-builder-tag-group">
                      <div className="prompt-builder-tag-group-header">
                        <h3>{formatLabel(PROMPT_TAG_LABELS[group.id])}</h3>
                      </div>
                      <ul className="prompt-builder-word-list">{group.items.map((word) => renderWordRow(word))}</ul>
                    </div>
                  ))}
                </div>
              )
            ) : (
              <ul className="prompt-builder-word-list">
                {visibleWords.map((word) => renderWordRow(word))}
                {visibleWords.length === 0 ? (
                  <li className="prompt-builder-word-empty">該当するワードがありません。</li>
                ) : null}
              </ul>
            )}
          </>
        ) : null}
      </section>
    </div>
  )
}
