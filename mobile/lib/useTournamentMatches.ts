import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { apiFetch } from './api';
import { applyFixturesUpdate, type FixturesUpdateMessage } from './fixturesBroadcast';
import { useHomeData } from './HomeDataProvider';
import { leaseBroadcast } from './realtimeLease';
import { supabase } from './supabase';

// Mirrors iOS `ResultsViewModel` + `Match` shape. Selects every field the
// Results list and Match Detail screens need so a single fetch powers both.
export type ResultsMatch = {
  matchId: string;
  matchNumber: number;
  stage: string;
  groupLetter: string | null;
  matchDate: string;
  status: string;
  statusDetail: string | null;
  originalMatchDate: string | null;
  venue: string | null;
  homeTeamId: string | null;
  awayTeamId: string | null;
  homeScoreFt: number | null;
  awayScoreFt: number | null;
  homeScorePso: number | null;
  awayScorePso: number | null;
  liveMinute: number | null;
  livePeriod: string | null;
  liveAdded: number | null;
  homeTeamPlaceholder: string | null;
  awayTeamPlaceholder: string | null;
  homeTeam: ResultsTeam | null;
  awayTeam: ResultsTeam | null;
  /**
   * The MATCHWEEK, for a league fixture. Null for every World Cup match, which
   * groups by `stage` instead.
   *
   * ⚠ IT IS NOT OPTIONAL DECORATION. The league adapter stamps
   * `stage = 'regular_season'` — a value `matches_stage_check` does not even
   * admit — and puts the real grouping here. A screen that reaches for `stage`
   * to name a section prints a database enum at a member, which is exactly what
   * `regular_season · #1` did on the web before it was fixed.
   */
  roundNumber: number | null;
  /**
   * The competition's display name, e.g. "Premier League". Null for the World
   * Cup, where there is only one thing being played.
   *
   * A member can be in a Premier League pool and a La Liga pool at once, and two
   * crests with no caption cannot say which competition a game belongs to.
   */
  competition: string | null;
  /**
   * The same competition as an id — `tournaments.external_league_id`, the
   * api-football league id.
   *
   * ⚠ THE NAME IS THE CAPTION; THIS IS THE KEY. Colour, mark and crest are all
   * `Record<number, …>` on this id, on the phone and the web alike, so a header
   * that wants a competition's brand reads THIS and never maps the display
   * string back to one. Null for every World Cup match, which has no league id.
   */
  competitionId: number | null;
};

export type ResultsTeam = {
  countryName: string;
  countryCode: string | null;
  flagUrl: string | null;
  /**
   * A shorter label for a narrow row, or null when there is no better form.
   *
   * ⚠ NULL FOR EVERY WORLD CUP TEAM, and that is correct — `MATCH_SELECT`
   * below does not ask for it, because a country has no club-style short form.
   * Only `/api/users/:id/fixtures` sends it, computed by the web's own
   * `shortClubName` so the phone and the browser cannot end up calling Forest
   * two different things. A consumer must fall back, never assume.
   */
  shortName: string | null;
};

const MATCH_SELECT = `
  match_id, match_number, stage, group_letter, match_date, status, status_detail, original_match_date, venue,
  home_team_id, away_team_id,
  home_score_ft, away_score_ft, home_score_pso, away_score_pso, live_minute, live_period, live_added,
  home_team_placeholder, away_team_placeholder,
  home_team:teams!matches_home_team_id_fkey(country_name, country_code, flag_url),
  away_team:teams!matches_away_team_id_fkey(country_name, country_code, flag_url)
`;

const STALE_AFTER_MS = 30_000;

/** The shape of `GET /api/users/:user_id/fixtures`. */
/**
 * One league table, as the competition has it.
 *
 * ⚠ EVERY FIELD IS ALREADY RESOLVED. The route orders the rows (clubs the feed
 * leaves genuinely level go alphabetically, matching the official app), keeps
 * each place's `rank` and band ON THE PLACE rather than letting them ride along
 * with a club that moved, and classifies `band` with the phrases migration 113
 * scores against. `league_standings` is world-readable so the phone COULD read
 * it directly — and would then order the same season differently from the web.
 */
