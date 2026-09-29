import { LinearGradient } from 'expo-linear-gradient';
import { Text as RNText, StyleSheet, View } from 'react-native';

import { MemberAvatar } from '@/components/avatar/MemberAvatar';
import { Text } from '@/components/ui';
import { getInitials, gradientForUser } from '@/lib/avatarGradient';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

import { Crest } from './Crest';
import { useFixtureColors } from './fixtureColors';

// =============================================================
// One header, two subjects
// =============================================================
// ## ⚠⚠ THE TWO SHEETS HAD NOTHING IN COMMON AT THE TOP, AND NOW THEY ARE ONE
//
// The fixture sheet led with a slate eyebrow, a left-aligned row of crests and a
// hairline rule. The dossier led with a 220pt purple `LinearGradient`, a centred
// 62pt avatar and a centred name. Same feature, two front doors, and the header
// was the single biggest visual difference between them. Ryan, 2026-09-12:
// identical, and the fixture header is the one to keep.
//
// So the shape is fixed — EYEBROW · SUBJECT ROW · DETAIL LINE · HAIRLINE — and
// only the subject slot differs: two crests and a "v" for a match, one avatar
// for a member.
//
// ## ⚠ THE MEMBER'S COLOUR SURVIVES, IT JUST MOVED
//
// `DossierSheet`'s note argued the tint is "what makes this read as *them*
// rather than as a panel", and that argument holds — it is the mechanism that
// changed, not the intent. A fixture header carries identity through its crests;
// the person equivalent is the avatar inline beside the name, still keyed on
// `gradientForUser` and still frozen, so they are the same colour here, in
// Banter and on the duel card.
//
// ## ⚠ NO CLOSE BUTTON AND NO GRAB HANDLE OF ITS OWN
//
// `ScoutSheet` draws a gorhom grab handle above this, the backdrop closes on a
// tap and a drag throws it down. A fourth way out would be clutter competing
// with the gesture the sheet was rebuilt to have.
// =============================================================

