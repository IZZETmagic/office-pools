import { Text as RNText, View } from 'react-native';

import { MONO_BOLD } from '@/components/match/matchDisplay';
import { Text } from '@/components/ui';
import type { CrowdSplit, FixturePlayersResponse, PlayerForm, SideScout } from '@/lib/api';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// The people — who is actually playing well
// =============================================================
// Migration 141 put forty players a fixture into the database at no extra
// provider cost, and until this card nothing read them.
//
// ## ⚠ TWO LISTS, BECAUSE THEY ANSWER DIFFERENT QUESTIONS
//
// IN FORM is an AVERAGE and is minutes-qualified — a substitute's 9.0 over
// eleven minutes would otherwise top it every week. DANGER is a TOTAL and is
// deliberately not qualified, because four goals in three starts is exactly who
// a card about danger should name. Showing them under one heading would make one
// of the two floors look arbitrary.
//
// ⚠ THE GOALS COLUMN COMES FROM THE TIMELINE, not from the player rows the
// ratings come from. The two disagree at source — 428 against 430 across 146
// fixtures — and only `match_events` is authoritative. Nothing here may add a
// goals figure from another source.
//
// ⚠ AND IT SAYS WHAT IT LOOKED AT. "Over the last ten fixtures" is the
// difference between a rating that means something and one that reads as
// all-time. Same call the head-to-head card makes with its span.
// =============================================================

export function PeopleCard({ players }: { players: FixturePlayersResponse }) {
  const { home, away, crowd } = players;
  const anyRated =
    home.scout.inForm.length > 0 ||
    away.scout.inForm.length > 0 ||
    home.scout.dangerMen.length > 0 ||
    away.scout.dangerMen.length > 0;

  return (
    <View style={{ gap: 16 }}>
      {crowd ? (
        <CrowdCard crowd={crowd} homeName={home.club.name} awayName={away.club.name} />
      ) : null}

      {/*
        ⚠ THE SIDE CARDS ARE SKIPPED ENTIRELY WHEN NEITHER CLUB HAS A RATED
        PLAYER, rather than each printing "nobody rated yet". In August that is
        both of them, and two identical apologies stacked under a crowd bar read
        as a broken screen. One club rated and the other not IS worth saying —
        that is a fact about the two squads — so the empty state lives on the
        card rather than here.
      */}
      {anyRated ? (
        <>
          <SideCard title={home.club.name} scout={home.scout} />
          <SideCard title={away.club.name} scout={away.scout} />
        </>
      ) : null}

      {anyRated ? (
      <View style={{ marginHorizontal: 20, gap: 2 }}>
        <Text variant="detail" color="slate">
          Form over each club&apos;s last ten completed fixtures
        </Text>
        {/* ⚠ THE FLOOR, STATED. A reader wondering why a name they expected is
            missing deserves the reason rather than having to guess at one. */}
        <Text variant="detail" color="slate">
          Ratings need 180 minutes played · goals from the match timeline
        </Text>
      </View>
      ) : null}
    </View>
  );
}

/**
 * How the whole platform called this fixture.
 *
 * ⚠⚠ THE SCOPE IS STATED ON THE CARD, NOT JUST IN THE CODE. A member seeing a
 * split beside a fixture will assume it is their pool unless told otherwise,
 * and their pool is exactly what it must never be — picks reveal per matchweek
 * and the Showdown draw is sealed. The line at the foot is load-bearing.
 */
function CrowdCard({
  crowd,
  homeName,
  awayName,
}: {
  crowd: CrowdSplit;
  homeName: string;
  awayName: string;
}) {
  const theme = useTheme();

  // ⚠ THE SERVER SENDS COUNTS AND THE DIVISION HAPPENS ONCE, HERE. Rounding
  // three shares independently lets them total 99 or 101 and leaves a gap in
  // the bar; the flex values below are the raw counts, so the bar is exact
  // whatever the labels round to.
  const total = Math.max(1, crowd.picks);
  const asPct = (n: number) => Math.round((n / total) * 100);

  return (
    <View
      style={{
        marginHorizontal: 20,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        ...theme.shadows.card,
        overflow: 'hidden',
      }}
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
        <Text variant="cardTitle">How SportPool called it</Text>
      </View>

      <View style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
        <View style={{ flexDirection: 'row', height: 26, borderRadius: theme.radii.xs, overflow: 'hidden' }}>
          <Bar flex={crowd.home} color={theme.colors.primary} label={`${asPct(crowd.home)}%`} />
          <Bar flex={crowd.draw} color={theme.colors.silver} label={`${asPct(crowd.draw)}%`} />
          <Bar flex={crowd.away} color={theme.colors.accent} label={`${asPct(crowd.away)}%`} />
        </View>

        <View style={{ flexDirection: 'row', marginTop: 10, gap: 16 }}>
          <Key color={theme.colors.primary} label={homeName} />
          <Key color={theme.colors.silver} label="Draw" />
          <Key color={theme.colors.accent} label={awayName} />
        </View>

        <Text variant="detail" color="slate" style={{ marginTop: 12 }}>
          {crowd.picks} picks across every pool on SportPool — never your own pool,
          and only from matchweeks that have already locked.
        </Text>
      </View>
    </View>
  );
}

