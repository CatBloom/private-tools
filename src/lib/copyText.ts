// iOS Brave 等、async Clipboard API が失敗しやすい環境向けの同期フォールバック。
// 一時 textarea を選択状態にして document.execCommand('copy') を試す。
const copyWithExecCommand = (text: string): boolean => {
  let textarea: HTMLTextAreaElement | null = null
  try {
    textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.top = '0'
    textarea.style.left = '0'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'
    textarea.style.fontSize = '16px' // iOS のフォーカス時ズームを防ぐ
    document.body.appendChild(textarea)
    textarea.contentEditable = 'true'
    textarea.readOnly = false
    textarea.focus()
    textarea.setSelectionRange(0, text.length) // iOS は select() だけだと効かないことがある
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    // append 前に例外が出た場合は textarea が未接続のままなので、接続済みのときだけ除去する
    if (textarea?.parentNode) textarea.parentNode.removeChild(textarea)
  }
}

// iOS/WebKit は最初の await をまたぐと user activation が失効するため、
// 同期の execCommand を先に試し、失敗時のみ Clipboard API を使う。
export const copyText = async (text: string): Promise<boolean> => {
  if (copyWithExecCommand(text)) return true
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}
