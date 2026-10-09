import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// =============================================================
// Two feels may never resolve to the same call
// =============================================================
// `lib/haptics.ts` names seven distinct sensations. Nothing in the type system
// stops two of them from bottoming out in the SAME platform call, and when
// that happens it is invisible: the names still read differently, every call
// site still compiles, and the only symptom is on a device, where a
// distinction the UI was designed around simply is not there.
//
// That is not hypothetical — it is why this file exists. The first version of
// `lib/haptics.ts` shipped with two collisions:
//
//   · `hapticSelection` and `hapticPress` both called `selectionAsync()` on
//     iOS. `app/pool/[id]/pickem/[entryId].tsx` was deliberately built so the
//     matchweek arrow felt firmer than a club pick, with a comment explaining
//     the choice. On iPhone the two were byte-identical.
//   · `hapticDragStart` and `hapticLongPress` both fell to `Long_Press` below
//     API 34, so picking a club up in `TablePicker` felt the same as opening a
//     reaction picker in Banter.
//
// ⚠ NOTHING ELSE CATCHES THIS. tsc is happy, eslint is happy, the Android
// bundle builds, and there are no simulator destinations on this machine to
// feel it on. Same situation as `walkoutWorklets.guard.test.ts`, and the same
// answer: assert the invariant in a test.
//
// ⚠ This reads the SOURCE rather than importing the module, because importing
// it pulls in `react-native`'s `Platform` and `expo-haptics`' native module,
// neither of which resolves under plain vitest. Crude, and the same technique
// the web's `bandStateOrder.guard.test.ts` uses for the same reason.
// =============================================================

const src = readFileSync(resolve(process.cwd(), 'mobile/lib/haptics.ts'), 'utf8');

/**
 * The five constants `HapticsRecord.kt` resolves at ANY API level — they are
 * the only ones with an explicit `when` fallback when reflection misses.
 *
 * ⚠ KEEP THIS LIST IN STEP WITH THE KOTLIN, not with what sounds reasonable.
 * Expo's `HapticsRecord.toHapticFeedbackType()` catches `NoSuchFieldException`
 * and maps exactly these; everything else re-throws
 * `HapticsNotSupportedException`.
 */
const ALWAYS_SAFE = ['Clock_Tick', 'Context_Click', 'Keyboard_Tap', 'Long_Press', 'Virtual_Key'];

/** The body of the `FEELS` table, from `const FEELS = {` to its `} as const`. */
function feelsBody(): string {
  const start = src.indexOf('const FEELS = {');
  const end = src.indexOf('} as const satisfies', start);
  expect(start, 'the FEELS table should still be declared as `const FEELS = {`').toBeGreaterThan(-1);
  expect(end, 'the FEELS table should still close with `} as const satisfies`').toBeGreaterThan(
    start,
  );
  return src.slice(start, end);
}

type Rung = { minApi: number; constant?: string; pattern?: string };
type Parsed = { name: string; ios: string; android: Rung[] };

/**
 * Pull each feel out of the table: its name, the literal text of its iOS call,
 * and its Android ladder as rungs.
 *
 * Deliberately a parse of the source rather than a structural import — see the
 * header. It is tied to the table's shape, which is the point: if someone
 * reshapes the table, this fails loudly rather than silently passing on
 * nothing.
 */
function parseFeels(): Parsed[] {
  const body = feelsBody();
  // Each entry starts at `  <name>: {` at the table's indent level.
  const entryRe = /^ {2}(\w+): \{$/gm;
  const starts: { name: string; at: number }[] = [];
  for (let m = entryRe.exec(body); m !== null; m = entryRe.exec(body)) {
    starts.push({ name: m[1], at: m.index });
  }
  expect(starts.length, 'no feels parsed out of the FEELS table').toBeGreaterThan(0);

  return starts.map(({ name, at }, i) => {
    const chunk = body.slice(at, i + 1 < starts.length ? starts[i + 1].at : undefined);

    // `ios:` is a STRUCTURED SPEC, not a thunk — `{ kind: 'impact', style:
    // IMPACT.Rigid }`. Flattened to one string here purely so two feels can be
    // compared for equality.
    const iosSpec = /ios: \{([^}]*)\}/.exec(chunk);
    expect(iosSpec, `feel \`${name}\` has no parsable \`ios:\` spec`).not.toBeNull();
    const kind = /kind:\s*'(\w+)'/.exec(iosSpec![1]);
    const arg = /(?:style|type):\s*\w+\.(\w+)/.exec(iosSpec![1]);
    expect(kind, `feel \`${name}\`'s ios spec has no \`kind\``).not.toBeNull();
    const ios: [string] = [arg ? `${kind![1]}:${arg[1]}` : kind![1]];

    const android = /android: \[([\s\S]*?)\],?\s*\}/.exec(chunk);
    expect(android, `feel \`${name}\` has no parsable \`android:\` ladder`).not.toBeNull();

    const rungs: Rung[] = [];
    const rungRe = /\{([^}]*)\}/g;
    for (let m = rungRe.exec(android![1]); m !== null; m = rungRe.exec(android![1])) {
      const text = m[1];
      const minApi = /minApi:\s*(\d+)/.exec(text);
      const constant = /constant:\s*A\.(\w+)/.exec(text);
      const pattern = /pattern:\s*NOTIFY\.(\w+)/.exec(text);
      rungs.push({
        minApi: minApi ? Number(minApi[1]) : 0,
        constant: constant?.[1],
        pattern: pattern?.[1],
      });
    }
    expect(rungs.length, `feel \`${name}\` parsed an empty ladder`).toBeGreaterThan(0);

    return { name, ios: ios[0], android: rungs };
  });
}

