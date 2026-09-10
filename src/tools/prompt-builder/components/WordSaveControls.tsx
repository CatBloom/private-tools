import type { LoadStatus, SaveStatus } from '../state/WordsProvider'

type WordSaveButtonProps = {
  dirty: boolean
  saveStatus: SaveStatus
  onSave: () => void
}

export const WordSaveButton = ({ dirty, saveStatus, onSave }: WordSaveButtonProps) => (
  <div className="prompt-builder-save-controls">
    {/* バッジはボタンの左に置く。右寄せの並びで後ろに出すと、表示のたびに保存ボタンの位置がずれるため。 */}
    {dirty && saveStatus !== 'saving' ? <span className="pt-badge prompt-builder-dirty-badge">未保存の変更あり</span> : null}
    <button type="button" className="pt-button" disabled={!dirty || saveStatus === 'saving'} onClick={onSave}>
      {saveStatus === 'saving' ? '保存中…' : '保存'}
    </button>
  </div>
)

type WordSaveErrorProps = {
  saveStatus: SaveStatus
  saveError: string | null
}

export const WordSaveError = ({ saveStatus, saveError }: WordSaveErrorProps) =>
  saveStatus === 'error' ? (
    <p className="pt-status-message pt-status-message-error prompt-builder-status-message" role="alert">
      {saveError}
    </p>
  ) : null

type WordLoadErrorProps = {
  loadStatus: LoadStatus
  loadError: string | null
  onReload: () => void
}

export const WordLoadError = ({ loadStatus, loadError, onReload }: WordLoadErrorProps) =>
  loadStatus === 'error' ? (
    <p className="pt-status-message pt-status-message-error prompt-builder-status-message" role="alert">
      {loadError}
      <button type="button" className="pt-button" onClick={onReload}>
        再読み込み
      </button>
    </p>
  ) : null
