import { DARK_MODE_ICON_PATH, ICON_VIEW_BOX, LIGHT_MODE_ICON_PATH } from './icon-paths'

export const DarkModeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox={ICON_VIEW_BOX} width="24" height="24" fill="currentColor" aria-hidden="true">
    <path d={DARK_MODE_ICON_PATH} />
  </svg>
)

export const LightModeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox={ICON_VIEW_BOX} width="24" height="24" fill="currentColor" aria-hidden="true">
    <path d={LIGHT_MODE_ICON_PATH} />
  </svg>
)
