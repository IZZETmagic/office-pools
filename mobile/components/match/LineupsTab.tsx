import { useMemo, useState } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';

import { MONO_BOLD } from '@/components/match/matchDisplay';
import { PlayerStatSheet } from '@/components/match/PlayerStatSheet';
import {
  PitchMarkings,
  pitchXToView,
  pitchYToView,
  VIEW_L,
  VIEW_W,
} from '@/components/match/PitchMarkings';
import { Text } from '@/components/ui';
import { fixturePalette } from '@/lib/design/clubColors';
import { groupByRow, surnameOf } from '@/lib/lineupLayout';
import {
  formatRating,
  indexByPlayerId,
  ratingColor,
  type MatchPlayerStat,
} from '@/lib/playerStats';
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
// ⚠ PLAYERS ARE PLACED ABSOLUTELY NOW, NOT FLEXED INTO ROWS. The pitch carries
// real markings at real sizes, so a shirt has to land in the right PART of it —
// a flexed row spreads evenly through whatever height it is given, which stood
// a back four across the penalty spot. Percentages of the pitch box put each
// row where its grid row says it belongs.
//
// ⚠ HOME IS THE TOP HALF. It is the side the fixture is named for and the side
// the band above the pitch names first, so the eye does not swap ends between
// the scoreline and the shirts.
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
  playerStats,
  homeName,
  awayName,
  homeTeam,
  awayTeam,
}: {
  lineups: MatchLineup[];
  /** Migration 141. Empty before a match, and on any client older than it. */
  playerStats: MatchPlayerStat[];
  homeName: string;
  awayName: string;
  /** For the shirt colours — the crest URL is where the club's id hides. */
  homeTeam: ResultsTeam | null;
  awayTeam: ResultsTeam | null;
}) {
  const theme = useTheme();
  const home = lineups.find((l) => l.side === 'home') ?? null;
  const away = lineups.find((l) => l.side === 'away') ?? null;

  // ⚠ KEYED ON THE PROVIDER'S PLAYER ID, WHICH IS THE ONLY THING THE TWO
  // TABLES SHARE. `match_lineups.players[].player_id` and
  // `match_player_stats.external_player_id` are both api-football's id; the
  // NAMES differ between the two endpoints (`/lineups` abbreviates), so
  // matching on those would silently fail for exactly the players whose names
  // are long enough to be worth reading.
  const statsById = useMemo(() => indexByPlayerId(playerStats), [playerStats]);
  const [open, setOpen] = useState<{ stat: MatchPlayerStat; team: string; tint: string } | null>(
    null,
  );

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
      <Pitch
        home={home}
        away={away}
        homeName={homeName}
        awayName={awayName}
        palette={palette}
        statsById={statsById}
        onPick={setOpen}
      />
      {home ? (
        <Bench
          lineup={home}
          teamName={homeName}
          tint={palette.home}
          statsById={statsById}
          onPick={setOpen}
        />
      ) : null}
      {away ? (
        <Bench
          lineup={away}
          teamName={awayName}
          tint={palette.away}
          statsById={statsById}
          onPick={setOpen}
        />
      ) : null}

      <PlayerStatSheet
        stat={open?.stat ?? null}
        teamName={open?.team ?? ''}
        tint={open?.tint ?? palette.home}
        onClose={() => setOpen(null)}
      />
    </View>
  );
}

/**
 * Both starting elevens on one pitch, HOME defending the top goal and away the
 * bottom.
 *
 * ⚠ HOME ON TOP, and it is the home side's own goal at the top — the eleven you
 * read first is the one the fixture is named for. It also matches the order the
 * band above the pitch puts them in, so a member's eye does not have to swap
 * sides between the scoreline and the shirts.
 */
type Pick = (v: { stat: MatchPlayerStat; team: string; tint: string } | null) => void;
type StatsById = Map<number, MatchPlayerStat>;

