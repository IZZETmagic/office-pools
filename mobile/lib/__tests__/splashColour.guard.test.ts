import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// =============================================================
// The two splashes have to be the same colour, in both modes
// =============================================================
// There are two of them. The NATIVE splash is drawn by the OS from `app.json`
// before a line of JS runs, and the JS `Splash` component paints the same
// background a moment later, adds the wordmark, and crossfades out.
//
// ⚠ THE COLOUR IS THE ONLY THING JOINING THEM. The native layer carries no
// image at all — it is a solid ground, deliberately — so nothing else makes the
// two read as one screen. If the colours drift, the launch stops being a screen
// that gains a wordmark and becomes two screens handing over.
//
// ⚠⚠ AND THERE ARE NOW FOUR COLOURS TO KEEP STRAIGHT, not two: a light and a
// dark ground, each declared once in `app.json` for the OS and once in
// `Splash.tsx` for the JS layer. The OS picks its entry by the device's colour
// scheme, and the component picks its own with `useColorScheme()`. Get one pair
// wrong and the mismatch only appears in ONE mode — on whichever device nobody
// happened to test.
//
// ⚠⚠ THEY ALSO CANNOT SHIP SEPARATELY. The native colours are baked into the
// binary at prebuild, so they move only with a NATIVE BUILD, while the JS ones
// travel on an OTA. An OTA that changes a ground alone reaches devices still
// painting the old one — the drift this guards against is not only a typo, it
// is a delivery mismatch.
// =============================================================

const splashSource = readFileSync(
  resolve(process.cwd(), 'mobile/components/Splash.tsx'),
  'utf8',
);
const themeSource = readFileSync(
  resolve(process.cwd(), 'mobile/theme/colors.ts'),
  'utf8',
);
const appConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), 'mobile/app.json'), 'utf8'),
) as { expo: { plugins: (string | [string, Record<string, unknown>])[] } };

type NativeSplash = { backgroundColor?: string; dark?: { backgroundColor?: string }; image?: string };

function nativeSplashConfig(): NativeSplash {
  const entry = appConfig.expo.plugins.find(
    (p): p is [string, Record<string, unknown>] =>
      Array.isArray(p) && p[0] === 'expo-splash-screen',
  );
  if (!entry) throw new Error('expo-splash-screen is not configured in app.json');
  return entry[1] as NativeSplash;
}

/** The hex a `const NAME = '#RRGGBB';` declares in Splash.tsx. */
function jsGround(name: string): string | undefined {
  return splashSource.match(new RegExp(`const ${name} = '(#[0-9A-Fa-f]{6})';`))?.[1]?.toUpperCase();
}

const upper = (v: string | undefined) => v?.toUpperCase();

describe('the JS splash matches the native splash', () => {
  it('finds both colours the JS splash declares', () => {
    // Guards the guard: renaming either constant must fail loudly here rather
    // than quietly stop checking anything.
    expect(jsGround('SPLASH_BG_LIGHT')).toBeDefined();
    expect(jsGround('SPLASH_BG_DARK')).toBeDefined();
  });

  it('has no native image — the ground is the whole native screen', () => {
    // ⚠ Re-adding one is a real regression, not a tidy-up. A native image means
    // the OS draws artwork and the JS layer then draws a wordmark instead: two
    // different compositions, which is the hand-off this design removed. If an
    // image is genuinely wanted, the JS layer has to show the same thing.
    expect(nativeSplashConfig().image).toBeUndefined();
  });

  it('paints the same light ground the OS drew a moment earlier', () => {
    expect(jsGround('SPLASH_BG_LIGHT')).toBe(upper(nativeSplashConfig().backgroundColor));
  });

  it('paints the same dark ground, which is a separate pair entirely', () => {
    expect(jsGround('SPLASH_BG_DARK')).toBe(upper(nativeSplashConfig().dark?.backgroundColor));
  });

  it('lands the light splash on the app\'s own background, not "some white"', () => {
    // ⚠ THE POINT OF THE LIGHT MODE. The splash is revealing the app, so the
    // colour it dissolves into should already be the colour underneath it —
    // `snow.light`, the background the tabs draw on. Any other near-white makes
    // the reveal a visible step rather than a fade, and the difference is small
    // enough that it would be argued about rather than noticed.
    const snowLight = themeSource
      .match(/snow:\s*\{\s*light:\s*'(#[0-9A-Fa-f]{6})'/)?.[1]
      ?.toUpperCase();
    expect(snowLight).toBeDefined();
    expect(jsGround('SPLASH_BG_LIGHT')).toBe(snowLight);
  });

  it('keeps the two modes distinct', () => {
    // If these ever collapse to one value, one of the two modes has silently
    // lost its ground and the wordmark may be sitting on the wrong one.
    expect(jsGround('SPLASH_BG_LIGHT')).not.toBe(jsGround('SPLASH_BG_DARK'));
  });
});
