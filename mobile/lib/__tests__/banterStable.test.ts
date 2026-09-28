// =============================================================
// banterStable — an unchanged message or reaction keeps its object
// =============================================================
// The banter bubble skips its redraw by IDENTITY, so the two failure modes
// are opposite and both matter:
//   - a real change that keeps the old object → a bubble stuck showing stale
//     text / reactions (the dangerous one, so most cases below test it)
//   - no change that makes a new object → the whole list redraws again
// =============================================================

import { describe, it, expect } from 'vitest';

import {
  mergeReactionAggregates,
  reuseIfUnchanged,
  sameChatMessage,
  sameReactionAggregates,
  type ReactionAggregate,
  type StableChatMessage,
} from '../banterStable';

function msg(overrides: Partial<StableChatMessage> = {}): StableChatMessage {
  return {
    _id: 'm1',
    text: 'hello',
    createdAt: new Date('2026-09-28T10:00:00Z'),
    user: { _id: 'u1', name: 'ryan' },
    _showSenderName: true,
    _isLastOfGroup: true,
    _messageType: 'text',
    _metadata: null,
    ...overrides,
  };
}

describe('sameChatMessage', () => {
  it('treats a rebuilt copy with identical contents as the same', () => {
    expect(sameChatMessage(msg(), msg())).toBe(true);
  });

  it('compares createdAt by time, not Date identity', () => {
    expect(
      sameChatMessage(msg(), msg({ createdAt: new Date('2026-09-28T10:00:00Z') })),
    ).toBe(true);
  });

  it.each<[string, Partial<StableChatMessage>]>([
    ['text', { text: 'edited' }],
    ['createdAt', { createdAt: new Date('2026-09-28T10:00:01Z') }],
    ['sender id', { user: { _id: 'u2', name: 'ryan' } }],
    ['sender name', { user: { _id: 'u1', name: 'renamed' } }],
    ['first-of-group flag', { _showSenderName: false }],
    ['last-of-group flag (the avatar moves)', { _isLastOfGroup: false }],
    ['message type', { _messageType: 'badge_flex' }],
    ['metadata', { _metadata: { leader_points: 12 } }],
    ['a reply appearing', { replyMessage: { _id: 'p', text: 'hi', user: { _id: 'u2' } } }],
  ])('sees a change to the %s', (_label, change) => {
    expect(sameChatMessage(msg(), msg(change))).toBe(false);
  });

  it('compares metadata by value, since a refresh hands back a new object', () => {
    const a = msg({ _metadata: { top_entries: [{ rank: 1, points: 40 }] } });
    const b = msg({ _metadata: { top_entries: [{ rank: 1, points: 40 }] } });
    const c = msg({ _metadata: { top_entries: [{ rank: 1, points: 41 }] } });
    expect(sameChatMessage(a, b)).toBe(true);
    expect(sameChatMessage(a, c)).toBe(false);
  });

  it('sees a change inside the quoted reply', () => {
    const reply = { _id: 'p', text: 'hi', user: { _id: 'u2', name: 'sam' } };
    const a = msg({ replyMessage: reply });
    expect(sameChatMessage(a, msg({ replyMessage: { ...reply } }))).toBe(true);
    expect(sameChatMessage(a, msg({ replyMessage: { ...reply, text: 'bye' } }))).toBe(false);
    expect(
      sameChatMessage(a, msg({ replyMessage: { ...reply, user: { _id: 'u2', name: 'x' } } })),
    ).toBe(false);
  });
});

describe('reuseIfUnchanged', () => {
  it('returns the cached object when nothing changed', () => {
    const cached = msg();
    const cache = new Map([['m1', cached]]);
    expect(reuseIfUnchanged(cache, msg())).toBe(cached);
  });

  it('returns the fresh object when something changed', () => {
    const cache = new Map([['m1', msg()]]);
    const fresh = msg({ _isLastOfGroup: false });
    expect(reuseIfUnchanged(cache, fresh)).toBe(fresh);
  });

  it('returns the fresh object for a message it has never seen', () => {
    const fresh = msg();
    expect(reuseIfUnchanged(new Map(), fresh)).toBe(fresh);
  });
});

const agg = (emoji: string, userIds: string[]): ReactionAggregate => ({
  emoji,
  count: userIds.length,
  userIds,
});

describe('sameReactionAggregates', () => {
  it('matches identical contents', () => {
    expect(sameReactionAggregates([agg('🔥', ['a', 'b'])], [agg('🔥', ['a', 'b'])])).toBe(true);
  });

  it('sees a new reactor, a new emoji and a removed emoji', () => {
    const base = [agg('🔥', ['a'])];
    expect(sameReactionAggregates(base, [agg('🔥', ['a', 'b'])])).toBe(false);
    expect(sameReactionAggregates(base, [agg('😂', ['a'])])).toBe(false);
    expect(sameReactionAggregates(base, [])).toBe(false);
  });
});

describe('mergeReactionAggregates', () => {
  it('returns the SAME map when the fetch changes nothing', () => {
    const prev = new Map([['m1', [agg('🔥', ['a'])]]]);
    const fetched = new Map([['m1', [agg('🔥', ['a'])]]]);
    expect(mergeReactionAggregates(prev, fetched, ['m1', 'm2'])).toBe(prev);
  });

  it('keeps unchanged arrays and replaces only the changed one', () => {
    const keep = [agg('🔥', ['a'])];
    const prev = new Map([
      ['m1', keep],
      ['m2', [agg('😂', ['a'])]],
    ]);
    const fetched = new Map([
      ['m1', [agg('🔥', ['a'])]],
      ['m2', [agg('😂', ['a', 'b'])]],
    ]);
    const next = mergeReactionAggregates(prev, fetched, ['m1', 'm2']);
    expect(next).not.toBe(prev);
    expect(next.get('m1')).toBe(keep);
    expect(next.get('m2')?.[0].userIds).toEqual(['a', 'b']);
  });

  it('removes a queried message whose reactions are all gone', () => {
    const prev = new Map([['m1', [agg('🔥', ['a'])]]]);
    const next = mergeReactionAggregates(prev, new Map(), ['m1']);
    expect(next.has('m1')).toBe(false);
  });

  it('leaves messages that were not queried alone', () => {
    // m9 is kept live by realtime; a page fetch for m1 must not wipe it.
    const live = [agg('👍', ['z'])];
    const prev = new Map([['m9', live]]);
    const next = mergeReactionAggregates(prev, new Map([['m1', [agg('🔥', ['a'])]]]), ['m1']);
    expect(next.get('m9')).toBe(live);
    expect(next.get('m1')?.[0].emoji).toBe('🔥');
  });

  it('does not mutate the previous map', () => {
    const prev = new Map([['m1', [agg('🔥', ['a'])]]]);
    mergeReactionAggregates(prev, new Map(), ['m1']);
    expect(prev.has('m1')).toBe(true);
  });
});
