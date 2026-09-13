import { Image } from 'expo-image';
import { Text as RNText, View } from 'react-native';

import { MONO_BOLD } from '@/components/match/matchDisplay';
import { Text } from '@/components/ui';
import type { PlayerForm, SideScout } from '@/lib/api';
import { playerPhotoUrl } from '@/lib/playerStats';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

import { ScoutCard, ScoutBlurb } from './ScoutCard';
import { useScoutPalette } from './tone';

// =============================================================
// Who is actually playing well
// =============================================================
// ## ⚠ TWO LISTS, BECAUSE THEY ANSWER DIFFERENT QUESTIONS
//
// IN FORM is an AVERAGE and is minutes-qualified — a substitute's 9.0 over
// eleven minutes would otherwise top it every week. DANGER is a TOTAL and is
// deliberately not qualified, because four goals in three starts is exactly who
// a card about danger should name. Showing them under one heading would make one
// of the two floors look arbitrary.
//
// ## ⚠⚠ THE SHORT PEEK LIST IS GONE, AND THAT WAS A DELIBERATE REVERSAL
//
// `MatchScoutSheet` used to draw a single cross-club top four here, with a note
// arguing "ONE LIST, NOT TWO COLUMNS — THIS IS THE PEEK, NOT THE TAB". Ryan,
// 2026-09-12: the binoculars sheet and the match-detail tab must be the same
// report, and the fuller card is the one that survives. The sheet's 72% height
// is unchanged; the content simply scrolls further.
//
// ⚠ THE GOALS COLUMN COMES FROM THE TIMELINE, not from the player rows the
// ratings come from. The two disagree at source — 428 against 430 across 146
// fixtures — and only `match_events` is authoritative. Nothing here may add a
// goals figure from another source.
//
// ## ⚠ NO GOLD ON THIS CARD, AND THAT IS THE GRAMMAR WORKING
//
// The rating pill used to be green for every rating — 6.2 and 8.4 alike — so
// green carried no information on the one card where it was also load-bearing
// two cards above. The danger pill was gold, which is "the finding".
//
// Both are now neutral. These rows are a RANKED LIST: the top one is already
// first, and position says so without spending a colour. The first row in each
// section takes a heavier tint, which is hierarchy for free.
// =============================================================

export function PeopleCard({
  home,
  away,
  homeName,
  awayName,
}: {
  home: SideScout;
  away: SideScout;
  homeName: string;
  awayName: string;
}) {
  // ⚠ A FIXTURE WITH NOBODY RATED SKIPS BOTH SIDE CARDS RATHER THAN PRINTING
  // TWO IDENTICAL APOLOGIES. In August that is both clubs, and two stacked
  // "nobody rated yet" panels read as a broken screen. One club rated and the
  // other not IS worth saying — that is a fact about the two squads — so the
  // empty state lives on the side card rather than here.
  const anyRated =
    home.inForm.length > 0 ||
    away.inForm.length > 0 ||
    home.dangerMen.length > 0 ||
    away.dangerMen.length > 0;

  if (!anyRated) {
    return (
      <ScoutCard title="People">
        <ScoutBlurb>Nobody has played enough minutes to be rated yet.</ScoutBlurb>
      </ScoutCard>
    );
  }

  return (
    <>
      <SideCard title={homeName} scout={home} />
      <SideCard title={awayName} scout={away} />
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
    </>
  );
}

function SideCard({ title, scout }: { title: string; scout: SideScout }) {
  const empty = scout.inForm.length === 0 && scout.dangerMen.length === 0;

  if (empty) {
    return (
      <ScoutCard title={title}>
        <ScoutBlurb>Not enough minutes played this season to rate anybody yet.</ScoutBlurb>
      </ScoutCard>
    );
  }

  return (
    <ScoutCard title={title}>
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
    </ScoutCard>
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
  const palette = useScoutPalette();
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
      <PlayerFace player={player} />

      <View style={{ flex: 1, minWidth: 0 }}>
        <RNText
          numberOfLines={1}
          style={{
            fontFamily: fontFamilies.semibold,
            fontSize: 13,
            color: theme.colors.ink,
          }}
        >
          {player.name}
        </RNText>
        <Text variant="detail" color="slate">
          {player.position ? `${positionName(player.position)} · ` : ''}
          {player.appearances} app{player.appearances === 1 ? '' : 's'}
          {metric === 'rating' ? ` · ${player.minutes} min` : involvementDetail(player)}
        </Text>
      </View>

      <View
        style={{
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: theme.radii.xs,
          // ⚠ WEIGHT, NOT HUE. The leader of each list gets a heavier wash of the
          // same neutral — hierarchy without spending a colour that means
          // something else two cards away.
          backgroundColor: withOpacity(palette.neutral.fg, first ? 0.14 : 0.07),
        }}
      >
        <RNText
          style={{
            fontFamily: MONO_BOLD,
            fontSize: 13,
            color: palette.neutral.fg,
            fontVariant: ['tabular-nums'],
          }}
        >
          {metric === 'rating' ? player.rating.toFixed(2) : `${involvements}`}
        </RNText>
      </View>
    </View>
  );
}

