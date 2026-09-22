// =============================================================
// Club colours, and the clash rule
// =============================================================
// Two things here can be wrong in ways that look fine on the one fixture you
// happen to be looking at:
//
//   · a colour that fails contrast is unreadable only for the club it belongs
//     to, so it ships and surfaces months later;
//   · a clash rule that is too loose draws Arsenal against Manchester United in
//     two reds nobody can tell apart, on maybe six fixtures a season.
//
// Both are asserted rather than eyeballed.
// =============================================================

import { describe, it, expect } from 'vitest';

import {
  CLUB_ALT_COLOR,
  CLUB_COLOR,
  clubAltColorFromCrestUrl,
  clubColorFromCrestUrl,
  clubOnSurface,
  colourFamily,
  clubIdFromCrestUrl,
  clubInk,
  clubBarNeedsHairline,
  fixturePalette,
} from '../design/clubColors';

const FALLBACK = { home: '#111111', away: '#222222' };
const crest = (id: number) => `https://media.api-sports.io/football/teams/${id}.png`;

/** WCAG relative luminance, so contrast can be asserted rather than trusted. */
function luminance(hex: string): number {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrastWithInk(hex: string): number {
  const [a, b] = [luminance(hex), luminance('#1B2340')];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function contrastWithWhite(hex: string): number {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  return 1.05 / (lum + 0.05);
}

describe('CLUB_COLOR', () => {
  it('⚠ every colour has a LEGIBLE FOREGROUND — white or ink, whichever wins', () => {
    // ⚠⚠ THIS REPLACED "every colour clears 4.5:1 against white" on 2026-09-19.
    // That rule assumed one foreground and cost five clubs their identity:
    // Hull and Lecce darkened to brown, Dortmund and Villarreal pushed onto
    // their second colour, Leeds onto its blue. Yellow is not unreadable —
    // yellow with WHITE text is. Leeds' #FFE100 is 1.31 against white and
    // 11.77 against ink, so the foreground is chosen, not assumed.
    for (const [id, hex] of Object.entries(CLUB_COLOR)) {
      const ink = clubInk(hex);
      const ratio = ink === '#FFFFFF' ? contrastWithWhite(hex) : contrastWithInk(hex);
      expect(ratio, `club ${id} (${hex}) has no readable foreground`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('the light clubs take ink, the dark ones white', () => {
    // The five that used to be bent out of shape, and a control group.
    expect(clubInk(CLUB_COLOR[63]), 'Leeds').toBe('#1B2340');
    expect(clubInk(CLUB_COLOR[165]), 'Dortmund').toBe('#1B2340');
    expect(clubInk(CLUB_COLOR[533]), 'Villarreal').toBe('#1B2340');
    expect(clubInk(CLUB_COLOR[64]), 'Hull').toBe('#1B2340');
    expect(clubInk(CLUB_COLOR[867]), 'Lecce').toBe('#1B2340');
    expect(clubInk(CLUB_COLOR[42]), 'Arsenal').toBe('#FFFFFF');
    expect(clubInk(CLUB_COLOR[47]), 'Spurs').toBe('#FFFFFF');
  });

  it('⚠ a bar too pale to read as a shape asks for a hairline', () => {
    // A bar is not text: WCAG wants 3:1 of it. Leeds is 1.31 against the card,
    // so without an outline a yellow club renders as a gap in the row.
    expect(clubBarNeedsHairline(CLUB_COLOR[63]), 'Leeds').toBe(true);
    expect(clubBarNeedsHairline(CLUB_COLOR[42]), 'Arsenal').toBe(false);
    for (const [id, hex] of Object.entries(CLUB_COLOR)) {
      if (!clubBarNeedsHairline(hex)) {
        expect(contrastWithWhite(hex), `club ${id} needs no hairline, so it must clear 3:1`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it.skip('superseded: every colour clears 4.5:1 against white', () => {
    // The two that are off-brand are off-brand for exactly this reason:
    // Arsenal's #EF0107 is 4.49 and Hull's amber #F5A12D is 2.10.
    for (const [id, hex] of Object.entries(CLUB_COLOR)) {
      expect(contrastWithWhite(hex), `club ${id} (${hex}) is unreadable in white`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('covers every club in the five imported leagues', () => {
    // ⚠ WAS `toHaveLength(20)` — the Premier League only. The Results tab
    // dropped club crests for colour bars on 2026-09-19, at which point 76 of
    // the 96 clubs in play would have rendered nothing, so the other four
    // leagues were added. 20 PL + 20 La Liga + 20 Serie A + 18 Bundesliga +
    // 18 Ligue 1 = 96.
    expect(Object.keys(CLUB_COLOR)).toHaveLength(96);
    // The original twenty must survive any future edit to the map.
    for (const id of [42, 66, 35, 55, 51, 49, 1346, 52, 45, 36, 64, 57, 63, 40, 50, 33, 34, 65, 746, 47]) {
      expect(CLUB_COLOR[id], `Premier League club ${id} lost its colour`).toBeTruthy();
    }
  });

  it('is all six-digit hex — a shorthand would break the distance maths', () => {
    for (const hex of Object.values(CLUB_COLOR)) {
      expect(hex).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});

describe('clubIdFromCrestUrl', () => {
  it('reads the provider id out of a crest URL', () => {
    expect(clubIdFromCrestUrl(crest(42))).toBe(42);
    expect(clubIdFromCrestUrl(crest(1346))).toBe(1346);
  });

  it('survives a query string', () => {
    expect(clubIdFromCrestUrl(`${crest(49)}?v=2`)).toBe(49);
  });

  it('⚠ fails to null rather than throwing on anything unexpected', () => {
    // A provider that rehosts its crests costs the tab its club colours and
    // nothing else.
    expect(clubIdFromCrestUrl(null)).toBeNull();
    expect(clubIdFromCrestUrl(undefined)).toBeNull();
    expect(clubIdFromCrestUrl('')).toBeNull();
    expect(clubIdFromCrestUrl('https://example.com/arsenal.png')).toBeNull();
    expect(clubIdFromCrestUrl('not a url')).toBeNull();
  });
});

describe('clubColorFromCrestUrl', () => {
  it('resolves a Premier League club', () => {
    expect(clubColorFromCrestUrl(crest(42))).toBe(CLUB_COLOR[42]);
  });

  it('is null for a club outside the map — an unimported league keeps the app colours', () => {
    // ⚠ 529 (Barcelona) USED TO BE THE EXAMPLE HERE and now has a colour. The
    // case still matters: a club in a league nobody has imported yet.
    expect(clubColorFromCrestUrl(crest(999999))).toBeNull();
  });
});

describe('fixturePalette', () => {
  it('uses both clubs when they are clearly different', () => {
    // Chelsea navy against Arsenal red — 415 apart.
    const p = fixturePalette(crest(49), crest(42), FALLBACK);
    expect(p).toEqual({ home: CLUB_COLOR[49], away: CLUB_COLOR[42], usingClubColors: true });
  });

  it('⚠ falls back when the two clubs read as the same colour', () => {
    // ⚠⚠ THIS EXAMPLE HAS MOVED TWICE, WHICH IS THE FEATURE WORKING. It was
    // Arsenal v Manchester United (both now change), then Everton v Chelsea
    // (both now change). The rule needs a pair where NEITHER side has a change
    // colour: Stuttgart's red against Leipzig's, 83 apart — both clubs' 2026/27
    // away shirts are also red, so neither could be given an alternate.
    const p = fixturePalette(crest(172), crest(173), FALLBACK);
    expect(p.usingClubColors).toBe(false);
    expect(p).toMatchObject(FALLBACK);
  });

  it('catches every same-family pair the league actually contains', () => {
    const clashes: [number, number, string][] = [
      // ⚠ CRYSTAL PALACE v LEEDS WAS HERE, and was the tightest pair in the
      // league at 10.9 — two near-identical blues. It stopped being a clash on
      // 2026-09-19 when Leeds went back to yellow, which is the point of that
      // change rather than a casualty of it.
      [40, 746, 'Liverpool v Sunderland'],
      [36, 34, 'Fulham v Newcastle'],
      [45, 49, 'Everton v Chelsea'],
      [40, 65, 'Liverpool v Nottingham Forest'],
      [33, 65, 'Manchester United v Nottingham Forest'],
    ];
    // And the pair that stopped clashing, asserted so a future darkening of
    // Leeds cannot quietly bring the collision back.
    expect(
      fixturePalette(crest(52), crest(63), FALLBACK).usingClubColors,
      'Crystal Palace v Leeds should no longer clash',
    ).toBe(true);
    // ⚠⚠ THE ASSERTION MOVED FROM THE OUTCOME TO THE GUARANTEE (2026-09-19).
    // It used to demand that each of these falls back, and most of them no
    // longer do — the away side changes kit instead, which is the entire point
    // of the feature. What must remain true is narrower and stronger: a club
    // whose own colour clashes with the home side is NEVER shipped wearing it.
    // Either it changed, or the fixture gave up its colours altogether.
    for (const [a, b, name] of clashes) {
      const p = fixturePalette(crest(a), crest(b), FALLBACK);
      expect(p.away, name).not.toBe(CLUB_COLOR[b]);
      expect(p.away, `${name} — away is either a change kit or the fallback`).toBe(
        p.usingClubColors ? CLUB_ALT_COLOR[b] : FALLBACK.away,
      );
    }
  });

  it('⚠ BOTH sides revert when there is no change kit, never just one', () => {
    // One club in its own colour and the other in a generic reads as a bug
    // rather than as a decision. Stuttgart v Leipzig — two reds, and both play
    // in red away too, so there is no alternate for either.
    const p = fixturePalette(crest(172), crest(173), FALLBACK);
    expect(p.home).toBe(FALLBACK.home);
    expect(p.away).toBe(FALLBACK.away);
  });

  it('falls back when either club is outside the map', () => {
    expect(fixturePalette(crest(42), crest(999999), FALLBACK).usingClubColors).toBe(false);
    expect(fixturePalette(crest(999999), crest(42), FALLBACK).usingClubColors).toBe(false);
    expect(fixturePalette(null, null, FALLBACK).usingClubColors).toBe(false);
  });

  it('is symmetric when neither side has to change', () => {
    // ⚠ THIS USED TO BE UNCONDITIONAL and is now qualified, because the away
    // side changing kit is asymmetric BY DEFINITION — see the next block. Two
    // clubs who do not clash still behave exactly as they always did.
    const a = fixturePalette(crest(49), crest(42), FALLBACK);
    const b = fixturePalette(crest(42), crest(49), FALLBACK);
    expect(a.usingClubColors).toBe(b.usingClubColors);
    expect(a.home).toBe(b.away);
    expect(a.away).toBe(b.home);
  });
});

describe('⚠⚠ on a clash the AWAY side changes kit, as it does in football', () => {
  // Added 2026-09-19. 234 of the 876 possible pairings across the five leagues
  // — 27% — used to lose club colour entirely. A change colour recovers the
  // fixture instead of reverting both sides to the app's pair.

  it('Manchester United at home keeps red, and Arsenal change', () => {
    const p = fixturePalette(crest(33), crest(42), FALLBACK);
    expect(p.usingClubColors, 'the fixture should no longer fall back').toBe(true);
    expect(p.home).toBe(CLUB_COLOR[33]);
    expect(p.away).toBe(CLUB_ALT_COLOR[42]);
  });

  it('⚠ THE HOME SIDE NEVER MOVES — the invariant that replaced symmetry', () => {
    // Whatever happens, a club at home is in its own colour or the fixture has
    // fallen back entirely. It is never asked to change.
    for (const [h, a] of [[33, 42], [42, 33], [40, 65], [49, 42]] as const) {
      const p = fixturePalette(crest(h), crest(a), FALLBACK);
      expect(p.home, `${h} at home`).toBe(p.usingClubColors ? CLUB_COLOR[h] : FALLBACK.home);
    }
  });

  it('⚠ and the same fixture reverses — Arsenal at home do NOT change', () => {
    // The asymmetry stated plainly: Arsenal wear yellow at Old Trafford and red
    // at the Emirates. Manchester United have no change colour yet, so this one
    // still falls back — which is the honest behaviour of a partial map.
    const p = fixturePalette(crest(42), crest(33), FALLBACK);
    expect(p.home).not.toBe(CLUB_ALT_COLOR[42]);
  });

  it('⚠ a change colour that ALSO clashes is refused, not shipped', () => {
    // The guard that stops this becoming the same problem in a new shade: the
    // alternate is measured against the home side exactly as the primary was.
    // Chelsea's navy against Arsenal's yellow is fine, so Arsenal keep red here
    // — the change kit is only reached when the primaries actually clash.
    const p = fixturePalette(crest(49), crest(42), FALLBACK);
    expect(p.away).toBe(CLUB_COLOR[42]);
  });

  it('⚠ every change colour is a real alternative to that club’s own', () => {
    // An alternate within the threshold of its own primary would never resolve
    // anything — it would be the same shirt.
    for (const [id, alt] of Object.entries(CLUB_ALT_COLOR)) {
      const primary = CLUB_COLOR[Number(id)];
      expect(primary, `club ${id} has a change colour but no primary`).toBeTruthy();
      expect(alt).toMatch(/^#[0-9A-F]{6}$/i);
      const p = fixturePalette(crest(Number(id)), crest(Number(id)), FALLBACK);
      // Same club both sides is the strictest case: its own colour against
      // itself is distance 0, so the alternate has to carry the whole fixture.
      expect(p.away, `club ${id}'s change colour does not separate from its own`).toBe(alt);
    }
  });

  it('resolves a change colour from a crest URL, and null for everyone else', () => {
    expect(clubAltColorFromCrestUrl(crest(42))).toBe(CLUB_ALT_COLOR[42]);
    // ⚠ Tottenham. Their 2026/27 away shirt is "Obsidian" navy and the colour
    // we hold for them is already navy, so it could not resolve anything and
    // was left out. See CLUB_ALT_COLOR.
    expect(clubAltColorFromCrestUrl(crest(47))).toBeNull();
    expect(clubAltColorFromCrestUrl(null)).toBeNull();
  });

  it('⚠ same FAMILY counts too, not only same colour', () => {
    // Ryan, 2026-09-19. The threshold asks "do these read as the same colour";
    // this asks "are they the same KIND of colour", which is what a viewer
    // notices across a fixture list. Everton's navy and Manchester City's blue
    // are 135 apart — clearly distinct by the threshold — and are two blues.
    expect(colourFamily(CLUB_COLOR[45])).toBe('blue');
    expect(colourFamily(CLUB_COLOR[50])).toBe('blue');
    // Arsenal away at Everton: both would have been shipped as-is before.
    const p = fixturePalette(crest(45), crest(42), FALLBACK);
    expect(p.away, 'red against navy is not a family clash').toBe(CLUB_COLOR[42]);
  });

  it('⚠⚠ a family clash with NO change colour keeps both primaries', () => {
    // THE LINE THAT STOPS THIS BEING A REGRESSION. Widening the trigger for
    // wearing a change kit must not widen the trigger for losing club colour
    // altogether — Everton v Tottenham are two blues 122 apart, Spurs have no
    // usable alternate, and they are perfectly legible. They keep what they
    // have rather than both reverting.
    const p = fixturePalette(crest(45), crest(47), FALLBACK);
    expect(p.usingClubColors).toBe(true);
    expect(p.home).toBe(CLUB_COLOR[45]);
    expect(p.away).toBe(CLUB_COLOR[47]);
  });

  it('⚠ hue is ignored where the eye cannot see it', () => {
    // #1B1B1B's hue rounds to 0 and it is not "a red"; navy is not "a black".
    expect(colourFamily(CLUB_COLOR[36]), 'Fulham').toBe('dark');
    expect(colourFamily(CLUB_COLOR[34]), 'Newcastle').toBe('dark');
    expect(colourFamily(CLUB_COLOR[47]), 'Tottenham navy').toBe('blue');
  });

  it('⚠ a club with no change colour behaves exactly as it did before', () => {
    // Sixteen clubs still have no entry. Everything not in the map must be
    // untouched by this feature. Freiburg and Köln share a hex exactly, and
    // both play in red away as well, so neither could be given an alternate.
    const p = fixturePalette(crest(160), crest(192), FALLBACK);
    expect(p.usingClubColors).toBe(false);
    expect(p).toMatchObject(FALLBACK);
  });
});

// =============================================================
// Dark mode: a club colour is not a foreground until it is lifted
// =============================================================
// Ryan, 2026-09-20: "the teams that have black in the light mode should have
// white in the dark or we will not be able to see the number."
//
// The people card sets a shirt number in the CLUB'S OWN COLOUR, which is the
// approved design (drafts/2026-09-14_chosen_design.html §6). On the dark
// surface that is unreadable for most of the league and INVISIBLE for the
// black-shirted clubs — Newcastle's #241F20 against #1C2030 is 1.01:1.
// =============================================================

const DARK = '#1C2030';
const LIGHT = '#FFFFFF';

function contrastOf(a: string, b: string): number {
  const lum = (h: string) => {
    const c = [0, 2, 4]
      .map((i) => parseInt(h.slice(1).substr(i, 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe('clubOnSurface', () => {
  it('⚠⚠ EVERY club clears 4.5:1 on the dark surface', () => {
    // The whole point. If this fails, some club's number is unreadable in dark
    // mode and nobody will notice until a member with that club complains.
    for (const [id, colour] of Object.entries(CLUB_COLOR)) {
      const lifted = clubOnSurface(colour, DARK);
      expect(contrastOf(lifted, DARK), `club ${id} (${colour} → ${lifted})`).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  it('⚠ a black club goes to WHITE, not to the first grey that passes', () => {
    // Stepping the lightness clears 4.5:1 at about #8B8B8B, which is legible
    // and is not what anybody means by "white in dark mode". Below 0.15
    // saturation there is no hue to preserve, so it goes all the way.
    for (const id of [34, 36, 496, 494]) {
      expect(clubOnSurface(CLUB_COLOR[Number(id)], DARK), `club ${id}`).toBe('#E8EAF0');
    }
  });

  it('⚠ a club with a hue KEEPS it — lifted, not replaced', () => {
    // Everton must still be a blue and Liverpool still a red, or colouring the
    // number by club has stopped saying anything.
    const everton = clubOnSurface(CLUB_COLOR[45], DARK);
    const liverpool = clubOnSurface(CLUB_COLOR[40], DARK);
    expect(colourFamily(everton), 'Everton lifted').toBe('blue');
    expect(colourFamily(liverpool), 'Liverpool lifted').toBe('red');
    expect(everton).not.toBe('#E8EAF0');
  });

  it('leaves a colour alone when it already clears the bar', () => {
    // Most clubs need nothing on the light card, and Leeds' yellow needs
    // nothing on the dark one.
    expect(clubOnSurface(CLUB_COLOR[40], LIGHT)).toBe(CLUB_COLOR[40]);
    expect(clubOnSurface(CLUB_COLOR[63], DARK)).toBe(CLUB_COLOR[63]);
  });

  it('⚠ darkens rather than lightens when the surface is light', () => {
    // Leeds' yellow is 1.31:1 on white. The same function has to work both
    // ways round or the light card grows its own exception.
    const leeds = clubOnSurface(CLUB_COLOR[63], LIGHT);
    expect(contrastOf(leeds, LIGHT)).toBeGreaterThanOrEqual(4.5);
    expect(colourFamily(leeds), 'still yellow').toBe('yellow');
  });
});
