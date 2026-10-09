// The phone-side half of the "needs more players" card. Which pool it is for is decided in
// `lib/inviteCard.ts`; this holds the pools it has been closed for, and the one action it takes.
//
// Per phone, like the notifications-off card's × (`usePushAsk.ts`), and kept across sign-out: the
// list is pool ids and nothing else, and the card only ever shows for a pool you run.

import * as SecureStore from 'expo-secure-store';
import { useSyncExternalStore } from 'react';

import { parseClosedPools, withClosedPool } from './inviteCard';

// A JSON list of pool ids, newest last.
const CLOSED_KEY = 'invite_card_closed_pools';

type State = {
  /** `null` until SecureStore has answered — and for good if it can't, which means no card. */
  ids: readonly string[] | null;
  closed: ReadonlySet<string> | null;
};

let state: State = { ids: null, closed: null };
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;

function setIds(ids: readonly string[]): void {
  state = { ids, closed: new Set(ids) };
  listeners.forEach((l) => l());
}

function load(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      try {
        setIds(parseClosedPools(await SecureStore.getItemAsync(CLOSED_KEY)));
      } catch (err) {
        // ⚠ FAILS CLOSED. Left `null`, which shows no card: if the list can't be read it can't be
        // written either, and a card whose × can't be remembered is back on every launch.
        console.warn('[inviteCard] SecureStore read failed', err);
      }
    })();
  }
  return loading;
}

function subscribe(listener: () => void): () => void {
  void load();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const snapshot = () => state.closed;

/** The card's ×. Closed for that pool for good on this phone; memory first, so it goes at once. */
export async function closeInviteCard(poolId: string): Promise<void> {
  // No list means no card was showing, so there is nothing to close.
  if (state.ids === null) return;
  const next = withClosedPool(state.ids, poolId);
  setIds(next);
  try {
    await SecureStore.setItemAsync(CLOSED_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn('[inviteCard] SecureStore write failed', err);
  }
}

/** The pools the card has been closed for on this phone. `null` until known. */
export function useClosedInviteCards(): ReadonlySet<string> | null {
  return useSyncExternalStore(subscribe, snapshot);
}
