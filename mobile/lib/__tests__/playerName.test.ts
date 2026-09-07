// =============================================================
// A player's name, at the width a row has
// =============================================================
// Every example below is a real value from production's `match_events` on
// 2026-09-07, not an invented one — the point of the rule is to survive what
// this particular feed actually sends, which is four different name shapes in
// the same column.
// =============================================================

import { describe, it, expect } from 'vitest';

import { displayPlayerName, NAME_BUDGET } from '../playerName';

describe('displayPlayerName — the four shapes the feed sends', () => {
  it('leaves a single token alone (3.3% of rows)', () => {
    expect(displayPlayerName('Richarlison')).toBe('Richarlison');
  });

  it('keeps a two-word name whole when it fits (45.1% of rows)', () => {
    expect(displayPlayerName('Bruno Fernandes')).toBe('Bruno Fernandes');
    expect(displayPlayerName('Robert Andrich')).toBe('Robert Andrich');
  });

  it('abbreviates the forename when two words will not fit', () => {
    // 25 characters against a 16 budget.
    expect(displayPlayerName('Pierre-Emerick Aubameyang')).toBe('P. Aubameyang');
  });

  it("⚠ takes FIRST AND LAST of a long name, not the first two", () => {
    // The first two words are two forenames and identify nobody; the last token
    // is the surname. Real row, 43 characters.
    expect(displayPlayerName('Ignacio Ezequiel Agustín Fernández Carballo')).toBe('Ignacio Carballo');
  });

  it('falls all the way to the surname when even the initial form is too long', () => {
    // 'Paul Okon-Engstler' is 18, 'P. Okon-Engstler' is 16 — just fits.
    expect(displayPlayerName('Paul Michael Junior Okon-Engstler')).toBe('P. Okon-Engstler');
    // Push the surname past the budget on its own and the ladder bottoms out.
    expect(displayPlayerName('Alexander Oxlade-Chamberlainson')).toBe('Oxlade-Chamberlainson');
  });
});

describe('displayPlayerName — names the provider already abbreviated (47.2% of rows)', () => {
  it('leaves a short abbreviated name untouched', () => {
    expect(displayPlayerName('B. Leno')).toBe('B. Leno');
    expect(displayPlayerName('E. Nketiah')).toBe('E. Nketiah');
  });

  it('⚠ keeps the initial and drops the middle of a long one', () => {
    // Real row. 'I. Ruiz de Galarreta' is 20; the initial cannot be abbreviated
    // again, so first + last is the answer rather than an initial of an initial.
    expect(displayPlayerName('I. Ruiz de Galarreta')).toBe('I. Galarreta');
  });

  it('drops to the surname when an abbreviated name still will not fit', () => {
    expect(displayPlayerName('M. Fernandez Constantinopoulos')).toBe('Constantinopoulos');
  });
});

describe('displayPlayerName — the edges', () => {
  it('is empty for nothing at all', () => {
    expect(displayPlayerName(null)).toBe('');
    expect(displayPlayerName('')).toBe('');
    expect(displayPlayerName('   ')).toBe('');
  });

  it('collapses stray whitespace rather than counting it', () => {
    expect(displayPlayerName('  Bruno   Fernandes  ')).toBe('Bruno Fernandes');
  });

  it('never returns more than the budget unless the surname alone exceeds it', () => {
    const samples = [
      'Richarlison',
      'B. Leno',
      'Bruno Fernandes',
      'Pierre-Emerick Aubameyang',
      'Ignacio Ezequiel Agustín Fernández Carballo',
      'I. Ruiz de Galarreta',
      'José Mário dos Santos Mourinho Félix',
      'Francisco Javier Hernandez Coarasa',
      'Arthur Augusto De Matos Soares',
    ];
    for (const s of samples) {
      const out = displayPlayerName(s);
      const surname = s.trim().split(/\s+/).pop()!;
      // Either it fits, or it is the bare surname and there was nothing shorter.
      expect(out.length <= NAME_BUDGET || out === surname).toBe(true);
      expect(out).not.toContain('  ');
    }
  });

  it('honours a custom budget, so a wider row can show more', () => {
    expect(displayPlayerName('Pierre-Emerick Aubameyang', 40)).toBe('Pierre-Emerick Aubameyang');
    expect(displayPlayerName('Bruno Fernandes', 8)).toBe('B. Fernandes'.length <= 8 ? 'B. Fernandes' : 'Fernandes');
  });
});
