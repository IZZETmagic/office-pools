// =============================================================
// HAS THIS MEMBER BEEN SHOWN IT YET — the two one-shot markers
// =============================================================
// Phases 2 and 5 each happen ONCE per duel, and "once" needs somewhere durable
// to live. Both markers are columns on `pool_entries`:
//
//   `last_reveal_seen_duel`   (136)  the walkout — phase 2
//   `last_recap_seen_at`      (122)  the recap   — phase 5
//
// ⚠ READ AND WRITTEN DIRECTLY, NOT THROUGH THE LEAGUE CONTRACT. Both migrations
// checked the grant path before choosing this: `pg_class.relacl` is a
// table-wide `authenticated=arwdDxtm`, and the RLS policy "Users can update own
// entries" lets a member write their own row while the pool is not archived.
// Adding them to `/api/pools/:id/league` would put two per-viewer flags on a
// payload that is otherwise about the SEASON — which the read-path cost review
// is explicit about: cache the season, never the pool. Two flags that differ
// per member would make the whole thing uncacheable.
//
// It also means phases 2 and 5 need no server deploy to work.
//
// ⚠ THEY ARE DIFFERENT SHAPES ON PURPOSE, and it is not an inconsistency.
// The recap compares `settled_at > last_recap_seen_at`, because settlement time
// moves forward whatever order the rounds are played in (122). The walkout
// compares duel IDS, because a redraw mints a new id for the same matchweek at
// the same reveal instant — a clock cannot see that (136).
// =============================================================

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from './supabase';

/**
 * The reveal marker cannot be read because migration 136 has not been applied.
 *
 * ⚠ A DISTINCT VALUE, NOT `null`. Null is a real answer meaning "this member
 * has never watched a walkout", and it opens the ceremony. This means "we have
 * no way to record that they watched it", which must CLOSE it — a ceremony
 * whose dismissal cannot be stored replays on every single app open.
 */
export const MISSING = '__reveal_column_missing__';

export type CeremonyMarkers = {
  lastRevealSeenDuel: string | null;
  lastRecapSeenAt: string | null;
};

const EMPTY: CeremonyMarkers = { lastRevealSeenDuel: null, lastRecapSeenAt: null };

/** Does this PostgREST error mean the named column is not deployed yet? */
function isUndefinedColumn(err: { code?: string; message?: string }, column: string): boolean {
  // 42703 is Postgres `undefined_column`. The message check is the belt to that
  // braces — PostgREST has changed which of the two it populates before.
  return err.code === '42703' || (err.message ?? '').includes(column);
}

function key(entryId: string | null) {
  return ['ceremony-markers', entryId] as const;
}

