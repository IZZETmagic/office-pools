import { useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, Text as RNText, View } from 'react-native';

import { MONO_BOLD } from '@/components/match/matchDisplay';
import { PlayerBadges } from '@/components/match/PlayerBadges';
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
import { groupByRow, rowDepths, surnameOf } from '@/lib/lineupLayout';
import {
  formatRating,
  indexByPlayerId,
  playerMarkers,
  playerPhotoUrl,
  ratingColor,
  subMinute,
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
  substitutionMinutes,
  homeName,
  awayName,
  homeTeam,
  awayTeam,
}: {
  lineups: MatchLineup[];
  /** Migration 141. Empty before a match, and on any client older than it. */
  playerStats: MatchPlayerStat[];
  /**
   * ⚠ ONLY THE MINUTES, AND ONLY TO CORROBORATE. A player cannot be joined to
   * the timeline — its names are abbreviated and carry no id — so this is used
   * to CONFIRM the minute his own row already implies, never to look one up.
   * See `subMinute`.
   */
  substitutionMinutes: number[];
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
  const substMinutes = useMemo(() => new Set(substitutionMinutes), [substitutionMinutes]);
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
      {/* ⚠ ONE BLOCK, NO GAPS. The bars and the pitch are a single object; the
          tab's own `gap` would put air between them and break that. */}
      <View>
        <TeamBar
          lineup={home}
          name={homeName}
          crestUrl={homeTeam?.flagUrl ?? null}
          tint={palette.home}
          rating={teamRating(playerStats, 'home')}
        />
        <Pitch
          home={home}
          away={away}
          homeName={homeName}
          awayName={awayName}
          palette={palette}
          statsById={statsById}
          onPick={setOpen}
          substMinutes={substMinutes}
        />
        <TeamBar
          lineup={away}
          name={awayName}
          crestUrl={awayTeam?.flagUrl ?? null}
          tint={palette.away}
          rating={teamRating(playerStats, 'away')}
        />
      </View>
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
  substMinutes,
}: {
  home: MatchLineup | null;
  away: MatchLineup | null;
  /** ⚠ Only to title the stat sheet — the BARS carry the names on screen now. */
  homeName: string;
  awayName: string;
  palette: { home: string; away: string };
  statsById: StatsById;
  onPick: Pick;
  substMinutes: ReadonlySet<number>;
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
        // ⚠ SOFTENED, AND THE NUMBER THAT MATTERED WAS SATURATION, NOT
        // LIGHTNESS. #1D7A45 was 76% saturated — a strong, almost synthetic
        // green. #417A57 is 47%, which reads as grass rather than as a colour
        // swatch, and it holds white text at 5.06:1 (the old one was 5.35, and
        // 4.5 is the floor for a 12pt name). Every lighter candidate I measured
        // fell under that floor: #4A9068 is 3.83:1, #52996F is 3.42:1. The
        // markings are unaffected — 30% white over the new green composites to
        // 1.77:1 against it, where the old one gave 1.78:1.
        backgroundColor: theme.mode === 'dark' ? '#1B3A2C' : '#417A57',
      }}
    >
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
        <PitchMarkings />
      </View>

      {/* Home across the top half, away across the bottom. */}
      <Half
        lineup={home}
        tint={palette.home}
        half="top"
        teamName={homeName}
        statsById={statsById}
        onPick={onPick}
        substMinutes={substMinutes}
      />
      <Half
        lineup={away}
        tint={palette.away}
        half="bottom"
        teamName={awayName}
        statsById={statsById}
        onPick={onPick}
        substMinutes={substMinutes}
      />

    </View>
  );
}

/**
 * The band above or below the pitch: rating, crest, name, formation.
 *
 * ⚠ ATTACHED, NOT FLOATING. It used to sit inside the pitch, in the corner each
 * side defends — which kept the caption beside the eleven it named, but cost
 * two things the reference app gets right: the words competed with the grass
 * and the markings behind them, and the corner is exactly where a full-back
 * stands. A band takes the words off the pitch entirely.
 *
 * ⚠ NO GAP ANYWHERE. "Attached" is the whole point: the bars and the pitch have
 * to read as one object, so they sit in a container of their own rather than in
 * the tab's `gap: 16` stack. Nothing here is rounded, because the pitch stopped
 * being a card — see the note on the pitch container.
 */
function TeamBar({
  lineup,
  name,
  crestUrl,
  tint,
  rating,
}: {
  lineup: MatchLineup | null;
  name: string;
  crestUrl: string | null;
  tint: string;
  rating: number | null;
}) {
  const theme = useTheme();
  const badge = formatRating(rating);
  const badgeColor = ratingColor(rating);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 10,
        // A shade off the grass, so the band separates from the pitch without
        // becoming a second colour on the screen.
        backgroundColor: theme.mode === 'dark' ? '#163024' : '#376A4A',
      }}
    >
      {/* ⚠ THE RATING LEADS, as it does in the reference — it is the one number
          on the band somebody is actually looking for. Absent before kickoff. */}
      {badge && badgeColor ? (
        <View
          style={{
            minWidth: 38,
            paddingHorizontal: 8,
            paddingVertical: 4,
            borderRadius: 9,
            backgroundColor: badgeColor,
            alignItems: 'center',
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
            {badge}
          </RNText>
        </View>
      ) : (
        // Keeps the name in the same place before and after kickoff, so the
        // band does not jump sideways when the first rating lands.
        <View style={{ width: 38 }} />
      )}

      {crestUrl ? (
        <Image
          source={{ uri: crestUrl }}
          style={{ width: 22, height: 22 }}
          contentFit="contain"
          cachePolicy="memory-disk"
          // Decorative: the club's name is the very next thing read out.
          alt=""
        />
      ) : (
        <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: tint }} />
      )}

      <RNText
        numberOfLines={1}
        style={{ fontFamily: fontFamilies.bold, fontSize: 15, color: '#FFFFFF', flexShrink: 1 }}
      >
        {name}
      </RNText>

      {lineup?.formation ? (
        <RNText
          style={{
            fontFamily: MONO_BOLD,
            fontSize: 13,
            color: 'rgba(255,255,255,0.78)',
            fontVariant: ['tabular-nums'],
          }}
        >
          {lineup.formation}
        </RNText>
      ) : null}
    </View>
  );
}

