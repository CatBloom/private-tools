import { useEffect, useState } from 'react'

// credit-csv.css のブレークポイント（48rem = 768px）に合わせる
const MOBILE_QUERY = '(max-width: 48rem)'

const matches = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(MOBILE_QUERY).matches
    : false

export const useIsMobile = () => {
  const [isMobile, setIsMobile] = useState(matches)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    const mql = window.matchMedia(MOBILE_QUERY)
    const handleChange = (event: MediaQueryListEvent) => setIsMobile(event.matches)

    setIsMobile(mql.matches)
    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [])

  return isMobile
}
