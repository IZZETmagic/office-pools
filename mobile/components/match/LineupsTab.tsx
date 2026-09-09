import { useMemo, useState } from 'react';
import { Image } from 'expo-image';
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
import { Icon, Text } from '@/components/ui';
import { fixturePalette } from '@/lib/design/clubColors';
import { groupByRow, surnameOf } from '@/lib/lineupLayout';
import {
  formatRating,
  indexByPlayerId,
  playerMarkers,
  playerPhotoUrl,
  ratingColor,
  teamRating,
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
// ⚠ 52, NOT 38, AND THE MARKERS ARE WHY. A rating badge alone was already
// tight on a 38pt circle; ringing a player with a goal, a card, an armband and
// a substitution arrow needs about 52 — which needs ~72pt of column, which is
// what edge to edge provides in a five-man row (79pt) and the card did not
// (71pt). The size, the markers and the full-bleed pitch are one decision.
// ⚠ 48 IS THE GEOMETRY, NOT A PREFERENCE. Rows sit 65.7pt apart on a
// 714pt edge-to-edge pitch (BAND 46% over five rows). A 48pt circle plus a 3pt
// gap plus an 11pt label ends 41.5pt below its own centre, and the next row's
// circle starts at 41.7pt. 52 overlaps by 5pt and puts a name across a face.
const CHIP = 48;
/** How far a marker hangs outside the circle. */
const MARK = 17;
/** How wide a name may run before it truncates — five of these across 68m. */
// ⚠⚠ THE LABEL TAKES ITS OWN COLUMN, WHICH IS WHY THERE IS NO `NAME_W` ANY
// MORE. A fixed 62pt was narrower than every column on the pitch — even the
// tightest, a five-man row at 79pt — so names were being clipped in space we
// already had. And a single constant cannot be right for both: a back four
// gets 98pt each, a midfield five gets 79. 'Alexander-Arnold' needs ~92pt,
// which fits the first and not the second, and he is a full-back.
//
// So the width is `100 / row.length` percent of the pitch, and the label is
// centred by a matching negative margin. Each player gets exactly the room his
// row affords him.

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
        homeRating={teamRating(playerStats, 'home')}
        awayRating={teamRating(playerStats, 'away')}
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
  homeRating,
  awayRating,
}: {
  home: MatchLineup | null;
  away: MatchLineup | null;
  homeName: string;
  awayName: string;
  palette: { home: string; away: string };
  statsById: StatsById;
  onPick: Pick;
  homeRating: number | null;
  awayRating: number | null;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        // ⚠⚠ EDGE TO EDGE, AND NOT FOR THE PIXELS. A pitch is a DIAGRAM, not a
        // card: the frame a card provides exists to say "this is one thing,
        // separate from its neighbours", and a full green football pitch says
        // that far louder than a radius and a shadow can. The frame was doing
        // no work. It does buy room — +11% linear, +24% area on a 393pt phone —
        // and that room is what lets the circles carry a face and its markers
        // without colliding, but the reason is that the card was never the
        // right container. The BENCHES stay cards: those are lists, and a list
        // needs a frame to say where it starts and stops.
        //
        // ⚠ NO `cardRadius` ANY MORE. The touchline used to be handed the
        // card's corner radius so the two ran concentric — see the long note in
        // `PitchMarkings`. With no card there is no corner to follow, so it
        // falls back to its own floor. The measuring `onLayout` went with it.
        overflow: 'hidden',
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
        <PitchMarkings />
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
      <TeamTag lineup={home} name={homeName} corner="top" rating={homeRating} />
      <TeamTag lineup={away} name={awayName} corner="bottom" rating={awayRating} />
    </View>
  );
}

