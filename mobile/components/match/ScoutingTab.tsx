import { Text as RNText, View } from 'react-native';

import { MONO_BOLD } from '@/components/match/matchDisplay';
import { Text } from '@/components/ui';
import type { H2HSummary } from '@/lib/api';
import type { ResultsMatch } from '@/lib/useTournamentMatches';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// The scout report — what usually happens when these two play
// =============================================================
// Every previous competitive meeting, reduced to the handful of figures worth
// reading before a prediction. Built entirely from `/fixtures/headtohead`: one
// provider call per club pairing, cached for a day.
//
// ⚠ EVERY NUMBER IS FROM THE HOME CLUB'S POINT OF VIEW, wherever the meeting
// was played — the two clubs swap ends between fixtures, so "wins" means this
// club's wins home and away, not the wins of whoever happened to be at home.
// The server does that; see `lib/scouting/h2h.ts`.
//
// ⚠ IT IS FRAMED AS HISTORY, NOT AS A TIP. The same numbers can be written as a
// bookmaker's card — "over 2.5", "both teams to score" — and this product is
// explicitly not for bettors. "Both scored in 7 of 11" is the same fact told as
// what has happened rather than as what to back.
//
// ⚠ AND IT SAYS WHAT IT IS COUNTING. Every figure carries its denominator and
// the span carries its years, because "Arsenal have won 4" means nothing
// without "of the last 11, since 2019" beside it.
// =============================================================

export function ScoutingTab({
  match,
  summary,
  homeName,
  awayName,
  palette,
}: {
  match: ResultsMatch;
  summary: H2HSummary;
  homeName: string;
  awayName: string;
  palette: { home: string; away: string };
}) {
  const theme = useTheme();

  return (
    <View style={{ gap: 16 }}>
      <RecordCard
        summary={summary}
        homeName={homeName}
        awayName={awayName}
        palette={palette}
      />
      <PatternsCard summary={summary} match={match} />
      <RecentCard summary={summary} homeName={homeName} awayName={awayName} palette={palette} />

      {/*
        ⚠ THE SAMPLE, STATED. A record over eleven meetings and one over forty
        are different kinds of claim, and the difference is invisible unless the
        card says so. The excluded count goes here too rather than being
        silently dropped — a reader comparing against another site should be
        able to see why the numbers differ.
      */}
      <View style={{ marginHorizontal: 20, gap: 2 }}>
        <Text variant="detail" color="slate">
          {summary.meetings} competitive meeting{summary.meetings === 1 ? '' : 's'}
          {summary.span
            ? ` · ${summary.span.from.slice(0, 4)}–${summary.span.to.slice(0, 4)}`
            : ''}
        </Text>
        {summary.competitions.length > 0 ? (
          <Text variant="detail" color="slate">
            {summary.competitions.map((c) => `${c.name} (${c.count})`).join(' · ')}
          </Text>
        ) : null}
        {summary.excluded > 0 ? (
          <Text variant="detail" color="slate">
            {summary.excluded} friendly{summary.excluded === 1 ? '' : ' matches'} not counted
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/** The bare record, as a three-way split. */
function RecordCard({
  summary,
  homeName,
  awayName,
  palette,
}: {
  summary: H2HSummary;
  homeName: string;
  awayName: string;
  palette: { home: string; away: string };
}) {
  const theme = useTheme();
  const total = Math.max(1, summary.meetings);

  return (
    <Card title="Head to head">
      <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 8 }}>
          <Tally value={summary.wins} label={homeName} color={palette.home} align="left" />
          <Tally value={summary.draws} label="Drawn" color={theme.colors.slate} align="center" />
          <Tally value={summary.losses} label={awayName} color={palette.away} align="right" />
        </View>

        {/* ⚠ A SPLIT BAR IS HONEST HERE, unlike on the stats tab: these three
            really are shares of one whole — every meeting is exactly one of
            them, and they total `meetings` by construction. */}
        <View style={{ flexDirection: 'row', height: 6, gap: 2 }}>
          <Segment flex={summary.wins / total} color={palette.home} />
          <Segment flex={summary.draws / total} color={theme.colors.silver} />
          <Segment flex={summary.losses / total} color={palette.away} />
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
          <Text variant="detail" color="slate">{summary.goalsFor} goals for</Text>
          <Text variant="detail" color="slate">{summary.goalsAgainst} against</Text>
        </View>
      </View>
    </Card>
  );
}

function Segment({ flex, color }: { flex: number; color: string }) {
  // ⚠ `minWidth` so a nil tally is a hairline rather than nothing at all — a
  // missing segment reads as a broken bar rather than as "never happened".
  return (
    <View style={{ flex: Math.max(flex, 0.001), minWidth: flex > 0 ? 3 : 0, borderRadius: 3, backgroundColor: color }} />
  );
}

function Tally({
  value,
  label,
  color,
  align,
}: {
  value: number;
  label: string;
  color: string;
  align: 'left' | 'center' | 'right';
}) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center' }}>
      <RNText style={{ fontFamily: MONO_BOLD, fontSize: 22, color, fontVariant: ['tabular-nums'] }}>
        {value}
      </RNText>
      <RNText
        numberOfLines={1}
        style={{
          fontFamily: fontFamilies.medium,
          fontSize: 11,
          color: theme.colors.slate,
          textAlign: align === 'right' ? 'right' : align === 'left' ? 'left' : 'center',
        }}
      >
        {label}
      </RNText>
    </View>
  );
}