export function useCeremonyMarkers(entryId: string | null) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: key(entryId),
    enabled: entryId !== null,
    /**
     * ⚠ NOT REFETCHED ON FOCUS OR ON AN INTERVAL. These change only when THIS
     * device writes them, and a refetch mid-ceremony that came back with the
     * pre-write value would restart a walkout somebody is halfway through.
     */
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<CeremonyMarkers> => {
      const read = async (columns: string) =>
        supabase.from('pool_entries').select(columns).eq('entry_id', entryId!).maybeSingle();

      let { data, error } = await read('last_reveal_seen_duel, last_recap_seen_at');

      /**
       * ⚠⚠ THE TWO MARKERS ARE NOT DEPLOYED TOGETHER, AND ASKING FOR BOTH AT
       * ONCE MADE THE OLDER ONE FAIL.
       *
       * `last_recap_seen_at` has been live since migration 122.
       * `last_reveal_seen_duel` arrives with 136, which has to be applied by
       * hand. Between those two moments PostgREST rejects the whole SELECT with
       * `42703` — a select list is all-or-nothing — so the RECAP was suppressed
       * by a column only the WALKOUT needs.
       *
       * Ryan hit exactly this on 2026-09-06: matchweek 3 had settled, he had
       * not reviewed it, and no recap appeared. Nothing errored on screen,
       * because the caller treats a failed read as "already seen" — which is
       * the right bias for a ceremony and the wrong one for a missing column.
       *
       * So a missing reveal column degrades to the recap alone rather than
       * taking both down. It self-heals the moment 136 lands: the first read
       * succeeds and the fallback stops being reached.
       */
      let revealColumnMissing = false;
      if (error && isUndefinedColumn(error, 'last_reveal_seen_duel')) {
        revealColumnMissing = true;
        ({ data, error } = await read('last_recap_seen_at'));
      }

      /**
       * ⚠ THROWN, NOT SWALLOWED INTO A DEFAULT. A discarded PostgREST error is
       * a documented way this codebase has lost hours — `const { data } = await`
       * hides a 400 and renders an empty default forever. Here the empty
       * default means "never seen anything", which would replay both ceremonies
       * on every single app open. Failing loudly leaves the query in `error`,
       * and the caller below treats that as "already seen".
       */
      if (error) throw new Error(`[ceremony] markers read failed: ${error.message}`);

      const row = data as unknown as {
        last_reveal_seen_duel?: string | null;
        last_recap_seen_at: string | null;
      } | null;

      return {
        /**
         * ⚠ `MISSING` IS NOT `null` HERE. Null means "never watched one", which
         * OPENS the walkout; the column being absent means we cannot know, and
         * offering a ceremony whose dismissal cannot be recorded would replay it
         * on every app open forever. The caller distinguishes the two.
         */
        lastRevealSeenDuel: revealColumnMissing ? MISSING : row?.last_reveal_seen_duel ?? null,
        lastRecapSeenAt: row?.last_recap_seen_at ?? null,
      };
    },
  });

  const write = useMutation({
    mutationFn: async (patch: Partial<Record<'duel' | 'recapAt', string>>) => {
      if (!entryId) return;
      const row: Record<string, string> = {};
      // ⚠ Writing a column that does not exist fails the whole UPDATE, which
      // would take the recap stamp down with it when both are patched.
      if (patch.duel !== undefined && patch.duel !== MISSING) {
        row.last_reveal_seen_duel = patch.duel;
      }
      if (patch.recapAt !== undefined) row.last_recap_seen_at = patch.recapAt;
      if (Object.keys(row).length === 0) return;

      const { error } = await supabase.from('pool_entries').update(row).eq('entry_id', entryId);

      /**
       * ⚠ LOGGED, NOT DISCARDED. The web's equivalent note: if the column ever
       * loses its UPDATE grant, this is the only thing that would say so. A
       * silently failed write means the ceremony reappears on the next visit,
       * which is confusing rather than broken — worth knowing about, not worth
       * blocking on.
       */
      if (error) console.error('[ceremony] marking seen failed:', error.message);
    },
  });

  /**
   * ⚠ OPTIMISTIC, AND IT HAS TO BE. The ceremony closes the instant the member
   * presses Skip; waiting on a round trip would hold a full-screen takeover
   * open on a bad connection. The cache is updated first and the write follows.
   * A failed write means it reappears next visit — mildly annoying, and far
   * better than the alternative.
   */
  const markRevealSeen = useCallback(
    (duelId: string) => {
      qc.setQueryData(key(entryId), (prev: CeremonyMarkers | undefined) => ({
        ...(prev ?? EMPTY),
        lastRevealSeenDuel: duelId,
      }));
      write.mutate({ duel: duelId });
    },
    [qc, entryId, write],
  );

  const markRecapSeen = useCallback(() => {
    const now = new Date().toISOString();
    qc.setQueryData(key(entryId), (prev: CeremonyMarkers | undefined) => ({
      ...(prev ?? EMPTY),
      lastRecapSeenAt: now,
    }));
    write.mutate({ recapAt: now });
  }, [qc, entryId, write]);

  return {
    /**
     * ⚠ `null` UNTIL IT IS KNOWN, and the caller must not read that as "never
     * seen". While this is loading — or if the read failed — the phase machine
     * would be told nobody has watched anything, and would open a walkout over
     * a member who has already met their opponent. `ready` is the guard.
     */
    markers: query.data ?? EMPTY,
    /** True once the markers are a real answer rather than a placeholder. */
    ready: query.isSuccess,
    /**
     * The read failed. Treated by the caller exactly like "already seen": a
     * member who cannot be shown a ceremony has lost nothing they can name,
     * whereas one shown it every time they open the app has lost patience.
     */
    failed: query.isError,
    markRevealSeen,
    markRecapSeen,
  };
}