/** Mirrors `resolveAndroidRung` in the module under test. */
function rungAt(rungs: Rung[], api: number): Rung {
  return rungs.find((r) => api >= r.minApi) ?? rungs[rungs.length - 1];
}

function duplicates(pairs: { name: string; call: string }[]): string[] {
  const seen = new Map<string, string[]>();
  for (const { name, call } of pairs) seen.set(call, [...(seen.get(call) ?? []), name]);
  return [...seen.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([call, names]) => `${names.join(' + ')} both resolve to ${call}`);
}

describe('the haptics table', () => {
  const feels = parseFeels();

  it('parses every export in the module', () => {
    const exported = [...src.matchAll(/^export function haptic(\w+)\(/gm)].map(
      (m) => m[1][0].toLowerCase() + m[1].slice(1),
    );
    // Every `hapticX` export must have a matching table entry and vice versa —
    // an export with no entry would throw at runtime on its first tap.
    expect([...exported].sort()).toEqual([...feels.map((f) => f.name)].sort());
  });

  it('gives every feel a distinct call on iOS', () => {
    // ⚠ THE ORIGINAL BUG. `selection` and `press` both read `selectionAsync()`.
    expect(duplicates(feels.map((f) => ({ name: f.name, call: f.ios })))).toEqual([]);
  });

  // 24 is below every gate (the floor, whatever Expo's template sets), 30 adds
  // Confirm/Reject/Gesture_Start, 34 adds Drag_Start. A collision can exist at
  // one and not another, so each is checked on its own.
  for (const api of [24, 30, 34]) {
    it(`gives every feel a distinct call on Android API ${api}`, () => {
      const pairs = feels.map((f) => {
        const r = rungAt(f.android, api);
        return { name: f.name, call: r.pattern ? `pattern:${r.pattern}` : `constant:${r.constant}` };
      });
      // ⚠ THE OTHER ORIGINAL BUG, which only showed below 34: `dragStart` and
      // `longPress` both landed on Long_Press.
      expect(duplicates(pairs)).toEqual([]);
    });
  }

  it('ends every ladder somewhere every device can reach', () => {
    for (const f of feels) {
      const last = f.android[f.android.length - 1];
      expect(last.minApi, `feel \`${f.name}\` ends on a GATED rung — old devices get nothing`).toBe(
        0,
      );
      if (last.constant) {
        // A pattern always works; a constant must be one of the five.
        expect(
          ALWAYS_SAFE,
          `feel \`${f.name}\` ends on ${last.constant}, which HapticsRecord.kt cannot resolve below the API that introduced it`,
        ).toContain(last.constant);
      }
    }
  });

  it('orders every ladder from the highest API down', () => {
    for (const f of feels) {
      const apis = f.android.map((r) => r.minApi);
      expect(
        [...apis].sort((a, b) => b - a),
        `feel \`${f.name}\`'s ladder is out of order — \`resolveAndroidRung\` takes the FIRST match, so a low rung above a high one shadows it`,
      ).toEqual(apis);
    }
  });

  it('never reaches for the Vibrator where a constant would do', () => {
    // `notificationAsync` is the discouraged path on Android: it needs VIBRATE
    // and ignores the system touch-feedback setting. It is allowed only as a
    // RHYTHM, which no constant can express — so only these three may use it.
    const patternFeels = feels.filter((f) => f.android.some((r) => r.pattern)).map((f) => f.name);
    expect([...patternFeels].sort()).toEqual(['failure', 'success', 'warning']);
  });
});