function Bar({ flex, color, label }: { flex: number; color: string; label: string }) {
  // ⚠ A ZERO-WIDTH SEGMENT MUST NOT RENDER ITS LABEL. `flex: 0` collapses the
  // view but the text inside would still try to lay out and can escape it.
  if (flex <= 0) return null;
  return (
    <View style={{ flex, alignItems: 'center', justifyContent: 'center', backgroundColor: color }}>
      <RNText style={{ fontFamily: MONO_BOLD, fontSize: 11, color: '#0B0F1A' }}>{label}</RNText>
    </View>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
      <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: color }} />
      <Text variant="detail" color="slate" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function SideCard({ title, scout }: { title: string; scout: SideScout }) {
  const theme = useTheme();

  // ⚠ A SIDE WITH NOTHING TO SAY SAYS SO RATHER THAN RENDERING AN EMPTY CARD —
  // normal in August, and a blank panel reads as a broken build where a sentence
  // reads as news. The same call `matchTabs` makes about a tab.
  const empty = scout.inForm.length === 0 && scout.dangerMen.length === 0;

  return (
    <View
      style={{
        marginHorizontal: 20,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        ...theme.shadows.card,
        overflow: 'hidden',
      }}
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
        <Text variant="cardTitle">{title}</Text>
      </View>

      {empty ? (
        <View style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
          <Text variant="body" color="slate">
            Not enough minutes played this season to rate anybody yet.
          </Text>
        </View>
      ) : (
        <>
          {scout.inForm.length > 0 ? (
            <Section label="In form">
              {scout.inForm.map((p, i) => (
                <PlayerRow key={p.externalPlayerId} player={p} first={i === 0} metric="rating" />
              ))}
            </Section>
          ) : null}

          {scout.dangerMen.length > 0 ? (
            <Section label="Danger">
              {scout.dangerMen.map((p, i) => (
                <PlayerRow key={p.externalPlayerId} player={p} first={i === 0} metric="threat" />
              ))}
            </Section>
          ) : null}
        </>
      )}
    </View>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ paddingBottom: 6 }}>
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: 4,
          borderTopWidth: 0.5,
          borderTopColor: withOpacity(theme.colors.mist, 0.6),
        }}
      >
        <Text variant="caption" color="slate">
          {label}
        </Text>
      </View>
      {children}
    </View>
  );
}

function PlayerRow({
  player,
  first,
  metric,
}: {
  player: PlayerForm;
  first: boolean;
  metric: 'rating' | 'threat';
}) {
  const theme = useTheme();
  const involvements = player.goals + player.assists;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 9,
      }}
    >
      <View style={{ flex: 1 }}>
        <RNText
          numberOfLines={1}
          style={{ fontFamily: fontFamilies.semibold, fontSize: 13, color: theme.colors.ink }}
        >
          {player.name}
        </RNText>
        <Text variant="detail" color="slate">
          {player.position ? `${positionName(player.position)} · ` : ''}
          {player.appearances} app{player.appearances === 1 ? '' : 's'}
          {metric === 'rating'
            ? ` · ${player.minutes} min`
            : involvementDetail(player)}
        </Text>
      </View>

      <View
        style={{
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: theme.radii.xs,
          backgroundColor: withOpacity(
            metric === 'rating' ? theme.colors.green : theme.colors.accent,
            first ? 0.18 : 0.1,
          ),
        }}
      >
        <RNText
          style={{
            fontFamily: MONO_BOLD,
            fontSize: 13,
            color: metric === 'rating' ? theme.colors.green : theme.colors.accent,
            fontVariant: ['tabular-nums'],
          }}
        >
          {metric === 'rating' ? player.rating.toFixed(2) : `${involvements}`}
        </RNText>
      </View>
    </View>
  );
}

/**
 * "3 goals, 1 assist" — spelled out rather than shown as "3+1".
 *
 * ⚠ A MEMBER READING "4" NEXT TO A NAME NEEDS TO KNOW WHAT KIND OF FOUR IT IS.
 * Goals and assists are not interchangeable to anybody choosing a scoreline,
 * and the shorthand hides which one this player actually does.
 */
function involvementDetail(p: PlayerForm): string {
  const parts: string[] = []
  if (p.goals > 0) parts.push(`${p.goals} goal${p.goals === 1 ? '' : 's'}`)
  if (p.assists > 0) parts.push(`${p.assists} assist${p.assists === 1 ? '' : 's'}`)
  return parts.length > 0 ? ` · ${parts.join(', ')}` : ''
}

function positionName(p: 'G' | 'D' | 'M' | 'F'): string {
  return p === 'G' ? 'GK' : p === 'D' ? 'DEF' : p === 'M' ? 'MID' : 'FWD';
}
