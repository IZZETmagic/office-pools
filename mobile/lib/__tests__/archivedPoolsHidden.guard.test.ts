// =============================================================
// An archived pool is not a visible pool
// =============================================================
// Archiving stamps `pools.archived_at` (migration 040) and DELIBERATELY leaves
// `pools.status` alone — status is the competition lifecycle, CHECK-constrained
// to (open, completed), and a pool can be both completed and archived. The two
// are separate axes.
//
// That is the whole bug this guard exists for: every mobile pool list filtered
// on `status`, so an archived pool was still `status = 'open'` and still drew
// on the home dashboard and the Pools tab — and still counted toward the
// dashboard's `totalPoints` and `bestRank`. It looked handled because three
// downstream hooks (useSeasons, usePodium, useTrophies) each subtracted the
// archived set by hand; the two surfaces that matter most did not.
//
// ⚠ SOURCE-TEXT, because the seam is a PostgREST query string. Asserting the
// behaviour would mean a live database or a mock deep enough to interpret an
// embedded `is.null` filter, and neither exists here. What this can do is make
// the filter's removal loud.
// =============================================================

import { readFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

const LIB = join(__dirname, '..');

/**
 * ⚠ COMMENTS STRIPPED. Each of these files explains the rule in prose and
 * names the filter while doing so, so a naive scan would pass on the
 * explanation alone — and keep passing after the code was deleted.
 */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
    .join('\n');
}

describe('archived pools stay out of the mobile pool lists', () => {
  it('⚠ the home query excludes them — it feeds BOTH the dashboard and the Pools tab', () => {
    // `useHomeData` is the single source of every pool list the app draws:
    // `pools` (home dashboard) and `allPools` (Pools tab, seasons, podium) are
    // both derived from this one read, so this is the only place the filter
    // has to be — and the only place it can be removed from to break all of
    // them at once.
    const src = code(join(LIB, 'useHomeData.ts'));
    expect(
      /\.is\(\s*['"]pools\.archived_at['"]\s*,\s*null\s*\)/.test(src),
      'useHomeData lost its archived filter. Without it an archived pool is ' +
        "still status='open' and renders on the home dashboard and the Pools " +
        'tab, and counts toward totalPoints / bestRank.',
    ).toBe(true);
  });

  it('Discover does not offer one to join', () => {
    // An archived pool is read-only. Offering it in Discover invites a member
    // into a pool they cannot predict in — and `status = 'open'` alone does
    // not exclude it.
    const src = code(join(LIB, 'useDiscoverPools.ts'));
    expect(
      /\.is\(\s*['"]archived_at['"]\s*,\s*null\s*\)/.test(src),
      'useDiscoverPools lost its archived filter — the Pools tab will offer ' +
        'archived public pools to join.',
    ).toBe(true);
  });

  it('the archived screen still asks for the INVERSE, so the pools remain reachable', () => {
    // The flip side of the rule above. Hiding archived pools everywhere is
    // only acceptable because this one hook shows them: nothing is deleted,
    // and an admin restores from there. If this filter inverts or vanishes,
    // archiving becomes a one-way door.
    const src = code(join(LIB, 'useArchivedPools.ts'));
    expect(
      /\.not\(\s*['"]pool\.archived_at['"]\s*,\s*['"]is['"]\s*,\s*null\s*\)/.test(src),
      'useArchivedPools no longer selects archived pools — Settings → ' +
        'Archived pools is the only way back to one.',
    ).toBe(true);
  });
});
