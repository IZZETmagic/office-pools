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
  CLUB_COLOR,
  clubColorFromCrestUrl,
  clubIdFromCrestUrl,
  fixturePalette,
} from '../design/clubColors';

const FALLBACK = { home: '#111111', away: '#222222' };
const crest = (id: number) => `https://media.api-sports.io/football/teams/${id}.png`;

/** WCAG relative luminance, so contrast can be asserted rather than trusted. */
function contrastWithWhite(hex: string): number {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  return 1.05 / (lum + 0.05);
}

describe('CLUB_COLOR', () => {
  it('⚠ every colour clears 4.5:1 against white, because the pill has white text', () => {
    // The two that are off-brand are off-brand for exactly this reason:
    // Arsenal's #EF0107 is 4.49 and Hull's amber #F5A12D is 2.10.
    for (const [id, hex] of Object.entries(CLUB_COLOR)) {
      expect(contrastWithWhite(hex), `club ${id} (${hex}) is unreadable in white`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('covers a full twenty-club Premier League', () => {
    expect(Object.keys(CLUB_COLOR)).toHaveLength(20);
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

  it('is null for a club outside the map — La Liga keeps the app colours', () => {
    expect(clubColorFromCrestUrl(crest(529))).toBeNull(); // Barcelona
  });
});

describe('fixturePalette', () => {
  it('uses both clubs when they are clearly different', () => {
    // Chelsea navy against Arsenal red — 415 apart.
    const p = fixturePalette(crest(49), crest(42), FALLBACK);
    expect(p).toEqual({ home: CLUB_COLOR[49], away: CLUB_COLOR[42], usingClubColors: true });
  });

  it('⚠ falls back when the two clubs read as the same colour', () => {
    // Arsenal v Manchester United, two reds 89.7 apart. Shipping both would be
    // two pills a viewer cannot tell apart, which is worse than a fixed pair.
    const p = fixturePalette(crest(42), crest(33), FALLBACK);
    expect(p.usingClubColors).toBe(false);
    expect(p).toMatchObject(FALLBACK);
  });

  it('catches every same-family pair the league actually contains', () => {
    const clashes: [number, number, string][] = [
      [52, 63, 'Crystal Palace v Leeds'],
      [40, 746, 'Liverpool v Sunderland'],
      [36, 34, 'Fulham v Newcastle'],
      [45, 49, 'Everton v Chelsea'],
      [40, 65, 'Liverpool v Nottingham Forest'],
      [33, 65, 'Manchester United v Nottingham Forest'],
    ];
    for (const [a, b, name] of clashes) {
      expect(fixturePalette(crest(a), crest(b), FALLBACK).usingClubColors, name).toBe(false);
    }
  });

  it('⚠ BOTH sides revert on a clash, never just one', () => {
    // One club in its own colour and the other in a generic reads as a bug
    // rather than as a decision.
    const p = fixturePalette(crest(42), crest(33), FALLBACK);
    expect(p.home).toBe(FALLBACK.home);
    expect(p.away).toBe(FALLBACK.away);
  });

  it('falls back when either club is outside the map', () => {
    expect(fixturePalette(crest(42), crest(529), FALLBACK).usingClubColors).toBe(false);
    expect(fixturePalette(crest(529), crest(42), FALLBACK).usingClubColors).toBe(false);
    expect(fixturePalette(null, null, FALLBACK).usingClubColors).toBe(false);
  });

  it('is symmetric — swapping the sides swaps the colours and nothing else', () => {
    const a = fixturePalette(crest(49), crest(42), FALLBACK);
    const b = fixturePalette(crest(42), crest(49), FALLBACK);
    expect(a.usingClubColors).toBe(b.usingClubColors);
    expect(a.home).toBe(b.away);
    expect(a.away).toBe(b.home);
  });
});
