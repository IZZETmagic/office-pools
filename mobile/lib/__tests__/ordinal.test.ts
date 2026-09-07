// =============================================================
// 1st, 2nd, 3rd — and the twenties, which the app's six other copies get wrong
// =============================================================
// The six inline copies elsewhere read
//
//     n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'
//
// which is correct for every number they can currently reach — a World Cup
// group is four and a Premier League table is twenty — and wrong from 21 up.
// `league_clubs` permits a competition of up to 30, so this copy is tested
// against the numbers that would expose it.
// =============================================================

import { describe, it, expect } from 'vitest';

import { ordinal } from '../ordinal';

describe('ordinal', () => {
  it('handles the three special units', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(4)).toBe('4th');
  });

  it('⚠ the teens all take "th", including 11, 12 and 13', () => {
    // The trap in any units-digit-only rule.
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
    expect(ordinal(14)).toBe('14th');
  });

  it('⚠ the twenties, which the inline copies render as "21th"', () => {
    expect(ordinal(21)).toBe('21st');
    expect(ordinal(22)).toBe('22nd');
    expect(ordinal(23)).toBe('23rd');
    expect(ordinal(24)).toBe('24th');
  });

  it('covers a full 30-club competition without a wrong suffix', () => {
    // `league_clubs` permits 4..30, so every position a table can hold.
    const expected: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd', 21: 'st', 22: 'nd', 23: 'rd' };
    for (let n = 1; n <= 30; n++) {
      expect(ordinal(n)).toBe(`${n}${expected[n] ?? 'th'}`);
    }
  });

  it('is stable at a round twenty and thirty', () => {
    expect(ordinal(20)).toBe('20th');
    expect(ordinal(30)).toBe('30th');
  });
});
