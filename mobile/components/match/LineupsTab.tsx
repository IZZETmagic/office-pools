import { Text as RNText, View } from 'react-native';

import { MONO_BOLD } from '@/components/match/matchDisplay';
import { PitchMarkings, PITCH_L, PITCH_W } from '@/components/match/PitchMarkings';
import { Text } from '@/components/ui';
import { fixturePalette } from '@/lib/design/clubColors';
import { groupByRow, surnameOf } from '@/lib/lineupLayout';
import type { LineupPlayer, MatchLineup } from '@/lib/useMatchDetail';
import type { ResultsTeam } from '@/lib/useTournamentMatches';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// Who played — a pitch, and two benches
// =============================================================
// ⚠ POSITIONS COME FROM `grid`, NOT FROM THE FORMATION STRING. The feed sends
// both, and only one of them is reliable: `formation` is a caption ("4-2-3-1")
// that a renderer would have to parse and then guess a layout from, while
// `grid` is "row:col" per player and is what the provider actually used. A
// fixture whose formation string and grid disagree — and they do — must follow
// the grid, or a player stands somewhere nobody picked him.
//
// ⚠ EVERY SUBSTITUTE HAS `grid: null`. That is the feed's answer, not a gap
// (migration 139 records the check), so the bench is a LIST and never a
// position on the pitch. `starter` is read directly rather than inferred from
// `grid != null`: the two agree today, and inferring would silently drop a
// starter the feed forgot to place.
//
// ⚠ PLAYERS ARE PLACED ABSOLUTELY NOW, NOT FLEXED INTO ROWS. The pitch is drawn
// to real proportions and carries real markings, so a shirt has to land in the
// right PART of it — a flexed row spreads evenly through whatever height it is
// given, which stood a back four across the penalty spot. Percentages of the
// pitch box put each row where its grid row says it belongs.
//
// ⚠ NO PLAYER IS TAPPABLE. There is no player screen to open — "Player detail
// page" is an unstarted backlog item — and a press that does nothing is worse
// than no affordance at all.
// =============================================================

/** The shirt. Big enough to read a number in, small enough for five across. */
const CHIP = 34;
/** How wide a name may run before it truncates — five of these across 68m. */
const NAME_W = 62;

export function LineupsTab({
  lineups,
  homeName,
  awayName,
  homeTeam,
  awayTeam,
}: {
  lineups: MatchLineup[];
  homeName: string;
  awayName: string;
  /** For the shirt colours — the crest URL is where the club's id hides. */
  homeTeam: ResultsTeam | null;
  awayTeam: ResultsTeam | null;
}) {
  const theme = useTheme();
  const home = lineups.find((l) => l.side === 'home') ?? null;
  const away = lineups.find((l) => l.side === 'away') ?? null;

  // ⚠ THE SAME PALETTE THE STATS TAB USES, and for the same reason: two clubs
  // who play in the same red would put twenty-two indistinguishable shirts on
  // one pitch. `fixturePalette` reverts BOTH sides when it cannot tell them
  // apart — see `clubColors` for the measured threshold.
  const palette = fixturePalette(homeTeam?.flagUrl, awayTeam?.flagUrl, {
    home: theme.colors.primary,
    away: theme.colors.accent,
  });

  return (
    <View style={{ gap: 16 }}>
      <Pitch home={home} away={away} homeName={homeName} awayName={awayName} palette={palette} />
      {home ? <Bench lineup={home} teamName={homeName} tint={palette.home} /> : null}
      {away ? <Bench lineup={away} teamName={awayName} tint={palette.away} /> : null}
    </View>
  );
}

/**
 * Both starting elevens on one pitch, away defending the top goal and home the
 * bottom — the arrangement every broadcast uses, so it needs no explaining.
 */
function Pitch({
  home,
  away,
  homeName,
  awayName,
  palette,
}: {
  home: MatchLineup | null;
  away: MatchLineup | null;
  homeName: string;
  awayName: string;
  palette: { home: string; away: string };
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        marginHorizontal: 20,
        borderRadius: theme.radii.lg,
        overflow: 'hidden',
        ...theme.shadows.card,
        // ⚠ THE PITCH'S OWN PROPORTIONS, 68 BY 105. Anything else stretches the
        // centre circle into an ellipse, which is the one marking everybody
        // knows the shape of — and it is what gives the formation its room.
        aspectRatio: PITCH_W / PITCH_L,
        backgroundColor: theme.mode === 'dark' ? '#123021' : '#1D7A45',
      }}
    >
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
        <PitchMarkings />
      </View>

      {/* Away across the top half, home across the bottom. */}
      <Half lineup={away} tint={palette.away} half="top" />
      <Half lineup={home} tint={palette.home} half="bottom" />

      {/* ⚠ IN THE CORNER EACH SIDE DEFENDS, so the caption sits beside the team
          it names rather than in a legend the eye has to travel to. */}
      <TeamTag lineup={away} name={awayName} corner="top" />
      <TeamTag lineup={home} name={homeName} corner="bottom" />
    </View>
  );
}

function TeamTag({
  lineup,
  name,
  corner,
}: {
  lineup: MatchLineup | null;
  name: string;
  corner: 'top' | 'bottom';
}) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 12,
        ...(corner === 'top' ? { top: 10 } : { bottom: 10 }),
        maxWidth: '55%',
      }}
    >
      <RNText
        numberOfLines={1}
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 13,
          color: '#FFFFFF',
          textShadowColor: 'rgba(0,0,0,0.45)',
          textShadowRadius: 3,
        }}
      >
        {name}
      </RNText>
      {lineup?.formation ? (
        <RNText
          style={{
            fontFamily: MONO_BOLD,
            fontSize: 11,
            color: 'rgba(255,255,255,0.82)',
            textShadowColor: 'rgba(0,0,0,0.45)',
            textShadowRadius: 3,
          }}
        >
          {lineup.formation}
        </RNText>
      ) : null}
    </View>
  );
}

