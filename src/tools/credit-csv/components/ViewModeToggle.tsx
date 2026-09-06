import type { ViewMode } from '../lib/types'

type ViewModeToggleProps = {
  viewMode: ViewMode
  onViewModeChange: (value: ViewMode) => void
}

export const ViewModeToggle = ({ viewMode, onViewModeChange }: ViewModeToggleProps) => (
  <div className="credit-csv-segmented">
    <button
      className={`pt-button${viewMode === 'detail' ? ' active' : ''}`}
      type="button"
      onClick={() => onViewModeChange('detail')}
    >
      明細
    </button>
    <button
      className={`pt-button${viewMode === 'monthly-summary' ? ' active' : ''}`}
      type="button"
      onClick={() => onViewModeChange('monthly-summary')}
    >
      月内合計
    </button>
  </div>
)