/** How big a face is on a scout row. */
const FACE = 32;

/**
 * The player's photograph.
 *
 * ## ⚠⚠ THE FALLBACK IS DRAWN FIRST, UNDERNEATH — NOT AS AN ELSE BRANCH
 *
 * `expo-image` renders NOTHING when a source fails, and the provider answers an
 * unknown id with HTML rather than a 404. So there is no error event to hang an
 * `onError` on: whatever sits beneath the image simply shows through. A
 * conditional fallback — the shape the old peek list used — leaves an empty
 * circle instead, because the ternary has already chosen the image branch by the
 * time the load fails. Same call `LineupsTab` makes, and it carries the note.
 *
 * ⚠ THE POSITION IS THE FALLBACK, NOT THE CLUB CREST. The peek list used a crest
 * because its one list mixed both sides; here the card title already names the
 * club, so a crest would repeat it. The position is the next most useful thing
 * about a face you cannot see.
 *
 * ⚠ `cover`, NOT `contain`. These are 150×150 head-and-shoulders cutouts and
 * letterboxing one inside a circle wastes the little room a face has.
 *
 * ⚠ AND THE IMAGES COST NO PROVIDER QUOTA. `media.api-sports.io` is not the API
 * host — no key is sent and the daily counter does not move. The app already
 * hotlinks this exact CDN for club crests.
 */
function PlayerFace({ player }: { player: PlayerForm }) {
  const theme = useTheme();
  const photo = playerPhotoUrl(player.externalPlayerId);

  return (
    <View
      style={{
        width: FACE,
        height: FACE,
        borderRadius: theme.radii.pill,
        backgroundColor: theme.colors.mist,
        alignItems: 'center',
        justifyContent: 'center',
        // ⚠ THE CIRCLE MUST CLIP. The photograph is a square and without this it
        // renders as one, corners and all.
        overflow: 'hidden',
      }}
    >
      <RNText
        style={{ fontFamily: MONO_BOLD, fontSize: 10, color: theme.colors.slate }}
      >
        {player.position ?? '\u00b7'}
      </RNText>
      {photo ? (
        <Image
          source={{ uri: photo }}
          style={{ position: 'absolute', width: FACE, height: FACE }}
          contentFit="cover"
          // Twelve can load at once on a two-club card; the disk cache means that
          // cost is paid on the first look at a fixture and never again.
          cachePolicy="memory-disk"
          transition={120}
          // Decorative — the name sits beside it.
          alt=""
        />
      ) : null}
    </View>
  );
}

/**
 * "3 goals, 1 assist" — spelled out rather than shown as "3+1".
 *
 * ⚠ A MEMBER READING "4" NEXT TO A NAME NEEDS TO KNOW WHAT KIND OF FOUR IT IS.
 * Goals and assists are not interchangeable to anybody choosing a scoreline, and
 * the shorthand hides which one this player actually does.
 */
function involvementDetail(p: PlayerForm): string {
  const parts: string[] = [];
  if (p.goals > 0) parts.push(`${p.goals} goal${p.goals === 1 ? '' : 's'}`);
  if (p.assists > 0) parts.push(`${p.assists} assist${p.assists === 1 ? '' : 's'}`);
  return parts.length > 0 ? ` · ${parts.join(', ')}` : '';
}

function positionName(p: 'G' | 'D' | 'M' | 'F'): string {
  return p === 'G' ? 'GK' : p === 'D' ? 'DEF' : p === 'M' ? 'MID' : 'FWD';
}
