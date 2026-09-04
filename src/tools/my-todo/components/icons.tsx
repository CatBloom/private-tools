type TabMoveIconProps = {
  flipped?: boolean
}

// Material Symbols の tab_move（他のタブへ送るアイコン）。装飾用途のみなので aria-hidden・
// focusable="false" にし、意味は呼び出し側のボタンの aria-label/title で伝える。
// fill は currentColor にしてライト/ダークのテーマ色に追従させる（ダウンロード元は #1f1f1f 固定）。
export const TabMoveIcon = ({ flipped = false }: TabMoveIconProps) => (
  <svg
    className={`mytodo-move-icon${flipped ? ' is-flipped' : ''}`}
    width="20"
    height="20"
    viewBox="0 -960 960 960"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M200-120q-33 0-56.5-23.5T120-200v-120h80v120h560v-480H200v120h-80v-200q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm260-140-56-56 83-84H120v-80h367l-83-84 56-56 180 180-180 180Z" />
  </svg>
)
