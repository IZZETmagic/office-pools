import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { OutcomePicker, type Outcome } from '@/components/pool-detail/OutcomePicker';
import { TapScoreField } from '@/components/pool-detail/TapScoreField';
import { Icon, Text } from '@/components/ui';
import { saveLeaguePicks, type LeaguePickBody } from '@/lib/api';
import { defaultWeek, fixturesForWeek, lastLockedWeek, stepWeek, weekState } from '@/lib/pickemWeek';
import {
  leaguePoolQueryKey,
  useLeaguePool,
  useLeaguePoolPicks,
  type LeagueMatch,
} from '@/lib/useLeaguePool';
import { useTheme, withOpacity } from '@/theme';

// =============================================================
// ONE MATCHWEEK'S PICKS — the picker, and the read-back
// =============================================================
// Ryan, 2026-09-03: *"For the exact scores, this should look kind of similar to
// the World Cup one and operate the same with the tapping to increase the
// scores."* So the Scores control IS the World Cup's — `TapScoreField`, tap to
// increment, long-press to reset, the same haptics. Results depth gets
// `OutcomePicker` instead, because at that depth there is no scoreline.
//
// ## ⚠ ONE SCREEN AT TWO POINTS IN TIME, like the table picker
//
// Whether this edits or reads is decided by two facts, never by a route:
//
//   your entry + the week is OPEN   -> pick
//   anything else                   -> read
//
// A rival's picks are reachable only once their week has locked, which is the
// same rule the landing applies and the same one the server enforces. Your own
// locked week is readable too — the picks were always yours to see.
//
// ⚠ ITS OWN ROUTE, not a branch inside the predictions tab. A scrollable picker
// rendered in the pool's tab pager cannot get a height (`flex: 1` collapses to
// content) — `LeagueTableEntriesTab`'s header records the lesson and the
// survivor picker repeats it.
//
// ## ⚠⚠ A REFUSED WRITE IS SILENT AT THE DATABASE
//
// The matchweek lock is a silent-skip trigger: an upsert it refuses still
// returns success having written nothing. The route reads back and answers 409
// naming how many picks were refused, and this screen SHOWS that rather than
// leaving somebody looking at values the database does not hold. That is the
// whole reason there is no submit button to feel reassured by.
// =============================================================

