// =============================================================
// The scout report, during the practice matchweek
// =============================================================
// ⭐ THE REAL SHELL AND THE REAL CARDS. `ScoutSheet` is the gorhom shell the live picker uses —
// same height, same drag-to-dismiss, same picker visible behind it — and every card is built
// from `components/scouting/kit`, which is the only place a scout card may be composed from. What
// this file does NOT do is fetch: `MatchScoutSheet` reads `useMatchScout(fixtureId)`, and a 2018/19
// practice fixture has no row to read. The data comes from the checked-in seed instead.
//
// ⚠ IT LIVES IN `components/onboarding/`, NOT `components/scouting/`. `lib/__tests__/scoutKit.guard.test.ts`
// forbids any file inside `components/scouting/` from reaching for `theme.colors.green|red|accent|amber`
// or redefining a kit name. Nothing here does either, but the folder it sits in is what the guard
// greps — so a practice-only variant belongs outside it rather than inside asking for an exception.
//
// ⚠ THE CALL-OUT AT THE BOTTOM IS LOAD-BEARING. The scout report is a Season Pass feature, and the
// onboarding sequence is *use it → hear what it is → get asked once, weeks later, at a real moment*.
// This card is the "use it" half announcing itself; take it out and the trial screen later arrives
// as a cold pitch instead of a reminder.
// =============================================================

import { View } from 'react-native';

import {
  FixtureSubject,
  FormStrip,
  ScoutCard,
  ScoutCardBody,
  ScoutHeader,
  SplitBar,
  StatTiles,
} from '@/components/scouting/kit';
import { ScoutSheet, ScoutSheetBody } from '@/components/scouting/ScoutSheet';
import { Text } from '@/components/ui';
import { clubColorFromCrestUrl } from '@/lib/design/clubColors';
import { crestUrl, type PracticeFixture } from '@/lib/onboarding/practiceMatchweek';
import { useTheme, withOpacity } from '@/theme';

export function PracticeScoutSheet({
  fixture,
  onClose,
}: {
  /** Null closes the sheet. The sheet stays mounted so the close animates. */
  fixture: PracticeFixture | null;
  onClose: () => void;
}) {
  const theme = useTheme();

  const home = fixture ? crestUrl(fixture.home.id) : null;
  const away = fixture ? crestUrl(fixture.away.id) : null;

  return (
    <ScoutSheet open={fixture !== null} onClose={onClose}>
      {fixture ? (
        <ScoutSheetBody>
          <ScoutHeader detail={`Matchweek ${6} · practice`}>
            <FixtureSubject
              home={{ name: fixture.home.shortName, crestUrl: home }}
              away={{ name: fixture.away.shortName, crestUrl: away }}
            />
          </ScoutHeader>

          <ScoutCard title="Form">
            <ScoutCardBody>
              <FormRow label={`${fixture.home.shortName} at home`} outcomes={fixture.scout.homeForm} />
              <FormRow label={`${fixture.away.shortName} away`} outcomes={fixture.scout.awayForm} />
            </ScoutCardBody>
          </ScoutCard>

          <ScoutCard title="The pairing">
            <ScoutCardBody>
              <StatTiles
                tiles={[
                  { value: fixture.scout.commonScore, label: 'Most common scoreline', tone: 'finding' },
                  { value: fixture.scout.avgGoals, label: 'Average goals' },
                  { value: `${fixture.scout.bttsPct}%`, label: 'Both scored' },
                ]}
              />
            </ScoutCardBody>
          </ScoutCard>

          {/* ⚠ "Platform-wide" is not decoration. A member reading a split assumes the narrowest
              scope they can think of, and for the crowd bar the narrowest scope — their own pool —
              is exactly the one it must never be mistaken for. */}
          <ScoutCard title="The crowd" scope="Platform-wide">
            <ScoutCardBody>
              <SplitBar
                caption="How everyone picked it"
                counts={fixture.scout.crowd}
                names={{
                  home: fixture.home.shortName,
                  draw: 'Draw',
                  away: fixture.away.shortName,
                }}
                keyFormat="pct"
                clubColors={
                  // ⚠ Each club's own colour, resolved the same way the picker behind this sheet
                  // resolves it, so the bar and the buttons cannot disagree.
                  clubColorFromCrestUrl(home) && clubColorFromCrestUrl(away)
                    ? {
                        home: clubColorFromCrestUrl(home) as string,
                        away: clubColorFromCrestUrl(away) as string,
                      }
                    : null
                }
              />
            </ScoutCardBody>
          </ScoutCard>

          <View
            style={{
              borderRadius: theme.radii.md,
              padding: theme.spacing.lg,
              backgroundColor: withOpacity(theme.colors.primary, 0.08),
              borderWidth: 1,
              borderColor: withOpacity(theme.colors.primary, 0.28),
            }}
          >
            <Text variant="body" color="slate">
              <Text variant="body" color="ink" style={{ fontWeight: '700' }}>
                This is the scout report.
              </Text>{' '}
              It is free for the practice week — we’ll tell you what it normally costs once you’ve
              actually used it.
            </Text>
          </View>
        </ScoutSheetBody>
      ) : null}
    </ScoutSheet>
  );
}

function FormRow({ label, outcomes }: { label: string; outcomes: ('W' | 'D' | 'L')[] }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
      <Text variant="body" color="ink" style={{ flex: 1 }}>
        {label}
      </Text>
      <FormStrip outcomes={outcomes} />
    </View>
  );
}
