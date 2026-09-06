import { describe, expect, it } from 'vitest';

import { duelPhase, type DuelPhaseInput } from '../duelPhase';

// =============================================================
// The Showdown phase machine
// =============================================================
// These test the ORDER above everything else, because the order is the part
// that has already failed in production and the part nothing else can catch.
//
// On 2026-09-01 the web's band asked "is anything sealed?" before "is there a
// week I can act on?". Mid-season there is always a next sealed week, so the
// walkout became unreachable for every member of every Showdown pool. It
// shipped and survived review because the countdown it wrongly showed was
// itself a correct countdown — to the wrong matchweek.
//
// The web guards this by reading its own source as text and comparing two
// `indexOf` results. This asserts what the machine RETURNS instead, so it keeps
// holding when the code is refactored.
// =============================================================

/** A pool mid-season with nothing unusual about it. */
const base: DuelPhaseInput = {
  hasDraw: true,
  current: { matchweek: 3, settledAt: null, revealsAt: '2026-09-02T01:00:00Z' },
  sealedMatchweek: 4,
  isInPlay: false,
  lastSettledAt: null,
  revealSeenAt: null,
  recapSeenAt: null,
};

const at = (input: Partial<DuelPhaseInput>) => duelPhase({ ...base, ...input });

// -------------------------------------------------------------

describe('⚠ the open week is chosen before the sealed one', () => {
  it('offers the walkout even though a later week is sealed', () => {
    // The exact production shape: matchweek 3 revealed, matchweek 4 sealed.
    // The bug returned a countdown to 4 here.
    const r = at({});
    expect(r.phase).toBe('revealable');
    expect(r.matchweek).toBe(3);
  });

  it('names the week you can ACT on, never the one you can only wait for', () => {
    expect(at({ revealSeenAt: '2026-09-03T00:00:00Z' })).toMatchObject({
      phase: 'scouting',
      matchweek: 3,
    });
  });

  it('falls through to sealed only when there is genuinely no open duel', () => {
    // ⚠ RLS (116) withholds a sealed week's rows, so `current: null` IS how a
    // sealed week arrives. No extra "is it revealed?" test is needed.
    expect(at({ current: null })).toMatchObject({ phase: 'sealed', matchweek: 4 });
  });
});

describe('⚠ football outranks both of them', () => {
  it('stays live while the week is being played', () => {
    expect(at({ isInPlay: true }).phase).toBe('live');
  });

  it('does not offer next week’s walkout mid-match', () => {
    // Unwatched reveal AND a sealed week AND a ball in play.
    const r = at({ isInPlay: true, revealSeenAt: null, sealedMatchweek: 4 });
    expect(r.phase).toBe('live');
    expect(r.opponentVisible).toBe(true);
  });

  it('does not interrupt live football with last week’s recap', () => {
    // ⚠ The recap is not lost — the marker is durable, so it fires the moment
    // the football stops. See the `live` branch's note.
    const r = at({ isInPlay: true, lastSettledAt: '2026-08-31T20:59:00Z' });
    expect(r.phase).toBe('live');
    expect(r.recapPending).toBe(false);
  });
});

describe('⚠ the recap comes before the next walkout', () => {
  // Ryan's sequence is explicit: phase 5, then phase 6. Matchweek 3 settles on
  // the Monday and matchweek 4's draw opens 24h later (129), so anybody who
  // does not open the app on the Monday has both waiting.
  const bothWaiting: Partial<DuelPhaseInput> = {
    lastSettledAt: '2026-09-07T20:59:00Z',
    current: { matchweek: 4, settledAt: null, revealsAt: '2026-09-08T20:59:00Z' },
    sealedMatchweek: 5,
    revealSeenAt: null,
    recapSeenAt: null,
  };

  it('shows the recap first', () => {
    const r = at(bothWaiting);
    expect(r.phase).toBe('decided');
    expect(r.recapPending).toBe(true);
  });

  it('then lets the walkout through once the recap is acknowledged', () => {
    const r = at({ ...bothWaiting, recapSeenAt: '2026-09-08T09:00:00Z' });
    expect(r.phase).toBe('revealable');
    expect(r.matchweek).toBe(4);
  });

  it('gives ONE recap after three weeks away, not a queue of three', () => {
    // Falls out of "anything newer than what I last saw" — 122's reasoning.
    const r = at({ lastSettledAt: '2026-09-21T20:00:00Z', recapSeenAt: '2026-08-31T20:00:00Z' });
    expect(r.phase).toBe('decided');
    expect(r.recapPending).toBe(true);
  });
});

