import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, useMemo } from 'react';
import { Platform, Text as RNText, View } from 'react-native';

import { MatchStatusBadge } from '@/components/MatchStatusBadge';
import { getMatchStatusBadge } from '@/lib/matchStatus';
import { formatStageLabel } from '@/lib/stage';
import type { ResultsMatch } from '@/lib/useTournamentMatches';
import { Pressable } from '@/components/ui';
import { useTheme, withOpacity } from '@/theme';
import { clubOnSurface, fixturePalette } from '@/lib/design/clubColors';
import { awayDisplayName, homeDisplayName } from '@/components/match/matchDisplay';

type NextKickoffCardProps = {
  match: ResultsMatch;
  matchesToday: number;
  onPress?: () => void;
};

/** The dark end of the card's own gradient — what a bar has to be seen on. */
const CARD_DARK = '#0F0F1A';

export function NextKickoffCard({ match, matchesToday, onPress }: NextKickoffCardProps) {

  const theme = useTheme();

  /**
   * What the two bars wear.
   *
   * ⚠⚠ BOTH COLOUR RULES, AND THIS CARD NEEDS THEM MORE THAN MOST.
   * `fixturePalette` stops two clubs in the same colour drawing two identical
   * bars — there is no crest here to tell them apart any more.
   * `clubOnSurface` then lifts for the card's near-black gradient, which is
   * where a black-shirted club would otherwise vanish: the approved design
   * calls that out by name, "Udinese and Newcastle use their white here, which
   * is honest to the kit" (drafts/2026-09-14_chosen_design.html §1).
   *
   * ⚠ MEASURED AGAINST THE DARKER END of the gradient — the worst case, not
   * the average, since a bar sits at either edge of the card.
   */
  const markColours = useMemo(() => {
    const palette = fixturePalette(match.homeTeam?.flagUrl, match.awayTeam?.flagUrl, {
      home: theme.colors.primary,
      away: theme.colors.accent,
    });
    return {
      home: clubOnSurface(palette.home, CARD_DARK, 3),
      away: clubOnSurface(palette.away, CARD_DARK, 3),
    };
  }, [match.homeTeam?.flagUrl, match.awayTeam?.flagUrl, theme.colors.primary, theme.colors.accent]);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const kickoff = new Date(match.matchDate).getTime();
  const diffMs = Math.max(0, kickoff - now);
  const under24h = diffMs < 24 * 60 * 60 * 1000;

  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diffMs / (1000 * 60)) % 60);
  const seconds = Math.floor((diffMs / 1000) % 60);

  const friendlyDate = new Date(match.matchDate).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const badge = getMatchStatusBadge(match);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
    >
      <LinearGradient
        colors={['#0F0F1A', '#1A1830']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{
          borderRadius: theme.radii.lg,
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
          overflow: 'hidden',
        }}
      >
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 140,
            height: 140,
            borderRadius: 70,
            backgroundColor: withOpacity(theme.colors.primary, 0.06),
            shadowColor: theme.colors.primary,
            shadowOpacity: 0.5,
            shadowRadius: 45,
            shadowOffset: { width: 0, height: 0 },
            top: -20,
            right: -60,
          }}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 100,
            height: 100,
            borderRadius: 50,
            backgroundColor: withOpacity(theme.colors.accent, 0.05),
            shadowColor: theme.colors.accent,
            shadowOpacity: 0.4,
            shadowRadius: 40,
            shadowOffset: { width: 0, height: 0 },
            bottom: -30,
            left: -50,
          }}
        />

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <RNText
            style={{
              fontFamily: 'Nunito_900Black',
              fontSize: 11,
              color: 'rgba(255,255,255,0.5)',
              letterSpacing: 1.5,
              textTransform: 'uppercase',
            }}
          >
            Next Kickoff
          </RNText>
          {match.stage ? (
            <RNText
              style={{
                fontFamily: 'Nunito_700Bold',
                fontSize: 11,
                color: 'rgba(255,255,255,0.4)',
                letterSpacing: 0.5,
                textTransform: 'uppercase',
              }}
            >
              {formatStageLabel(match.stage, match.roundNumber)}
            </RNText>
          ) : null}
        </View>

        {/*
          ⚠⚠ ONE ROW: BAR · NAME · CLOCK · NAME · BAR (Ryan, 2026-09-21). The
          crests here were among the last in the app, and the clubs had to stay
          either side of the clock — which is what this card is for.

          ⚠ THE BARS ARE VERTICAL FOR A REASON THAT IS NOT TASTE. Lying down,
          the approved design's 34pt underline would take 68pt of a 314pt row,
          with two names and a countdown already fighting for it. Stood up they
          cost 6 each. That is why the layout fits at all.
        */}
        {/*
          ⚠⚠ THE BADGE AND THE DATE ARE OUTSIDE THE ROW, and that is what makes
          the row line up (Ryan, 2026-09-21: "the bars countdown team names
          should all be horizontally aligned"). They used to be stacked WITH the
          countdown inside the middle cell, so `alignItems: 'center'` centred the
          two sides against badge-plus-clock-plus-date — the whole stack — and
          the bars and names settled below the clock's own centre. With only the
          clock left in the row, the three cells share one centre line by
          construction rather than by arithmetic.

          ⚠ SAME FIX THE MATCH HEADER NEEDED, for the same reason: a caption
          under a figure quietly moves the figure when something centres on
          their shared box.
        */}
        {badge && !badge.hidesCountdown ? (
          <View style={{ alignItems: 'center' }}>
            <MatchStatusBadge match={match} />
          </View>
        ) : null}

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <TeamSide
            name={cardName(match.homeTeam, homeDisplayName(match))}
            colour={markColours.home}
          />

          {/* ⚠ ONE CELL, ONE THING. The badge branch replaces the clock rather
              than sitting above it — a delayed fixture has no countdown to
              show, so the badge IS the figure in that state. */}
          {/*
            ⚠⚠ THE DATE IS BACK UNDER THE CLOCK, and that is not a reversal of
            this morning's fix — it is the same rule applied to a layout that
            changed underneath it. When the sides were a 30pt bar-and-name row,
            a middle stack of badge-clock-date was twice their height and
            centring dragged them below the clock. Now every column is a figure
            over a smaller mark — name over rule, clock over date — so their
            centres agree by construction. The badge stays hoisted because it
            has no counterpart on either side.
          */}
          {badge?.hidesCountdown ? (
            <MatchStatusBadge match={match} />
          ) : (
            <View style={{ alignItems: 'center', gap: 4 }}>
            <Countdown
              parts={
                under24h
                  ? [
                      { value: hours, label: 'H' },
                      { value: minutes, label: 'M' },
                      { value: seconds, label: 'S' },
                    ]
                  : [
                      { value: days, label: 'D' },
                      { value: hours, label: 'H' },
                    ]
              }
            />
            <RNText
              style={{
                fontFamily: 'Nunito_500Medium',
                fontSize: 10,
                color: 'rgba(255,255,255,0.4)',
              }}
            >
              {friendlyDate}
            </RNText>
            </View>
          )}

          <TeamSide
            name={cardName(match.awayTeam, awayDisplayName(match))}
            colour={markColours.away}
          />
        </View>



        {under24h && matchesToday > 1 ? (
          <RNText
            style={{
              fontFamily: 'Nunito_600SemiBold',
              fontSize: 11,
              color: withOpacity(theme.colors.accent, 0.8),
              textAlign: 'center',
            }}
          >
            {matchesToday - 1} more match{matchesToday - 1 === 1 ? '' : 'es'} today
          </RNText>
        ) : null}

        {match.venue ? (
          <RNText
            style={{
              fontFamily: 'Nunito_500Medium',
              fontSize: 11,
              color: 'rgba(255,255,255,0.35)',
              textAlign: 'center',
            }}
          >
            {match.venue}
          </RNText>
        ) : null}
      </LinearGradient>
    </Pressable>
  );
}

