import { Image, Text as RNText, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { getCompetitionMarkPng, getPoolStripe } from '@/lib/design/competition';
import { fontFamilies, useTheme } from '@/theme';

// =============================================================
// WHICH LEAGUE THESE GAMES BELONG TO
// =============================================================
// The Results list is scoped to the member's own pools, so it holds one
// competition for most members and several for anyone in pools across leagues.
// Until this existed it held several with nothing to say so: a Saturday rendered
// Toulouse–Lille directly above Real Sociedad–Celta, twenty crests deep, and the
// only way to tell Ligue 1 from La Liga was to already know the clubs.
//
// `ResultsMatch.competition` has carried the caption since league fixtures
// arrived — the Results tab simply never read it.
//
// ## Why a chip and not just the words
//
// The mark PNGs are WHITE ON TRANSPARENT (see `getCompetitionMarkPng`) because
// they were built to sit on the pool card's coloured rail. Drawn straight onto
// the light surface here they would be invisible. So the chip is the rail's own
// gradient, miniaturised — which is also why it reads as the same object a
// member already knows from their pool cards rather than as new furniture.
//
// ⚠ SUBORDINATE TO THE DAY, ON PURPOSE. The day header above it is bold 14 ink;
// this is 11 uppercase slate. The day is the thing being navigated and the
// competition is a division inside it — swapping that weighting makes the list
// read as a league table that happens to be dated.
// =============================================================

type Props = {
  /** The caption. A block with none renders nothing — see below. */
  competition: string | null;
  /** `external_league_id`, for the brand colour and the mark. */
  competitionId: number | null;
  /** Whether a hairline separates this block from the one above it. */
  divided: boolean;
};

export function CompetitionHeader({ competition, competitionId, divided }: Props) {
  const theme = useTheme();

  // ⚠ A NULL CAPTION RENDERS NOTHING, rather than a placeholder. That block is
  // the World Cup, which carries no league id and no competition name, and the
  // honest options are its real name or silence. Inferring "World Cup" from the
  // absence of a league id is the derivation Decision 14 exists to stop, and a
  // header reading "Other" over the 2026 final would be worse than no header.
  if (!competition) return null;

  const stripe = getPoolStripe(competitionId);
  const mark = getCompetitionMarkPng(competitionId);

  return (
    <View>
      {divided ? (
        <View
          style={{
            height: 0.5,
            marginHorizontal: 14,
            backgroundColor: theme.colors.mist,
          }}
        />
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 6,
        }}
      >
        <LinearGradient
          colors={stripe}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{
            width: 18,
            height: 18,
            borderRadius: 5,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {mark ? (
            <Image
              source={mark}
              style={{ width: 12, height: 12 }}
              resizeMode="contain"
              // Already white-on-transparent — the same file the rail draws.
              fadeDuration={0}
            />
          ) : null}
        </LinearGradient>
        <RNText
          numberOfLines={1}
          style={{
            flex: 1,
            fontFamily: fontFamilies.bold,
            fontSize: 11,
            letterSpacing: 0.6,
            textTransform: 'uppercase',
            color: theme.colors.slate,
          }}
        >
          {competition}
        </RNText>
      </View>
    </View>
  );
}
