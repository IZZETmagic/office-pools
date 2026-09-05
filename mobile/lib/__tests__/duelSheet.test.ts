import { describe, expect, it } from 'vitest';

import {
  anyFixtureLive,
  buildSheet,
  pickMissed,
  duelVerdict,
  remainingFixtures,
  sheetSummary,
  type SheetFixture,
  type SheetLive,
} from '../duelSheet';

// Every case below is a bug the web shipped. The comments in `duelSheet.ts`
// record them; these are the same rules, held.

const YOU = 'entry-you';
const THEM = 'entry-them';

function fixture(n: number, over: Partial<SheetFixture> = {}): SheetFixture {
  return {
    number: n,
    id: `fx-${n}`,
    homeName: `Home ${n}`,
    awayName: `Away ${n}`,
    homeAbbr: `H${n}`,
    awayAbbr: `A${n}`,
    homeCrest: null,
    awayCrest: null,
    kickoffAt: '2026-09-05T14:00:00Z',
    homeScoreFt: null,
    awayScoreFt: null,
    isCompletedFt: false,
    ...over,
  };
}

function live(over: Partial<SheetLive> = {}): SheetLive {
  return {
    homeScore: null,
    awayScore: null,
    status: null,
    isCompleted: false,
    liveMinute: null,
    livePeriod: null,
    liveAdded: null,
    ...over,
  };
}

/** No picks revealed and no points — the pre-lock baseline. */
function build(over: Partial<Parameters<typeof buildSheet>[0]> = {}) {
  return buildSheet({
    fixtures: [fixture(1)],
    live: new Map(),
    mine: new Map(),
    theirs: new Map(),
    label: () => null,
    youEntry: YOU,
    themEntry: THEM,
    ...over,
  });
}

describe('buildSheet — who took the fixture', () => {
  it('does not flip the opponent: neither scoring is `neither`, never `them`', () => {
    // The 0-0 both members missed. Both have a row worth 0, so the fixture IS
    // scored — and nobody took it.
    const [row] = build({
      mine: new Map([[1, 0]]),
      theirs: new Map([[1, 0]]),
      label: (e) => (e === YOU ? 'HOME' : 'AWAY'),
    });
    expect(row.outcome).toBe('neither');
  });

  it('calls the same pick `same`, even when both scored', () => {
    const [row] = build({
      mine: new Map([[1, 100]]),
      theirs: new Map([[1, 100]]),
      label: () => 'HOME',
    });
    expect(row.outcome).toBe('same');
  });

  it('gives the fixture to whoever scored more', () => {
    const [row] = build({
      mine: new Map([[1, 100]]),
      theirs: new Map([[1, 0]]),
      label: (e) => (e === YOU ? 'HOME' : 'AWAY'),
    });
    expect(row.outcome).toBe('you');
  });
});

describe('buildSheet — pending means NOT STARTED', () => {
  it('is `pending` before kickoff', () => {
    expect(build()[0].outcome).toBe('pending');
  });

  it('is `neither` — not `pending` — while the game is being played', () => {
    // Unscored but running. A dashed "not started" chip beside a ticking clock
    // is the bug; grey is the truth: nobody is ahead YET.
    const [row] = build({
      live: new Map([[1, live({ status: 'live', liveMinute: 23 })]]),
    });
    expect(row.clock).toBe("23'");
    expect(row.outcome).toBe('neither');
  });
});

describe('buildSheet — the winning club is lit at FULL TIME only', () => {
  it('states no result while the match is live', () => {
    // 1-0 at 12 minutes must not fade the side that goes on to win 3-1.
    const [row] = build({
      live: new Map([[1, live({ status: 'live', liveMinute: 12, homeScore: 1, awayScore: 0 })]]),
    });
    expect(row.homeScore).toBe(1);
    expect(row.result).toBeNull();
  });

  it('states the result once the fixture is completed', () => {
    const [row] = build({
      live: new Map([
        [1, live({ status: 'FT', isCompleted: true, homeScore: 3, awayScore: 1 })],
      ]),
    });
    expect(row.result).toBe('home');
  });

  it('reads a live 0-0 as no result rather than a settled draw', () => {
    const [row] = build({
      live: new Map([[1, live({ status: 'live', liveMinute: 5, homeScore: 0, awayScore: 0 })]]),
    });
    expect(row.result).toBeNull();
  });
});

