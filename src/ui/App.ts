import { createElement, useRef, useState, type ChangeEvent, type FormEvent } from 'react'

type ApiResponse =
  | { ok: true; data: { message: string } }
  | { ok: false; error: { message: string } }

export function App() {
  const [name, setName] = useState('')
  const [message, setMessage] = useState('名前を入力して送信してください。')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const inFlight = useRef(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (inFlight.current) return

    inFlight.current = true
    setIsSubmitting(true)
    setMessage('送信中です。')

    try {
      const response = await fetch('/api/hello', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const result: ApiResponse = await response.json()
      setMessage(result.ok ? result.data.message : '送信できませんでした。もう一度お試しください。')
    } catch {
      setMessage('送信できませんでした。通信状態を確認してください。')
    } finally {
      inFlight.current = false
      setIsSubmitting(false)
    }
  }

  return createElement(
    'main',
    { className: 'page-shell' },
    createElement(
      'section',
      { className: 'card', 'aria-labelledby': 'page-title' },
      createElement('p', { className: 'eyebrow' }, '検証用アプリ'),
      createElement('h1', { id: 'page-title' }, '検証用アプリ'),
      createElement('p', null, 'SSR と React の動作を確認するためのアプリです。'),
      createElement(
        'form',
        { onSubmit: submit, className: 'hello-form' },
        createElement('label', { htmlFor: 'name' }, 'お名前'),
        createElement('input', {
          id: 'name',
          name: 'name',
          value: name,
          onChange: (event: ChangeEvent<HTMLInputElement>) => setName(event.target.value),
          autoComplete: 'name',
          required: true,
          maxLength: 50,
        }),
        createElement('button', { type: 'submit', disabled: isSubmitting }, isSubmitting ? '送信中…' : 'あいさつする'),
      ),
      createElement(
        'p',
        { role: 'status', 'aria-live': 'polite', className: 'response-message' },
        message,
      ),
    ),
  )
}
