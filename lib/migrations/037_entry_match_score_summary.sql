-- 037: entry_match_score_summary — aggregate scored matches in the database
--
-- WHY
-- The RN home screen needs five small numbers per entry: how many matches were
-- scored, how many exact, how many correct, the current point-scoring streak,
-- and the last five results. Producing them in Node means shipping every scored
-- row out of Postgres and counting them in the API — for a user in ten pools
-- that is ~1,000 rows to produce ~10 objects. One sampled entry set measured
-- 1,042 rows, which is also past PostgREST's 1,000-row cap.
--
-- This does the counting where the rows already are, and returns one row per
-- entry. Same answer, ~1/100th the bytes leaving the database.
--
-- SOURCE SELECTION
-- Takes p_source rather than a table name so it mirrors lib/scoring/readSource.ts
-- exactly: 'shadow' for pools in shadow_read_enabled_pools, 'prod' otherwise.
-- The two branches are a UNION ALL gated on a constant, so the planner applies a
-- one-time filter and never scans the unused table — no dynamic SQL, so no
-- injection surface and the plan stays inspectable.
--
-- SECURITY
-- Deliberately SECURITY INVOKER (the default). shadow_match_scores is RLS
-- deny-all, and this function must NOT become a way around that: it is called
-- with the service role from the API route, which already has the caller's
-- authorisation checked. EXECUTE is granted to service_role only.
--
-- ENTRIES WITH NO SCORED MATCHES
-- Return no row at all rather than a zero row. The caller seeds every requested
-- entry with a zero summary first, so a missing row and an all-zero row mean the
-- same thing — and bracket_picker entries legitimately have no match_scores.

create or replace function public.entry_match_score_summary(
  p_entry_ids uuid[],
  p_source    text
)
returns table (
  entry_id        uuid,
  total_completed integer,
  exact_count     integer,
  correct_count   integer,
  streak          integer,
  form            text[]
)
language sql
stable
as $$
  with src as (
    select ms.entry_id, ms.match_number, ms.score_type, ms.total_points
    from match_scores ms
    where p_source = 'prod'
      and ms.entry_id = any(p_entry_ids)
    union all
    select sms.entry_id, sms.match_number, sms.score_type, sms.total_points
    from shadow_match_scores sms
    where p_source = 'shadow'
      and sms.entry_id = any(p_entry_ids)
  ),
  ranked as (
    -- rn = 1 is the most recent match for the entry.
    select src.*,
           row_number() over (partition by src.entry_id order by src.match_number desc) as rn
    from src
  ),
  recent_form as (
    -- Newest LAST, matching readRecentForm and the form indicator's render order.
    select r.entry_id, array_agg(r.score_type order by r.match_number) as form
    from ranked r
    where r.rn <= 5
    group by r.entry_id
  ),
  streaks as (
    -- Count back from the most recent match while points were scored. The
    -- running sum counts pointless matches, so rows still at 0 are exactly the
    -- unbroken leading run; an entry whose latest match scored nothing has no
    -- row here and coalesces to 0 below.
    select b.entry_id, count(*)::integer as streak
    from (
      select r.entry_id,
             sum(case when r.total_points > 0 then 0 else 1 end)
               over (partition by r.entry_id order by r.rn) as breaks
      from ranked r
    ) b
    where b.breaks = 0
    group by b.entry_id
  ),
  agg as (
    select src.entry_id,
           count(*)::integer                                          as total_completed,
           count(*) filter (where src.score_type = 'exact')::integer  as exact_count,
           count(*) filter (where src.score_type <> 'miss')::integer  as correct_count
    from src
    group by src.entry_id
  )
  select a.entry_id,
         a.total_completed,
         a.exact_count,
         a.correct_count,
         coalesce(s.streak, 0)::integer as streak,
         coalesce(f.form, array[]::text[]) as form
  from agg a
  left join recent_form f on f.entry_id = a.entry_id
  left join streaks     s on s.entry_id = a.entry_id;
$$;

comment on function public.entry_match_score_summary(uuid[], text) is
  'Per-entry scored-match aggregates (counts, streak, last-5 form) for the RN home screen. '
  'p_source is ''shadow'' or ''prod'' and must mirror lib/scoring/readSource.ts. '
  'Replaces shipping every scored row to the API to count it there.';

revoke all on function public.entry_match_score_summary(uuid[], text) from public;
revoke all on function public.entry_match_score_summary(uuid[], text) from anon, authenticated;
grant execute on function public.entry_match_score_summary(uuid[], text) to service_role;
