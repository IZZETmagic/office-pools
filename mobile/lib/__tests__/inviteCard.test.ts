// The "needs more players" card on Home (mobile/lib/inviteCard.ts): which pool it is for, that its
// × closes it for that pool only, and the stored list it remembers that in.

import { describe, expect, it } from 'vitest';

import {
  INVITE_CARD_CLOSED_LIMIT,
  parseClosedPools,
  pickInviteTarget,
  withClosedPool,
  type InviteCandidate,
} from '../inviteCard';

const NOW = Date.parse('2026-10-09T12:00:00Z');
const LATER = '2026-10-20T15:00:00Z';
const EARLIER = '2026-10-01T15:00:00Z';

function pool(poolId: string, patch: Partial<InviteCandidate> = {}): InviteCandidate {
  return {
    poolId,
    role: 'admin',
    memberCount: 2,
    hasScoringStarted: false,
    predictionDeadline: LATER,
    ...patch,
  };
}

const none = new Set<string>();

describe('pickInviteTarget', () => {
  it('picks the first small, not-yet-started pool you run', () => {
    expect(pickInviteTarget([pool('a'), pool('b')], none, NOW)?.poolId).toBe('a');
  });

  it('skips a pool you only play in', () => {
    expect(pickInviteTarget([pool('a', { role: 'member' }), pool('b')], none, NOW)?.poolId).toBe('b');
  });

  it('skips a pool that already has four members', () => {
    expect(pickInviteTarget([pool('a', { memberCount: 4 }), pool('b')], none, NOW)?.poolId).toBe('b');
  });

  it('skips a pool whose deadline has passed, or that has started scoring', () => {
    const pools = [
      pool('a', { predictionDeadline: EARLIER }),
      pool('b', { hasScoringStarted: true }),
      pool('c'),
    ];
    expect(pickInviteTarget(pools, none, NOW)?.poolId).toBe('c');
  });

  it('a pool with no deadline yet can still have it', () => {
    expect(pickInviteTarget([pool('a', { predictionDeadline: null })], none, NOW)?.poolId).toBe('a');
  });

  it('closing it for one pool moves it to the next pool that qualifies', () => {
    const pools = [pool('a'), pool('b')];
    expect(pickInviteTarget(pools, new Set(['a']), NOW)?.poolId).toBe('b');
  });

  it('closed for every pool that qualifies means no card', () => {
    expect(pickInviteTarget([pool('a'), pool('b')], new Set(['a', 'b']), NOW)).toBeNull();
  });

  it('shows nothing until the phone has said which pools are closed', () => {
    expect(pickInviteTarget([pool('a')], null, NOW)).toBeNull();
  });
});

describe('the stored list', () => {
  it('adds a pool newest last, once', () => {
    expect(withClosedPool(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
    expect(withClosedPool(['a', 'b'], 'a')).toEqual(['b', 'a']);
  });

  it('keeps at most the limit, dropping the oldest', () => {
    const full = Array.from({ length: INVITE_CARD_CLOSED_LIMIT }, (_, i) => `p${i}`);
    const next = withClosedPool(full, 'new');
    expect(next).toHaveLength(INVITE_CARD_CLOSED_LIMIT);
    expect(next[0]).toBe('p1');
    expect(next.at(-1)).toBe('new');
  });

  it('stays under the size SecureStore warns about on iOS', () => {
    const uuid = '00000000-0000-0000-0000-000000000000';
    const full = Array.from({ length: INVITE_CARD_CLOSED_LIMIT }, () => uuid);
    expect(JSON.stringify(full).length).toBeLessThan(2048);
  });

  it('reads nothing stored, or anything unreadable, as nothing closed', () => {
    expect(parseClosedPools(null)).toEqual([]);
    expect(parseClosedPools('not json')).toEqual([]);
    expect(parseClosedPools('{"a":1}')).toEqual([]);
    expect(parseClosedPools('["a",2,"b"]')).toEqual(['a', 'b']);
  });
});
