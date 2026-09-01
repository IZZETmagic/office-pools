// =============================================================
// RENDER A COMPOSITION AND PUT IT IN BLOB — shared by both routes
// =============================================================
// The recap and the reveal differ entirely in what they are ALLOWED to draw and
// not at all in how they are drawn. This is the second half: restore the
// snapshot, render, upload, stream progress, always stop the sandbox.
//
// Extracted when the reveal arrived rather than copied, because the parts that
// are easy to get subtly wrong — the cache key, the benign upload race, the
// `downloadUrl` trap, stopping the sandbox — are exactly the parts a second copy
// would drift on.
// =============================================================

import { head } from '@vercel/blob'

import { restoreSnapshot } from './restoreSnapshot'

export type Progress =
  | { type: 'phase'; phase: string; progress: number }
  | { type: 'done'; url: string; cached: boolean }
  | { type: 'error'; message: string }

/**
 * The already-rendered file, if there is one.
 *
 * ⚠ `head` is one request and saves an entire sandbox. Safe to trust: both cards
 * describe facts that cannot change once written — a settled duel has a result
 * forever, and a revealed pairing is fixed for that matchweek.
 */
export async function cachedRender(pathname: string, blobToken: string): Promise<string | null> {
  const existing = await head(pathname, { token: blobToken }).catch(() => null)
  return existing?.url ?? null
}

/**
 * Stream a render into Blob at `pathname`, reporting progress.
 *
 * Returns the SSE stream AND the promise doing the work.
 *
 * ⚠ THE CALLER MUST PASS `done` TO `waitUntil`. Starting the render and
 * throwing the promise away works locally, where the dev server lives forever,
 * and silently truncates renders on Vercel — the function is free to terminate
 * once the response headers are out. That failure only appears in production.
 *
 * The caller is responsible for having decided that this viewer may see this
 * composition; nothing here checks anything.
 */
export function renderToBlobStream({
  compositionId,
  inputProps,
  pathname,
  blobToken,
  label,
}: {
  compositionId: string
  inputProps: Record<string, unknown>
  pathname: string
  blobToken: string
  /** For the server log when a render fails. */
  label: string
}): { stream: ReadableStream<Uint8Array>; done: Promise<void> } {
  const encoder = new TextEncoder()
  const stream = new TransformStream<Uint8Array, Uint8Array>()
  const writer = stream.writable.getWriter()
  const send = (m: Progress) => writer.write(encoder.encode(`data: ${JSON.stringify(m)}\n\n`))

  const run = async () => {
    let sandbox: Awaited<ReturnType<typeof restoreSnapshot>> | null = null
    try {
      await send({ type: 'phase', phase: 'Starting up', progress: 0 })
      sandbox = await restoreSnapshot()

      const { renderMediaOnVercel, uploadToVercelBlob } = await import('@remotion/vercel')

      const { sandboxFilePath, contentType } = await renderMediaOnVercel({
        sandbox,
        compositionId,
        inputProps,
        onProgress: async (u: { stage: string; overallProgress: number }) => {
          await send({
            type: 'phase',
            phase: u.stage === 'render-progress' ? 'Rendering' : 'Preparing',
            progress: u.overallProgress,
          })
        },
      })

      await send({ type: 'phase', phase: 'Uploading', progress: 1 })

      // ⚠ `blobPath` is stored VERBATIM — measured against the live store, not
      // assumed: `put` adds no random suffix unless asked. Omit it and the
      // library invents `renders/<uuid>.mp4` and nothing is ever a cache hit.
      try {
        await uploadToVercelBlob({
          sandbox,
          sandboxFilePath,
          contentType,
          blobToken,
          access: 'public',
          blobPath: pathname,
        })
      } catch (uploadErr) {
        // ⚠ THE RACE IS REAL AND BENIGN. Two taps that both miss the cache both
        // render, and the second `put` throws "This blob already exists" —
        // `uploadToVercelBlob` does not pass `allowOverwrite`. The file IS there,
        // written by the other request. That is a hit, not a failure.
        const msg = uploadErr instanceof Error ? uploadErr.message : ''
        if (!/already exists/i.test(msg)) throw uploadErr
      }

      // ⚠ Resolved through `head`, not taken from the upload — which returns
      // Blob's `downloadUrl`, the `?download=1` variant that forces a save
      // instead of playing inline. A share sheet wants the plain URL.
      const stored = await head(pathname, { token: blobToken })
      await send({ type: 'done', url: stored.url, cached: false })
    } catch (err) {
      console.error(`[${label}] render failed`, pathname, err)
      await send({ type: 'error', message: err instanceof Error ? err.message : 'Render failed' })
    } finally {
      // ⚠ Always stop it. A sandbox left running bills until its timeout.
      await sandbox?.stop().catch(() => {})
      await writer.close()
    }
  }

  return { stream: stream.readable, done: run() }
}

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  Connection: 'keep-alive',
} as const
