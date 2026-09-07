import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAlert, useConfirm } from '../../../components/feedback'
import { WordSaveButton, WordSaveError } from '../components/WordSaveControls'
import { buildDecomposeRows, buildPrompt, setRowEdit, toOutputItems, type DecomposeRow, type RowEdit } from '../lib/decompose'
import { parsePrompt } from '../lib/parsePrompt'
import { readOutputItems, writeOutputItems } from '../lib/outputStorage'
import { formatLabel } from '../shared/labels'
import { MAX_WORDS } from '../shared/limits'
import { PROMPT_TAG_IDS, PROMPT_TAG_LABELS, type PromptTagId } from '../shared/tags'
import { useWords } from '../state/WordsProvider'

const LIMIT_ERROR_MESSAGE = `ワード数の上限（${MAX_WORDS}件）を超えるため登録できません。`

const TagOptions = () => (
  <>
    {PROMPT_TAG_IDS.map((tag) => (
      <option key={tag} value={tag}>
        {formatLabel(PROMPT_TAG_LABELS[tag])}
      </option>
    ))}
  </>
)

export const RegisterPage = () => {
  const { showAlert } = useAlert()
  const { confirm } = useConfirm()
  const navigate = useNavigate()
  const { words, loadStatus, dirty, saveStatus, saveError, saveWords, addWords } = useWords()

  const [newText, setNewText] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newTag, setNewTag] = useState<PromptTagId | ''>('')

  const [decomposeInput, setDecomposeInput] = useState('')
  const [rowEdits, setRowEdits] = useState<Map<string, RowEdit>>(new Map())

  const isAlreadyRegistered = (text: string) => words.some((word) => word.text === text.trim())

  const handleAddWord = (event: FormEvent) => {
    event.preventDefault()
    if (loadStatus !== 'ready') return
    const text = newText.trim()
    if (!text) return
    if (newTag === '') return

    const result = addWords([{ text, description: newDescription, tag: newTag }])
    if (!result.ok) {
      if (result.reason === 'limit') showAlert('error', LIMIT_ERROR_MESSAGE)
      return
    }

    setNewText('')
    setNewDescription('')
    setNewTag('')
    showAlert('success', '追加しました')
  }

  const rows = useMemo(() => buildDecomposeRows(parsePrompt(decomposeInput), rowEdits), [decomposeInput, rowEdits])

  const updateRow = (row: DecomposeRow, patch: Partial<RowEdit>) => {
    setRowEdits((current) => setRowEdit(current, row.key, { text: row.text, tag: row.tag, description: row.description }, patch))
  }

  const handleRemoveRow = async (row: DecomposeRow) => {
    const confirmed = await confirm('この行を外しますか？', { title: '削除', danger: true, confirmLabel: '削除' })
    if (!confirmed) return

    // 元 text＋weight で再構築する。編集後の text を使うと他の行の編集まで textarea に混ざってしまうため。
    const remaining = rows.filter((candidate) => candidate.key !== row.key)
    setDecomposeInput(buildPrompt(remaining.map((candidate) => ({ text: candidate.originalText, weight: candidate.weight }))))
    showAlert('success', `${row.text.trim()}を外しました`)
  }

  const unregisteredRows = rows.filter((row) => row.text.trim().length > 0 && !isAlreadyRegistered(row.text))

  const handleRegisterAll = () => {
    if (unregisteredRows.length === 0) return

    const result = addWords(unregisteredRows.map((row) => ({ text: row.text, description: row.description, tag: row.tag })))
    if (!result.ok) {
      if (result.reason === 'limit') showAlert('error', LIMIT_ERROR_MESSAGE)
      return
    }

    showAlert('success', `${unregisteredRows.length}件登録しました`)
  }

  const handleSendToOutput = async () => {
    if (rows.length === 0) return

    if (readOutputItems().length > 0) {
      const confirmed = await confirm('出力欄を分解結果で置き換えますか？ 現在の出力は失われます', {
        title: '出力へ',
        confirmLabel: '置き換え',
      })
      if (!confirmed) return
    }

    writeOutputItems(toOutputItems(rows, () => crypto.randomUUID()))
    navigate('/output')
  }

  return (
    <div className="prompt-builder-page-stack">
      <section className="pt-card prompt-builder-panel">
        <div className="prompt-builder-panel-header">
          <h1>ワード登録</h1>
          <WordSaveButton dirty={dirty} saveStatus={saveStatus} onSave={() => saveWords()} />
        </div>

        <WordSaveError saveStatus={saveStatus} saveError={saveError} />

        <form className="prompt-builder-word-form" onSubmit={handleAddWord}>
          <input
            type="text"
            className="pt-input"
            placeholder="ワード"
            aria-label="ワード"
            value={newText}
            disabled={loadStatus !== 'ready'}
            onChange={(event) => setNewText(event.target.value)}
          />
          <div className="prompt-builder-word-form-row">
            <input
              type="text"
              className="pt-input"
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
          <button type="submit" className="pt-button pt-button-accent" disabled={loadStatus !== 'ready' || !newText.trim() || newTag === ''}>
            追加
          </button>
        </form>
      </section>

      <section className="pt-card prompt-builder-panel">
        <div className="prompt-builder-panel-header">
          <h2>ワード分解</h2>
        </div>

        <textarea
          className="pt-input prompt-builder-decompose-textarea"
          aria-label="分解するプロンプト"
          placeholder="AAAA,BBBB,{{CCCC}}"
          value={decomposeInput}
          onChange={(event) => setDecomposeInput(event.target.value)}
        />

        {rows.length > 0 ? (
          <ul className="prompt-builder-decompose-list">
            {rows.map((row) => {
              const alreadyRegistered = isAlreadyRegistered(row.text)
              return (
                <li
                  key={row.key}
                  className={`prompt-builder-row prompt-builder-decompose-row${alreadyRegistered ? ' prompt-builder-decompose-row-registered' : ''}`}
                  title={alreadyRegistered ? '既に登録されています' : undefined}
                >
                  <div className="prompt-builder-decompose-row-line">
                    <input
                      type="text"
                      className="pt-input"
                      aria-label="ワード"
                      value={row.text}
                      disabled={alreadyRegistered}
                      onChange={(event) => updateRow(row, { text: event.target.value })}
                    />
                    <button
                      type="button"
                      className="pt-button pt-button-danger prompt-builder-decompose-remove"
                      aria-label="この行を外す"
                      onClick={() => handleRemoveRow(row)}
                    >
                      ×
                    </button>
                  </div>
                  <div className="prompt-builder-word-form-row">
                    <input
                      type="text"
                      className="pt-input"
                      aria-label="説明"
                      placeholder="説明（任意）"
                      value={row.description}
                      disabled={alreadyRegistered}
                      onChange={(event) => updateRow(row, { description: event.target.value })}
                    />
                    <select
                      aria-label="タグ"
                      className="prompt-builder-tag-select"
                      value={row.tag}
                      disabled={alreadyRegistered}
                      onChange={(event) => updateRow(row, { tag: event.target.value as PromptTagId })}
                    >
                      <TagOptions />
                    </select>
                  </div>
                </li>
              )
            })}
          </ul>
        ) : null}

        <div className="prompt-builder-decompose-bulk-actions">
          <button
            type="button"
            className="pt-button"
            disabled={unregisteredRows.length === 0 || loadStatus !== 'ready'}
            onClick={handleRegisterAll}
          >
            すべて追加
          </button>
          <button
            type="button"
            className="pt-button pt-button-accent"
            disabled={rows.length === 0}
            onClick={handleSendToOutput}
          >
            出力へ
          </button>
        </div>
      </section>
    </div>
  )
}
