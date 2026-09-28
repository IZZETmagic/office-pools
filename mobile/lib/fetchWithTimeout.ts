// =============================================================
// A FETCH THAT GIVES UP
// =============================================================
// React Native's `fetch` has no timeout. A request to a host that accepts the
// connection and then says nothing does not fail — it waits on the platform
// socket timeout, which on iOS defaults to sixty seconds. That is the gap this
// closes, and the distinction that matters is:
//
//   a FAILED request   the server said no, or the connection dropped → we
//                      already handle this, every caller has a catch
//   a STALLED request  nothing comes back at all → nothing settles, no catch
//                      runs, every `finally` waits, and the UI holds
//
// The second is the one that made the app look hung on bad signal rather than
// slow: the splash gate waits on `loading`, `loading` is cleared in a `finally`,
// and a `finally` only runs when the promise settles.
//
// ⚠ This covers `fetch` only — which is exactly right. Realtime is a WebSocket
// and is not routed through here; aborting it would tear down the live
// leaderboard rather than protect it.
// =============================================================

/**
 * ⚠ FIFTEEN SECONDS, AND DELIBERATELY GENEROUS. The number is not a UX budget —
 * the splash ceiling in `app/_layout.tsx` owns how long a person ever waits, and
 * it is measured in single-digit seconds. This is the point past which a request
 * is not slow but stuck, so it must sit ABOVE the slowest honest request the app
 * makes. The home fan-out is `4P + 2T` queries and can legitimately take several
 * seconds on a bad connection; aborting one that would have returned at twelve
 * seconds turns a slow load into an error screen, which is a downgrade.
 */
export const DEFAULT_TIMEOUT_MS = 15_000;

/**
 * The message a person actually reads. `useHomeData` surfaces `err.message`
 * straight into the "Couldn't load home" screen, so "Aborted" — which is what
 * the platform throws — would be the whole explanation offered to someone whose
 * train went into a tunnel.
 */
export const TIMEOUT_MESSAGE = 'The request timed out. Check your connection and try again.';

/**
 * `fetch`, with an upper bound.
 *
 * Signature-compatible with the global `fetch` (the third parameter is
 * optional), so it can be handed to `createClient`'s `global.fetch` as-is.
 */
export function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  // ⚠ CHAIN THE CALLER'S SIGNAL, DO NOT REPLACE IT. supabase-js exposes
  // `.abortSignal()` on a query, and passing our own signal through `init`
  // would silently drop theirs — a caller's cancel would stop cancelling and
  // nothing would report that it had stopped working.
  const upstream = init?.signal;
  if (upstream) {
    if (upstream.aborted) {
      controller.abort();
    } else {
      upstream.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  return fetch(input, { ...init, signal: controller.signal })
    .catch((err: unknown) => {
      // Only OUR abort becomes a timeout. An abort the caller asked for is
      // theirs, and must keep the shape they are catching for.
      if (timedOut) throw new Error(TIMEOUT_MESSAGE);
      throw err;
    })
    .finally(() => clearTimeout(timer));
}