export default function PickemPickScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id: poolId, entryId, mw, name } = useLocalSearchParams<{
    id: string;
    entryId: string;
    mw?: string;
    /**
     * Whose picks these are, carried from the landing.
     *
     * ⚠ It has to come over the route. The league contract's `you.entries` holds
     * only YOUR entries by design, so a rival's name is not on this screen to be
     * looked up — without this the header read "Their picks" over somebody's
     * actual picks, which is worse than useless in a pool of ten.
     */
    name?: string;
  }>();

  const league = useLeaguePool(poolId);
  const qc = useQueryClient();
  const now = Date.now();

  const season = league.data?.season;
  const depth = league.data?.pool.league_depth ?? null;
  // ⚠ `=== 'results'` and nothing else. A NULL depth is Scores, byte for byte
  // with the engine (066); the opposite polarity has shipped three times on web
  // and tells members they are playing a game they are not being scored at.
  const isResults = depth === 'results';

  const ownEntry = league.data?.you.entries.find((e) => e.entry_id === entryId) ?? null;
  const isOwn = ownEntry !== null;

  // ---- which week is on screen -------------------------------------------
  // ⚠ THE SWITCHER LIVES HERE, not on the predictions tab. Ryan moved it on
  // 2026-09-03: the tab answers "whose picks", this screen answers "which week",
  // and a control that spans both belongs to the one it actually governs.
  //
  // ⚠ It DEFAULTS rather than being told. The tab passes no `mw`, so the wizard
  // resolves the week itself and the two screens cannot drift — and a member who
  // left the app on matchweek 12 does not come back to it. `mw` is still
  // honoured when something deep-links a specific week.
  const matchweeks = useMemo(() => season?.matchweeks ?? [], [season]);

  /**
   * ⚠⚠ THE CEILING ON A RIVAL'S PICKS. Ryan, 2026-09-03: *"for other member
   * predictions, these should be readonly and only ever up to the most recent
   * lock date."* Past the last lock lies the week they can still change, and
   * showing that is the one thing this mode cannot survive.
   *
   * ⚠ It bounds BOTH the default and the forward arrow. Defaulting correctly
   * and leaving the arrow free would put the same week one tap away.
   */
  const ceiling = lastLockedWeek(matchweeks, now);

  // Your own opens on the ACTIVE week — the one you came to pick in. A rival's
  // opens on the last one that locked, because that is the newest of theirs that
  // exists to be seen.
  const fallback = isOwn
    ? defaultWeek(
        matchweeks,
        season?.openMatchweekNumber ?? null,
        season?.inPlayMatchweekNumber ?? null,
        now,
      )
    : ceiling;

  const [chosen, setChosen] = useState<number | null>(mw ? Number(mw) : null);
  const week = chosen ?? fallback;
  const matchweek = matchweeks.find((m) => m.number === week);
  const state = weekState(matchweek, season?.openMatchweekNumber ?? null, now);

  const canEdit = isOwn && state === 'open';

  const prevWeek = week === null ? null : stepWeek(matchweeks, week, -1);
  const rawNext = week === null ? null : stepWeek(matchweeks, week, 1);
  // ⚠ A rival's forward arrow stops at the last lock. Your own runs to the end
  // of the season — a future week of your own is empty, not secret.
  const nextWeek = !isOwn && rawNext !== null && ceiling !== null && rawNext > ceiling ? null : rawNext;

  // A rival's picks live behind the reveal gate, so they come from `/bulk` and
  // only for a locked week. Your own always come from the league contract.
  const picks = useLeaguePoolPicks(poolId, !isOwn && state === 'locked');

  const fixtures = useMemo(
    () => (week === null ? [] : fixturesForWeek(season?.matches ?? [], week)),
    [season, week],
  );

  // ---- the values on screen ------------------------------------------------
  // Seeded from the server and then owned locally, because a tap has to land
  // instantly and the save is a consequence rather than the event.
  const [scores, setScores] = useState<Record<string, { home: number | null; away: number | null }>>({});
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [seeded, setSeeded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (seeded || !league.data) return;
    if (isOwn && ownEntry) {
      const s: Record<string, { home: number | null; away: number | null }> = {};
      for (const p of ownEntry.predictions) {
        // ⚠ `match_id`. The contract renames the column — see `LeaguePrediction`.
        s[p.match_id] = { home: p.predicted_home_score, away: p.predicted_away_score };
      }
      setScores(s);
      setOutcomes({ ...ownEntry.outcomes });
    }
    setSeeded(true);
  }, [league.data, isOwn, ownEntry, seeded]);

  // A rival's revealed picks — read-only, so they are derived rather than held.
  const theirs = useMemo(() => {
    if (isOwn) return null;
    const s = new Map<string, { home: number | null; away: number | null }>();
    const o = new Map<string, Outcome>();
    for (const p of picks.data?.predictions ?? []) {
      if (p.entry_id === entryId) s.set(p.match_id, { home: p.predicted_home_score, away: p.predicted_away_score });
    }
    for (const x of picks.data?.outcomes ?? []) {
      if (x.entry_id === entryId) o.set(x.match_id, x.outcome);
    }
    return { scores: s, outcomes: o };
  }, [picks.data, entryId, isOwn]);

  // ---- saving --------------------------------------------------------------
  // ⚠ IN-FLIGHT COALESCING, NOT A DEBOUNCE. The table picker chose the same and
  // its header says why: a debounce loses the change that triggered it when the
  // app backgrounds mid-timer. Here every change is queued, one request is in
  // the air at a time, and whatever accumulated while it flew goes next.
  const pending = useRef<Map<string, LeaguePickBody>>(new Map());
  const inFlight = useRef(false);

  const save = useMutation({
    mutationFn: (predictions: LeaguePickBody[]) =>
      saveLeaguePicks(poolId, { entryId, predictions }),
    onSuccess: () => setError(null),
    onError: (e) => setError(e instanceof Error ? e.message : 'Your picks could not be saved.'),
  });

  const flush = useCallback(async () => {
    if (inFlight.current || pending.current.size === 0) return;
    inFlight.current = true;
    const batch = [...pending.current.values()];
    pending.current.clear();
    try {
      await save.mutateAsync(batch);
    } catch {
      /* surfaced through onError; the values stay on screen so nothing is lost */
    } finally {
      inFlight.current = false;
      if (pending.current.size > 0) void flush();
    }
  }, [save]);

  // ⚠ The contract is invalidated on the way OUT, not after every save. It is a
  // 165 kB payload; refetching it per tap would be the most expensive thing on
  // the screen, and the local values are already what the member is looking at.
  useEffect(() => {
    return () => {
      if (poolId) void qc.invalidateQueries({ queryKey: leaguePoolQueryKey(poolId) });
    };
  }, [poolId, qc]);

  const queue = useCallback(
    (body: LeaguePickBody) => {
      pending.current.set(body.matchId, body);
      void flush();
    },
    [flush],
  );

  function setScore(fixtureId: string, side: 'home' | 'away', value: number) {
    setScores((prev) => {
      const next = { ...prev, [fixtureId]: { ...(prev[fixtureId] ?? { home: null, away: null }), [side]: value } };
      const pair = next[fixtureId];
      // ⚠ Only sent once BOTH halves exist. A scoreline is one prediction, and
      // the route requires both numbers — queueing a half would 400 on every
      // first tap of every fixture.
      if (pair.home !== null && pair.away !== null) {
        queue({ matchId: fixtureId, homeScore: pair.home, awayScore: pair.away });
      }
      return next;
    });
  }

  function setOutcome(fixtureId: string, outcome: Outcome) {
    setOutcomes((prev) => ({ ...prev, [fixtureId]: outcome }));
    queue({ matchId: fixtureId, outcome });
  }

  const title = isOwn ? 'Your picks' : name?.trim() || 'Their picks';
  const loading = league.isPending || (!isOwn && picks.isPending);

  return (
    // `edges={[]}` plus an explicit paddingTop — the top inset does not apply
    // inside a fullScreenModal and the header drew under the status bar.
    <SafeAreaView edges={[]} style={{ flex: 1, backgroundColor: theme.colors.snow, paddingTop: insets.top }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          paddingHorizontal: theme.spacing.xl,
          paddingTop: theme.spacing.md,
          // Ryan, 2026-09-03: the title and the week bar were sitting on top of
          // each other. They are two different things — WHOSE picks, and WHICH
          // week — and the gap is what says so.
          paddingBottom: theme.spacing.lg,
        }}
      >
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Icon name="chevron.left" color="ink" size={17} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text variant="cardTitle" numberOfLines={1}>
            {title}
          </Text>
          <Text variant="detail" color="slate">
            {canEdit ? 'Tap to pick' : state === 'locked' ? 'Locked' : 'Not open yet'}
          </Text>
        </View>
        {save.isPending ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
      </View>

      {week !== null ? (
        <WeekBar
          week={week}
          state={state}
          lockAt={matchweek?.lock_at ?? null}
          onPrev={() => prevWeek !== null && setChosen(prevWeek)}
          onNext={() => nextWeek !== null && setChosen(nextWeek)}
          hasPrev={prevWeek !== null}
          hasNext={nextWeek !== null}
        />
      ) : null}

      {error ? <SaveError message={error} /> : null}

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : fixtures.length === 0 ? (
        <Empty message="This matchweek has no fixtures." />
      ) : !isOwn && state !== 'locked' ? (
        /* Defence in depth. The landing does not offer this card before the
           lock, and the server would return nothing anyway — but a route can be
           reached directly and must not imply the picks are simply missing. */
        <Empty message="These picks are hidden until the matchweek locks." />
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: theme.spacing.lg,
            paddingBottom: insets.bottom + theme.spacing.hero,
            gap: theme.spacing.sm,
          }}
        >
          {fixtures.map((f) => (
            <FixtureRow
              key={f.match_id}
              fixture={f}
              isResults={isResults}
              canEdit={canEdit}
              score={
                isOwn
                  ? scores[f.match_id] ?? { home: null, away: null }
                  : theirs?.scores.get(f.match_id) ?? { home: null, away: null }
              }
              outcome={isOwn ? outcomes[f.match_id] ?? null : theirs?.outcomes.get(f.match_id) ?? null}
              onScore={(side, v) => setScore(f.match_id, side, v)}
              onOutcome={(o) => setOutcome(f.match_id, o)}
            />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

/**
 * ⚠ Shown, never swallowed. A 409 here means the database refused some or all
 * of the batch because the week locked — the values are still on screen and are
 * NOT what is stored, which is precisely the state a member must not be left in
 * unknowingly.
 */
function SaveError({ message }: { message: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        marginHorizontal: theme.spacing.lg,
        marginBottom: theme.spacing.sm,
        padding: theme.spacing.md,
        borderRadius: theme.radii.md,
        backgroundColor: withOpacity(theme.colors.red, 0.1),
        flexDirection: 'row',
        gap: 8,
        alignItems: 'flex-start',
      }}
    >
      <Icon name="exclamationmark.triangle.fill" color="red" size={13} />
      <Text variant="detail" style={{ flex: 1, color: theme.colors.red }}>
        {message}
      </Text>
    </View>
  );
}

/**
 * ‹ Matchweek 3 › — the season, browsed from inside the wizard.
 *
 * ⚠ The chip states what the WEEK is, not what you have done in it. "Picks
 * close Fri 7:00 pm" is a fact about the pool; a progress count belongs on the
 * predictions tab, where it is about one entry.
 */
function WeekBar({
  week,
  state,
  lockAt,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: {
  week: number;
  state: 'open' | 'locked' | 'future';
  lockAt: string | null;
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}) {
  const theme = useTheme();
  const tone = state === 'open' ? theme.colors.green : theme.colors.slate;
  const label =
    state === 'open'
      ? lockAt
        ? `Closes ${shortWhen(lockAt)}`
        : 'Open'
      : state === 'locked'
        ? 'Locked'
        : 'Not open yet';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.lg,
        paddingBottom: theme.spacing.lg,
      }}
    >
      <WeekArrow icon="chevron.left" onPress={onPrev} enabled={hasPrev} />
      <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
        <Text variant="cardTitle">Matchweek {week}</Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: 9,
            paddingVertical: 3,
            borderRadius: theme.radii.pill,
            backgroundColor: withOpacity(tone, 0.12),
          }}
        >
          <Icon
            name={(state === 'open' ? 'lock.open' : state === 'locked' ? 'lock' : 'clock') as never}
            color={state === 'open' ? 'green' : 'slate'}
            size={9}
          />
          <Text variant="detail" style={{ color: tone }}>
            {label}
          </Text>
        </View>
      </View>
      <WeekArrow icon="chevron.right" onPress={onNext} enabled={hasNext} />
    </View>
  );
}