function Half({
  lineup,
  tint,
  half,
  teamName,
  statsById,
  onPick,
  substMinutes,
}: {
  lineup: MatchLineup | null;
  tint: string;
  half: 'top' | 'bottom';
  teamName: string;
  statsById: StatsById;
  onPick: Pick;
  substMinutes: ReadonlySet<number>;
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

  // ⚠ THE KEEPER IS THE FIRST ROW ONLY IF HE IS ALONE IN IT. `groupByRow` sorts
  // by the feed's `grid`, and a starter missing one lands in a trailing row of
  // his own — so a lineup with NO grids puts eleven players in "row one", and
  // pinning that to the goal line would stack the whole team on the keeper.
  const firstRowIsKeeper = rows.length > 1 && rows[0].length === 1;
  const depths = rowDepths(rows.length, firstRowIsKeeper);

  return (
    <>
      {rows.map((row, rowIndex) => {
        const depth = depths[rowIndex];
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
              // ⚠ THE PRESSABLE CARRIES THE LABEL, not the photograph. This is
              // the node a screen reader lands on, and it is the only place the
              // rating and the name can be read out together.
              accessibilityRole={stat ? 'button' : undefined}
              accessibilityLabel={
                stat
                  ? `${stat.playerName}, ${teamName}` +
                    (formatRating(stat.rating) ? `, rated ${formatRating(stat.rating)}` : '') +
                    '. Open his match statistics.'
                  : undefined
              }
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
              <Shirt
                player={player}
                tint={tint}
                stat={stat}
                subbedAt={stat ? subMinute(stat, substMinutes) : null}
              />
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
  subbedAt,
}: {
  player: LineupPlayer;
  tint: string;
  stat: MatchPlayerStat | undefined;
  subbedAt: number | null;
}) {
  const rating = stat?.rating ?? null;
  const photo = playerPhotoUrl(player.playerId);
  const marks = stat ? playerMarkers(stat) : null;

  return (
    <View style={{ alignItems: 'center', gap: 3 }}>
      {/* ⚠⚠ TWO VIEWS, AND THE SPLIT IS LOAD-BEARING. The circle must CLIP: the
          photograph is a square and without `overflow: hidden` it renders as
          one, corners and all. But every marker hangs OUTSIDE the circle on a
          negative offset, and while they were children of the clipping view
          they were clipped away — the rating, the card, the armband and the
          arrow all vanished silently the moment the photograph landed. This
          anchor does not clip, and the markers are siblings of the circle
          rather than children of it. */}
      <View style={{ width: CHIP, height: CHIP, alignItems: 'center', justifyContent: 'center' }}>
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
            overflow: 'hidden',
          }}
        >
          {/* ⚠ THE FALLBACK IS DRAWN FIRST. `expo-image` renders nothing when a
              source fails — the provider answers an unknown id with HTML — so
              whatever sits underneath shows through, with no error handling and
              no empty circle while it loads. */}
          <RNText style={{ fontFamily: MONO_BOLD, fontSize: 15, color: 'rgba(255,255,255,0.9)' }}>
            {player.pos ?? '\u00b7'}
          </RNText>
          {photo ? (
            <Image
              source={{ uri: photo }}
              style={{ position: 'absolute', width: CHIP, height: CHIP }}
              // `cover`, not `contain`: these are 150x150 head-and-shoulders
              // cutouts, and letterboxing one inside a circle wastes the little
              // room a face has.
              contentFit="cover"
              // Twenty-two load at once; the disk cache means that cost is paid
              // on the first look at a fixture and never again.
              cachePolicy="memory-disk"
              transition={120}
              // Decorative: the Pressable around it announces the player.
              alt=""
            />
          ) : null}
        </View>

        <PlayerBadges marks={marks} rating={rating} subMinute={subbedAt} chip={CHIP} />
      </View>


      {/* ⚠⚠ THE NUMBER LIVES HERE NOW, NOT IN THE CIRCLE. It used to be drawn
          inside the shirt purely as the photograph's fallback — and since every
          player has a photograph, it was covered on every single one. We were
          rendering it and then hiding it. Beside the surname it is visible
          again, which is also how the reference app reads.

          ⚠ AND IT DOES NOT TRUNCATE. `numberOfLines` is gone: a name too long
          for its column wraps to a second line rather than losing its ending,
          because the ending is the part that identifies a player. */}
      {/* ⚠ `center`, NOT `baseline`. The armband is a View and a View has no
          baseline, so it would drop out of alignment with the two texts. At
          10pt against 11pt the centre and the baseline are a fraction apart. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {stat?.isCaptain ? (
          <View
            style={{
              width: 13,
              height: 13,
              borderRadius: 6.5,
              backgroundColor: '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <RNText style={{ fontFamily: MONO_BOLD, fontSize: 8, color: '#111827' }}>C</RNText>
          </View>
        ) : null}
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
