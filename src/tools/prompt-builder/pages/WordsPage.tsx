import { useMemo, useState } from 'react'
import { Spinner, useAlert, useConfirm } from '../../../components/feedback'
import { RowMenu } from '../../../components/RowMenu'
import { WordSaveButton, WordSaveError } from '../components/WordSaveControls'
import { readOutputItems, writeOutputItems } from '../lib/outputStorage'
import { useGroupedFilter } from '../hooks/useGroupedFilter'
import { formatLabel } from '../shared/labels'
import { useWords } from '../state/WordsProvider'
import { DEFAULT_TAG, PROMPT_TAG_IDS, PROMPT_TAG_LABELS, type PromptTagId } from '../shared/tags'
import type { PromptWord } from '../shared/types'

type TagFilter = PromptTagId | 'ALL'

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
  const { words, loadStatus, loadError, reloadWords, dirty, saveStatus, saveError, saveWords, updateWord, deleteWord } =
    useWords()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editTag, setEditTag] = useState<PromptTagId>(DEFAULT_TAG)

  const [filterTag, setFilterTag] = useState<TagFilter>('ALL')
  const [searchQuery, setSearchQuery] = useState('')

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

    updateWord(id, { text, description: editDescription, tag: editTag })
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

  const handleDeleteWord = async (id: string) => {
    const confirmed = await confirm('このワードを削除しますか？', { title: '削除', danger: true })
    if (!confirmed) return

    deleteWord(id)
    showAlert('success', '削除しました')
  }

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
          className="pt-input"
          aria-label="ワード"
          value={editText}
          onChange={(event) => setEditText(event.target.value)}
        />
        <div className="prompt-builder-word-form-row">
          <input
            type="text"
            className="pt-input"
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
          <button type="button" className="pt-button" disabled={!editText.trim()} onClick={() => commitEdit(word.id)}>
            保存
          </button>
          <button type="button" className="pt-button" onClick={cancelEdit}>
            キャンセル
          </button>
        </div>
      </li>
    ) : (
      <li key={word.id} className="prompt-builder-row prompt-builder-word-row">
        <button
          type="button"
          className="pt-button prompt-builder-word-row-text prompt-builder-word-row-button"
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
              { key: 'delete', label: '削除', onClick: () => handleDeleteWord(word.id), danger: true },
            ]}
          />
        </div>
      </li>
    )

  return (
    <div className="prompt-builder-page-stack">
      <section className="pt-card prompt-builder-panel">
        <div className="prompt-builder-panel-header">
          <h1>ワード一覧</h1>
          <WordSaveButton dirty={dirty} saveStatus={saveStatus} onSave={() => saveWords()} />
        </div>

        <WordSaveError saveStatus={saveStatus} saveError={saveError} />

        {loadStatus === 'loading' ? <Spinner label="読み込み中…" /> : null}
        {loadStatus === 'error' ? (
          <p className="prompt-builder-status-message prompt-builder-status-message-error" role="alert">
            {loadError}
            <button type="button" className="pt-button" onClick={reloadWords}>
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
                className="pt-input prompt-builder-word-search"
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