/** The tendencies — each with the denominator it was counted over. */
function PatternsCard({ summary, match }: { summary: H2HSummary; match: ResultsMatch }) {
  const rows: { label: string; value: string }[] = [
    { label: 'Goals per meeting', value: summary.avgGoals.toFixed(1) },
    { label: 'Both teams scored', value: `${summary.bothScored} of ${summary.meetings}` },
  ];
  if (summary.commonScore) {
    rows.push({
      label: 'Most common score',
      value: `${summary.commonScore.score} (${summary.commonScore.count}×)`,
    });
  }
  // ⚠ Only when the provider gave half-time scores for some of them, and the
  // count it was measured over travels with it.
  if (summary.decidedAfterHtOf > 0) {
    rows.push({
      label: 'Level at half time, decided after',
      value: `${summary.decidedAfterHt} of ${summary.decidedAfterHtOf}`,
    });
  }
  if (summary.atVenue && match.venue) {
    rows.push({
      label: `At ${match.venue}`,
      value: `${summary.atVenue.wins}W ${summary.atVenue.draws}D ${summary.atVenue.losses}L`,
    });
  }

  return (
    <Card title="Patterns">
      {rows.map((r, i) => (
        <Row key={r.label} label={r.label} value={r.value} first={i === 0} />
      ))}
      <View style={{ height: 8 }} />
    </Card>
  );
}

function Row({ label, value, first }: { label: string; value: string; first: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderTopWidth: first ? 0 : 0.5,
        borderTopColor: withOpacity(theme.colors.mist, 0.5),
      }}
    >
      <RNText
        numberOfLines={2}
        style={{ flex: 1, fontFamily: fontFamilies.medium, fontSize: 12, color: theme.colors.slate }}
      >
        {label}
      </RNText>
      <RNText
        style={{ fontFamily: MONO_BOLD, fontSize: 13, color: theme.colors.ink, fontVariant: ['tabular-nums'] }}
      >
        {value}
      </RNText>
    </View>
  );
}

/** The last few, as they were played. */
function RecentCard({
  summary,
  homeName,
  awayName,
  palette,
}: {
  summary: H2HSummary;
  homeName: string;
  awayName: string;
  palette: { home: string; away: string };
}) {
  const theme = useTheme();
  if (summary.recent.length === 0) return null;

  return (
    <Card title="Recent meetings">
      {/* ⚠ THE SCORELINE IS LEFT AS PLAYED, home side first, rather than
          flipped into this fixture's order. A member reading "2-1" against a
          date and a ground is reading the scoreboard from that day; rewriting
          it to put today's home club first would silently invert half of them.
          The caption at the foot says which way round it is. */}
      {summary.recent.map((m, i) => {
        return (
          <View
            key={m.fixtureId}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderTopWidth: i === 0 ? 0 : 0.5,
              borderTopColor: withOpacity(theme.colors.mist, 0.5),
            }}
          >
            <View style={{ flex: 1 }}>
              <RNText
                numberOfLines={1}
                style={{ fontFamily: fontFamilies.semibold, fontSize: 12, color: theme.colors.ink }}
              >
                {m.competition}
              </RNText>
              <Text variant="detail" color="slate">
                {new Date(m.date).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
                {m.venueName ? ` · ${m.venueName}` : ''}
              </Text>
            </View>
            <RNText
              style={{
                fontFamily: MONO_BOLD,
                fontSize: 14,
                color: theme.colors.ink,
                fontVariant: ['tabular-nums'],
              }}
            >
              {m.homeGoals}–{m.awayGoals}
            </RNText>
          </View>
        );
      })}
      <View style={{ height: 8 }} />
      <View style={{ paddingHorizontal: 16, paddingBottom: 10 }}>
        {/* ⚠ Which way round the scoreline reads. Without this a member has to
            guess whether 2-1 was this club's win or the other's. */}
        <Text variant="detail" color="slate">
          Scores as played — home side first
        </Text>
      </View>
    </Card>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
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
      {children}
    </View>
  );
}
