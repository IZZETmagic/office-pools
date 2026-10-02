-- 152 — a member cannot write their own score
--
-- 🔴 FIXES programme risk R34. The same shape as 145 (users) and 151 (pool_members), on the table
-- that holds the scores:
--
--   1. RLS "Users can update own entries" lets a member UPDATE their own pool_entries rows, with NO
--      `with check` and no column restriction; "Pool admins can update entries" is the same for
--      every entry in an admin's pool.
--   2. `authenticated` holds UPDATE on every column — point_adjustment, scored_total_points,
--      current_rank, retired_at, fee_paid, predictions_locked, predictions_submitted_at …
--   3. The only triggers were on INSERT (identity fill, tier cap).
--
-- What that allowed, by a member on their own entry (not probed, read from the catalog):
--   · point_adjustment — which `shadow_finalize_totals` folds into the total every member-facing
--     World Cup leaderboard reads (035:115). The live way to give yourself points.
--   · scored_total_points / current_rank — shown wherever pool_entries is read raw.
--   · retired_at (un-retire yourself), fee_paid (mark yourself paid), predictions_locked.
--   · INSERT an extra entry carrying any of the above, and any pool_id: `fill_pool_entry_identity`
--     only fills pool_id/user_id when they are NULL.
--   · DELETE their own entry outright — bypassing the soft delete of 056 and its four doors.
-- And a pool admin could rewrite any entry's totals and ranks directly, outside the logged
-- point_adjustments trail.
--
-- ⭐ CHECKED 2026-10-02, no evidence it was used: all 164 entries with a non-zero adjustment match
-- the point_adjustments log exactly (which only pool admins can write); every stored
-- scored_total_points equals match + bonus + adjustment; no predictions_submitted_at is in the future.
--
-- WHO MAY WRITE WHAT — the audit of every writer, 2026-10-02:
--
--   member, own entry   entry_name, last_recap_seen_at, last_reveal_seen_duel,
--                       predictions_last_saved_at, has_submitted_predictions (false → true only),
--                       predictions_submitted_at (server-stamped, below)
--                       — web PoolDetail/DuelsTab, mobile usePoolEntries/usePredictions, and the
--                         member API routes (predictions, predictions/round, bracket-picks,
--                         entries), which all write through the MEMBER's session.
--   pool admin, any     the member set, plus fee_paid, fee_paid_at, point_adjustment,
--   entry in their pool adjustment_reason, and un-submitting (unlock) — web MembersTab/FeesTab,
--                       mobile AdjustPointsSheet/FeesTab/member screen.
--   trusted             everything — the service role (scoring, auto-submit, retire/restore,
--                       join, create), migrations, and SECURITY DEFINER functions such as
--                       lite_recalc_entry, which re-derives totals and ranks after an admin
--                       adjustment.
--   super admin         everything.
--
-- ⚠⚠ "TRUSTED" IS `current_user`, NOT `auth.uid()` (which 151 uses). An admin's adjustment calls
-- lite_recalc_entry, a SECURITY DEFINER function, which then writes scored_total_points and
-- current_rank across the pool. auth.uid() is still the admin inside it, so an auth.uid() test
-- would block it; current_user is the function's owner, so this test lets it through. That is
-- also why THIS trigger function is SECURITY INVOKER — a definer trigger would always see its
-- own owner. ⚠ So any SECURITY DEFINER function that writes pool_entries is trusted: it must
-- derive what it writes, never take a value from its caller. Today four functions write the
-- table: create_pool_entry and save_predictions_batch (INVOKER — checked as the member),
-- snapshot_pool_ranks (INVOKER — only the admin client calls it), lite_recalc_entry (DEFINER —
-- derives scored_total_points from stored parts and re-ranks).
--
-- THE TIEBREAK TIME BELONGS TO THE SERVER. predictions_submitted_at is the last rank tiebreak, and
-- mobile stamps it from the device clock (mobile/lib/usePredictions.ts). For an untrusted writer
-- the trigger now replaces any value with now() the first time it is set, and never lets it move
-- after; clearing it is an admin unlock. Coerced rather than refused, so no released app breaks.
--
-- A MEMBER-INSERTED ENTRY STARTS CLEAN: every scoring, fee, lock, retire and marker column is
-- reset to its default, and pool_id/user_id are cleared so `fill_pool_entry_identity` derives them
-- from the membership. Name and number are the member's. (This trigger sorts before trg_fill_*.)
--
-- ⚠ NOT ADDRESSED HERE:
--   • mobile usePoolEntries inserts entries directly, so it skips create_pool_entry's deadline and
--     max-entries checks. Only the tier cap (075, enforced pools only) limits it. Product logic,
--     not score integrity — separate item.
--   • lite_recalc_entry and snapshot_pool_ranks are executable by any signed-in user. Neither takes
--     a value from its caller, so neither can tamper; at worst they cause extra writes.
--   • 12 positive self-adjustments (+887) in 4 pools were made by an admin who is not the pool's
--     creator — plausibly real co-admins, but R32 (151) let anyone become admin until today.
--     Not reviewed, at Ryan's call.

