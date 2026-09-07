import { Text as RNText, View } from 'react-native';

import { MONO_BOLD } from '@/components/match/matchDisplay';
import { groupByRow, surnameOf } from '@/lib/lineupLayout';
import { Text } from '@/components/ui';
import type { LineupPlayer, MatchLineup } from '@/lib/useMatchDetail';
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
// ⚠ NO PLAYER IS TAPPABLE. There is no player screen to open — "Player detail
// page" is an unstarted backlog item — and a press that does nothing is worse
// than no affordance at all.
// =============================================================

export function LineupsTab({
  lineups,
  homeName,
  awayName,
}: {
  lineups: MatchLineup[];
  homeName: string;
  awayName: string;
}) {
  const home = lineups.find((l) => l.side === 'home') ?? null;
  const away = lineups.find((l) => l.side === 'away') ?? null;

  return (
    <View style={{ gap: 16 }}>
      <Pitch home={home} away={away} />
      {home ? <Bench lineup={home} teamName={homeName} /> : null}
      {away ? <Bench lineup={away} teamName={awayName} /> : null}
    </View>
  );
}

/**
 * Both starting elevens on one pitch, home in the near half and away mirrored
 * in the far half — the arrangement every football broadcast uses, so it needs
 * no explaining.
 */
function Pitch({ home, away }: { home: MatchLineup | null; away: MatchLineup | null }) {
  const theme = useTheme();

  return (
    <View
      style={{
        marginHorizontal: 20,
        borderRadius: theme.radii.lg,
        overflow: 'hidden',
        ...theme.shadows.card,
        // The pitch is its own surface rather than the card surface: a line-up
        // reads as a pitch or it reads as a table, and half-way is neither.
        backgroundColor: theme.mode === 'dark' ? '#12301C' : '#1B7A3E',
      }}
    >
      <PitchMarkings />

      <View style={{ paddingVertical: 14 }}>
        {/* Away at the top, defending the far goal, so the two sides face each
            other the way they do on a television. */}
        <Half lineup={away} inverted />
        <HalfwayLine />
        <Half lineup={home} inverted={false} />
      </View>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingHorizontal: 14,
          paddingBottom: 12,
          gap: 12,
        }}
      >
        <FormationTag lineup={away} align="left" />
        <FormationTag lineup={home} align="right" />
      </View>
    </View>
  );
}

/** A centre circle and a halfway line, drawn with borders — no SVG needed. */
function PitchMarkings() {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
      <View
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 88,
          height: 88,
          marginLeft: -44,
          marginTop: -44,
          borderRadius: 44,
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.16)',
        }}
      />
    </View>
  );
}

function HalfwayLine() {
  return (
    <View
      style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.16)', marginVertical: 6 }}
    />
  );
}

/**
 * One team's eleven, laid out by `grid`.
 *
 * ⚠ ROWS ARE GROUPED, NOT POSITIONED ABSOLUTELY. A row of three and a row of
 * five must each spread evenly across the same width, which `flex` does for
 * free and absolute placement would need the pitch's measured width for. The
 * column NUMBER is used only to order players within their row.
 */
function Half({ lineup, inverted }: { lineup: MatchLineup | null; inverted: boolean }) {
  const theme = useTheme();
  if (!lineup) {
    return (
      <View style={{ paddingVertical: 28, alignItems: 'center' }}>
        <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
          Line-up not published
        </RNText>
      </View>
    );
  }

  const rows = groupByRow(lineup.players.filter((p) => p.starter));

  return (
    <View style={{ gap: 10, paddingHorizontal: 8 }}>
      {/* The keeper's row is nearest that team's own goal, so the away half is
          drawn from the back forwards and the home half from the front back. */}
      {(inverted ? rows : [...rows].reverse()).map((row, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-evenly',
            alignItems: 'flex-start',
          }}
        >
          {row.map((p, j) => (
            <PlayerChip key={p.playerId ?? `${i}-${j}`} player={p} tint={theme.colors.snow} />
          ))}
        </View>
      ))}
    </View>
  );
}

function PlayerChip({ player, tint }: { player: LineupPlayer; tint: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 3, width: 58 }}>
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'rgba(255,255,255,0.92)',
        }}
      >
        <RNText
          style={{
            fontFamily: MONO_BOLD,
            fontSize: 11,
            color: '#16192B',
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
          fontSize: 9,
          color: tint,
          textAlign: 'center',
        }}
      >
        {surnameOf(player.name)}
      </RNText>
    </View>
  );
}

function FormationTag({ lineup, align }: { lineup: MatchLineup | null; align: 'left' | 'right' }) {
  if (!lineup?.formation) return <View />;
  return (
    <RNText
      style={{
        fontFamily: MONO_BOLD,
        fontSize: 11,
        color: 'rgba(255,255,255,0.72)',
        textAlign: align,
      }}
    >
      {lineup.formation}
    </RNText>
  );
}

/** The bench, and the coach. A list, because a substitute has no position. */
function Bench({ lineup, teamName }: { lineup: MatchLineup; teamName: string }) {
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
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
        <Text variant="cardTitle" numberOfLines={1}>{teamName}</Text>
        {lineup.coachName ? (
          <Text variant="detail" color="slate">Coach · {lineup.coachName}</Text>
        ) : null}
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