/**
 * One team's eleven, placed by `grid` across its own half.
 *
 * ⚠ ROW 1 IS THE KEEPER AND SITS NEAREST THAT TEAM'S OWN GOAL, so the top half
 * counts outward from the top and the bottom half inward from the bottom.
 * Getting this the wrong way round puts a goalkeeper on the halfway line, which
 * looks like a formation rather than a bug.
 *
 * ⚠ THE ROWS SPREAD ACROSS 46% OF THE PITCH, NOT 50%. A team's shape runs from
 * its own six-yard box to a little short of the halfway line; using the exact
 * half would stand the front row ON the centre line, overlapping the eleven
 * coming the other way.
 */
function Half({
  lineup,
  tint,
  half,
}: {
  lineup: MatchLineup | null;
  tint: string;
  half: 'top' | 'bottom';
}) {
  if (!lineup) {
    return (
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          ...(half === 'top' ? { top: '18%' } : { bottom: '18%' }),
          alignItems: 'center',
        }}
      >
        <RNText
          style={{
            fontFamily: fontFamilies.medium,
            fontSize: 12,
            color: 'rgba(255,255,255,0.75)',
            textShadowColor: 'rgba(0,0,0,0.45)',
            textShadowRadius: 3,
          }}
        >
          Line-up not published
        </RNText>
      </View>
    );
  }

  const rows = groupByRow(lineup.players.filter((p) => p.starter));
  const BAND = 46;
  const LEAD = 4; // keeps the keeper off his own goal line

  return (
    <>
      {rows.map((row, rowIndex) => {
        const depth = LEAD + ((rowIndex + 0.5) / rows.length) * BAND;
        const top = half === 'top' ? depth : 100 - depth;

        return row.map((player, colIndex) => {
          const left = ((colIndex + 0.5) / row.length) * 100;
          return (
            <View
              key={player.playerId ?? `${rowIndex}-${colIndex}`}
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: `${top}%`,
                left: `${left}%`,
                width: NAME_W,
                // ⚠ Centred on its point rather than hung off the left edge, so
                // a row of three and a row of five share the same axis.
                marginLeft: -NAME_W / 2,
                marginTop: -CHIP / 2,
                alignItems: 'center',
              }}
            >
              <Shirt player={player} tint={tint} />
            </View>
          );
        });
      })}
    </>
  );
}

function Shirt({ player, tint }: { player: LineupPlayer; tint: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 3 }}>
      <View
        style={{
          width: CHIP,
          height: CHIP,
          borderRadius: CHIP / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tint,
          // A hairline of white, so a dark shirt still separates from the grass.
          borderWidth: 1.5,
          borderColor: 'rgba(255,255,255,0.85)',
        }}
      >
        <RNText
          style={{
            fontFamily: MONO_BOLD,
            fontSize: 13,
            color: '#FFFFFF',
            fontVariant: ['tabular-nums'],
          }}
        >
          {player.number ?? '–'}
        </RNText>
      </View>
      <RNText
        numberOfLines={1}
        style={{
          fontFamily: fontFamilies.semibold,
          fontSize: 11,
          color: '#FFFFFF',
          textAlign: 'center',
          // ⚠ Real work, not decoration: the grass is mid-green and a name can
          // land on a white marking, where it would otherwise disappear.
          textShadowColor: 'rgba(0,0,0,0.6)',
          textShadowRadius: 3,
        }}
      >
        {surnameOf(player.name)}
      </RNText>
    </View>
  );
}

/** The bench, and the coach. A list, because a substitute has no position. */
function Bench({
  lineup,
  teamName,
  tint,
}: {
  lineup: MatchLineup;
  teamName: string;
  tint: string;
}) {
  const theme = useTheme();
  const subs = lineup.players.filter((p) => !p.starter);
  if (subs.length === 0 && !lineup.coachName) return null;

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
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 16,
          paddingTop: 14,
          paddingBottom: 10,
        }}
      >
        {/* The same colour the side wears on the pitch above. */}
        <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: tint }} />
        <View style={{ flex: 1 }}>
          <Text variant="cardTitle" numberOfLines={1}>{teamName}</Text>
          {lineup.coachName ? (
            <Text variant="detail" color="slate">Coach · {lineup.coachName}</Text>
          ) : null}
        </View>
      </View>

      {subs.length > 0 ? (
        <>
          <View
            style={{
              height: 0.5,
              marginHorizontal: 14,
              backgroundColor: withOpacity(theme.colors.mist, 0.5),
            }}
          />
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 8,
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
          >
            {subs.map((p, i) => (
              <View
                key={p.playerId ?? i}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 5,
                  borderRadius: theme.radii.xs,
                  backgroundColor: withOpacity(theme.colors.mist, 0.5),
                }}
              >
                <RNText
                  style={{
                    fontFamily: MONO_BOLD,
                    fontSize: 10,
                    color: theme.colors.slate,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {p.number ?? '–'}
                </RNText>
                <RNText
                  style={{ fontFamily: fontFamilies.medium, fontSize: 12, color: theme.colors.ink }}
                >
                  {p.name ?? '—'}
                </RNText>
              </View>
            ))}
          </View>
        </>
      ) : null}
    </View>
  );
}
