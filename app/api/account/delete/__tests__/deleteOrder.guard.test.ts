// =============================================================
// The account-delete route checks BEFORE it destroys
// =============================================================
// `app/api/account/delete/route.ts` used to run eight deletes — match scores,
// bonus scores, predictions, group predictions, special predictions, player
// scores, entries, memberships — and only THEN ask whether the caller still
// administers a pool, returning 400 if they did.
//
// So a pool admin who tapped Delete Account was told to transfer admin first,
// having already lost every prediction and every score in every pool they were
// ever in. The account survived. Nothing else did. The 400 read like a refusal
// and was actually a receipt.
//
// ## Why a text scan rather than a behavioural test
//
// The honest test is "call the route with an admin user and assert the rows
// survive", and that needs a live Postgres with RLS, the FK graph and the
// service-role key — which is what makes this route hard to test at all and is
// part of why the bug lived. This guard is deliberately cheaper and narrower:
// it asserts the ORDER of two things in one file, which is the whole defect.
//
// ⚠ IT PROVES LESS THAN IT LOOKS. It cannot tell you the check is correct, only
// that it comes first. A check that queries the wrong column would pass here.
// Read it as "the destruction cannot be reached before the guard", nothing
// more.
//
// ⚠ ANCHOR ON THE CALL, NEVER THE COLUMN NAME. The first draft of this file
// searched for `admin_user_id` and matched the PROSE above the query — the
// comment explaining the bug — so it measured the position of a sentence. Any
// anchor here has to be a thing only code can be.
// =============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROUTE = join(process.cwd(), 'app/api/account/delete/route.ts')

/** The ownership query itself, not the paragraph that explains it. */
const GUARD = `.eq('admin_user_id'`

describe('account deletion checks pool ownership before it deletes anything', () => {
  const src = readFileSync(ROUTE, 'utf8')

  it('finds the two things at all — a rename must fail here, not pass silently', () => {
    // If either of these stops matching, every assertion below becomes
    // vacuously true. That is the failure mode a guard like this dies of.
    expect(src, 'the ownership guard queries pools.admin_user_id').toContain(GUARD)
    expect(src.match(/\.delete\(\)/g)?.length ?? 0,
      'the route still performs deletes').toBeGreaterThan(0)
  })

  it('the ownership guard appears before the first delete', () => {
    const guard = src.indexOf(GUARD)
    const firstDelete = src.indexOf('.delete()')
    expect(guard).toBeGreaterThan(-1)
    expect(firstDelete).toBeGreaterThan(-1)
    expect(guard, 'pool-ownership check must precede every delete').toBeLessThan(firstDelete)
  })

  it('the guard returns before reaching the deletes', () => {
    // Ordering alone is not enough: the check could sit at the top and fall
    // through. Assert the 400 return is between the query and the first delete.
    const guard = src.indexOf(GUARD)
    const firstDelete = src.indexOf('.delete()')
    const between = src.slice(guard, firstDelete)
    expect(between, 'the guard must RETURN 400, not merely observe').toContain('status: 400')
  })

  it('a failed ownership query does not read as "owns nothing"', () => {
    // `const { data } = await supabase…` discards the error, and a read that
    // failed then looks identical to a user who administers no pools — which
    // would open the delete path for everyone the moment `pools` was
    // unreadable. The error has to be captured and acted on.
    const guard = src.indexOf(GUARD)
    const before = src.slice(Math.max(0, guard - 400), guard)
    expect(before, 'the ownership read must destructure its error').toMatch(/error:\s*\w+Err/)
  })
})