create or replace function public.guard_pool_entry_writes()
returns trigger
language plpgsql
security invoker            -- ⚠ load-bearing: current_user must be the CALLER's role. See above.
set search_path = public
as $$
declare
  c_member_cols constant text[] := array[
    'entry_name', 'last_recap_seen_at', 'last_reveal_seen_duel',
    'predictions_last_saved_at', 'has_submitted_predictions', 'predictions_submitted_at'];
  c_admin_cols constant text[] := array[
    'entry_name', 'last_recap_seen_at', 'last_reveal_seen_duel',
    'predictions_last_saved_at', 'has_submitted_predictions', 'predictions_submitted_at',
    'fee_paid', 'fee_paid_at', 'point_adjustment', 'adjustment_reason'];
  v_pool     uuid;
  v_is_admin boolean;
  v_allowed  text[];
begin
  -- Trusted: anything not running as an end-user role — the service role, migrations, and
  -- SECURITY DEFINER functions (current_user is their owner). And super admins.
  if current_user not in ('authenticated', 'anon') or public.is_super_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- A member adding an entry of their own: it starts clean.
    new.pool_id := null;  new.user_id := null;          -- derived by fill_pool_entry_identity
    new.point_adjustment := 0;  new.adjustment_reason := null;
    new.fee_paid := false;  new.fee_paid_at := null;
    new.has_submitted_predictions := false;  new.predictions_submitted_at := null;
    new.predictions_locked := false;  new.predictions_last_saved_at := null;
    new.auto_submitted := false;
    new.total_points := 0;  new.match_points := null;  new.bonus_points := null;
    new.scored_total_points := null;
    new.current_rank := null;  new.previous_rank := null;  new.last_rank_update := null;
    new.retired_at := null;  new.retired_reason := null;  new.retired_by := null;
    new.last_recap_seen_at := null;  new.last_reveal_seen_duel := null;
    new.created_at := now();
    return new;
  end if;

  -- UPDATE. An entry's identity never moves.
  if new.entry_id     is distinct from old.entry_id
     or new.member_id    is distinct from old.member_id
     or new.pool_id      is distinct from old.pool_id
     or new.user_id      is distinct from old.user_id
     or new.entry_number is distinct from old.entry_number
     or new.created_at   is distinct from old.created_at
  then
    raise exception 'pool_entries: % may not change an entry''s identity', auth.uid()
      using errcode = '42501';
  end if;

  v_pool := coalesce(old.pool_id,
                     (select pm.pool_id from public.pool_members pm where pm.member_id = old.member_id));
  v_is_admin := v_pool is not null and public.is_pool_admin(v_pool);

  -- The tiebreak time is the server's: stamped with now() the first time it is set, never moved
  -- after. Clearing it is an admin unlock; a member's attempt to clear it keeps the old value.
  if new.predictions_submitted_at is distinct from old.predictions_submitted_at then
    if new.predictions_submitted_at is null then
      if not v_is_admin then
        new.predictions_submitted_at := old.predictions_submitted_at;
      end if;
    elsif old.predictions_submitted_at is null then
      new.predictions_submitted_at := now();
    else
      new.predictions_submitted_at := old.predictions_submitted_at;
    end if;
  end if;

  -- A member submits; only an admin un-submits (unlock).
  if not v_is_admin
     and coalesce(old.has_submitted_predictions, false)
     and not coalesce(new.has_submitted_predictions, false)
  then
    raise exception 'pool_entries: % may not un-submit predictions; a pool admin unlocks them', auth.uid()
      using errcode = '42501';
  end if;

  -- Everything outside the writer's allow-list must come back unchanged.
  v_allowed := case when v_is_admin then c_admin_cols else c_member_cols end;
  if (to_jsonb(new) - v_allowed) is distinct from (to_jsonb(old) - v_allowed) then
    raise exception 'pool_entries: % may only change % on this entry', auth.uid(), v_allowed
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_pool_entry_writes() is
  'Allow-list guard on pool_entries for end-user writes. Members: name, read markers, prediction '
  'save/submit (submission time server-stamped). Pool admins: also fees, logged point '
  'adjustments, unlock. Totals, ranks, retire, lock and identity: trusted writers only (service '
  'role, SECURITY DEFINER functions, super admin). SECURITY INVOKER on purpose. See 152 (R34).';

drop trigger if exists pool_entries_guard_writes on public.pool_entries;

-- Named to sort BEFORE trg_fill_pool_entry_identity, so a cleared pool_id/user_id is re-derived.
create trigger pool_entries_guard_writes
  before insert or update on public.pool_entries
  for each row
  execute function public.guard_pool_entry_writes();

-- Leaving goes through the four soft-delete doors (056), all on the service role. Nothing in the
-- web or the app hard-deletes an entry through a user session.
drop policy if exists "Users can delete own entries" on public.pool_entries;
