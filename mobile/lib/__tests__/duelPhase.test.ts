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
  current: { duelId: 'duel-3', matchweek: 3, settledAt: null },
  sealedMatchweek: 4,
  isInPlay: false,
  lastSettledAt: null,
  revealSeenDuel: null,
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
    expect(at({ revealSeenDuel: 'duel-3' })).toMatchObject({
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
    const r = at({ isInPlay: true, revealSeenDuel: null, sealedMatchweek: 4 });
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
    current: { duelId: 'duel-4', matchweek: 4, settledAt: null },
    sealedMatchweek: 5,
    revealSeenDuel: null,
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
    expect(at({ revealSeenDuel: null }).opponentVisible).toBe(false);
  });

  it.each([
    ['scouting', { revealSeenDuel: 'duel-3' }],
    ['live', { isInPlay: true }],
  ] as const)('names them in %s', (_phase, patch) => {
    expect(at(patch).opponentVisible).toBe(true);
  });
});

describe('the reveal marker is a DUEL ID, not a clock', () => {
  it('shows a first-ever walkout when the marker is null', () => {
    expect(at({ revealSeenDuel: null }).phase).toBe('revealable');
  });

  it('does not replay the one already watched', () => {
    expect(at({ revealSeenDuel: 'duel-3' }).phase).toBe('scouting');
  });

  it('walks them out again for the NEXT duel', () => {
    const r = at({
      current: { duelId: 'duel-4', matchweek: 4, settledAt: null },
      revealSeenDuel: 'duel-3',
    });
    expect(r.phase).toBe('revealable');
    expect(r.opponentVisible).toBe(false);
  });

  it('⚠⚠ RE-REVEALS AFTER A REDRAW — the whole reason this is not a timestamp', () => {
    // `league_generate_duel_schedule` redraws with
    //     DELETE FROM league_duels WHERE ... settled_at IS NULL;  INSERT ...
    // (083/095/117), so a redrawn week keeps its matchweek NUMBER and its reveal
    // INSTANT but gets a brand new `duel_id`.
    //
    // Under the timestamp design this member would have been handed a different
    // opponent with no ceremony and no signal whatsoever — the clock says they
    // already saw this week's reveal, and they did; it just is not true any
    // more. The id comparison catches it because the thing itself changed.
    const watchedThenRedrawn = at({
      current: { duelId: 'duel-3-REDRAWN', matchweek: 3, settledAt: null },
      revealSeenDuel: 'duel-3',
    });
    expect(watchedThenRedrawn.phase).toBe('revealable');
    expect(watchedThenRedrawn.matchweek).toBe(3);
    expect(watchedThenRedrawn.opponentVisible).toBe(false);
  });

  it('⚠ a stale marker pointing at a deleted duel shows the ceremony', () => {
    // 136 deliberately has no foreign key, so the id can outlive its row. The
    // only thing a dangling id can do is fail to equal the current duel — which
    // shows the walkout. That is the safe direction, and it is the same path
    // the redraw case takes.
    expect(at({ revealSeenDuel: 'duel-that-no-longer-exists' }).phase).toBe('revealable');
  });

  it('does not offer a walkout for a duel that has already settled', () => {
    // A finished duel is not a reveal, whatever the marker says.
    const r = at({
      current: { duelId: 'duel-3', matchweek: 3, settledAt: '2026-09-07T20:59:00Z' },
      lastSettledAt: '2026-09-07T20:59:00Z',
      recapSeenAt: '2026-09-08T09:00:00Z',
      revealSeenDuel: null,
      sealedMatchweek: null,
    });
    expect(r.phase).not.toBe('revealable');
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
      current: { duelId: 'duel-38', matchweek: 38, settledAt: '2027-05-23T18:00:00Z' },
      sealedMatchweek: null,
      lastSettledAt: '2027-05-23T18:00:00Z',
      recapSeenAt: '2027-05-24T09:00:00Z',
    });
    expect(r.phase).toBe('decided');
    expect(r.recapPending).toBe(false);
    expect(r.matchweek).toBe(38);
  });
});

describe('⚠⚠ a SETTLED current bout must not hold the screen on last week', () => {
  // The production shape Ryan hit on 2026-09-06, and the one the harness's own
  // fixture was too clean to reproduce.
  //
  // `useDuel.current` is "the first UNSETTLED bout, FALLING BACK TO THE LAST
  // RESULT" — so after matchweek 3 settles, `current` is still matchweek 3.
  // Everything downstream that asks "is there a bout?" therefore answers yes
  // forever, and the header sat on a finished duel instead of counting down to
  // the next one.
  //
  // The machine got this right all along; the band was not reading it. These
  // pin the answer so the next surface to be wired cannot get it wrong either.
  const settledCurrent = {
    duelId: 'duel-3',
    matchweek: 3,
    settledAt: '2026-09-07T20:59:00Z',
  };

  it('is SEALED once the recap has been seen, even with a bout in hand', () => {
    const r = at({
      current: settledCurrent,
      sealedMatchweek: 4,
      lastSettledAt: '2026-09-07T20:59:00Z',
      recapSeenAt: '2026-09-07T21:30:00Z',
      revealSeenDuel: 'duel-3',
    });
    expect(r.phase).toBe('sealed');
    // ⚠ AND IT NAMES THE WEEK BEING WAITED FOR, not the one just played.
    expect(r.matchweek).toBe(4);
  });

  it('is DECIDED while the recap is still owed — the result stays readable', () => {
    // The recap renders OVER the band, so the bout must still be on screen
    // behind it. Flipping to the countdown here would make the popup the only
    // way to learn the result, which is the disclosure gate's failure case.
    const r = at({
      current: settledCurrent,
      sealedMatchweek: 4,
      lastSettledAt: '2026-09-07T20:59:00Z',
      recapSeenAt: null,
      revealSeenDuel: 'duel-3',
    });
    expect(r.phase).toBe('decided');
    expect(r.matchweek).toBe(3);
  });

  it('never offers a walkout for the settled week it is falling back to', () => {
    const r = at({
      current: settledCurrent,
      sealedMatchweek: 4,
      lastSettledAt: '2026-09-07T20:59:00Z',
      recapSeenAt: '2026-09-07T21:30:00Z',
      // Never watched anything — and it still must not open one for a duel
      // that has already been played.
      revealSeenDuel: null,
    });
    expect(r.phase).toBe('sealed');
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
