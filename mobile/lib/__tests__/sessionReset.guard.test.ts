// =============================================================
// Signing out forgets the member — all of them, not just the one on disk
// =============================================================
// Reported 2026-10-04: sign out, sign into a SECOND account, and the profile
// card draws the FIRST account's avatar. Not for a frame — until the app was
// killed. `useMyAvatar` holds the composed SVG in a module-scoped `cached`,
// signing out does not restart the JS bundle, and the hook seeds its state from
// that cache and returns early from its fetch while the cache is warm. So the
// wrong face was both shown immediately and never corrected.
//
// `signOut()` already cleared the on-disk cold-start cache, which is what makes
// this worth a guard: the hard-to-remember cache had an owner and the easy ones
// did not. Every per-member cache now goes through `sessionReset.ts`.
//
// ⚠ SOURCE-TEXT, like the other guards here. The behaviour lives in a React
// Native auth provider and a hook, neither of which the root vitest can import
// (it resolves against the root `node_modules`, and both reach `react-native`
// transitively). What a text guard CAN do is make the removal of the wiring
// loud instead of silent — and silence is exactly how this shipped.
// =============================================================

import { readFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

const LIB = join(__dirname, '..');
const APP = join(__dirname, '..', '..', 'app');

/**
 * ⚠ COMMENTS STRIPPED. Every file involved explains the rule in prose and names
 * the functions while doing so, so a scan of the raw text would pass on the
 * explanation alone — and would keep passing after the call was deleted.
 */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
    .join('\n');
}

describe('the session teardown', () => {
  it('forgets all three caches, not just the one on disk', () => {
    // The whole point of the file. A fourth per-member cache added later is
    // only as safe as this list is complete, but a list of two was the bug.
    const src = code(join(LIB, 'sessionReset.ts'));
    for (const call of ['clearCache()', 'clearQueryCache()', 'resetMyAvatar()']) {
      expect(
        src.includes(call),
        `sessionReset no longer calls ${call}. Whatever that cache holds now ` +
          'survives into the next member\'s session on this device.',
      ).toBe(true);
    }
  });

  it('is what sign-out calls — and sign-out does not clear caches by hand', () => {
    const src = code(join(LIB, 'auth.tsx'));
    expect(
      src.includes('resetSessionState()'),
      'auth.tsx stopped calling resetSessionState(). Signing out now leaves ' +
        'the outgoing member\'s avatar, queries and disk cache in place.',
    ).toBe(true);
    // ⚠ The point of the indirection. `signOut` used to call `clearCache()`
    // directly, which is precisely why the other two caches were missed: there
    // was no single place that meant "forget this member".
    expect(
      /\bclearCache\b/.test(src),
      'auth.tsx is clearing a cache directly again. Teardown belongs in ' +
        'sessionReset.ts, or the next cache added will be forgotten the same ' +
        'way the avatar was.',
    ).toBe(false);
  });

  it('runs on an identity change too, not only on the Sign Out button', () => {
    // A refresh token that fails ends the session with nobody pressing
    // anything — `getSession()` rejects, the provider treats it as signed out
    // and the gate routes to sign-in. A teardown wired to the button alone
    // leaves the whole of that member's state for whoever signs in next.
    const src = code(join(LIB, 'auth.tsx'));
    // ⚠ TWO CALL SITES, COUNTED. An `onAuthStateChange([\s\S]*?)resetSessionState`
    // regex looks tighter and is not: it happily matches from the listener all
    // the way down into `signOut`'s call, so it passes with the listener's own
    // teardown deleted. Counting is what actually fails.
    expect(
      src.match(/resetSessionState\(\)/g)?.length ?? 0,
      'auth.tsx should tear down in TWO places — the Sign Out handler and the ' +
        'auth-state listener. A session that ends without a press (a refresh ' +
        'token that fails) only goes through the listener.',
    ).toBeGreaterThanOrEqual(2);
    // ⚠ And it must still be able to TELL an identity change from a token
    // refresh, which fires the same listener repeatedly for the same member.
    // Scoped to the comparison, so deleting the call next to it fails here too.
    expect(
      /seenUserId[\s\S]{0,160}?resetSessionState\(\)/.test(src),
      'The listener lost the last-seen user id, or stopped tearing down when ' +
        'it changes. Without that comparison, either every token refresh wipes ' +
        'the caches or no account switch does.',
    ).toBe(true);
  });

  it('can reach the query cache at all', () => {
    // The client is held in `useState` in the root layout, so nothing outside
    // that component can empty it unless the layout hands it over.
    const src = code(join(APP, '_layout.tsx'));
    expect(
      src.includes('registerQueryClient('),
      'The root layout stopped registering its QueryClient, so ' +
        'clearQueryCache() is now a silent no-op and cached pools, fixtures ' +
        'and activity survive a sign-out.',
    ).toBe(true);
  });
});

describe('the avatar cache', () => {
  const src = code(join(LIB, 'useMyAvatar.ts'));

  it('is emptied by resetMyAvatar, not merely marked stale', () => {
    // Marking it stale leaves the old face on screen until a refetch lands —
    // one member's likeness rendered inside another member's session. Initials
    // for a few hundred milliseconds is the correct trade.
    expect(
      /export function resetMyAvatar\(\): void \{[\s\S]*?cached = null/.test(src),
      'resetMyAvatar no longer drops `cached`. The next member to sign in on ' +
        'this device sees the previous one\'s avatar.',
    ).toBe(true);
  });

  it('ignores a response that belongs to the session that just ended', () => {
    // The subtle half. Dropping `cached` cannot cancel a request already in
    // flight; without the generation check its `.then` writes the outgoing
    // member's face back in a moment later, which reads as an unreproducible
    // race rather than a bug.
    expect(
      /generation \+= 1/.test(src),
      'resetMyAvatar stopped bumping `generation`, so an in-flight request ' +
        'from the old session can repopulate the cache after the reset.',
    ).toBe(true);
    expect(
      /if \(g === generation\) \{/.test(src),
      'The load path no longer checks the generation before caching, so a ' +
        'response from an ended session is treated as current.',
    ).toBe(true);
  });
});
