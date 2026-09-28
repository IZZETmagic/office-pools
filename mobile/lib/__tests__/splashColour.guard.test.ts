import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// =============================================================
// The two splashes have to be the same colour
// =============================================================
// There are two of them. The NATIVE splash is drawn by the OS from
// `app.json` before a line of JS runs, and the JS `Splash` component paints the
// same mark on the same background a moment later and crossfades out. The
// hand-off is invisible only because those two backgrounds are the same solid
// colour — that is the whole trick, and it is why the trophy appears to sit
// still while the layer underneath it dissolves.
//
// ⚠ NOTHING KEEPS THEM IN SYNC. `SPLASH_BG` is a hex string hand-copied into
// `components/Splash.tsx`, and its only tie to `app.json` is a comment saying
// it matches. Change one and the app gains a flash at launch — and it is a
// flash on the very first frame a person sees, on a screen that nothing in
// this repo renders in CI.
//
// ⚠⚠ THEY ALSO CANNOT SHIP SEPARATELY. The native colour is baked into the
// binary at prebuild, so it only moves with a NATIVE BUILD, while the JS one
// travels on an OTA. An OTA that changes `SPLASH_BG` alone reaches devices
// whose native splash is still the old colour — the drift this guards against
// is not only a typo, it is a delivery mismatch.
// =============================================================

const splashSource = readFileSync(
  resolve(process.cwd(), 'mobile/components/Splash.tsx'),
  'utf8',
);
const appConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), 'mobile/app.json'), 'utf8'),
) as {
  expo: { plugins: (string | [string, Record<string, unknown>])[] };
};

function nativeSplashConfig(): { backgroundColor?: string; dark?: { backgroundColor?: string } } {
  const entry = appConfig.expo.plugins.find(
    (p): p is [string, Record<string, unknown>] =>
      Array.isArray(p) && p[0] === 'expo-splash-screen',
  );
  if (!entry) throw new Error('expo-splash-screen is not configured in app.json');
  return entry[1] as { backgroundColor?: string; dark?: { backgroundColor?: string } };
}

describe('the JS splash matches the native splash', () => {
  it('finds the colour the JS splash paints', () => {
    // Guards the guard: a rename of the constant must fail loudly here rather
    // than quietly stop checking anything.
    expect(splashSource).toMatch(/const SPLASH_BG = '#[0-9A-Fa-f]{6}';/);
  });

  it('paints the same background the OS drew a moment earlier', () => {
    const js = splashSource.match(/const SPLASH_BG = '(#[0-9A-Fa-f]{6})';/)?.[1];
    expect(js?.toUpperCase()).toBe(nativeSplashConfig().backgroundColor?.toUpperCase());
  });

  it('matches in dark mode too, where the OS picks a different entry', () => {
    // `dark.backgroundColor` is what the OS uses on a dark-mode device. If it
    // ever differs from the light one, the JS splash — which is a single solid
    // colour — can only match one of them, and this is where that decision
    // gets made rather than discovered.
    const js = splashSource.match(/const SPLASH_BG = '(#[0-9A-Fa-f]{6})';/)?.[1];
    const dark = nativeSplashConfig().dark?.backgroundColor;
    expect(dark?.toUpperCase()).toBe(js?.toUpperCase());
  });
});
