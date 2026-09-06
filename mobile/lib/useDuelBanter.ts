// =============================================================
// WHAT THE TWO OF THEM SAID, WHILE IT WAS BEING DECIDED
// =============================================================
// Ryan, 2026-09-06, on the duel review page: *"Was there any banter that went
// back and forth between the two users?"*
//
// Two members, one matchweek's window. Nothing else.
//
// ## ⚠ IT IS SCOPED BY TIME, NOT BY "RECENT"
//
// The window is the matchweek's own `lock_at` to the duel's `settled_at` —
// picks close, football is played, the duel settles. Taking "the last N
// messages" instead would put this week's argument on last week's review page
// the moment somebody posted after the whistle, and the page is permanent.
//
// ## ⚠ AND IT SHOWS NOTHING THE POOL CANNOT ALREADY SEE
//
// Banter is a pool-wide room; every message here is one both members and
// everyone else already read. This is a filter over a public feed, not a
// private thread being surfaced — run the disclosure gate's tooltip test:
// *"we show the messages you two posted while this duel was being played"*
// passes.
//
// ⚠ NO SENTIMENT, NO SUMMARY, NO "SPICIEST MESSAGE". The messages are shown as
// written, in order. Ranking them would mean deciding whose banter was better,
// which is a judgement this product has no business making about two friends.
// =============================================================

import { useQuery } from '@tanstack/react-query';

import { supabase } from './supabase';

export type DuelBanterMessage = {
  messageId: string;
  userId: string;
  senderName: string;
  content: string;
  createdAt: string;
};

type Args = {
  poolId: string;
  /** Both duellists' user ids. Nulls are tolerated and filtered. */
  userIds: (string | null)[];
  /** The matchweek's lock. Null disables the query — see below. */
  from: string | null;
  /** When the duel settled. Null disables the query. */
  to: string | null;
};

export function useDuelBanter({ poolId, userIds, from, to }: Args) {
  const ids = userIds.filter((u): u is string => !!u);

  /**
   * ⚠ DISABLED UNTIL THE WINDOW IS KNOWN, rather than defaulting to an open
   * one. A missing `from` or `to` with a naive query would return every message
   * those two have ever posted in the pool and present it as this week's
   * exchange — wrong, and wrong in a way that looks plausible.
   */
  const enabled = ids.length > 0 && from !== null && to !== null;

  const query = useQuery({
    queryKey: ['duel-banter', poolId, ids.join(','), from, to],
    enabled,
    // A settled week does not change. Nothing here needs refetching.
    staleTime: Infinity,
    queryFn: async (): Promise<DuelBanterMessage[]> => {
      const { data, error } = await supabase
        .from('pool_messages')
        .select('message_id, user_id, content, message_type, created_at, users(full_name, username)')
        .eq('pool_id', poolId)
        .in('user_id', ids)
        .gte('created_at', from!)
        .lte('created_at', to!)
        .order('created_at', { ascending: true })
        /**
         * ⚠ BOUNDED. PostgREST silently truncates an unbounded select at 1,000
         * rows, and an exact 1,000 is a bug rather than a result. A duel's worth
         * of chat between two people is nowhere near this, so the cap is a
         * guard: if it is ever hit, the window is wrong, not the pool talkative.
         */
        .limit(200);

      // ⚠ THROWN, NOT DISCARDED. `const { data } = await` hides a 400 and
      // renders "nobody said anything" forever — which on this page is a
      // factual claim about two people's week, not an empty state.
      if (error) throw new Error(`[duel-banter] ${error.message}`);

      type Row = {
        message_id: string;
        user_id: string;
        content: string | null;
        message_type: string | null;
        created_at: string;
        users: { full_name: string | null; username: string | null } | null;
      };

      return ((data ?? []) as unknown as Row[])
        /**
         * ⚠ AUTO-POSTED SHARE CARDS ARE NOT BANTER, and dropping them is the
         * difference between a card worth reading and a card full of the app
         * talking to itself: roughly two thirds of all messages in this product
         * are auto share-cards. Ryan asked what the two of them SAID.
         */
        .filter((r) => (r.message_type ?? 'text') === 'text')
        .filter((r) => (r.content ?? '').trim().length > 0)
        .map((r) => ({
          messageId: r.message_id,
          userId: r.user_id,
          senderName: r.users?.full_name ?? r.users?.username ?? 'Someone',
          content: (r.content ?? '').trim(),
          createdAt: r.created_at,
        }));
    },
  });

  return {
    messages: query.data ?? [],
    /** ⚠ Only true while a query that will actually run is in flight. */
    loading: enabled && query.isPending,
    failed: query.isError,
  };
}