function WeekArrow({ icon, onPress, enabled }: { icon: string; onPress: () => void; enabled: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surface,
        opacity: !enabled ? 0.3 : pressed ? 0.7 : 1,
        ...theme.shadows.card,
      })}
    >
      <Icon name={icon as never} color="slate" size={13} />
    </Pressable>
  );
}

/** A short, device-local "when" — the same shape the predictions tab uses. */
function shortWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

function Empty({ message }: { message: string }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.xl }}>
      <Text variant="body" color="slate" align="center">
        {message}
      </Text>
    </View>
  );
}

function FixtureRow({
  fixture,
  isResults,
  canEdit,
  score,
  outcome,
  onScore,
  onOutcome,
}: {
  fixture: LeagueMatch;
  isResults: boolean;
  canEdit: boolean;
  score: { home: number | null; away: number | null };
  outcome: Outcome | null;
  onScore: (side: 'home' | 'away', value: number) => void;
  onOutcome: (o: Outcome) => void;
}) {
  const theme = useTheme();
  // ⚠ Club name is `country_name` and the crest is `flag_url` — the positional
  // mapping `fixtureToMatch` applies so league fixtures can be drawn by
  // components written for national teams. Reaching for `name` yields undefined
  // and renders a blank, not an error.
  const home = fixture.home_team;
  const away = fixture.away_team;

  return (
    <View
      style={{
        padding: theme.spacing.md,
        borderRadius: theme.radii.lg,
        backgroundColor: theme.colors.surface,
        gap: theme.spacing.sm,
        ...theme.shadows.card,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="detail" color="slate">
          {kickoff(fixture)}
        </Text>
        {fixture.is_completed ? (
          <Text variant="detail" color="slate">
            FT {fixture.home_score_ft}–{fixture.away_score_ft}
          </Text>
        ) : null}
      </View>

      {/*
        ⚠ TWO LAYOUTS, AND RESULTS DOES NOT DRAW THE CLUBS TWICE. At Scores the
        clubs label two steppers, so they are their own row. At Results the
        clubs ARE the buttons — rendering a name row above them would print
        every fixture twice and push the control off the card.
      */}
      {isResults ? (
        <OutcomePicker
          value={outcome}
          onChange={onOutcome}
          home={{
            name: home?.country_name ?? 'Home',
            abbr: home?.country_code ?? null,
            crestUrl: home?.flag_url ?? null,
          }}
          away={{
            name: away?.country_name ?? 'Away',
            abbr: away?.country_code ?? null,
            crestUrl: away?.flag_url ?? null,
          }}
          disabled={!canEdit}
        />
      ) : (
        /*
          ⚠ NAMES OUTBOARD, CRESTS INBOARD — the order Ryan specified, and it
          reads better than the mirror: each crest sits against the number it
          belongs to, so which box is whose needs no working out.
          `name · crest · [ ] · [ ] · crest · name`

          The budget, measured at 375pt: 319 after screen and card padding, less
          80 for the two score fields, 52 for the crests, 26 of gaps and the
          dash itself leaves ~76 a name.

          ⚠ THAT IS MARGINAL, and it is handled rather than hoped. "Bournemouth"
          is the longest club name across the three live seasons that CANNOT
          wrap — one word, 11 characters — and it wants 72-79 at this size. So
          the name is allowed to SHRINK a little rather than truncate; see
          `Club`. Everything longer ("Crystal Palace", "Nott'm Forest") is more
          than one word and breaks across two lines instead.
        */
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Club team={home} side="home" />
          <TapScoreField
            value={score.home}
            onChange={(v) => onScore('home', v)}
            disabled={!canEdit}
            width={40}
          />
          {/* ⚠ Back by request. It reads as a scoreline rather than as two
              unrelated boxes — the thing the crests either side do not quite
              say on their own. Its cost is real (about 7pt plus a gap) and is
              paid for out of the score fields, not out of the names. */}
          <Text variant="detail" color="slate">
            –
          </Text>
          <TapScoreField
            value={score.away}
            onChange={(v) => onScore('away', v)}
            disabled={!canEdit}
            width={40}
          />
          <Club team={away} side="away" />
        </View>
      )}
    </View>
  );
}

/**
 * A club beside its score box: the name on the outside, the crest against the
 * number.
 *
 * ⚠ THE SHORT NAME, not the full one and not the three-letter code. Ryan,
 * 2026-09-03: *"it doesn't have to be the three-letter acronym — it could be
 * Man United, Man City."* Those forms are exactly what `shortClubName` already
 * produces, and the contract carries them in `short_name`; the code is right
 * for the Results control, where three buttons share a row, and wrong here.
 *
 * ⚠ `country_name` is the FULL name and the fallback — the World Cup field
 * names again (`lib/league/read.ts`). Every fixture in the three live seasons
 * carries a `short_name`, so the fallback should never fire.
 *
 * ⚠ TWO LINES ALLOWED. "Crystal Palace" and "Nott'm Forest" do not fit a
 * ~81pt column on one line at this size, and truncating them is the failure
 * the Results control avoids by using a code. Here there is room to wrap, so
 * they wrap; only a single long word can still truncate, and the longest that
 * exists is "Bournemouth", which fits.
 */
function Club({ team, side }: { team: LeagueMatch['home_team']; side: 'home' | 'away' }) {
  const theme = useTheme();
  const label = team?.short_name?.trim() || team?.country_name || 'TBD';
  return (
    <View
      style={{
        flex: 1,
        // Home reads name-then-crest, away crest-then-name.
        flexDirection: side === 'home' ? 'row-reverse' : 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 6,
      }}
    >
      {team?.flag_url ? (
        <Image source={{ uri: team.flag_url }} style={{ width: 26, height: 26 }} resizeMode="contain" />
      ) : null}
      {/*
        ⚠ SHRINKS BEFORE IT TRUNCATES. With the dash restored a name gets ~76pt
        and "Bournemouth" wants 72-79 — a coin toss on the real font. An
        ellipsis is a failure a member has to decode ("Bournemou…"); 12pt
        instead of 13 on one row of one card is not. `minimumFontScale` floors
        it at 0.85 so nothing can shrink into illegibility, and the two-line
        allowance still does the work for every multi-word name.
      */}
      <Text
        variant="body"
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        style={{
          flexShrink: 1,
          fontSize: 13,
          lineHeight: 16,
          color: theme.colors.ink,
          textAlign: side === 'home' ? 'right' : 'left',
        }}
      >
        {label}
      </Text>
    </View>
  );
}

function kickoff(f: LeagueMatch): string {
  // ⚠ `status_detail` and `original_match_date` are what mark a postponement.
  // A moved game showing its old kickoff as though it were on is a bug both
  // surfaces have shipped before.
  if (f.original_match_date && f.status_detail) return f.status_detail;
  if (!f.match_date) return 'Date TBC';
  const d = new Date(f.match_date);
  if (Number.isNaN(d.getTime())) return 'Date TBC';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}