export function ScoutHeader({
  /**
   * The line under the subject — a venue for a fixture, a standing for a member.
   *
   * ⚠⚠ THE STANDING SLOT IS NOT SAFE FOR LAST MAN STANDING. A venue is always
   * printable; a rank is not. Stored `current_rank` in LMS is entry-id ORDER,
   * not a position, so a caller must pass `undefined` there rather than a
   * number. `StandingCard` already makes that call on `rank == null` — inherit
   * it, do not re-derive it.
   */
  detail,
  children,
}: {
  detail?: string | null;
  children: React.ReactNode;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        paddingTop: 18,
        paddingBottom: 14,
        paddingHorizontal: 20,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: withOpacity(theme.colors.mist, 0.8),
      }}
    >
      <Text variant="caption" color="slate">
        Scout report
      </Text>

      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}
      >
        {children}
      </View>

      {detail ? (
        <Text variant="detail" color="slate" style={{ marginTop: 4 }}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

/** The size both identity marks are drawn at. Crest and avatar must match. */
const MARK = 22;

/**
 * A fixture: two crests either side of the two names.
 *
 * ⚠ `flexShrink` ON THE NAMES, NOT ON THE CRESTS. "Brighton & Hove Albion v
 * Wolverhampton Wanderers" overflows a phone; the badges are what let a reader
 * identify the clubs once the names have ellipsed.
 */
export function FixtureSubject({
  home,
  away,
}: {
  home: { name: string; crestUrl: string | null };
  away: { name: string; crestUrl: string | null };
}) {
  const theme = useTheme();

  // ⚠ THE SAME FIXTURE RULE THE CARDS BELOW USE. The header names both clubs
  // and draws both bars; if it resolved each colour on its own it would
  // contradict the form card two inches underneath it, which does not.
  const colors = useFixtureColors(home.crestUrl, away.crestUrl);

  return (
    <>
      <Crest url={home.crestUrl} colour={colors?.home} size={MARK} />
      <RNText
        numberOfLines={1}
        style={{
          flexShrink: 1,
          fontFamily: fontFamilies.black,
          fontSize: 16,
          color: theme.colors.ink,
        }}
      >
        {home.name}
      </RNText>
      <Text variant="detail" color="slate">
        v
      </Text>
      <RNText
        numberOfLines={1}
        style={{
          flexShrink: 1,
          fontFamily: fontFamilies.black,
          fontSize: 16,
          color: theme.colors.ink,
        }}
      >
        {away.name}
      </RNText>
      <Crest url={away.crestUrl} colour={colors?.away} size={MARK} />
    </>
  );
}

/**
 * A member: their face, then their name.
 *
 * ⚠⚠ THE FACE IS DELIBERATELY BIGGER THAN A CREST, WHICH REVERSES THE RULE THIS
 * COMPONENT USED TO STATE. It read "the avatar is the same size as a crest — the
 * same slot doing the same job", and that held while the avatar was two letters
 * on a gradient: at 22pt a monogram is as much as a monogram can be. A FACE is
 * not that. At 22pt the features collapse and it reads as a coloured dot, which
 * is worse than the initials it replaced. Ryan, 2026-09-29: the avatar "and the
 * name should be a bit bigger".
 *
 * ⚠ THE CONSEQUENCE, ACCEPTED: the member door is now taller than the FIXTURE
 * door in this same kit, which still uses `MARK` crests. The old note warned
 * about exactly this — "the centred 62pt header creeping back in one component
 * at a time" — so if the fixture header ever looks stunted beside this one, the
 * answer is to size that one too, not to shrink this back.
 */
const FACE = 40;

export function MemberSubject({
  name,
  /** ⚠ Nullable — a detached entry has no user to be keyed on. */
  userId,
  avatarColour = null,
  avatarBuild = null,
}: {
  name: string;
  userId: string | null | undefined;
  /** The colour they picked; null falls back to the hash of their id. */
  avatarColour?: string | null;
  /** Their stored avatar; null renders the monogram, which is a correct answer. */
  avatarBuild?: unknown;
}) {
  const theme = useTheme();
  /**
   * ⚠ `avatarColour` was missing here too — `gradientForUser(userId)` alone hashes
   * the id and ignores a chosen colour, so this header disagreed with the same
   * person elsewhere. It matters more now that a face sits on top of it.
   */
  const gradient = userId ? gradientForUser(userId, avatarColour) : null;

  const monogram = (
    <View
      style={{
        width: FACE,
        height: FACE,
          borderRadius: theme.radii.pill,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.mist,
        }}
      >
        {gradient ? (
          <LinearGradient
            colors={[gradient[0], gradient[1]]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
        <RNText
          style={{
            fontFamily: fontFamilies.black,
            // ⚠ Scaled with the circle. It was 9 for a 22pt mark; left there, two
            // letters would float in the middle of a 40pt disc.
            fontSize: 15,
            // ⚠ WHITE IN BOTH THEMES, not a token. The avatar gradients are
            // fixed brand pairs that do not flip with the theme, so a token here
            // would drop below contrast in one mode or the other. This is the
            // same literal the dossier's own avatar used and the same one Banter
            // and the duel card draw — one person, one colour, everywhere.
            color: '#FFFFFF',
          }}
      >
        {getInitials(name)}
      </RNText>
    </View>
  );

  return (
    <>
      {userId ? (
        /**
         * ⭐ The subject's real face, with the gradient monogram behind it as the
         * fallback — that is what a member who has not built one keeps seeing, and
         * it is the same treatment every other scouting surface uses.
         */
        <MemberAvatar
          userId={userId}
          avatarBuild={avatarBuild}
          avatarColour={avatarColour}
          size={FACE}
          fallback={monogram}
        />
      ) : (
        monogram
      )}
      <RNText
        numberOfLines={1}
        style={{
          flexShrink: 1,
          fontFamily: fontFamilies.black,
          // ⚠ 16 -> 20, with the face. A 40pt circle beside 16pt type reads as an
          // avatar with a caption rather than a person with a name.
          fontSize: 20,
          color: theme.colors.ink,
        }}
      >
        {name}
      </RNText>
    </>
  );
}
