'use client'

// =============================================================
// ASKING FOR THE VIDEO
// =============================================================
// The client half of `/api/pools/:pool_id/duel-reveal` and `/duel-recap`. Both
// routes existed for a while with NOTHING calling them — the whole render
// pipeline was unreachable from the product, which is the gap this closes.
//
// ⚠ THE ROUTE ANSWERS IN TWO SHAPES, and both have to be handled. A cache hit
// replies immediately as JSON; a fresh render streams server-sent events for
// ~30 seconds while a sandbox boots, renders and uploads. Waiting on an event
// stream to be told the file already exists would be silly, so the route does
// not do that — which means this cannot assume `text/event-stream`.
// =============================================================

import { useCallback, useRef, useState } from 'react'

export type DuelVideoKind = 'duel-reveal' | 'duel-recap'

export type DuelVideoState = {
  /** Idle until asked. */
  status: 'idle' | 'working' | 'ready' | 'error'
  /** What the server is doing, for the button's label. */
  phase: string
  /** 0–1. Only meaningful while `working`. */
  progress: number
  url: string | null
  /** True when it came straight from Blob rather than being rendered. */
  cached: boolean
  error: string | null
}

const IDLE: DuelVideoState = {
  status: 'idle',
  phase: '',
  progress: 0,
  url: null,
  cached: false,
  error: null,
}

/** Refusals the route can return, in words a member can read. */
const REFUSAL: Record<string, string> = {
  'not-a-member': 'You are not in this pool.',
  'wrong-pool': 'That duel is not in this pool.',
  'not-revealed': 'This duel has not opened yet.',
  'already-settled': 'This duel has already been played.',
  'not-settled': 'This duel has not been played yet.',
  'not-your-duel': 'That is not your duel.',
  'missing-entry': 'Someone in this duel has left the pool.',
}

export function useDuelVideo(poolId: string, kind: DuelVideoKind) {
  const [state, setState] = useState<DuelVideoState>(IDLE)
  // ⚠ Guards against a second press while a render is in flight. A render costs
  // sandbox time, and the route has no rate limiting yet.
  const inFlight = useRef(false)

  const request = useCallback(
    async (duelId: string) => {
      if (inFlight.current) return
      inFlight.current = true
      setState({ ...IDLE, status: 'working', phase: 'Starting' })

      try {
        const res = await fetch(`/api/pools/${poolId}/${kind}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ duelId }),
        })

        const type = res.headers.get('content-type') ?? ''
        if (!type.includes('text/event-stream')) {
          const body = (await res.json().catch(() => ({}))) as { url?: string; cached?: boolean; error?: string }
          if (!res.ok) {
            const why = body.error ?? ''
            setState({
              ...IDLE,
              status: 'error',
              // ⚠ STATUS FIRST, THEN THE REASON. A 401 carries `error:
              // "Unauthorized"` from `requireAuth`, which is not in the refusal
              // map and fell through to "That video could not be made" — true,
              // useless, and hides the one cause the member can actually fix.
              // A 503 is the Blob store being unconfigured, which is ours.
              error:
                res.status === 401
                  ? 'Sign in to make a video.'
                  : res.status === 503
                    ? 'Video rendering is not set up yet.'
                    : REFUSAL[why] ?? 'That video could not be made.',
            })
            return
          }
          setState({ ...IDLE, status: 'ready', url: body.url ?? null, cached: !!body.cached, progress: 1 })
          return
        }

        // ⚠ SSE arrives in arbitrary chunks, so events must be reassembled on
        // the blank-line delimiter rather than assumed one-per-read.
        const reader = res.body!.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const parts = buf.split('\n\n')
          buf = parts.pop() ?? ''
          for (const part of parts) {
            if (!part.startsWith('data: ')) continue
            const msg = JSON.parse(part.slice(6)) as
              | { type: 'phase'; phase: string; progress: number }
              | { type: 'done'; url: string; cached: boolean }
              | { type: 'error'; message: string }
            if (msg.type === 'phase') {
              setState((s) => ({ ...s, phase: msg.phase, progress: msg.progress }))
            } else if (msg.type === 'done') {
              setState({ ...IDLE, status: 'ready', url: msg.url, cached: msg.cached, progress: 1 })
            } else {
              setState({ ...IDLE, status: 'error', error: msg.message })
            }
          }
        }
      } catch (e) {
        setState({
          ...IDLE,
          status: 'error',
          error: e instanceof Error ? e.message : 'That video could not be made.',
        })
      } finally {
        inFlight.current = false
      }
    },
    [poolId, kind],
  )

  const reset = useCallback(() => setState(IDLE), [])
  return { state, request, reset }
}

/**
 * Hand the finished file to the member.
 *
 * ⚠ THE NATIVE SHEET IS THE POINT ON A PHONE, which is where these get shared.
 * `navigator.share` with a File opens WhatsApp, Instagram and the rest directly;
 * a copied link makes somebody paste a URL into a chat and hope it unfurls.
 *
 * ⚠ IT MUST BE CALLED FROM THE USER GESTURE. Browsers require `share()` to be
 * invoked during a real click, so the fetch that builds the File has to happen
 * inside the same handler — which is why this takes a URL rather than doing the
 * render itself.
 *
 * Returns how it was delivered so the caller can say so.
 */
export async function shareDuelVideo(url: string, title: string): Promise<'shared' | 'copied'> {
  const nav = navigator as Navigator & {
    canShare?: (d: { files?: File[] }) => boolean
    share?: (d: { files?: File[]; title?: string; text?: string }) => Promise<void>
  }

  if (nav.share && nav.canShare) {
    try {
      const blob = await (await fetch(url)).blob()
      const file = new File([blob], 'showdown.mp4', { type: 'video/mp4' })
      if (nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title })
        return 'shared'
      }
    } catch {
      // ⚠ SWALLOWED ON PURPOSE, and only here. The user cancelling the share
      // sheet throws exactly like a real failure does, and there is nothing to
      // report either way — the fallback below still gives them the link.
    }
  }

  await navigator.clipboard.writeText(url)
  return 'copied'
}
