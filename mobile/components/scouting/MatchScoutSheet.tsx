import { ActivityIndicator, Pressable, Text as RNText, View } from 'react-native';

import { ScoutReport } from '@/components/scouting/ScoutReport';
import { ScoutSheet, ScoutSheetBody } from '@/components/scouting/ScoutSheet';
import { FixtureSubject, ScoutHeader } from '@/components/scouting/kit';
import { Text } from '@/components/ui';
import { useMatchScout } from '@/lib/useMatchScout';
import { fontFamilies, useTheme } from '@/theme';

// =============================================================
// A peek under the hood
// =============================================================
// Slides up over the prediction flow when somebody taps the binoculars on a
// fixture. The picker is still behind it when it closes.
//
// ## ⚠⚠ THIS FILE IS NOW A SHELL, AND THAT IS THE WHOLE POINT
//
// It used to hold a thousand lines of cards. Those cards are `ScoutReport`,
// which the match-detail Scout tab renders too — the two doors were separate
// implementations off separate endpoints, and the same fixture told you
// different things depending on which one you came through. Ryan, 2026-09-12:
// they should be the exact same.
//
// What stays here is everything that is about being a SHEET: the gorhom shell,
// the height, the loading and error states, and the header.
//
// ⚠ THE SHELL IS `ScoutSheet` — gorhom, so it can be thrown back down with a
// drag, the way the Banter sheet is. Ryan, 2026-09-10.
//
// ⚠ 72%, AND IT STAYS 72% EVEN THOUGH THE REPORT GREW. A dossier is something
// you read; this is something you check, and leaving the picker visible behind
// it is the whole difference between a peek and a page. The taller report simply
// scrolls further — the height was never about how much there is to say.
// =============================================================

export function MatchScoutSheet({
  /**
   * Null closes the sheet.
   *
   * ⚠ THE SHEET STAYS MOUNTED AND DISMISSES, rather than unmounting — that is
   * what lets the close ANIMATE instead of vanishing. `useMatchScout` does not
   * fetch on a null id, so a closed sheet costs nothing but a render.
   *
   * ⚠ ONE SHEET PER SCREEN, NOT PER ROW. The picker draws ten fixtures and a
   * sheet per card would hold ten of these.
   */
  fixtureId,
  onClose,
}: {
  fixtureId: string | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { data, loading, error, refresh } = useMatchScout(fixtureId);

  return (
    <ScoutSheet open={!!fixtureId} onClose={onClose} height="72%">
      {/* ⚠ THE SAME HEADER THE DOSSIER USES, with a fixture in the subject slot
          instead of a member. See `ScoutHeader`. */}
      <ScoutHeader detail={data?.fixture.venue}>
        {data ? (
          <FixtureSubject home={data.fixture.home} away={data.fixture.away} />
        ) : null}
      </ScoutHeader>

      <ScoutSheetBody>
        {loading ? (
          <View style={{ paddingTop: 40, alignItems: 'center' }}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : error ? (
          <Pressable
            onPress={() => void refresh()}
            style={{ marginHorizontal: 20, paddingVertical: 28, alignItems: 'center', gap: 8 }}
          >
            <RNText
              style={{ fontFamily: fontFamilies.bold, fontSize: 15, color: theme.colors.ink }}
            >
              Could not load the scout report
            </RNText>
            <Text variant="detail" color="slate">
              Tap to try again
            </Text>
          </Pressable>
        ) : data ? (
          <ScoutReport data={data} />
        ) : null}
      </ScoutSheetBody>
    </ScoutSheet>
  );
}
