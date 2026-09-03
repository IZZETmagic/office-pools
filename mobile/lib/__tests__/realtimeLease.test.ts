import { beforeEach, describe, expect, it, vi } from 'vitest';

// ⚠ MOCKED AT THE MODULE BOUNDARY, because `./supabase` reaches React Native
// (AsyncStorage, URL polyfills) and the root vitest cannot load that. What is
// under test is the reference counting, not the socket — but the mock has to
// reproduce the ONE behaviour that made this module necessary: `channel(topic)`
// returns the SAME object for a topic, so `unsubscribe()` ends it for everyone.
// Verified against supabase-js 2.106.0, the version the app ships.
const channels = new Map<string, MockChannel>();

type Binding = { event: string; handler: (message: { payload?: unknown }) => void };

class MockChannel {
  bindings: Binding[] = [];
  subscribed = false;
  unsubscribed = false;
  constructor(readonly topic: string) {}
  on(_type: string, filter: { event: string }, handler: Binding['handler']) {
    this.bindings.push({ event: filter.event, handler });
    return this;
  }
  subscribe() {
    this.subscribed = true;
    return this;
  }
  unsubscribe() {
    this.unsubscribed = true;
    channels.delete(this.topic);
    return Promise.resolve('ok');
  }
  /** Deliver a message the way the server would — to every binding. */
  emit(event: string, payload: unknown) {
    for (const b of this.bindings) if (b.event === event) b.handler({ payload });
  }
}

vi.mock('../supabase', () => ({
  supabase: {
    channel: (topic: string) => {
      const existing = channels.get(topic);
      if (existing) return existing;
      const created = new MockChannel(topic);
      channels.set(topic, created);
      return created;
    },
    realtime: { setAuth: () => Promise.resolve() },
  },
}));

const { leaseBroadcast, heldTopics } = await import('../realtimeLease');

const TOPIC = 'pool:p1:leaderboard';
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  for (const t of heldTopics()) channels.get(t)?.unsubscribe();
  channels.clear();
  // Drain any leases the previous test left holding.
  while (heldTopics().length > 0) channels.delete(heldTopics()[0]);
});

describe('leaseBroadcast', () => {
  it('subscribes once for a topic however many holders it has', async () => {
    const a = leaseBroadcast(TOPIC, 'fixtures_update', vi.fn());
    const b = leaseBroadcast(TOPIC, 'leaderboard_update', vi.fn());
    await flush();

    expect(channels.size).toBe(1);
    expect(channels.get(TOPIC)!.subscribed).toBe(true);
    a();
    b();
  });

  // ⚠ THE ONE THAT MATTERS. This is the defect the module exists to prevent:
  // a pool screen closing used to take Home's live match cards with it.
  it('keeps the topic alive when one holder releases and another has not', async () => {
    const poolScreen = vi.fn();
    const matchFeed = vi.fn();
    const releasePoolScreen = leaseBroadcast(TOPIC, 'leaderboard_update', poolScreen);
    const releaseMatchFeed = leaseBroadcast(TOPIC, 'fixtures_update', matchFeed);
    await flush();

    releasePoolScreen(); // the member closes the pool

    expect(channels.get(TOPIC)?.unsubscribed).toBeFalsy();
    channels.get(TOPIC)!.emit('fixtures_update', { season_id: 's', fixtures: [] });
    expect(matchFeed).toHaveBeenCalledTimes(1);

    // And the departed holder hears nothing more.
    channels.get(TOPIC)!.emit('leaderboard_update', {});
    expect(poolScreen).not.toHaveBeenCalled();

    releaseMatchFeed();
    expect(channels.get(TOPIC)).toBeUndefined();
  });

  it('tears the topic down when the last holder releases', async () => {
    const release = leaseBroadcast(TOPIC, 'fixtures_update', vi.fn());
    await flush();
    const channel = channels.get(TOPIC)!;
    release();
    expect(channel.unsubscribed).toBe(true);
    expect(heldTopics()).toEqual([]);
  });

  it('fans one event out to every holder of it', async () => {
    const first = vi.fn();
    const second = vi.fn();
    const r1 = leaseBroadcast(TOPIC, 'fixtures_update', first);
    const r2 = leaseBroadcast(TOPIC, 'fixtures_update', second);
    await flush();

    // ⚠ ONE binding on the channel, not one per holder — supabase-js offers no
    // way to remove a binding, so a holder-per-binding design would leak one on
    // every unmount.
    expect(channels.get(TOPIC)!.bindings.filter((b) => b.event === 'fixtures_update')).toHaveLength(1);

    channels.get(TOPIC)!.emit('fixtures_update', { n: 1 });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    r1();
    r2();
  });

  it('survives a release being called twice', async () => {
    const other = vi.fn();
    const release = leaseBroadcast(TOPIC, 'fixtures_update', vi.fn());
    const keep = leaseBroadcast(TOPIC, 'fixtures_update', other);
    await flush();

    release();
    release(); // React can run a cleanup twice; this must not take the topic

    channels.get(TOPIC)!.emit('fixtures_update', {});
    expect(other).toHaveBeenCalledTimes(1);
    keep();
  });

  it('does not subscribe a topic released before the JWT resolved', async () => {
    const release = leaseBroadcast(TOPIC, 'fixtures_update', vi.fn());
    release(); // released synchronously, before setAuth's promise settles
    await flush();
    expect(channels.get(TOPIC)).toBeUndefined();
  });

  it('keeps separate topics separate', async () => {
    const one = vi.fn();
    const two = vi.fn();
    const r1 = leaseBroadcast('pool:a:leaderboard', 'fixtures_update', one);
    const r2 = leaseBroadcast('pool:b:leaderboard', 'fixtures_update', two);
    await flush();

    channels.get('pool:a:leaderboard')!.emit('fixtures_update', {});
    expect(one).toHaveBeenCalledTimes(1);
    expect(two).not.toHaveBeenCalled();

    r1();
    expect(channels.get('pool:b:leaderboard')?.unsubscribed).toBeFalsy();
    r2();
  });
});