describe('⚠ the opponent is withheld until the walkout has been watched', () => {
  it('hides them while the reveal is still on offer', () => {
    // Ryan, 2026-09-02: their face next to a button marked Reveal meant the
    // button revealed nothing.
    expect(at({ revealSeenAt: null }).opponentVisible).toBe(false);
  });

  it.each([
    ['scouting', { revealSeenAt: '2026-09-03T00:00:00Z' }],
    ['live', { isInPlay: true }],
  ] as const)('names them in %s', (_phase, patch) => {
    expect(at(patch).opponentVisible).toBe(true);
  });
});

describe('the reveal marker', () => {
  it('walks them out when the draw opened after the last one watched', () => {
    expect(
      at({ revealSeenAt: '2026-09-01T00:00:00Z' }).phase, // reveal was 09-02
    ).toBe('revealable');
  });

  it('does not replay one already watched', () => {
    expect(at({ revealSeenAt: '2026-09-03T00:00:00Z' }).phase).toBe('scouting');
  });

  it('⚠ treats a MISSING reveal instant as already watched, never as replay', () => {
    // Failing towards "seen" costs a member one walkout. Failing the other way
    // shows the same walkout on every single app open.
    expect(at({ current: { matchweek: 3, settledAt: null, revealsAt: null } }).phase).toBe(
      'scouting',
    );
  });

  it('⚠ treats -infinity — the season’s always-open first week — as watched', () => {
    // 129 returns `-infinity` for the first playable matchweek. There was never
    // anything sealed about it, so there is nothing to walk out from.
    const r = at({
      current: { matchweek: 1, settledAt: null, revealsAt: '-infinity' },
      revealSeenAt: '2026-08-01T00:00:00Z',
    });
    expect(r.phase).toBe('scouting');
  });

  it('shows a first-ever walkout when the marker is null', () => {
    expect(at({ revealSeenAt: null }).phase).toBe('revealable');
  });
});

describe('a pool with nothing in it', () => {
  it('is `none` before there is a draw', () => {
    // A Showdown pool needs two members before anybody can be drawn against
    // anybody. A countdown here would tick towards nothing.
    expect(at({ hasDraw: false, current: null, sealedMatchweek: null }).phase).toBe('none');
  });

  it('is still sealed when the draw exists but this week is closed', () => {
    expect(at({ hasDraw: true, current: null, sealedMatchweek: 1 }).phase).toBe('sealed');
  });

  it('ends the season on the last result rather than a dead clock', () => {
    const r = at({
      current: { matchweek: 38, settledAt: '2027-05-23T18:00:00Z', revealsAt: null },
      sealedMatchweek: null,
      lastSettledAt: '2027-05-23T18:00:00Z',
      recapSeenAt: '2027-05-24T09:00:00Z',
    });
    expect(r.phase).toBe('decided');
    expect(r.recapPending).toBe(false);
    expect(r.matchweek).toBe(38);
  });
});

describe('⚠ phase 6 is phase 1 — deliberately not its own state', () => {
  it('returns `sealed` whether the pool is new or mid-season', () => {
    const brandNew = at({ current: null, sealedMatchweek: 1, lastSettledAt: null });
    const fullCircle = at({
      current: null,
      sealedMatchweek: 12,
      lastSettledAt: '2026-11-02T20:00:00Z',
      recapSeenAt: '2026-11-02T21:00:00Z',
    });

    expect(brandNew.phase).toBe('sealed');
    expect(fullCircle.phase).toBe('sealed');
    // The clock differs; the state does not. Two states here would be two
    // components that must always agree about one countdown.
    expect(brandNew.matchweek).toBe(1);
    expect(fullCircle.matchweek).toBe(12);
  });
});