function TeamTag({
  lineup,
  name,
  corner,
  rating,
}: {
  lineup: MatchLineup | null;
  name: string;
  corner: 'top' | 'bottom';
  /** The side's average, over the players who actually played. */
  rating: number | null;
}) {
  const badge = formatRating(rating);
  const badgeColor = ratingColor(rating);
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: 12,
        ...(corner === 'top' ? { top: 10 } : { bottom: 10 }),
        maxWidth: '62%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {/* ⚠ THE SIDE'S AVERAGE, and it sits beside the name rather than in a
          header band so it stays in the corner that side defends — the same
          reasoning that put the name here. Absent before kickoff, when nobody
          has been rated. */}
      {badge && badgeColor ? (
        <View
          style={{
            paddingHorizontal: 7,
            paddingVertical: 3,
            borderRadius: 9,
            backgroundColor: badgeColor,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.9)',
          }}
        >
          <RNText
            style={{
              fontFamily: MONO_BOLD,
              fontSize: 12,
              color: '#FFFFFF',
              fontVariant: ['tabular-nums'],
            }}
          >
            {badge}
          </RNText>
        </View>
      ) : null}
      <View style={{ flexShrink: 1 }}>
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
          const colPct = 100 / row.length;
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
                width: `${colPct}%`,
                // ⚠ Centred on its point rather than hung off the left edge, so
                // a row of three and a row of five share the same axis.
                marginLeft: `${-colPct / 2}%`,
                marginTop: -CHIP / 2,
                alignItems: 'center',
              })}
            >
              <Shirt player={player} tint={tint} stat={stat} />
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
  stat,
}: {
  player: LineupPlayer;
  tint: string;
  stat: MatchPlayerStat | undefined;
}) {
  const rating = stat?.rating ?? null;
  const badge = formatRating(rating);
  const badgeColor = ratingColor(rating);
  const photo = playerPhotoUrl(player.playerId);
  const marks = stat ? playerMarkers(stat) : null;

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
          // ⚠ The photograph is a square laid over a circle; without this it
          // renders as a square and the club colour disappears behind it.
          overflow: 'hidden',
        }}
      >
        {/* ⚠⚠ THE NUMBER IS THE FALLBACK, AND IT IS DRAWN FIRST ON PURPOSE.
            `expo-image` renders nothing at all when a source 404s — the
            provider answers an unknown id with HTML, not a placeholder — so
            the shirt number sitting UNDERNEATH is what shows through, with no
            error handling and no flash of an empty circle while it loads.
            Photo covers number; no photo, number stays. */}
        {/* ⚠ THE RATING RIDES ON THE SHIRT, and this is the whole feature: the
            numbers are readable without tapping anything, and the tap is for
            depth rather than for discovery. It hangs OUTSIDE the circle so it
            never covers the squad number.

            ⚠ It needs its own white hairline. The three band fills measure
            1.6–2.6:1 against the pitch green — fine for white text ON them,
            hopeless as an edge against grass. Same reasoning as the shirt. */}
        {/* ⚠ EVERY MARKER HANGS OUTSIDE THE CIRCLE, never over the face. The
            photograph is the thing that identifies the player at a glance, and
            a badge across it costs more than the badge is worth.

            ⚠ THE ICONS ARE THE FACTS TAB'S OWN. `sportscourt.fill` is a goal
            and `rectangle.portrait.fill` a card there too — two tabs on one
            screen must not use two vocabularies for the same event. */}
        {marks?.cameOff || marks?.cameOn ? (
          <View
            style={{
              position: 'absolute',
              top: -4,
              left: -MARK / 2,
              width: MARK,
              height: MARK,
              borderRadius: MARK / 2,
              backgroundColor: marks.cameOff ? '#B91C1C' : '#15803D',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.9)',
            }}
          >
            {/* ⚠ NO MINUTE. The timeline cannot be joined to a player — its
                names are abbreviated and carry no id — and a starter's minutes
                equal the real substitution minute only 83.8% of the time. The
                arrow is certain; the minute would be wrong one time in six. */}
            <RNText style={{ fontFamily: MONO_BOLD, fontSize: 10, color: '#FFFFFF' }}>
              {marks.cameOff ? '↓' : '↑'}
            </RNText>
          </View>
        ) : null}

        {marks?.yellow || marks?.red ? (
          <View
            style={{
              position: 'absolute',
              // Left-middle: the sub arrow has the top-left and the armband
              // the bottom-left, so a booking sits between them.
              top: CHIP / 2 - 7,
              left: -MARK / 2 + 2,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon
              name="rectangle.portrait.fill"
              size={13}
              color={marks.red ? 'red' : 'amber'}
              filled
            />
          </View>
        ) : null}

        {marks && (marks.goals > 0 || marks.assists > 0) ? (
          <View
            style={{
              position: 'absolute',
              bottom: -3,
              right: -MARK / 2,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 1,
              paddingHorizontal: 3,
              paddingVertical: 2,
              borderRadius: MARK / 2,
              backgroundColor: '#FFFFFF',
              borderWidth: 1,
              borderColor: 'rgba(0,0,0,0.12)',
            }}
          >
            {/* ⚠ ONLY A GOAL GETS THE BALL. There is no boot in this icon set,
                and borrowing another glyph for an assist would invent a symbol
                nobody has been taught — an assist reads as 'A' instead. */}
            {marks.goals > 0 ? (
              <Icon name="sportscourt.fill" size={11} color="ink" filled />
            ) : (
              <RNText style={{ fontFamily: MONO_BOLD, fontSize: 9, color: '#111827' }}>A</RNText>
            )}
            {(marks.goals > 0 ? marks.goals : marks.assists) > 1 ? (
              <RNText
                style={{
                  fontFamily: MONO_BOLD,
                  fontSize: 9,
                  color: '#111827',
                  fontVariant: ['tabular-nums'],
                }}
              >
                {marks.goals > 0 ? marks.goals : marks.assists}
              </RNText>
            ) : null}
          </View>
        ) : null}

        {marks?.captain ? (
          <View
            style={{
              position: 'absolute',
              bottom: -3,
              left: -MARK / 2 + 1,
              width: 14,
              height: 14,
              borderRadius: 7,
              backgroundColor: '#F5C518',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: 'rgba(255,255,255,0.9)',
            }}
          >
            <RNText style={{ fontFamily: MONO_BOLD, fontSize: 8, color: '#111827' }}>C</RNText>
          </View>
        ) : null}

        {badge && badgeColor ? (
          <View
            style={{
              position: 'absolute',
              // ⚠ FIVE MARKERS, FIVE POSITIONS, NO OVERLAP: arrow top-left,
              // rating top-right, card left-middle, armband bottom-left,
              // goal bottom-right. Two badges in one corner is how a pitch
              // stops being readable at a glance — this collided on the first
              // pass, with the rating and the goal both bottom-right.
              top: -5,
              right: -MARK / 2,
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
        {/* ⚠ THE FALLBACK IS DRAWN FIRST AND IS NO LONGER THE NUMBER — that
            moved to the label. `expo-image` renders nothing when a source
            fails (the provider answers an unknown id with HTML), so whatever
            sits underneath shows through with no error handling. A position
            letter is the most useful thing to be left with. */}
        <RNText
          style={{
            fontFamily: MONO_BOLD,
            fontSize: 15,
            color: 'rgba(255,255,255,0.9)',
          }}
        >
          {player.pos ?? '·'}
        </RNText>

        {photo ? (
          <Image
            source={{ uri: photo }}
            style={{ position: 'absolute', width: CHIP, height: CHIP }}
            // `cover`, not `contain`: these are 150×150 head-and-shoulders
            // cutouts, and letterboxing one inside a circle wastes the little
            // room a face has.
            contentFit="cover"
            // Twenty-two of these load at once. Disk cache means that cost is
            // paid on the first look at a fixture and never again.
            cachePolicy="memory-disk"
            transition={120}
          />
        ) : null}
      </View>
      {/* ⚠⚠ THE NUMBER LIVES HERE NOW, NOT IN THE CIRCLE. It used to be drawn
          inside the shirt purely as the photograph's fallback — and since every
          player has a photograph, it was covered on every single one. We were
          rendering it and then hiding it. Beside the surname it is visible
          again, which is also how the reference app reads.

          ⚠ AND IT DOES NOT TRUNCATE. `numberOfLines` is gone: a name too long
          for its column wraps to a second line rather than losing its ending,
          because the ending is the part that identifies a player. */}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
        {player.number !== null && player.number !== undefined ? (
          <RNText
            style={{
              fontFamily: MONO_BOLD,
              fontSize: 10,
              color: 'rgba(255,255,255,0.72)',
              fontVariant: ['tabular-nums'],
              textShadowColor: 'rgba(0,0,0,0.6)',
              textShadowRadius: 3,
            }}
          >
            {player.number}
          </RNText>
        ) : null}
        <RNText
          numberOfLines={1}
          style={{
            fontFamily: fontFamilies.semibold,
            // ⚠ ONE STEP DOWN FOR A LONG NAME, so it fits rather than wraps. A
            // second line would end 56pt below the row's centre and land on the
            // next row's face — the vertical budget is 41.7pt. Shrinking is the
            // only way to keep 'Alexander-Arnold' whole in a five-man row, and
            // keeping it whole is the point: the ending is what identifies him.
            fontSize: surnameOf(player.name).length > 13 ? 9.5 : 11,
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