export type LeagueStandingRow = {
  club_id: string;
  club_name: string;
  /** Shortened for a narrow column — "Man City", not "Manchester City". */
  short_name: string;
  crest_url: string | null;
  rank: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  goals_diff: number;
  points: number;
  /** Last five as the feed writes it, e.g. "WWDLW". Null before any football. */
  form: string | null;
  movement: 'up' | 'down' | 'same' | null;
  band: 'champions' | 'europa' | 'conference' | 'relegation' | null;
};

/** A competition the member actually has football in, with its table. */
export type LeagueSeasonTable = {
  season_id: string;
  competition: string | null;
  competition_id: number | null;
  standings: LeagueStandingRow[];
  standings_fetched_at: string | null;
};

type LeagueFixturesResponse = {
  seasons: Array<{
    season_id: string;
    competition: string | null;
    /** `league_seasons.external_league_id` — the api-football league id. */
    competition_id: number | null;
    /**
     * One of the member's pools on this season — the `pool:{id}:leaderboard`
     * topic to listen on for live score, status and minute.
     *
     * ⚠ OPTIONAL, and for the reason `standings` below is: react-query serves
     * the previously cached response until the next fetch, so on the build
     * where this ships the first render reads a season object with no
     * `pool_id` key at all. A missing one means no subscription for that
     * season, which is exactly the behaviour that shipped before it existed.
     */
    pool_id?: string | null;
    /** Already in the World Cup match shape — the route does the mapping. */
    matches: Record<string, unknown>[];
    /** Optional: absent from a response cached before this field existed. */
    standings?: LeagueStandingRow[];
    standings_fetched_at?: string | null;
  }>;
};

function normalizeTeam(raw: unknown): ResultsTeam | null {
  if (!raw) return null;
  const t = Array.isArray(raw) ? raw[0] : raw;
  if (!t) return null;
  const obj = t as {
    country_name?: string;
    country_code?: string | null;
    flag_url?: string | null;
    short_name?: string | null;
  };
  return {
    countryName: obj.country_name ?? '',
    countryCode: obj.country_code ?? null,
    flagUrl: obj.flag_url ?? null,
    shortName: obj.short_name ?? null,
  };
}

function normalizeMatch(row: Record<string, unknown>): ResultsMatch {
  return {
    matchId: (row.match_id as string) ?? '',
    matchNumber: (row.match_number as number) ?? 0,
    stage: (row.stage as string) ?? '',
    groupLetter: (row.group_letter as string | null) ?? null,
    matchDate: (row.match_date as string) ?? '',
    status: (row.status as string) ?? 'scheduled',
    statusDetail: (row.status_detail as string | null) ?? null,
    originalMatchDate: (row.original_match_date as string | null) ?? null,
    venue: (row.venue as string | null) ?? null,
    homeTeamId: (row.home_team_id as string | null) ?? null,
    awayTeamId: (row.away_team_id as string | null) ?? null,
    homeScoreFt: (row.home_score_ft as number | null) ?? null,
    awayScoreFt: (row.away_score_ft as number | null) ?? null,
    homeScorePso: (row.home_score_pso as number | null) ?? null,
    awayScorePso: (row.away_score_pso as number | null) ?? null,
    liveMinute: (row.live_minute as number | null) ?? null,
    livePeriod: (row.live_period as string | null) ?? null,
    liveAdded: (row.live_added as number | null) ?? null,
    homeTeamPlaceholder: (row.home_team_placeholder as string | null) ?? null,
    awayTeamPlaceholder: (row.away_team_placeholder as string | null) ?? null,
    homeTeam: normalizeTeam(row.home_team),
    awayTeam: normalizeTeam(row.away_team),
    // Absent from MATCH_SELECT, so this is null for every World Cup row — which
    // is correct: the World Cup groups by stage. The league route sends it.
    roundNumber: (row.round_number as number | null) ?? null,
    // Not per-row fields on either source. The league route carries both once
    // per season and `leagueMatches` below stamps them on.
    competition: null,
    competitionId: null,
  };
}

