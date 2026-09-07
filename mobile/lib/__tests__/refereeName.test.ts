// =============================================================
// The referee's name
// =============================================================
// A four-line function with one real trap in it, and the trap is a real
// Premier League official.
// =============================================================

import { describe, it, expect } from 'vitest';

import { refereeName } from '../refereeName';

describe('refereeName', () => {
  it('drops the country the feed appends', () => {
    expect(refereeName('Chris Kavanagh, England')).toBe('Chris Kavanagh');
    expect(refereeName('Samuel Barrott, England')).toBe('Samuel Barrott');
    expect(refereeName('Thomas Bramall, England')).toBe('Thomas Bramall');
  });

  it('⚠ leaves Darren England with his surname', () => {
    // The feed sends "Darren England, England". Anything matching on the
    // country's NAME rather than on the last comma eats half of his.
    expect(refereeName('Darren England, England')).toBe('Darren England');
  });

  it('handles a referee from somewhere else', () => {
    expect(refereeName('Felix Zwayer, Germany')).toBe('Felix Zwayer');
    expect(refereeName('Daniele Orsato, Italy')).toBe('Daniele Orsato');
  });

  it('⚠ returns a comma-less name whole, so stored short forms still render', () => {
    // Rows written before the provider enriched the name still read
    // "C. Kavanagh", and they must keep working while the column catches up.
    expect(refereeName('C. Kavanagh')).toBe('C. Kavanagh');
    expect(refereeName('Michael Oliver')).toBe('Michael Oliver');
  });

  it('survives a value that is only a country', () => {
    // Nothing to show is worse than showing the raw string.
    expect(refereeName(', England')).toBe(', England');
  });

  it('is null for nothing at all', () => {
    expect(refereeName(null)).toBeNull();
    expect(refereeName(undefined)).toBeNull();
    expect(refereeName('')).toBeNull();
    expect(refereeName('   ')).toBeNull();
  });

  it('trims stray whitespace around the parts', () => {
    expect(refereeName('  Chris Kavanagh ,  England  ')).toBe('Chris Kavanagh');
  });
});
