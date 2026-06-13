'use client'

import { useEffect, useState } from 'react'

type Props = {
  /** ISO timestamp (a UTC instant, e.g. a `timestamptz` from Supabase). */
  iso: string
  /** Formats the parsed Date — runs in the viewer's local timezone. */
  format: (d: Date) => string
  /** Rendered on the server and on the first client render (before mount). */
  fallback?: string
}

/**
 * Renders an absolute timestamp in the VIEWER's own timezone.
 *
 * Why this exists: date formatting that reads local fields (getHours/getDate/
 * toLocale*) returns whatever timezone the *runtime* is in. On the server that
 * runtime is UTC, so server-rendered kickoff times come out in UTC. Wrapping
 * such a value in `suppressHydrationWarning` (as this app previously did) makes
 * React keep the server's UTC text and never reconcile it to the client value —
 * so every user, in every timezone, saw UTC.
 *
 * The fix is to format on the client only. Server and first client render both
 * emit `fallback` (no hydration mismatch); a post-mount effect then fills in the
 * local-time string. `format` is intentionally keyed on `iso` alone so inline
 * formatter closures don't retrigger the effect.
 */
export function LocalTime({ iso, format, fallback = '' }: Props) {
  const [text, setText] = useState(fallback)
  useEffect(() => {
    setText(format(new Date(iso)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iso])
  return <>{text}</>
}
