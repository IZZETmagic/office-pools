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
// ## ⚠⚠ ONE LIST PER CLUB — THE TOP FIVE IN FORM. Ryan, 2026-09-12.
//
// There used to be two sections, IN FORM (average rating, minutes-qualified) and
// DANGER (goals + assists, deliberately not qualified). Measured across 96 clubs
// they named mostly different people — about a third of names were shared — so
// the split was not redundant. It was, however, two rankings asking a reader to
// hold two ideas at once on a card they glance at mid-pick.
//
// The single list is ranked by FORM and carries goals and assists ON EACH ROW,
// so a scorer is still visible — he is ranked by how he has played rather than
// by what he has scored, and the reader can see both and decide.
//
// ⚠ SO THE MINUTES FLOOR NOW GOVERNS THE WHOLE CARD. A striker with four goals
// in three starts no longer appears at all until he clears 180 minutes. That is
// the honest cost of one ranking, and the footer states the floor.
//
// ⚠ `dangerMen` IS STILL ON THE PAYLOAD and nothing here reads it — an installed
// bundle that has not taken the OTA still does. See `TOP_DANGER` server-side.
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
  const anyRated = home.inForm.length > 0 || away.inForm.length > 0;

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
  const empty = scout.inForm.length === 0;

  if (empty) {
    return (
      <ScoutCard title={title}>
        <ScoutBlurb>Not enough minutes played this season to rate anybody yet.</ScoutBlurb>
      </ScoutCard>
    );
  }

  return (
    <ScoutCard title={title}>
      <Section label="In form">
        {scout.inForm.map((p, i) => (
          <PlayerRow key={p.externalPlayerId} player={p} first={i === 0} />
        ))}
      </Section>
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

function PlayerRow({ player, first }: { player: PlayerForm; first: boolean }) {
  const theme = useTheme();
  const palette = useScoutPalette();

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
          {playerLine(player)}
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
          {player.rating.toFixed(2)}
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
 * "MID · 6 apps · 2 goals · 1 assist"
 *
 * ⚠ GOALS AND ASSISTS ARE NAMED, NEVER SUMMED. A member reading "3" beside a
 * name needs to know what kind of three it is — the two are not interchangeable
 * to anybody choosing a scoreline, and "3+1" hides which one this player
 * actually does.
 *
 * ⚠ ZEROS ARE SHOWN. They used to be omitted, which made the line a different
 * shape on every row and left the reader unsure whether a missing figure meant
 * none or meant unknown. A defender with no goals has scored none, and saying so
 * costs four characters.
 *
 * ⚠ MINUTES CAME OFF. They were here to justify the ranking, and the card's
 * footer already states the 180-minute floor — repeating it on five rows a club
 * crowded out the two figures Ryan asked for.
 */
function playerLine(p: PlayerForm): string {
  const parts: string[] = [];
  if (p.position) parts.push(positionName(p.position));
  parts.push(`${p.appearances} app${p.appearances === 1 ? '' : 's'}`);
  parts.push(`${p.goals} goal${p.goals === 1 ? '' : 's'}`);
  parts.push(`${p.assists} assist${p.assists === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

function positionName(p: 'G' | 'D' | 'M' | 'F'): string {
  return p === 'G' ? 'GK' : p === 'D' ? 'DEF' : p === 'M' ? 'MID' : 'FWD';
}