/**
 * Internal hook — fetches every match for every tournament the user has a
 * pool in, plus a realtime subscription that surgically updates rows on
 * `matches` UPDATE events (no full refetch). Mirrors iOS `ResultsViewModel`.
 *
 * Tournament IDs come from `HomeDataProvider`'s cached pools, so this hook
 * doesn't re-query memberships — it just fans out one query per tournament.
 *
 * ⚠ IT RETURNS TWO COMPETITIONS' WORTH OF MATCHES, from two sources. World Cup
 * matches come from the `matches` table below; league fixtures are NOT in that
 * table and never will be, so they come from `/api/users/:id/fixtures` and are
 * merged into the same array. Every consumer sees one list.
 *
 * IMPORTANT: don't call this directly from screens. Use `useTournamentMatches`
 * from `TournamentMatchesProvider` instead — it shares one fetch across the
 * whole app and lets the splash gate wait on the load so the Results tab
 * doesn't flash a loading spinner on first visit.
 */
export function useTournamentMatchesInternal() {
  const { data: homeData } = useHomeData();
  // The route resolves the member's seasons server-side from this id; the phone
  // never sends a pool list. `useHomeData` does not select `league_season_id`,
  // so it could not send an honest one anyway.
  const appUserId = homeData?.appUserId ?? null;
  const tournamentIds = useMemo(() => {
    const set = new Set<string>();
    for (const pool of homeData?.pools ?? []) {
      if (pool.tournamentId) set.add(pool.tournamentId);
    }
    return Array.from(set);
  }, [homeData?.pools]);

  const [matches, setMatches] = useState<ResultsMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastLoadedAtRef = useRef(0);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (tournamentIds.length === 0) {
        setMatches([]);
        setLoading(false);
        return;
      }
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const { data, error: err } = await supabase
          .from('matches')
          .select(MATCH_SELECT)
          .in('tournament_id', tournamentIds);
        if (err) throw err;
        setMatches(((data ?? []) as Record<string, unknown>[]).map(normalizeMatch));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load matches');
        console.warn('[useTournamentMatches]', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
        lastLoadedAtRef.current = Date.now();
      }
    },
    [tournamentIds],
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  // Realtime subscription — surgical UPDATE only, no full refetch.
  useEffect(() => {
    if (tournamentIds.length === 0) return;
    const channel = supabase
      .channel('results-match-updates')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'matches' },
        (payload) => {
          const newRow = payload.new as Record<string, unknown> | null;
          if (!newRow?.match_id) return;
          const updated = normalizeMatch(newRow);
          setMatches((prev) => {
            const idx = prev.findIndex((m) => m.matchId === updated.matchId);
            if (idx === -1) return prev;
            // Preserve joined team info — realtime payload doesn't include
            // the foreign-key join data.
            const existing = prev[idx];
            const merged: ResultsMatch = {
              ...updated,
              homeTeam: existing.homeTeam,
              awayTeam: existing.awayTeam,
            };
            const next = prev.slice();
            next[idx] = merged;
            return next;
          });
        },
      )
      .subscribe();
    return () => {
      void channel.unsubscribe();
    };
  }, [tournamentIds]);

  // =============================================================
  // THE LEAGUE HALF — the same list, a second source
  // =============================================================
  // League fixtures are not in `matches` and never will be: nothing on the
  // league path writes a row there. They come from
  // `GET /api/users/:id/fixtures`, which shapes them with the SAME adapter the
  // web pool view uses, so what arrives here needs no mapping mobile could get
  // wrong — see the route's own header for why that matters.
  //
  // ⚠ NO `refetchInterval`, and this is not an oversight. The payload is a
  // SEASON. Live score and minute reach an open screen on the
  // `pool:{id}:leaderboard` broadcast; polling a season for them would be the
  // most expensive line in the app. React Query's 30 s staleTime plus the
  // AppState focus wiring is what keeps this list current, and a results list
  // is allowed to be a focus behind — a pool leaderboard is not.
  //
  // ⚠ THAT SENTENCE WAS ASPIRATIONAL UNTIL 2026-09-03. Nothing on the phone
  // subscribed to the broadcast, so "it's pushed, don't poll" described a push
  // with no listener: a fixture that kicked off while the app was open never
  // went live on any screen. The subscription below is what makes the comment
  // true. Do not add an interval — fix the ear, not the clock.
  const leagueQueryKey = useMemo(() => ['league-fixtures', appUserId] as const, [appUserId]);
  const leagueQuery = useQuery({
    queryKey: leagueQueryKey,
    enabled: !!appUserId,
    queryFn: () => apiFetch<LeagueFixturesResponse>(`/api/users/${appUserId}/fixtures`),
  });

  // =============================================================
  // THE LIVE HALF — migration 125's `fixtures_update`, at last heard
  // =============================================================
  // The World Cup has had this since it shipped: a match going live writes a
  // `matches` row and the `postgres_changes` channel above pushes it to every
  // open screen with no fetch. A league fixture is not in `matches`, so the
  // league needs its own ear — and the message it needs is already being sent,
  // every sync tick, to `pool:{id}:leaderboard`.
  //
  // ⚠ ONE CHANNEL PER SEASON, NOT PER POOL. Every pool playing a season gets
  // the identical message, so a member with twelve league pools across five
  // seasons needs five sockets, not twelve. The route picks the pool — see
  // `poolBySeason` there for why it has to, and why a stable choice matters.
  const queryClient = useQueryClient();
  // ⚠ A STRING FIRST, THEN THE LIST. `leagueQuery.data` is a NEW object on
  // every refetch and on every message this very subscription applies, so
  // depending on it directly would tear down and rebuild all five channels
  // each time a minute ticked — dropping whatever arrived mid-rebuild, and
  // producing a live card that flickered instead of one that updated.
  const seasonTopicsKey = useMemo(
    () =>
      (leagueQuery.data?.seasons ?? [])
        .filter((s) => s.pool_id)
        .map((s) => `${s.season_id}:${s.pool_id}`)
        .sort()
        .join(','),
    [leagueQuery.data],
  );
  const seasonTopics = useMemo(
    () =>
      seasonTopicsKey
        .split(',')
        .filter(Boolean)
        .map((pair) => {
          const [seasonId, poolId] = pair.split(':');
          return { seasonId, poolId };
        }),
    [seasonTopicsKey],
  );

  // ⚠ LEASED, NOT SUBSCRIBED DIRECTLY, AND THAT IS LOAD-BEARING. This feed
  // lives at the root for the whole session while a pool screen — which holds
  // the SAME topic — comes and goes underneath it. `supabase.channel(topic)`
  // returns one shared object, so `usePoolEntries` unmounting would otherwise
  // have killed Home's live cards until the app was restarted. See
  // `realtimeLease.ts`, which is where that was measured.
  useEffect(() => {
    if (!appUserId || seasonTopics.length === 0) return;

    const releases = seasonTopics.map(({ seasonId, poolId }) =>
      leaseBroadcast(`pool:${poolId}:leaderboard`, 'fixtures_update', (msg) => {
        const payload = msg.payload as FixturesUpdateMessage | undefined;
        if (!payload || payload.season_id !== seasonId) return;
        // ⚠ APPLIED, NOT A DOORBELL. The payload carries every value the card
        // renders, so refetching a 300 kB season to learn a minute we were
        // just handed is the pattern migration 060's comment exists to mock:
        // "it was a doorbell, and then everyone fetched over HTTP anyway".
        // `applyFixturesUpdate` returns the same object when nothing moved, so
        // a repeat costs no render.
        queryClient.setQueryData<LeagueFixturesResponse>(leagueQueryKey, (prev) =>
          applyFixturesUpdate(prev, payload),
        );
      }),
    );

    return () => {
      for (const release of releases) release();
    };
  }, [appUserId, seasonTopics, queryClient, leagueQueryKey]);

  const leagueMatches = useMemo(() => {
    const out: ResultsMatch[] = [];
    for (const season of leagueQuery.data?.seasons ?? []) {
      for (const row of season.matches) {
        // The competition is a fact about the season, sent once rather than
        // repeated on 380 rows. Stamped on here so every consumer downstream
        // reads it off the match like any other field.
        out.push({
          ...normalizeMatch(row),
          competition: season.competition,
          competitionId: season.competition_id ?? null,
        });
      }
    }
    return out;
  }, [leagueQuery.data]);

  const allMatches = useMemo(
    () => (leagueMatches.length === 0 ? matches : [...matches, ...leagueMatches]),
    [matches, leagueMatches],
  );

  /**
   * The member's competitions and their tables — same query, no second fetch.
   *
   * ⚠ Seasons with NO table are dropped. A season carries an empty `standings`
   * until its first matches are played, and a competition pill leading to an
   * empty screen is worse than no pill: the Results screen's existing rule is
   * that a control is only offered when it has something to offer.
   */
  const leagueTables = useMemo<LeagueSeasonTable[]>(
    () =>
      (leagueQuery.data?.seasons ?? [])
        // ⚠ `?? []`, AND IT IS NOT DEFENSIVE PROGRAMMING FOR ITS OWN SAKE.
        // `standings` is a NEW field on this route, and react-query serves the
        // previously cached response until the next fetch — so on the build
        // where this ships, the first render reads a season object that has no
        // `standings` key at all and `.length` throws. The same applies to any
        // client running an older bundle against a newer server, or the reverse.
        .filter((s) => (s.standings ?? []).length > 0)
        .map((s) => ({
          season_id: s.season_id,
          competition: s.competition,
          competition_id: s.competition_id ?? null,
          standings: s.standings ?? [],
          standings_fetched_at: s.standings_fetched_at ?? null,
        })),
    [leagueQuery.data],
  );

  // ⚠ `refetch` ALONE IN THE DEPS, NOT `leagueQuery`. React Query returns a new
  // result object on every render, so depending on the whole thing would give
  // `refresh` a new identity each time — and these are handed to screens that
  // hold them in refs and effects. `refetch` is stable across renders.
  const refetchLeague = leagueQuery.refetch;

  const refresh = useCallback(async () => {
    await Promise.all([load('refresh'), refetchLeague()]);
  }, [load, refetchLeague]);

  const refreshIfStale = useCallback(() => {
    if (Date.now() - lastLoadedAtRef.current > STALE_AFTER_MS) {
      void load('refresh');
      void refetchLeague();
    }
  }, [load, refetchLeague]);

  return {
    matches: allMatches,
    // The tables, for Match Centre's Tables view. Empty for a World Cup-only
    // member, which is what hides the toggle rather than showing them a
    // control that leads nowhere.
    leagueTables,
    // ⚠ `loading` IS THE WORLD CUP READ ONLY, AND MUST STAY THAT WAY. The splash
    // gate in `app/_layout.tsx` waits on it, so folding the league round trip in
    // here would put a network call on the COLD-START path — the thing the
    // mobile perf work is trying to shorten. League loading is its own field,
    // and the Results screen decides what to do with it.
    loading,
    leagueLoading: !!appUserId && leagueQuery.isPending,
    refreshing,
    // ⚠ The league error is surfaced, not swallowed. Without it a failed fetch
    // leaves a league member on an empty list with no error and no explanation
    // — "No Matches" stated confidently, which is the whole defect this feature
    // exists to end.
    error,
    leagueError: leagueQuery.error ? (leagueQuery.error as Error).message : null,
    refresh,
    refreshIfStale,
  };
}
