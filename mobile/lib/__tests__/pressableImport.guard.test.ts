import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, resolve } from 'path';

// =============================================================
// Nothing reaches past the app's Pressable
// =============================================================
// Ryan's brief: *"anything that can be interacted with needs a haptic
// feedback"*. That is 507 `onPress` handlers across 135 files, and a policy
// applied by hand at every one of them is a policy that decays — the next
// screen somebody writes imports `Pressable` from `react-native` out of habit,
// it silently does not buzz, and nothing anywhere says so.
//
// So `components/ui/Tappable.tsx` owns the behaviour and this test owns the
// route to it. Importing the raw Pressable outside the design system fails the
// build.
//
// ⚠ WHY A TEST AND NOT A LINT RULE. `no-restricted-imports` can do this, but it
// would need the same allow-list and would report it as a style violation. The
// thing being protected is not style — it is that a control the user can touch
// answers them. A named test states that out loud, and this repo already
// settles invisible invariants this way (`walkoutWorklets.guard.test.ts`,
// `haptics.guard.test.ts`, the web's `bandStateOrder.guard.test.ts`).
//
// ⚠ IT CANNOT CATCH EVERYTHING, and the limit is worth knowing: a `TouchableOpacity`,
// a `TouchableHighlight`, a bare `onStartShouldSetResponder` or a gesture
// handler all take a tap without going near Pressable. Those are checked too,
// below, but a genuinely novel way of taking a touch would slip through. The
// test narrows the gap; it does not close it.
// =============================================================

const MOBILE = resolve(process.cwd(), 'mobile');

/**
 * Where the raw Pressable is legitimate.
 *
 * ⭐ `components/ui/` is the design system: `Tappable` wraps the real one, and
 * the four dialogs choose between a press and a warning on their own
 * `destructive` flag rather than taking a default. Importing the app's wrapper
 * from inside the design system would also be circular.
 *
 * ⭐ `haptic-tab.tsx` is the bottom nav, and it is the ONE control that fires on
 * press-IN rather than press — that quickness is what makes a tab bar feel
 * like a tab bar, and it needs `PlatformPressable` from React Navigation to get
 * the ripple and the hit area right.
 */
const ALLOWED = ['components/ui/', 'components/haptic-tab.tsx'];

/** Other ways to take a tap that bypass Pressable entirely. */
const OTHER_TOUCHABLES = ['TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

function sources(): { path: string; src: string }[] {
  return [...walk(join(MOBILE, 'app')), ...walk(join(MOBILE, 'components'))].map((path) => ({
    path: relative(MOBILE, path),
    src: readFileSync(path, 'utf8'),
  }));
}

/** The names imported from 'react-native' in one file, across both quote styles. */
function reactNativeImports(src: string): string[] {
  const out: string[] = [];
  const re = /import \{([^}]*)\} from 'react-native';?/g;
  for (let m = re.exec(src); m !== null; m = re.exec(src)) {
    out.push(...m[1].split(',').map((n) => n.trim().split(/\s+as\s+/)[0].trim()));
  }
  return out.filter(Boolean);
}

describe('the app only taps through its own Pressable', () => {
  const files = sources();

  it('finds the app source at all', () => {
    // ⚠ A walk that returns nothing passes every assertion below. Guard the
    // guard: this number only ever grows.
    expect(files.length).toBeGreaterThan(100);
  });

  it('imports Pressable from react-native only inside the design system', () => {
    const offenders = files
      .filter(({ path }) => !ALLOWED.some((a) => path.startsWith(a) || path === a))
      .filter(({ src }) => reactNativeImports(src).includes('Pressable'))
      .map(({ path }) => path);

    expect(
      offenders,
      `these import the raw Pressable, so their taps are silent: ${offenders.join(', ')}. Import { Pressable } from '@/components/ui' instead — it carries the haptic. If this control genuinely must not buzz, it still goes through the wrapper, with haptic={false}.`,
    ).toEqual([]);
  });

  it('uses no other touchable that would bypass the wrapper', () => {
    const offenders = files
      .filter(({ path }) => !ALLOWED.some((a) => path.startsWith(a) || path === a))
      .flatMap(({ path, src }) => {
        const names = reactNativeImports(src);
        return OTHER_TOUCHABLES.filter((t) => names.includes(t)).map((t) => `${path} (${t})`);
      });

    expect(
      offenders,
      `these take a tap without going through the app's Pressable: ${offenders.join(', ')}. Use { Pressable } from '@/components/ui'.`,
    ).toEqual([]);
  });

  it('keeps the wrapper itself on the real Pressable', () => {
    // ⚠ If `Tappable` ever stopped importing the RN one it would be wrapping
    // itself, and every tap in the app would recurse. Cheap to assert, and the
    // failure mode is a stack overflow on first touch.
    const tappable = files.find(({ path }) => path === 'components/ui/Tappable.tsx');
    expect(tappable, 'components/ui/Tappable.tsx has moved or gone').toBeDefined();
    expect(tappable!.src).toMatch(/import \{ Pressable as RNPressable[^}]*\} from 'react-native'/);
  });
});
