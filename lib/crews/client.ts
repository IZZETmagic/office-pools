// The web's crew requests — one way to call a crew route from the browser.
//
// Every crew route answers failures as { error } with a status (lib/crews/http.crewResponse), and
// the error is written to be shown: "This pool is full.", "You can't rejoin this crew yourself."
// So a failure throws an Error carrying exactly that sentence, and the screen shows err.message.

const FALLBACK = 'That didn’t work. Please try again.'

export async function crewRequest<T = Record<string, unknown>>(
  url: string,
  init: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: Record<string, unknown> } = {},
): Promise<T> {
  const method = init.method ?? (init.body ? 'POST' : 'GET')
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
      body: init.body ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    throw new Error(FALLBACK)
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : FALLBACK)
  return data as T
}

export const errorText = (e: unknown) => (e instanceof Error && e.message ? e.message : FALLBACK)
