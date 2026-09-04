import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './copyText'

describe('copyText', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns true via execCommand without calling the Clipboard API', async () => {
    const execCommand = vi.fn().mockReturnValue(true)
    Object.assign(document, { execCommand })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    await expect(copyText('hello')).resolves.toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('falls back to the Clipboard API when execCommand fails, returning true on success', async () => {
    const execCommand = vi.fn().mockReturnValue(false)
    Object.assign(document, { execCommand })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    await expect(copyText('hello')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('returns false when execCommand fails and the Clipboard API rejects', async () => {
    const execCommand = vi.fn().mockReturnValue(false)
    Object.assign(document, { execCommand })
    const writeText = vi.fn().mockRejectedValue(new Error('clipboard denied'))
    Object.assign(navigator, { clipboard: { writeText } })

    await expect(copyText('hello')).resolves.toBe(false)
  })

  it('returns false when execCommand fails and the Clipboard API is unavailable', async () => {
    const execCommand = vi.fn().mockReturnValue(false)
    Object.assign(document, { execCommand })
    Object.assign(navigator, { clipboard: undefined })

    await expect(copyText('hello')).resolves.toBe(false)
  })
})
