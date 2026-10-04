import { describe, expect, it } from 'vitest';

import * as web from '../../../lib/countdownFormat';
import * as rn from '../countdownFormat';

// =============================================================
// The Showdown clock's three bands, on both platforms
// =============================================================
// `mobile/lib/countdownFormat.ts` is a hand copy of `lib/countdownFormat.ts`.
// Every row runs through BOTH, so a change to one side alone fails here rather
// than shipping a web clock and a phone clock that disagree about the same
// second.
// =============================================================

const S = 1000;
const M = 60 * S;
const H = 60 * M;
const D = 24 * H;

const TABLE: [label: string, ms: number, text: string, band: web.CountdownBand][] = [
  ['twenty days out', 19 * D + 23 * H + 59 * M + 59 * S, '19d 23h 59m', 'days'],
  ['two days out', 2 * D + 4 * H + 11 * M + 9 * S, '2d 04h 11m', 'days'],
  ['exactly a day', D, '1d 00h 00m', 'days'],
  ['a millisecond under a day', D - 1, '23h 59m 59s', 'hours'],
  ['five hours out', 4 * H + 11 * M + 9 * S + 999, '4h 11m 09s', 'hours'],
  ['exactly an hour', H, '1h 00m 00s', 'hours'],
  ['a millisecond under an hour', H - 1, '59m 59s 99', 'minutes'],
  ['eleven minutes out', 11 * M + 9 * S + 832, '11m 09s 83', 'minutes'],
  ['the final second', 470, '0m 00s 47', 'minutes'],
  ['nine milliseconds', 9, '0m 00s 00', 'minutes'],
  ['zero', 0, '0m 00s 00', 'minutes'],
  ['already past', -5 * S, '0m 00s 00', 'minutes'],
  ['no target at all', NaN, '0m 00s 00', 'minutes'],
];

describe('formatCountdown', () => {
  for (const [label, ms, text, band] of TABLE) {
    it(`${label} reads ${text} on the web and the phone`, () => {
      expect(web.formatCountdown(ms)).toBe(text);
      expect(rn.formatCountdown(ms)).toBe(text);
      expect(web.countdownBand(ms)).toBe(band);
      expect(rn.countdownBand(ms)).toBe(band);
    });
  }

  it('never gets wider inside a band as the clock runs down', () => {
    // `CountdownText` sizes its box once per band, from the moment the band
    // starts. That only holds if no later reading in the same band is longer.
    for (const fmt of [web.formatCountdown, rn.formatCountdown]) {
      for (const [hi, lo] of [[30 * D, D], [D - 1, H], [H - 1, 0]]) {
        const widest = fmt(hi).length;
        for (let ms = hi; ms >= lo; ms -= Math.max(1, Math.floor((hi - lo) / 997))) {
          expect(fmt(ms).length).toBeLessThanOrEqual(widest);
        }
      }
    }
  });
});
