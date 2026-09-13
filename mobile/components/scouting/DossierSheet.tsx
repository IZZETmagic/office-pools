import { ActivityIndicator, Pressable, Text as RNText, View } from 'react-native';

import { Dossier } from '@/components/scouting/Dossier';
import { ScoutSheet, ScoutSheetBody } from '@/components/scouting/ScoutSheet';
import { MemberSubject, ScoutHeader } from '@/components/scouting/kit';
import { Text } from '@/components/ui';
import { useDossier } from '@/lib/useDossier';
import { fontFamilies, useTheme } from '@/theme';

// =============================================================
// The scout report, as a sheet
// =============================================================
// ⚠ IT WAS A ROUTE AND IT SHOULD NOT HAVE BEEN. A pushed screen gets the
// router's own chrome, stacks on the back history, and — on a duel — takes you
// away from the thing you opened it to think about. A scout report is something
// you glance at with the duel still behind it. Ryan, 2026-09-09.
//
// ## ⚠⚠ THE HEADER IS NOW THE FIXTURE SHEET'S, EXACTLY
//
// This used to open with a 220pt purple `LinearGradient`, an 80pt centred avatar
// and a centred three-line block. The fixture sheet opened with a slate eyebrow,
// a left-aligned row and a hairline rule. Same feature, two front doors, and the
// header was the single biggest visual difference between them. Ryan,
// 2026-09-12: identical, and the fixture header is the one to keep.
//
// So the gradient, the 80pt avatar and the centred column are gone. What
// survives is the thing they were FOR: the member's own colour, which now rides
// on the 22pt avatar inline beside their name — the same slot, doing the same
// job, that the fixture header gives a crest. Still `gradientForUser`, still
// frozen, so they are the same colour here, in Banter and on the duel card.
//
// ## ⚠ STILL NO RANK IN THE HEADER, AND THAT IS A STANDING DECISION
//
// Ryan removed it on 2026-09-10: "a pool position is not what this one is about
// — the report is how somebody picks, and their standing is a different fact
// that the season total already covers." The 2026-09-12 mockup drew one back in;
// the earlier decision wins until it is reopened deliberately.
//
// It is also the safe call. `ScoutHeader`'s detail slot would be the natural
// home for "3rd of 12", and in Last Man Standing the stored `current_rank` is
// entry-id ORDER rather than a position — so a rank there would be confidently
// wrong for one whole mode. `StandingCard`, the first card in the report,
// already shows rank properly behind its own `rank == null` guard.
//
// ⚠ THE SHEET IS TALLER THAN THE FIXTURE PEEK — 88% against 72%, and that
// difference stays. A dossier is something you sit and read; the peek opens over
// the picker and leaves it visible behind. Same shell, different height, and the
// caller owns the difference.
// =============================================================

export function DossierSheet({
  poolId,
  /** Null closes the sheet. */
  entryId,
  onClose,
}: {
  poolId: string;
  entryId: string | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { data, loading, error, refresh } = useDossier(poolId, entryId ?? undefined);

  const displayName = data?.entry_name?.trim()
    ? data.entry_name
    : (data?.full_name ?? 'Scout report');

  // What places the report: whose pool, which competition, how many points.
  //
  // ⚠ THE SEASON TOTAL, NEVER THE RANK — see the file header.
  const detail =
    [
      data?.pool?.name,
      data?.competition ? `${data.competition.name} ${data.competition.season}` : null,
      data?.standing ? `${data.standing.total_points} pts` : null,
    ]
      .filter(Boolean)
      .join(' · ') || null;

  return (
    <ScoutSheet open={!!entryId} onClose={onClose} height="88%">
      <ScoutHeader detail={detail}>
        {data ? <MemberSubject name={displayName} userId={data.user_id} /> : null}
      </ScoutHeader>

      <ScoutSheetBody>
        {loading ? (
          <View style={{ paddingTop: 48, alignItems: 'center' }}>
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
          <Dossier data={data} dossier={data.dossier} isSelf={data.is_self} />
        ) : null}
      </ScoutSheetBody>
    </ScoutSheet>
  );
}
