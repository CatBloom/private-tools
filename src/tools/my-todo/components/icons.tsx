// Material Symbols の expand_more（下向きシェブロン、行の操作メニューのトリガー）。並べ替え
// ハンドルの ⠿（点）と形を分けて役割を区別する。装飾用途のみなので aria-hidden・
// focusable="false" にし、意味は呼び出し側ボタンの aria-label で伝える。
export const ExpandMoreIcon = () => (
  <svg width="20" height="20" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z" />
  </svg>
)