describe('buildSheet — live wins, the season payload backs it', () => {
  it('falls back to the full-time score before the first live fetch', () => {
    const [row] = build({
      fixtures: [fixture(1, { homeScoreFt: 2, awayScoreFt: 2, isCompletedFt: true })],
      live: new Map(),
    });
    expect(row.homeScore).toBe(2);
    expect(row.result).toBe('draw');
  });

  it('prefers the live row once it lands', () => {
    const [row] = build({
      fixtures: [fixture(1, { homeScoreFt: null, awayScoreFt: null })],
      live: new Map([[1, live({ status: 'live', liveMinute: 70, homeScore: 1, awayScore: 2 })]]),
    });
    expect(row.awayScore).toBe(2);
  });
});

describe('buildSheet — the reveal gate', () => {
  it('renders no opponent column for a bye, and still builds the row', () => {
    const rows = build({ themEntry: null, label: () => 'HOME' });
    expect(rows[0].myPick).toBe('HOME');
    expect(rows[0].theirPick).toBeNull();
  });
});

describe('remainingFixtures / anyFixtureLive', () => {
  it('counts fixtures with no score row', () => {
    const rows = buildSheet({
      fixtures: [fixture(1), fixture(2), fixture(3)],
      live: new Map(),
      mine: new Map([[1, 100]]),
      theirs: new Map([[2, 100]]),
      label: () => null,
      youEntry: YOU,
      themEntry: THEM,
    });
    expect(remainingFixtures(rows)).toBe(1);
  });

  it('is not live merely because the matchweek is in progress', () => {
    // Sunday morning: matchweek open, nothing being played.
    const rows = buildSheet({
      fixtures: [fixture(1), fixture(2)],
      live: new Map([[1, live({ status: 'FT', isCompleted: true })]]),
      mine: new Map([[1, 100]]),
      theirs: new Map(),
      label: () => null,
      youEntry: YOU,
      themEntry: THEM,
    });
    expect(anyFixtureLive(rows)).toBe(false);
  });

  it('is live while a ball is in play', () => {
    const rows = build({ live: new Map([[1, live({ status: 'live', liveMinute: 3 })]]) });
    expect(anyFixtureLive(rows)).toBe(true);
  });
});

describe('sheetSummary', () => {
  it('says nothing until a pick is revealed', () => {
    expect(sheetSummary(build())).toBeNull();
  });

  it('names the divergences, not the agreements', () => {
    const rows = buildSheet({
      fixtures: [fixture(1, { homeName: 'Arsenal' }), fixture(2, { homeName: 'Chelsea' })],
      live: new Map(),
      mine: new Map(),
      theirs: new Map(),
      label: (e, id) => (id === 'fx-1' ? 'HOME' : e === YOU ? 'HOME' : 'AWAY'),
      youEntry: YOU,
      themEntry: THEM,
    });
    expect(sheetSummary(rows)).toBe('1 of 2 are dead heat. This duel is Chelsea.');
  });

  it('calls identical sheets what they are', () => {
    const rows = buildSheet({
      fixtures: [fixture(1), fixture(2)],
      live: new Map(),
      mine: new Map(),
      theirs: new Map(),
      label: () => 'DRAW',
      youEntry: YOU,
      themEntry: THEM,
    });
    expect(sheetSummary(rows)).toBe('Identical sheets — all 2 picks the same.');
  });
});

