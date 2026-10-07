// Asking a member whose notifications are off (mobile/lib/pushAsk.ts): which way back a phone has,
// when the one popup may open, and when the Activity card shows. Then three source-text guards on
// the promises that live outside the pure module: the welcome screens share the popup's "once",
// Home has one ask rather than two, and the preview screen can never spend the real OS prompt.

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

import { pushAskMode, shouldShowPushCard, shouldShowPushPopup, type PopupInputs } from '../pushAsk';

const MOBILE = join(__dirname, '..', '..');

/** Source without comments, so a rule explained in prose can't pass for the code that keeps it. */
function code(path: string): string {
  return readFileSync(join(MOBILE, path), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
    .join('\n');
}

describe('pushAskMode', () => {
  it('nothing to ask when notifications are on, or before the phone has answered', () => {
    expect(pushAskMode(null)).toBeNull();
    expect(pushAskMode({ status: 'granted', canAskAgain: true })).toBeNull();
    expect(pushAskMode({ status: 'granted', canAskAgain: false })).toBeNull();
  });
  it('never asked: the OS box', () => {
    expect(pushAskMode({ status: 'undetermined', canAskAgain: true })).toBe('prompt');
  });
  it('Android after one refusal is still the OS box, because it can ask again', () => {
    expect(pushAskMode({ status: 'denied', canAskAgain: true })).toBe('prompt');
  });
  it('once the OS will not ask again, the way back is Settings', () => {
    expect(pushAskMode({ status: 'denied', canAskAgain: false })).toBe('settings');
    expect(pushAskMode({ status: 'undetermined', canAskAgain: false })).toBe('settings');
  });
});

describe('shouldShowPushPopup', () => {
  const ready: PopupInputs = { signedIn: true, mode: 'prompt', shown: false, homeFocused: true, splashGone: true };

  it('opens when everything lines up, in either mode', () => {
    expect(shouldShowPushPopup(ready)).toBe(true);
    expect(shouldShowPushPopup({ ...ready, mode: 'settings' })).toBe(true);
  });
  it('never twice on a phone, and not before the flag has been read', () => {
    expect(shouldShowPushPopup({ ...ready, shown: true })).toBe(false);
    expect(shouldShowPushPopup({ ...ready, shown: null })).toBe(false);
  });
  it('not when notifications are on or unknown', () => {
    expect(shouldShowPushPopup({ ...ready, mode: null })).toBe(false);
  });
  it('only signed in, only on Home, only once the splash has gone', () => {
    expect(shouldShowPushPopup({ ...ready, signedIn: false })).toBe(false);
    expect(shouldShowPushPopup({ ...ready, homeFocused: false })).toBe(false);
    expect(shouldShowPushPopup({ ...ready, splashGone: false })).toBe(false);
  });
});

describe('shouldShowPushCard', () => {
  it('shows while notifications are off and the card has not been closed', () => {
    expect(shouldShowPushCard('prompt', false)).toBe(true);
    expect(shouldShowPushCard('settings', false)).toBe(true);
  });
  it('closed stays closed; on, or not yet known, shows nothing', () => {
    expect(shouldShowPushCard('prompt', true)).toBe(false);
    expect(shouldShowPushCard(null, false)).toBe(false);
    expect(shouldShowPushCard('prompt', null)).toBe(false);
  });
});

describe('the promises around it', () => {
  it('the welcome screens ask counts as the popup’s once', () => {
    const src = code('lib/useOnboardingProgress.ts');
    const body = src.slice(src.indexOf('export async function markNotificationsPrompted'));
    expect(body.slice(0, body.indexOf('\n}'))).toContain('markPushAskShown(');
  });

  it('Home has one ask: the popup, not the old dialog beside it', () => {
    const home = code('app/(tabs)/index.tsx');
    expect(home).toContain('<PushAskGate');
    expect(home).not.toContain('useNotificationPrompt');
    expect(existsSync(join(MOBILE, 'lib/useNotificationPrompt.ts'))).toBe(false);
  });

  it('the preview screen never touches the OS permission — iOS shows its box once per install', () => {
    const harness = code('app/push-ask-harness.tsx');
    expect(harness).not.toMatch(/usePushPermission|requestPermissionsAsync|expo-notifications/);
  });
});
