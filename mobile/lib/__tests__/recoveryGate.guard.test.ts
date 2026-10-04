import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// =============================================================
// A reset holds on "choose a new password" until it is saved or skipped
// =============================================================
// Verifying a reset code creates a session. The root gate's later branches
// send any session onward — to the notifications screen if this phone has
// never shown it, else out of (auth) into the tabs — so the `recovering`
// branch only works if it runs BEFORE them. Moved below either, the code
// screen would drop people into the app with a password they still don't know.
// =============================================================

const layout = readFileSync(join(__dirname, '../../app/_layout.tsx'), 'utf8');
const auth = readFileSync(join(__dirname, '../auth.tsx'), 'utf8');

describe('root gate', () => {
  it('checks `recovering` after the signed-out branch and before every signed-in one', () => {
    const signedOut = layout.indexOf('if (!session) {');
    const recovering = layout.indexOf('if (recovering) {');
    const notifications = layout.indexOf('if (!notificationsPrompted) {');
    const intoTabs = layout.indexOf("router.replace('/(tabs)')");

    expect(signedOut).toBeGreaterThan(-1);
    expect(recovering).toBeGreaterThan(signedOut);
    expect(notifications).toBeGreaterThan(recovering);
    expect(intoTabs).toBeGreaterThan(recovering);
  });

  it('holds on the new-password screen and re-runs when the flag changes', () => {
    expect(layout).toContain("router.replace('/(auth)/new-password')");
    expect(layout).toMatch(/\}, \[\s*session,\s*recovering,/);
  });
});

describe('verifyResetCode', () => {
  it('raises `recovering` before verifyOtp, so no render sees the session without it', () => {
    const body = auth.slice(auth.indexOf('async verifyResetCode('));
    expect(body.indexOf('setRecovering(true)')).toBeGreaterThan(-1);
    expect(body.indexOf('setRecovering(true)')).toBeLessThan(body.indexOf('verifyOtp('));
  });

  it('drops `recovering` whenever the session goes away', () => {
    expect(auth).toMatch(/if \(!nextSession\) setRecovering\(false\)/);
  });
});