describe('duelVerdict', () => {
  it('says nothing before anything has been paid out', () => {
    expect(duelVerdict(build(), 0, 0)).toBeNull();
  });

  it('calls it safe when the lead outruns what is left', () => {
    // Two fixtures, one scored at 100. One left, so 100 is still available —
    // and a 200 lead cannot be caught.
    const rows = buildSheet({
      fixtures: [fixture(1), fixture(2)],
      live: new Map(),
      mine: new Map([[1, 100]]),
      theirs: new Map([[1, 0]]),
      label: () => null,
      youEntry: YOU,
      themEntry: THEM,
    });
    expect(duelVerdict(rows, 200, 0)).toEqual({ safe: true, leader: 'you', lead: 200 });
  });

  it('prices a fixture from what was actually paid, not a constant', () => {
    // A Scores-depth sheet pays 500 for an exact, so the same 200 lead with one
    // game left is NOT safe. A hard-coded Results price would have called it.
    const rows = buildSheet({
      fixtures: [fixture(1), fixture(2)],
      live: new Map(),
      mine: new Map([[1, 500]]),
      theirs: new Map([[1, 0]]),
      label: () => null,
      youEntry: YOU,
      themEntry: THEM,
    });
    expect(duelVerdict(rows, 200, 0)).toEqual({ safe: false, lead: 200, deciders: 1 });
  });

  it('reports the other side leading', () => {
    const rows = buildSheet({
      fixtures: [fixture(1)],
      live: new Map(),
      mine: new Map([[1, 100]]),
      theirs: new Map([[1, 100]]),
      label: () => null,
      youEntry: YOU,
      themEntry: THEM,
    });
    expect(duelVerdict(rows, 0, 300)).toEqual({ safe: true, leader: 'them', lead: 300 });
  });
});


describe('pickMissed — a wrong pick is wrong on its own terms', () => {
  it('is false before the fixture is scored', () => {
    // No verdict yet. Dimming here would call a pick wrong before kickoff.
    const [row] = build();
    expect(pickMissed(row, 'you')).toBe(false);
    expect(pickMissed(row, 'them')).toBe(false);
  });

  it('dims the loser and not the winner', () => {
    const [row] = build({
      mine: new Map([[1, 100]]),
      theirs: new Map([[1, 0]]),
      label: (e) => (e === YOU ? 'HOME' : 'AWAY'),
    });
    expect(row.outcome).toBe('you');
    expect(pickMissed(row, 'you')).toBe(false);
    expect(pickMissed(row, 'them')).toBe(true);
  });

  it('⭐ dims BOTH when both were wrong — the bug this exists for', () => {
    // Different picks, neither scored. `outcome` is `neither`, so a rule keyed
    // on the outcome left both chips bright and the row read as undecided
    // rather than as two misses.
    const [row] = build({
      mine: new Map([[1, 0]]),
      theirs: new Map([[1, 0]]),
      label: (e) => (e === YOU ? 'HOME' : 'AWAY'),
    });
    expect(row.outcome).toBe('neither');
    expect(pickMissed(row, 'you')).toBe(true);
    expect(pickMissed(row, 'them')).toBe(true);
  });

  it('⭐ dims neither when two DIFFERENT picks both scored — Scores depth', () => {
    // Two scorelines that both land the correct result pay the same tier, so
    // `outcome` is `neither` here too. Same label, opposite meaning: nobody was
    // wrong. This is why the rule reads points and not the outcome.
    const [row] = build({
      mine: new Map([[1, 100]]),
      theirs: new Map([[1, 100]]),
      label: (e) => (e === YOU ? '2-1' : '3-2'),
    });
    expect(row.outcome).toBe('neither');
    expect(pickMissed(row, 'you')).toBe(false);
    expect(pickMissed(row, 'them')).toBe(false);
  });

  it('dims both on a shared pick that missed', () => {
    const [row] = build({
      mine: new Map([[1, 0]]),
      theirs: new Map([[1, 0]]),
      label: () => 'DRAW',
    });
    expect(row.outcome).toBe('same');
    expect(pickMissed(row, 'you')).toBe(true);
    expect(pickMissed(row, 'them')).toBe(true);
  });

  it('dims neither on a shared pick that landed', () => {
    const [row] = build({
      mine: new Map([[1, 100]]),
      theirs: new Map([[1, 100]]),
      label: () => 'HOME',
    });
    expect(row.outcome).toBe('same');
    expect(pickMissed(row, 'you')).toBe(false);
    expect(pickMissed(row, 'them')).toBe(false);
  });

  it('treats a bye\'s absent opponent as unscored, not wrong', () => {
    const [row] = build({ themEntry: null, mine: new Map([[1, 100]]), label: () => 'HOME' });
    expect(pickMissed(row, 'you')).toBe(false);
    // Nobody to be wrong. `theirs` is 0 because there is no opponent, and the
    // chip renders a dash rather than a faded label.
    expect(row.theirPick).toBeNull();
  });
});
