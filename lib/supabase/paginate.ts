/**
 * PostgREST silently caps an unbounded `.select()` at `db.max_rows` (1,000 on this
 * project) and returns a short array with **no error** — the service-role client is not
 * exempt. Any query over a table that can exceed a page (users 4.8k, pool_members 4.8k,
 * pool_entries 5k, predictions six figures, …) is silently truncated unless it pages.
 * Verified 2026-07-21: `users` returns 1,000 of 4,841 without `.range()`.
 *
 * Use `fetchAllRows()` instead of a bare `.select()` whenever the result set isn't already
 * bounded well under 1,000 (by `.eq()` on a unique/small key, `.single()`, `.limit()`, or
 * an `.in()` over a short caller-supplied list).
 */

export const PG_PAGE_SIZE = 1000

type PageResult<T> = { data: T[] | null; error: { message: string } | null }

/**
 * Run `page(from, to)` for successive `PG_PAGE_SIZE`-row windows until a short or empty
 * page signals the end, then return every row concatenated. The callback MUST apply the
 * window via `.range(from, to)` — that's the whole point.
 *
 * Throws on any page error rather than returning partial data: silently-short results are
 * exactly how the truncation bug stayed invisible, and callers here drive emails / scoring
 * where a half-answer is worse than a thrown one.
 *
 *   const users = await fetchAllRows((from, to) =>
 *     supabase.from('users').select('user_id, email').not('email', 'is', null).range(from, to),
 *     'users')
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  label = 'query'
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PG_PAGE_SIZE) {
    const { data, error } = await page(from, from + PG_PAGE_SIZE - 1)
    if (error) throw new Error(`[paginate] ${label} page @${from} failed: ${error.message}`)
    if (!data || data.length === 0) break
    rows.push(...data)
    if (data.length < PG_PAGE_SIZE) break
  }
  return rows
}
