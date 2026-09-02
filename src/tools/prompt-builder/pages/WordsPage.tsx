import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Spinner, useAlert, useConfirm } from '../../../components/feedback'
import { getWords, putWords } from '../api'
import { useGroupedFilter } from '../hooks/useGroupedFilter'
import { readOutputItems, writeOutputItems } from '../lib/outputStorage'
import { formatLabel } from '../shared/labels'
import { DEFAULT_TAG, PROMPT_TAG_IDS, PROMPT_TAG_LABELS, normalizeTag, type PromptTagId } from '../shared/tags'
import type { PromptWord } from '../shared/types'

type LoadStatus = 'loading' | 'ready' | 'error'
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
// 'ALL' = 全ワード表示（既定）、それ以外 = そのタグのみ表示。永続化しない。
type TagFilter = PromptTagId | 'ALL'

// ワード編集が止まってからこの時間だけアイドルしたら自動保存する（KV書き込み枠節約のためのデバウンス）
const AUTO_SAVE_DELAY_MS = 30_000

const createWord = (text: string, description: string, tag: PromptTagId): PromptWord => ({
  id: crypto.randomUUID(),
  text: text.trim(),
  description: description.trim(),
  tag,
})

const getWordTag = (word: PromptWord) => word.tag

// 登録・編集・絞り込みの各タグセレクトで共通の選択肢。プレースホルダや ALL は各 select 側で持つ。
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

  // 自動保存のタイマー発火時・アンマウント時の flush で最新値を参照するための ref（stale closure 対策）
  const wordsRef = useRef(words)
  wordsRef.current = words
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  // 直近で putWords に「成功」したスナップショット（参照）。保存の通信中の再編集や保存失敗後の遷移で、
  // アンマウント flush が「現在値が未保存か」を参照比較で判定するために持つ（失敗時は更新しない）。
  const lastSentRef = useRef<PromptWord[] | null>(null)
  // 実行中の putWords（保存は1度に1つ）。アンマウント flush をこの後ろに直列化して、古い保存が
  // 後着で最新を上書きするレースを防ぐために保持する。
  const inFlightRef = useRef<Promise<unknown> | null>(null)

  const [newText, setNewText] = useState('')
  const [newDescription, setNewDescription] = useState('')
  // プレースホルダ（未選択）を許すため '' を含む。登録時に '' なら弾く（後述 handleAddWord）。
  const [newTag, setNewTag] = useState<PromptTagId | ''>('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editTag, setEditTag] = useState<PromptTagId>(DEFAULT_TAG)

  // タグでの絞り込み。永続化しない（リロードのたびに既定の ALL に戻る）。
  const [filterTag, setFilterTag] = useState<TagFilter>('ALL')

  const loadWords = useCallback(async () => {
    setLoadStatus('loading')
    setLoadError(null)
    try {
      const data = await getWords()
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
  }, [])

  useEffect(() => {
    loadWords()
  }, [loadWords])

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

  // 絞り込みと ALL 表示用のタグ別グループ化（並び順は PROMPT_TAG_IDS の固定順・0件タグは除外）。
  const { visible: visibleWords, grouped: groupedWords } = useGroupedFilter(words, PROMPT_TAG_IDS, getWordTag, filterTag)

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
    // アンマウント flush が「この保存の後ろ」に直列化できるよう、in-flight の promise を保持する。
    const request = putWords(snapshot)
    inFlightRef.current = request
    try {
      await request
      // 送信に「成功」したスナップショットとして記録する（失敗時は記録しない＝アンマウント flush で
      // 再送させる）。保存中の再編集は wordsRef が別参照になるので、その後の遷移でも最新を送れる。
      lastSentRef.current = snapshot
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
    } finally {
      // 自分が最新の in-flight のときだけ解除する（後続保存に差し替わっていれば触らない）。
      if (inFlightRef.current === request) inFlightRef.current = null
    }
  }, [showAlert])

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

  // ページ切替（Routes の再マウント）で未保存の変更が失われないよう、アンマウント時に
  // best-effort で1回だけ flush する。state 更新は行わない。
  useEffect(() => {
    return () => {
      // 未保存の変更があり、かつ「最後に保存成功した内容」と現在値が参照で異なるなら best-effort で
      // 1回 flush する。これで (1) 保存の通信中に再編集して遷移したケースと (2) 保存失敗後に
      // 追加編集なしで遷移したケースの両方で、未保存の最新を送れる（保存成功済みと同参照なら送らない）。
      if (dirtyRef.current && wordsRef.current !== lastSentRef.current) {
        const pending = inFlightRef.current
        if (pending) {
          // in-flight の保存が確定してから、まだ現在値が保存されていない場合だけ送る。これで
          // A→B の順序を保証しつつ（古い保存 A が後着で最新を上書きするレースを回避）、A がその
          // まま現在値を保存したケースの二重送信（KV 書き込みの無駄）を防ぐ。A が失敗/古い内容
          // だったときは現在値を確実に送る（wordsRef はアンマウント後は不変）。
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
          <button type="submit" disabled={loadStatus !== 'ready' || !newText.trim() || newTag === ''}>
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
                <option value="ALL">ALL</option>
                <TagOptions />
              </select>
            </div>

            {filterTag === 'ALL' ? (
              groupedWords.length === 0 ? (
                <p className="pbuilder-word-empty">ワードが登録されていません。</p>
              ) : (
                <div className="pbuilder-tag-groups">
                  {groupedWords.map((group) => (
                    <div key={group.id} className="pbuilder-tag-group">
                      <div className="pbuilder-tag-group-header">
                        <h3>{formatLabel(PROMPT_TAG_LABELS[group.id])}</h3>
                      </div>
                      <ul className="pbuilder-word-list">{group.items.map((word) => renderWordRow(word))}</ul>
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
    </div>
  )
}
