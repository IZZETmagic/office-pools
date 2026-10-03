// Needs you — a card leaves the moment it is done (mobile/lib/needsYouState.ts).

import { describe, expect, it } from 'vitest';

import type { NeedsYouItem } from '../api';
import { applyFetched, restore, settle, sortNeeds, type Settled } from '../needsYouState';

const card = (id: string, deadline_at: string | null = null, extra: Partial<NeedsYouItem> = {}): NeedsYouItem => ({
  id,
  kind: 'crew_invite',
  pool_id: '',
  pool_name: '',
  entry_id: '',
  title: id,
  subtitle: '',
  deadline_at,
  made: 0,
  total: 1,
  cta: '',
  link: null,
  ...extra,
});

const T = 1_000_000;
const seat = card('seat', '2026-10-05T12:00:00Z');
const pick = card('pick', '2026-10-03T12:00:00Z', { kind: 'pick', entry_id: 'e1' });
const invite = card('invite');
const list = sortNeeds([invite, seat, pick]);

describe('the order', () => {
  it('soonest deadline first, no-deadline cards last — the same order the server sends', () => {
    // The parity with the server's sortNeeds is pinned on the web side
    // (lib/activity/__tests__/needsYou.test.ts), which can import both.
    expect(list.map((n) => n.id)).toEqual(['pick', 'seat', 'invite']);
  });
});

describe('settling — the card leaves now', () => {
  it('removes exactly the matching cards, and remembers when', () => {
    const r = settle(list, (n) => n.id === 'seat', new Map(), T);
    expect(r.needs.map((n) => n.id)).toEqual(['pick', 'invite']);
    expect(r.removed.map((n) => n.id)).toEqual(['seat']);
    expect(r.settled.get('seat')).toBe(T);
  });
  it('can match by what a screen knows — this entry’s pick card', () => {
    const r = settle(list, (n) => n.kind === 'pick' && n.entry_id === 'e1', new Map(), T);
    expect(r.needs.map((n) => n.id)).toEqual(['seat', 'invite']);
  });
  it('matching nothing changes nothing', () => {
    const marks: Settled = new Map();
    const r = settle(list, () => false, marks, T);
    expect(r.needs).toBe(list);
    expect(r.settled).toBe(marks);
  });
});

describe('a failed action puts the card back where it was', () => {
  it('in deadline order, and forgets it was settled', () => {
    const s = settle(list, (n) => n.id === 'seat', new Map(), T);
    const r = restore(s.needs, s.removed, s.settled);
    expect(r.needs.map((n) => n.id)).toEqual(['pick', 'seat', 'invite']);
    expect(r.settled.has('seat')).toBe(false);
  });
});

describe('⚠ a fetch that started before the tap can’t bring the card back', () => {
  it('a stale answer still holding it is ignored for that card only', () => {
    const s = settle(list, (n) => n.id === 'seat', new Map(), T);
    const r = applyFetched(list, s.settled, T - 500); // started half a second before the tap
    expect(r.needs.map((n) => n.id)).toEqual(['pick', 'invite']);
    expect(r.settled.has('seat')).toBe(true);
  });
  it('a fetch that started after it is the truth again — and the mark is dropped', () => {
    const s = settle(list, (n) => n.id === 'seat', new Map(), T);
    const r = applyFetched(list, s.settled, T + 10);
    expect(r.needs.map((n) => n.id)).toEqual(['pick', 'seat', 'invite']); // the server still had it
    expect(r.settled.size).toBe(0);
  });
  it('the usual case: the later fetch agrees it is gone', () => {
    const s = settle(list, (n) => n.id === 'seat', new Map(), T);
    const r = applyFetched(s.needs, s.settled, T + 10);
    expect(r.needs.map((n) => n.id)).toEqual(['pick', 'invite']);
  });
});