function Countdown({ parts }: { parts: Array<{ value: number; label: string }> }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
      {parts.map((part, i) => (
        <View key={part.label} style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
          <RNText
            style={{
              fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
              fontSize: 22,
              fontWeight: '900',
              color: '#FFFFFF',
              lineHeight: 26,
            }}
          >
            {String(part.value).padStart(2, '0')}
          </RNText>
          <RNText
            style={{
              fontFamily: 'Nunito_700Bold',
              fontSize: 10,
              color: 'rgba(255,255,255,0.4)',
              marginLeft: 1,
              marginBottom: 4,
            }}
          >
            {part.label}
          </RNText>
          {i < parts.length - 1 ? (
            <RNText
              style={{
                fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
                fontSize: 20,
                color: 'rgba(255,255,255,0.3)',
                marginHorizontal: 2,
              }}
            >
              :
            </RNText>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/**
 * The name this card can actually fit.
 *
 * ⚠⚠ A WORD CANNOT WRAP, AND THAT IS THE WHOLE PROBLEM. Each side gets about
 * 88pt once the clock has taken the middle, and at 16pt "Mönchengladbach" is
 * 118 — one unbreakable word, half again too wide. It already overflowed at 14.
 * Measured: `Wolverhampton` is 103, `Saint-Germain` 94.
 *
 * ⚠ SO THE FULL NAME YIELDS TO THE SHORT ONE, rather than to an ellipsis.
 * `shortClubName` has a real answer for exactly these — Gladbach, Wolves, PSG,
 * Leverkusen — and "Gladbach" reads better than "Mönchengl…" by any measure.
 * Ten characters is the longest word that fits at 16pt with air to spare.
 *
 * ⚠ AND THIS IS WHY THE CARD DIVERGES FROM THE MATCH HEADER, which takes the
 * full name unconditionally. Its side columns are 113pt at 19pt type; this one
 * has 88 at 16. Same layout, different budget — the rule belongs to the card
 * that has to live inside the smaller one.
 */
const LONGEST_WORD_THAT_FITS = 10;

function cardName(team: ResultsMatch['homeTeam'], full: string): string {
  const longest = Math.max(...full.split(/\s+/).map((w) => w.length));
  if (longest <= LONGEST_WORD_THAT_FITS) return full;
  return team?.shortName?.trim() || full;
}

/**
 * One club beside the clock: its full name, with its colour rule beneath.
 *
 * ⚠⚠ THE MATCH DETAIL HEADER'S LAYOUT, BROUGHT HERE (Ryan, 2026-09-21). This
 * card taps through to that screen, and until now the two drew the same fixture
 * two different ways — a bar beside a shortened name here, a full name over a
 * rule there. Same structure, same helpers, so they cannot drift.
 *
 * ⚠ FULL NAME, NOT SHORTENED. `homeDisplayName` is the header's own rule and it
 * resolves `countryName` — "Borussia Dortmund", not "Dortmund". It only works
 * because the name is allowed two lines; on one it would have to be the short
 * form, which is the trade the previous layout made.
 *
 * ⚠ AND THE RULE IS UNDER THE NAME, NOT BESIDE IT. Lying down it costs height
 * rather than width, which is what buys the name its second line — the
 * opposite of the reasoning that put the bar upright when it sat in the row.
 */
function TeamSide({ name, colour }: { name: string; colour: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 8 }}>
      <RNText
        // ⚠ TWO LINES IS THE DESIGN — and also the ceiling. `cardName` above
        // keeps the words short enough that this should never bite; it is here
        // so that a club nobody anticipated ellipsises instead of running
        // across the countdown.
        numberOfLines={2}
        style={{
          fontFamily: 'Nunito_900Black',
          fontSize: 16,
          lineHeight: 19,
          color: '#FFFFFF',
          textAlign: 'center',
        }}
      >
        {name}
      </RNText>
      {/* ⚠ 30×4, the header's 34×4 brought down with the type — it sets names
          at 19 and this card at 16. */}
      <View style={{ width: 30, height: 4, borderRadius: 2, backgroundColor: colour }} />
    </View>
  );
}


