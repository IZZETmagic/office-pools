// =============================================================
// ONE TOPIC, SEVERAL HOLDERS
// =============================================================
// ⚠ `supabase.channel(topic)` RETURNS THE SAME OBJECT EVERY TIME. Not a
// similar one — the identical instance, deduplicated by topic inside the
// client. Verified on the version the phone runs (supabase-js 2.106.0):
//
//     const a = supabase.channel(T);  const b = supabase.channel(T);
//     a === b                      → true
//     supabase.getChannels().length → 1
//
// Which means `channel.unsubscribe()` is not "my subscription ends". It is
// "this topic ends, for everybody" — the channel leaves `getChannels()` and
// every holder stops receiving, silently and with no error anywhere.
//
// ## Why that only became a problem on 2026-09-03
//
// Two hooks already shared `pool:{id}:leaderboard`: `usePoolDetail` and
// `usePoolEntries`. They mount and unmount together on the pool screen, so
// whichever tore the channel down was taking it from a component that was
// leaving anyway. The bug was latent, not absent.
//
// The match feed broke that symmetry. It subscribes to the same topic — that
// is where migration 125 sends live fixture state — but it lives at the ROOT,
// for the whole session, while a pool screen comes and goes underneath it. So
// every time a member closed a pool, `usePoolEntries`'s cleanup would have
// silently killed Home's live match cards, and the only way to get them back
// would have been to restart the app.
//
// ## What this does instead
//
// Reference-counts holders per topic and unsubscribes only when the last one
// leaves. Each holder gets its own handler; a release removes that handler and
// nothing else, so a departing holder cannot keep firing into a component that
// has unmounted either.
//
// ⚠ ONE BINDING PER (topic, event), FANNED OUT. `channel.on()` accumulates
// bindings and supabase-js exposes no way to remove one, so binding per holder
// would leave a dead binding behind on every unmount — a slow leak on a screen
// that is opened and closed all day. The Set below is removable; the binding
// is created once and never removed while the topic lives.
// =============================================================

import type { RealtimeChannel } from '@supabase/supabase-js';

import { supabase } from './supabase';

/** The half of a broadcast message anything here reads. */
export type BroadcastMessage = { payload?: unknown };

export type BroadcastHandler = (message: BroadcastMessage) => void;

type Entry = {
  channel: RealtimeChannel;
  /** Live handlers, per event name. The removable half of a binding. */
  handlers: Map<string, Set<BroadcastHandler>>;
  holders: number;
};

const entries = new Map<string, Entry>();

/**
 * Hold a private broadcast topic for as long as the returned function is
 * uncalled. Calling it releases this holder's claim; the channel is torn down
 * only when the last one lets go.
 *
 * ⚠ `setAuth()` BEFORE `subscribe()`, and it is not optional. A private
 * channel whose socket carries no JWT never passes its authorization policy
 * and simply receives nothing — no error, no failed status, just silence. The
 * `pool:{id}:leaderboard` policy authorizes by pool membership, which is why
 * these topics are named after pools at all.
 */
export function leaseBroadcast(
  topic: string,
  event: string,
  handler: BroadcastHandler,
): () => void {
  let entry = entries.get(topic);

  if (!entry) {
    const channel = supabase.channel(topic, { config: { private: true } });
    const created: Entry = { channel, handlers: new Map(), holders: 0 };
    entries.set(topic, created);
    entry = created;
    void Promise.resolve(supabase.realtime.setAuth()).then(() => {
      // Released again before the JWT landed — a fast navigation. Subscribing
      // now would join a topic nobody is holding, and nothing would ever
      // unsubscribe it.
      if (entries.get(topic) === created) channel.subscribe();
    });
  }

  let handlers = entry.handlers.get(event);
  if (!handlers) {
    const created = new Set<BroadcastHandler>();
    entry.handlers.set(event, created);
    handlers = created;
    // ⚠ Iterated over a COPY. A handler that releases its own lease while
    // being called would otherwise mutate the Set mid-iteration.
    // ⚠ NARROWED, NOT WIDENED. supabase-js hands the callback a record with an
    // index signature, which TypeScript will not assign to a type whose only
    // members are optional. `payload` is the sole field any holder reads, so
    // the cast is to the shape actually used rather than to `any`.
    entry.channel.on('broadcast', { event }, (message) => {
      for (const h of [...created]) h(message as BroadcastMessage);
    });
  }

  handlers.add(handler);
  entry.holders += 1;

  let released = false;
  return () => {
    // React can run a cleanup twice (StrictMode, and a re-entrant unmount).
    // Without this the count would go negative and take the topic down while
    // a real holder still had it.
    if (released) return;
    released = true;

    const current = entries.get(topic);
    if (!current) return;
    current.handlers.get(event)?.delete(handler);
    current.holders -= 1;
    if (current.holders > 0) return;

    entries.delete(topic);
    void current.channel.unsubscribe();
  };
}

/** Topics currently held, for tests. */
export function heldTopics(): string[] {
  return [...entries.keys()];
}
