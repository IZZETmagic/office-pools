// Roster review — who gets a saved spot in the pool being created (Decision 2, as amended).
//
// Done by whoever starts the pool, because any member can. Everyone is ticked except people we have
// a reason for, and the reason is SHOWN: "Didn't play last season", "Hasn't opened SportPool in 6
// months". Nobody unticked is told — they stay in the crew and can still join with the link.
//
// ⚠ SAVED SPOTS NEVER EXCEED WHAT THE POOL HOLDS (decision 7). A new pool is Free (10, so 9 spots
// besides the starter). Done is disabled while too many are ticked: a saved spot is a promise, and
// the eleventh person must never find out at the door. The server refuses the same thing.
//
// Not here yet: "Go Plus" from inside the create flow. A pool's tier is bought after it exists, so
// for now the sheet says what Free holds and lets the starter choose.

import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text, useSheetChrome } from '@/components/ui';
import { seatSelectionProblem } from '@/lib/createPool';
import { personName, plural, type RosterView } from '@/lib/crews';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

import { CrewFace } from './CrewFace';

export type RosterReviewSheetHandle = { open: (current: string[]) => void; close: () => void };

export const RosterReviewSheet = forwardRef<
  RosterReviewSheetHandle,
  { crewName: string; roster: RosterView | undefined; loading: boolean; onDone: (chosen: string[]) => void }
>(function RosterReviewSheet({ crewName, roster, loading, onDone }, ref) {
  const theme = useTheme();
  const sheetChrome = useSheetChrome('surface');
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  useImperativeHandle(ref, () => ({
    open: (current) => {
      setChosen(new Set(current));
      sheetRef.current?.expand();
    },
    close: () => sheetRef.current?.close(),
  }));

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.4} />,
    [],
  );

  const spots = roster?.spots ?? null;
  const problem = seatSelectionProblem(chosen.size, spots);

  function toggle(id: string) {
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={['85%']}
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      {...sheetChrome}
    >
      <BottomSheetScrollView
        contentContainerStyle={{
          paddingHorizontal: theme.spacing.xl,
          paddingTop: theme.spacing.sm,
          paddingBottom: insets.bottom + theme.spacing.lg,
          gap: theme.spacing.lg,
        }}
      >
        <View style={{ gap: 4 }}>
          <Text variant="cardTitle">Who gets a saved spot</Text>
          <Text variant="body" color="slate">
            {crewName}
            {roster ? ` · ${plural(roster.rows.length + 1, 'person', 'people')}` : ''}
          </Text>
        </View>

        {spots !== null ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              padding: theme.spacing.md,
              borderRadius: theme.radii.md,
              backgroundColor: problem ? theme.colors.redLight : withOpacity(theme.colors.primary, 0.08),
            }}
          >
            <RNText style={{ flex: 1, fontFamily: fontFamilies.medium, fontSize: 13, lineHeight: 18, color: problem ? theme.colors.red : theme.colors.ink }}>
              {problem ?? `A Free pool holds ${spots + 1}, so ${spots} can have a saved spot. Anyone else can still join with the link while there’s room.`}
            </RNText>
            <RNText style={{ fontFamily: fontFamilies.black, fontSize: 14, color: problem ? theme.colors.red : theme.colors.green }}>
              {chosen.size} of {spots}
            </RNText>
          </View>
        ) : null}

        {loading || !roster ? (
          <View style={{ padding: theme.spacing.xl, alignItems: 'center' }}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : roster.rows.length === 0 ? (
          <Text variant="body" color="slate">
            It’s just you in this crew so far — add people from the crew page, or share the pool’s link once it’s made.
          </Text>
        ) : (
          <View style={{ borderRadius: theme.radii.md, borderWidth: 1, borderColor: theme.colors.mist, overflow: 'hidden' }}>
            {roster.rows.map((r, i) => {
              const on = chosen.has(r.userId);
              return (
                <Pressable
                  key={r.userId}
                  onPress={() => toggle(r.userId)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={personName(r)}
                >
                  {i > 0 ? <View style={{ height: 0.5, backgroundColor: withOpacity(theme.colors.slate, 0.15) }} /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.md }}>
                    <Icon name={on ? 'checkmark.circle.fill' : 'circle'} size={22} tint={on ? theme.colors.primary : theme.colors.silver} />
                    <CrewFace person={r} size={32} />
                    <View style={{ flex: 1 }}>
                      <RNText numberOfLines={1} style={{ fontFamily: fontFamilies.bold, fontSize: 14, color: theme.colors.ink }}>
                        {personName(r)}
                      </RNText>
                      {r.reasons.length ? (
                        <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 11.5, color: theme.colors.amber }}>{r.reasons.join(' · ')}</RNText>
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        <Text variant="body" color="slate" style={{ fontSize: 12, lineHeight: 17 }}>
          Nobody unticked is told — they stay in the crew. Everyone ticked gets a saved spot and one reminder from
          SportPool before picks lock.
        </Text>

        <Pressable
          onPress={() => {
            if (problem) return;
            onDone([...chosen]);
            sheetRef.current?.close();
          }}
          disabled={!!problem}
          accessibilityRole="button"
          style={({ pressed }) => ({
            height: 52,
            borderRadius: theme.radii.md,
            backgroundColor: theme.colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: problem ? 0.5 : pressed ? 0.85 : 1,
          })}
        >
          <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 16, color: '#FFFFFF' }}>Done</RNText>
        </Pressable>
      </BottomSheetScrollView>
    </BottomSheet>
  );
});
