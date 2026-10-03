'use client'

// One GET to a crew route, keyed on its URL.
//
// ⚠ The answer is stored WITH the URL it answers, and only returned while that is still the URL
// asked for. Switching crew in the create flow changes the roster URL; without the key, the old
// crew's roster would sit on screen — tickable — until the new one arrived. (It also means nothing
// is reset synchronously inside an effect, which the React linter rightly rejects.)

import { useEffect, useState } from 'react'

import { crewRequest, errorText } from '@/lib/crews/client'

export function useCrewFetch<T>(url: string | null, attempt = 0): { data: T | null; error: string | null; loading: boolean } {
  const key = url ? `${url}#${attempt}` : null
  const [state, setState] = useState<{ key: string; data: T | null; error: string | null } | null>(null)

  useEffect(() => {
    if (!url || !key) return
    let cancelled = false
    crewRequest<T>(url)
      .then((data) => {
        if (!cancelled) setState({ key, data, error: null })
      })
      .catch((e) => {
        if (!cancelled) setState({ key, data: null, error: errorText(e) })
      })
    return () => {
      cancelled = true
    }
  }, [url, key])

  const current = state && state.key === key ? state : null
  return { data: current?.data ?? null, error: current?.error ?? null, loading: !!key && !current }
}
