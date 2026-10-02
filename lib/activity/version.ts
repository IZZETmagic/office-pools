// Which shape of the Activity response a caller asked for.
//
// Versions only ever ADD to the response, so the gate is "at least N", never "exactly N". It used
// to be `search.get('v') === '2'`, which meant a build asking for v=3 would have fallen all the way
// back to the v1 response — losing Needs You, links and paging — the moment it shipped. The Crews
// work needs a v3 (crew cards in Needs You that a v2 build cannot act on), so this had to change
// before any build sends one.
//
// Anything missing, non-numeric or below 1 is v1: an older OTA, or a client sending rubbish, gets
// the original response rather than an error.

export function activityApiVersion(raw: string | null): number {
  if (raw === null) return 1
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) return 1
  return n
}
