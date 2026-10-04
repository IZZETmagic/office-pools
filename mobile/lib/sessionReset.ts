import { clearCache } from './cache/persistentCache';
import { clearQueryCache } from './queryClient';
import { resetMyAvatar } from './useMyAvatar';

// =============================================================
// Everything that belongs to ONE signed-in member, forgotten in one place
// =============================================================
// ⭐⭐ THE RULE: anything held outside React that holds one member's data gets reset here. Not in
// the component that happens to own it, and not only in the Sign Out button's handler.
//
// ⚠⚠ WHY THIS FILE EXISTS. Signing out does not restart the JS bundle, so module-scoped state
// survives into the next session. `signOut()` cleared the on-disk cold-start cache and nothing
// else, which left the previous member's composed avatar in `useMyAvatar`'s module cache — and
// because that hook seeds from the cache and skips its fetch while the cache is warm, the second
// account to sign in on a device saw the first account's face until the app was killed (reported
// 2026-10-04). The disk cache was clearly thought about; the in-memory ones had no owner. This is
// the owner.
//
// ⚠ IT RUNS ON AN IDENTITY CHANGE, NOT JUST ON SIGN-OUT — see `lib/auth.tsx`. A refresh token that
// fails ends the session without anyone pressing Sign Out, and a teardown wired only to the button
// leaves exactly the same stale state behind.
// =============================================================

/**
 * Forget the outgoing member. Safe to call twice (sign-out calls it, and the auth listener sees
 * the same transition a moment later), and safe to call before anything has been cached.
 *
 * ⚠ SYNCHRONOUS AND NON-THROWING, deliberately. It is called from an auth-state callback where a
 * rejection would be unhandled, and each of these already swallows its own failures.
 */
export function resetSessionState(): void {
  // The app sandbox. On a shared phone this is the privacy-relevant one: pool names, member
  // initials and standings left on disk after someone signs out.
  clearCache();
  // The react-query cache — pools, fixtures, activity. Not all keys carry a user id.
  clearQueryCache();
  // The composed avatar SVG and its ground colour.
  resetMyAvatar();
}
