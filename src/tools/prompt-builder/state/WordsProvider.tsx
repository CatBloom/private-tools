import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAlert } from '../../../components/feedback'
import { useRevalidateOnReturn } from '../../../hooks/useRevalidateOnReturn'
import { useAutoSave, type SaveStatus } from '../hooks/useAutoSave'
import { getWords, putWords } from '../api'
import { MAX_WORDS } from '../shared/limits'
import { normalizeTag, type PromptTagId } from '../shared/tags'
import type { PromptWord } from '../shared/types'

export type { SaveStatus }
export type LoadStatus = 'loading' | 'ready' | 'error'
export type AddWordsResult = { ok: true } | { ok: false; reason: 'limit' | 'not-ready' }
export type WordActionResult = { ok: true } | { ok: false; reason: 'not-ready' }
export type WordDraft = { text: string; description: string; tag: PromptTagId }

const AUTO_SAVE_DELAY_MS = 30_000

const createWord = (draft: WordDraft): PromptWord => ({
  id: crypto.randomUUID(),
  text: draft.text.trim(),
  description: draft.description.trim(),
  tag: draft.tag,
})

type WordsContextValue = {
  words: PromptWord[]
  loadStatus: LoadStatus
  loadError: string | null
  reloadWords: () => void
  dirty: boolean
  saveStatus: SaveStatus
  saveError: string | null
  saveWords: () => Promise<void>
  addWords: (candidates: WordDraft[]) => AddWordsResult
  updateWord: (id: string, patch: WordDraft) => WordActionResult
  deleteWord: (id: string) => WordActionResult
}

const WordsContext = createContext<WordsContextValue | null>(null)

export const WordsProvider = ({ children }: { children: ReactNode }) => {
  const { showAlert } = useAlert()

  const [words, setWords] = useState<PromptWord[]>([])
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)

  // addWords/updateWord/deleteWord は useCallback([]) で固定するため、最新値はこの ref 経由で読む。
  const wordsRef = useRef(words)
  wordsRef.current = words
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const loadStatusRef = useRef(loadStatus)
  loadStatusRef.current = loadStatus

  // インラインのままだと render のたびに参照が変わり、flush effect が無駄に再セットアップされる。
  const onSaved = useCallback(() => setDirty(false), [])
  const onSuccess = useCallback(() => showAlert('success', '保存しました'), [showAlert])

  const {
    status: saveStatus,
    error: saveError,
    saveNow,
    resetStatus,
  } = useAutoSave<PromptWord[]>({
    value: words,
    dirty,
    delayMs: AUTO_SAVE_DELAY_MS,
    save: putWords,
    onSaved,
    onSuccess,
  })
  const saveStatusRef = useRef(saveStatus)
  saveStatusRef.current = saveStatus

  const loadWords = useCallback(async () => {
    setLoadStatus('loading')
    setLoadError(null)
    try {
      const data = await getWords()
      // dirty（読み込み中に編集開始済み）なら初期データで上書きしない。
      if (!dirtyRef.current) {
        setWords(data.map((word) => ({ ...word, tag: normalizeTag(word.tag) })))
        resetStatus()
      }
      setLoadStatus('ready')
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '読み込みに失敗しました。')
      setLoadStatus('error')
    }
  }, [resetStatus])

  useEffect(() => {
    loadWords()
  }, [loadWords])

  // タブに戻ったときの再取得。未保存の変更（dirty）がある・保存が進行中のときは何もしない。
  // 取得結果が現在と等価なら何もしない。異なれば words を差し替えるが、dirty は false のまま
  // なので自動保存のデバウンス／flush はどちらも動かず、差し替え自体で PUT は発火しない。
  const revalidateWords = useCallback(() => {
    if (loadStatusRef.current !== 'ready') return
    if (dirtyRef.current) return
    if (saveStatusRef.current === 'saving') return

    getWords()
      .then((data) => {
        // 取得中に編集が始まっていたら破棄する。
        if (dirtyRef.current) return
        const normalized = data.map((word) => ({ ...word, tag: normalizeTag(word.tag) }))
        if (JSON.stringify(normalized) === JSON.stringify(wordsRef.current)) return
        setWords(normalized)
      })
      .catch(() => {})
  }, [])

  useRevalidateOnReturn(revalidateWords)

  const markWordsDirty = useCallback(() => {
    setDirty(true)
    resetStatus()
  }, [resetStatus])

  // ロード完了前に書き込むと、直後の GET 結果が dirty 判定で捨てられ KV の既存ワードが消えるため。
  const addWords = useCallback((candidates: WordDraft[]): AddWordsResult => {
    if (candidates.length === 0) return { ok: true }
    if (loadStatusRef.current !== 'ready') return { ok: false, reason: 'not-ready' }
    if (wordsRef.current.length + candidates.length > MAX_WORDS) return { ok: false, reason: 'limit' }

    setWords((current) => [...current, ...candidates.map(createWord)])
    markWordsDirty()
    return { ok: true }
  }, [markWordsDirty])

  const updateWord = useCallback((id: string, patch: WordDraft): WordActionResult => {
    if (loadStatusRef.current !== 'ready') return { ok: false, reason: 'not-ready' }

    setWords((current) =>
      current.map((word) =>
        word.id === id ? { ...word, text: patch.text.trim(), description: patch.description.trim(), tag: patch.tag } : word,
      ),
    )
    markWordsDirty()
    return { ok: true }
  }, [markWordsDirty])

  const deleteWord = useCallback((id: string): WordActionResult => {
    if (loadStatusRef.current !== 'ready') return { ok: false, reason: 'not-ready' }

    setWords((current) => current.filter((word) => word.id !== id))
    markWordsDirty()
    return { ok: true }
  }, [markWordsDirty])

  const saveWords = useCallback(async () => {
    await saveNow()
  }, [saveNow])

  const value: WordsContextValue = {
    words,
    loadStatus,
    loadError,
    reloadWords: loadWords,
    dirty,
    saveStatus,
    saveError,
    saveWords,
    addWords,
    updateWord,
    deleteWord,
  }

  return <WordsContext.Provider value={value}>{children}</WordsContext.Provider>
}

export const useWords = (): WordsContextValue => {
  const context = useContext(WordsContext)
  if (!context) {
    throw new Error('useWords must be used within a WordsProvider')
  }
  return context
}
