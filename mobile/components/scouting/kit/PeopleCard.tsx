import { Text as RNText, View } from 'react-native';

import { MONO_BOLD } from '@/components/match/matchDisplay';
import { Text } from '@/components/ui';
import type { PlayerForm, SideScout } from '@/lib/api';
import { clubOnSurface } from '@/lib/design/clubColors';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

import { ScoutCard, ScoutBlurb } from './ScoutCard';
import { useFixtureColors } from './fixtureColors';
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
  homeCrestUrl,
  awayCrestUrl,
}: {
  home: SideScout;
  away: SideScout;
  homeName: string;
  awayName: string;
  /** For the number's colour, and for the away side's change kit. */
  homeCrestUrl: string | null;
  awayCrestUrl: string | null;
}) {
  // ⚠ A FIXTURE WITH NOBODY RATED SKIPS BOTH SIDE CARDS RATHER THAN PRINTING
  // TWO IDENTICAL APOLOGIES. In August that is both clubs, and two stacked
  // "nobody rated yet" panels read as a broken screen. One club rated and the
  // other not IS worth saying — that is a fact about the two squads — so the
  // empty state lives on the side card rather than here.
  const colors = useFixtureColors(homeCrestUrl, awayCrestUrl);
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
      {/* ⚠ THE FIXTURE RULE, NOT TWO CLUB LOOKUPS. Both cards are on one screen,
          so if the two clubs clash the away side's numbers take its change
          colour — the same call the header and the form card above already
          made. `useFixtureColors` is what guarantees all three agree. */}
      <SideCard title={homeName} scout={home} colour={colors?.home ?? null} />
      <SideCard title={awayName} scout={away} colour={colors?.away ?? null} />
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

function SideCard({
  title,
  scout,
  colour,
}: {
  title: string;
  scout: SideScout;
  /** The club's colour, already through the fixture rule — see `PeopleCard`. */
  colour: string | null;
}) {
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
          <PlayerRow key={p.externalPlayerId} player={p} first={i === 0} colour={colour} />
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

function PlayerRow({
  player,
  first,
  colour,
}: {
  player: PlayerForm;
  first: boolean;
  colour: string | null;
}) {
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
      <PlayerMark player={player} colour={colour} />

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

/**
 * The player, as the shirt number.
 *
 * ⚠⚠ THIS IS THE APPROVED ANSWER, NOT A NEW ONE. drafts/2026-09-14_chosen_design.html
 * §6: "the people card uses the shirt number as the typography, coloured by
 * club". It replaced a photograph on 2026-09-19 and spent a day showing the
 * POSITION LETTER instead — which was only ever the photograph's fallback, and
 * identifies a role rather than a player: every forward on the card looked the
 * same.
 *
 * ⚠ TYPOGRAPHY, NOT A BADGE. The number is set large and in the club's own
 * colour, with the bar muted beside it. A disc would make it a second crest;
 * the point of the approved design is that the number IS the mark.
 *
 * ⚠ THE BAR IS AT 35% AND THAT IS DELIBERATE. Both it and the number carry the
 * same club, and two statements of one fact at full strength is how the scout
 * palette stopped meaning anything (see `SplitBar`). The number is the one that
 * is read; the bar is what makes the column scannable.
 *
 * ⚠ THE POSITION IS THE FALLBACK NOW. `shirtNumber` is nullable on the wire and
 * absent from an older API, so a player with no number still gets a mark rather
 * than a gap — the letter is simply demoted from the answer to the exception.
 */
const MARK_W = 26;

function PlayerMark({ player, colour }: { player: PlayerForm; colour: string | null }) {
  const theme = useTheme();
  // ⚠⚠ LIFTED FOR THE SURFACE, NOT USED RAW (Ryan, 2026-09-20: "the teams that
  // have black in the light mode should have white in the dark or we will not
  // be able to see the number"). The number is TEXT in the club's own colour,
  // and against the dark card 77 of our 96 clubs fail even the 3:1 asked of a
  // shape — Newcastle measures 1.01:1, which is not a dark number, it is no
  // number. `clubOnSurface` keeps the hue and raises the lightness, so Everton
  // stays a blue; a black club has no hue to keep and goes to white.
  const tint = clubOnSurface(colour ?? theme.colors.slate, theme.colors.surface);
  const number = player.shirtNumber ?? null;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
      <RNText
        // ⚠ RIGHT-ALIGNED IN A FIXED SLOT so 7 and 47 put their bars on the same
        // line down the card. Five rows of a wandering bar reads as a mistake.
        style={{
          width: MARK_W,
          textAlign: 'right',
          fontFamily: MONO_BOLD,
          fontSize: 17,
          color: tint,
          fontVariant: ['tabular-nums'],
        }}
      >
        {number ?? player.position ?? '\u00b7'}
      </RNText>
      <View
        style={{
          width: 4,
          height: 26,
          borderRadius: 999,
          backgroundColor: withOpacity(tint, 0.35),
        }}
      />
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
