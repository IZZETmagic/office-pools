// The point of this module is that a STALLED request stops being indistinguishable
// from a slow one. The tests below are mostly about the seam between the two
// kinds of abort — ours (a timeout, which must be reported as one) and the
// caller's (which must keep the shape the caller is catching for). Getting that
// backwards would either swallow a real cancellation or tell a person their
// connection timed out when they navigated away.

import { afterEach, describe, expect, it, vi } from 'vitest';

import { TIMEOUT_MESSAGE, fetchWithTimeout } from '../fetchWithTimeout';

/**
 * A `fetch` that never answers, but honours its signal the way the real one
 * does — including a signal that is already aborted before it is called.
 */
function stallingFetch() {
  return vi.fn((_input: unknown, init?: { signal?: AbortSignal }) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return;
      if (signal.aborted) {
        reject(new Error('Aborted'));
        return;
      }
      signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
    });
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('fetchWithTimeout', () => {
  it('passes a normal response straight through', async () => {
    const response = { ok: true, status: 200 } as Response;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    await expect(fetchWithTimeout('https://example.test')).resolves.toBe(response);
  });

  it('rejects a stalled request with a message a person can act on', async () => {
    // The failure this module exists for: the host accepted the connection and
    // then said nothing. Before, this waited on the iOS socket timeout.
    vi.stubGlobal('fetch', stallingFetch());
    await expect(fetchWithTimeout('https://example.test', {}, 20)).rejects.toThrow(
      TIMEOUT_MESSAGE,
    );
  });

  it("does not disguise the caller's own abort as a timeout", async () => {
    // supabase-js exposes `.abortSignal()`. If a caller cancels, they should get
    // their cancellation back — not a claim about the network.
    vi.stubGlobal('fetch', stallingFetch());
    const controller = new AbortController();
    const pending = fetchWithTimeout('https://example.test', { signal: controller.signal }, 5_000);
    controller.abort();
    await expect(pending).rejects.toThrow('Aborted');
    await expect(pending).rejects.not.toThrow(TIMEOUT_MESSAGE);
  });

  it('honours a signal that was already aborted before the call', async () => {
    vi.stubGlobal('fetch', stallingFetch());
    const controller = new AbortController();
    controller.abort();
    await expect(
      fetchWithTimeout('https://example.test', { signal: controller.signal }, 5_000),
    ).rejects.toThrow('Aborted');
  });

  it('passes the caller\'s own init through rather than replacing it', async () => {
    // Chaining the signal must not cost the request its method, headers or body.
    const spy = vi.fn().mockResolvedValue({ ok: true } as Response);
    vi.stubGlobal('fetch', spy);
    await fetchWithTimeout('https://example.test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"a":1}',
    });
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect(init.signal).toBeDefined();
  });

  it('stops its timer once the request settles', async () => {
    // A leaked timer keeps the JS context awake and, on a long-lived screen,
    // accumulates one per request.
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true } as Response));
    await fetchWithTimeout('https://example.test');
    expect(clear).toHaveBeenCalled();
    clear.mockRestore();
  });
});