function Pitch({
  home,
  away,
  homeName,
  awayName,
  palette,
  statsById,
  onPick,
}: {
  home: MatchLineup | null;
  away: MatchLineup | null;
  homeName: string;
  awayName: string;
  palette: { home: string; away: string };
  statsById: StatsById;
  onPick: Pick;
}) {
  const theme = useTheme();

  /**
   * The card's rendered width, so the drawing can be told what the card's
   * corner radius is IN ITS OWN UNITS.
   *
   * ⚠ THE RADIUS IS IN POINTS AND THE PITCH IS IN METRES, and the conversion
   * depends on how wide the card ended up — which is the phone's business, not
   * this file's. Measuring is the only honest way to make the touchline follow
   * the card's corner instead of being clipped by it.
   */
  const [cardWidth, setCardWidth] = useState(0);
  const cardRadiusInPitchUnits =
    cardWidth > 0 ? (theme.radii.lg * VIEW_W) / cardWidth : undefined;

  return (
    <View
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        // Guarded: `onLayout` fires on every re-render, and writing the same
        // number back would loop.
        if (w > 0 && w !== cardWidth) setCardWidth(w);
      }}
      style={{
        marginHorizontal: 20,
        borderRadius: theme.radii.lg,
        overflow: 'hidden',
        ...theme.shadows.card,
        // ⚠ EXACTLY THE VIEWBOX'S RATIO — and that is the BLED box, not the
        // pitch. Any other value stretches the drawing to fit and turns the
        // centre circle into an ellipse. See `PitchMarkings` for why the extra
        // length over a real 105m pitch is drawn as grass rather than scaled,
        // and why the box carries a bleed at all.
        aspectRatio: VIEW_W / VIEW_L,
        backgroundColor: theme.mode === 'dark' ? '#123021' : '#1D7A45',
      }}
    >
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
        <PitchMarkings cardRadius={cardRadiusInPitchUnits} />
      </View>

      {/* Home across the top half, away across the bottom. */}
      <Half lineup={home} tint={palette.home} half="top" teamName={homeName} statsById={statsById}
          onPick={onPick}
        />
      <Half lineup={away} tint={palette.away} half="bottom" teamName={awayName} statsById={statsById}
          onPick={onPick}
        />

      {/* ⚠ IN THE CORNER EACH SIDE DEFENDS, so the caption sits beside the team
          it names rather than in a legend the eye has to travel to. */}
      <TeamTag lineup={home} name={homeName} corner="top" />
      <TeamTag lineup={away} name={awayName} corner="bottom" />
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
  teamName,
  statsById,
  onPick,
}: {
  lineup: MatchLineup | null;
  tint: string;
  half: 'top' | 'bottom';
  teamName: string;
  statsById: StatsById;
  onPick: Pick;
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
        // ⚠ Mapped through the bleed — a raw pitch percentage is not a box
        // percentage, and the keeper would stand outside his own goal line.
        const top = pitchYToView(half === 'top' ? depth : 100 - depth);

        return row.map((player, colIndex) => {
          const left = pitchXToView(((colIndex + 0.5) / row.length) * 100);
          const stat = player.playerId ? statsById.get(player.playerId) : undefined;
          return (
            <Pressable
              key={player.playerId ?? `${rowIndex}-${colIndex}`}
              // ⚠⚠ A DEAD PRESS IS WORSE THAN NONE — this file's original rule,
              // and it still holds. Before kickoff there are no statistics, so
              // there is nothing to open and the shirt stays inert exactly as it
              // always was. `pointerEvents` flips only when a tap would show
              // something, which is also what keeps the pitch swipeable.
              pointerEvents={stat ? 'auto' : 'none'}
              disabled={!stat}
              onPress={stat ? () => onPick({ stat, team: teamName, tint }) : undefined}
              hitSlop={6}
              style={({ pressed }) => ({
                opacity: pressed ? 0.7 : 1,
                position: 'absolute',
                top: `${top}%`,
                left: `${left}%`,
                width: NAME_W,
                // ⚠ Centred on its point rather than hung off the left edge, so
                // a row of three and a row of five share the same axis.
                marginLeft: -NAME_W / 2,
                marginTop: -CHIP / 2,
                alignItems: 'center',
              })}
            >
              <Shirt player={player} tint={tint} rating={stat?.rating ?? null} />
            </Pressable>
          );
        });
      })}
    </>
  );
}

function Shirt({
  player,
  tint,
  rating,
}: {
  player: LineupPlayer;
  tint: string;
  rating: number | null;
}) {
  const badge = formatRating(rating);
  const badgeColor = ratingColor(rating);

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
        {/* ⚠ THE RATING RIDES ON THE SHIRT, and this is the whole feature: the
            numbers are readable without tapping anything, and the tap is for
            depth rather than for discovery. It hangs OUTSIDE the circle so it
            never covers the squad number.

            ⚠ It needs its own white hairline. The three band fills measure
            1.6–2.6:1 against the pitch green — fine for white text ON them,
            hopeless as an edge against grass. Same reasoning as the shirt. */}
        {badge && badgeColor ? (
          <View
            style={{
              position: 'absolute',
              top: -5,
              right: -9,
              minWidth: 21,
              paddingHorizontal: 3,
              paddingVertical: 1,
              borderRadius: 5,
              backgroundColor: badgeColor,
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.9)',
              alignItems: 'center',
            }}
          >
            <RNText
              style={{
                fontFamily: MONO_BOLD,
                fontSize: 9,
                lineHeight: 12,
                color: '#FFFFFF',
                fontVariant: ['tabular-nums'],
              }}
            >
              {badge}
            </RNText>
          </View>
        ) : null}
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
  statsById,
  onPick,
}: {
  lineup: MatchLineup;
  teamName: string;
  tint: string;
  statsById: StatsById;
  onPick: Pick;
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
            {subs.map((p, i) => {
              const stat = p.playerId ? statsById.get(p.playerId) : undefined;
              // ⚠ ONLY THE ONES WHO CAME ON HAVE ANYTHING TO SHOW. An unused
              // substitute has a row in the table but no rating and no minutes,
              // so his chip stays a label rather than becoming a dead button.
              const played = stat ? (stat.minutes ?? 0) > 0 || stat.rating !== null : false;
              const badge = formatRating(stat?.rating ?? null);
              const badgeColor = ratingColor(stat?.rating ?? null);
              return (
              <Pressable
                key={p.playerId ?? i}
                disabled={!played}
                onPress={
                  played && stat ? () => onPick({ stat, team: teamName, tint }) : undefined
                }
                style={({ pressed }) => ({
                  opacity: pressed ? 0.6 : 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingHorizontal: 8,
                  paddingVertical: 5,
                  borderRadius: theme.radii.xs,
                  backgroundColor: withOpacity(theme.colors.mist, 0.5),
                })}
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
                {badge && badgeColor ? (
                  <View
                    style={{
                      paddingHorizontal: 4,
                      paddingVertical: 1,
                      borderRadius: 4,
                      backgroundColor: badgeColor,
                    }}
                  >
                    <RNText
                      style={{
                        fontFamily: MONO_BOLD,
                        fontSize: 9,
                        lineHeight: 12,
                        color: '#FFFFFF',
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {badge}
                    </RNText>
                  </View>
                ) : null}
              </Pressable>
              );
            })}
          </View>
        </>
      ) : null}
    </View>
  );
}
