import type { ViewMode } from '../lib/types'

type ViewModeToggleProps = {
  viewMode: ViewMode
  onViewModeChange: (value: ViewMode) => void
}

export const ViewModeToggle = ({ viewMode, onViewModeChange }: ViewModeToggleProps) => (
  <div className="ccsv-segmented">
    <button className={viewMode === 'detail' ? 'active' : ''} type="button" onClick={() => onViewModeChange('detail')}>
      明細
    </button>
    <button
      className={viewMode === 'monthly-summary' ? 'active' : ''}
      type="button"
      onClick={() => onViewModeChange('monthly-summary')}
    >
      月内合計
    </button>
  </div>
)
