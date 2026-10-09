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

/**
 * The declared aliases, parsed out of the module.
 *
 * ⚠ ELEVEN FEELS DO NOT FIT. iOS expresses nine single-shot feels and Android
 * below API 30 expresses eight, so sharing is forced. The invariant is
 * therefore not "never share" — it is "share only where the table SAYS SO".
 */
function parseAliases(): { pair: [string, string]; platform: string; upTo: number }[] {
  const start = src.indexOf('export const DECLARED_ALIASES');
  expect(start, 'DECLARED_ALIASES should still be exported').toBeGreaterThan(-1);
  const body = src.slice(start, src.indexOf('\n];', start));
  const out: { pair: [string, string]; platform: string; upTo: number }[] = [];
  const re = /feels: \['(\w+)', '(\w+)'\],\s*\n\s*platform: '(\w+)',(?:\s*\n\s*upTo: (\d+),)?/g;
  for (let m = re.exec(body); m !== null; m = re.exec(body)) {
    out.push({
      pair: [m[1], m[2]],
      platform: m[3],
      // No `upTo` means it holds at every level (the iOS entries).
      upTo: m[4] ? Number(m[4]) : Number.POSITIVE_INFINITY,
    });
  }
  expect(out.length, 'no aliases parsed — the shape of DECLARED_ALIASES changed').toBeGreaterThan(0);
  return out;
}

/** Mirrors `resolveAndroidRung` in the module under test. */
function rungAt(rungs: Rung[], api: number): Rung {
  return rungs.find((r) => api >= r.minApi) ?? rungs[rungs.length - 1];
}

/** Collisions the table declares, as the `a + b` key `duplicates` reports. */
function allowed(platform: 'ios' | 'android', api: number): Set<string> {
  return new Set(
    parseAliases()
      .filter((a) => a.platform === platform && api <= a.upTo)
      // `duplicates` joins names in table order, so both orders are allowed.
      .flatMap((a) => [`${a.pair[0]} + ${a.pair[1]}`, `${a.pair[1]} + ${a.pair[0]}`]),
  );
}

function undeclared(found: string[], ok: Set<string>): string[] {
  return found.filter((f) => !ok.has(f.split(' both resolve to ')[0]));
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
    // ⚠ DISPATCHERS, NOT FEELS. `hapticToggle(on)` picks between two entries
    // rather than naming one, so it has no table row and cannot have one. It is
    // listed here BY NAME for the same reason the aliases are written down: an
    // exception that is declared stays reviewable, and the rule stays absolute
    // for everything else. A new `hapticX` with no entry would throw on its
    // first tap, which is what this test is really protecting.
    // `cardTap` is `selection` under a name every card shares, so the card-tap
    // decision has one switch instead of twenty call sites. Like `toggle`, it
    // names no row of its own.
    const DISPATCHERS = ['toggle', 'cardTap'];
    const exported = [...src.matchAll(/^export function haptic(\w+)\(/gm)]
      .map((m) => m[1][0].toLowerCase() + m[1].slice(1))
      .filter((name) => !DISPATCHERS.includes(name));
    expect([...exported].sort()).toEqual([...feels.map((f) => f.name)].sort());
  });

  it('shares an iOS call only where the table declares it', () => {
    // ⚠ THE ORIGINAL BUG was `selection` and `press` both reading
    // `selectionAsync()` with nobody having decided it. Sharing is now legal,
    // but only in DECLARED_ALIASES — an undeclared one still fails here.
    const found = duplicates(feels.map((f) => ({ name: f.name, call: f.ios })));
    expect(undeclared(found, allowed('ios', 0))).toEqual([]);
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
      // `longPress` both landed on Long_Press — undeclared.
      expect(undeclared(duplicates(pairs), allowed('android', api))).toEqual([]);
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

  it('declares no alias that is not a real collision', () => {
    // ⚠ CHECKED BOTH WAYS so the list cannot rot. An entry that no longer
    // describes a collision — because a constant was freed up, or a feel was
    // retimed — is a stale excuse, and stale excuses are how a guard stops
    // guarding. Delete it rather than leaving it to cover a future accident.
    for (const alias of parseAliases()) {
      const [a, b] = alias.pair;
      const fa = feels.find((f) => f.name === a);
      const fb = feels.find((f) => f.name === b);
      expect(fa, `alias names \`${a}\`, which is not in the table`).toBeDefined();
      expect(fb, `alias names \`${b}\`, which is not in the table`).toBeDefined();

      if (alias.platform === 'ios') {
        expect(fa!.ios, `ios alias \`${a}\` + \`${b}\` is stale — they differ now`).toBe(fb!.ios);
      } else {
        // Check at the level the declaration claims it bites.
        const api = alias.upTo === Number.POSITIVE_INFINITY ? 24 : alias.upTo;
        const ra = rungAt(fa!.android, api);
        const rb = rungAt(fb!.android, api);
        expect(
          ra.pattern ? `p:${ra.pattern}` : `c:${ra.constant}`,
          `android alias \`${a}\` + \`${b}\` is stale at API ${api} — they differ now`,
        ).toBe(rb.pattern ? `p:${rb.pattern}` : `c:${rb.constant}`);
      }
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
