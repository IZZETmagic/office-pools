// "Keep this group together?" → Save as crew.
//
// Opened from the crew_save card in Activity → Needs you. The pool's admin names the crew (the
// pool's own name is the suggestion) and saves; everyone who played becomes a member — nobody is
// asked anything now, and the yes comes later, when they take a saved spot (Decision 2).
//
// ⚠ It says, in words, that saving makes the pool PRIVATE. A crew pool is never listed in Discover
// (Decision 6 / migration 154), and 84 of the finished World Cup groups were Public — so this is a
// change to their pool, and the admin is told before they tap, not after.
//
// Same shell as every other sheet (useSheetChrome) and JoinPoolSheet's keyboard handling, which is
// the pattern that holds up with the Android keyboard inside a gorhom sheet.

import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetTextInput,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text, useSheetChrome } from '@/components/ui';
import { saveCrewFromPool } from '@/lib/api';
import { hapticFailure, hapticSuccess } from '@/lib/haptics';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

const NAME_MAX = 60; // matches 154's CHECK and lib/crews/rules.CREW_NAME_MAX

export type SaveCrewSheetHandle = {
  open: (p: { poolId: string; suggestedName: string; people: number }) => void;
  close: () => void;
};

export const SaveCrewSheet = forwardRef<SaveCrewSheetHandle, { onSaved: () => void }>(function SaveCrewSheet(
  { onSaved },
  ref,
) {
  const theme = useTheme();
  const sheetChrome = useSheetChrome('surface');
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet | null>(null);
  const [poolId, setPoolId] = useState<string | null>(null);
  const [people, setPeople] = useState(0);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    open: (p) => {
      setPoolId(p.poolId);
      setPeople(p.people);
      setName(p.suggestedName.slice(0, NAME_MAX));
      setError(null);
      setSaving(false);
      sheetRef.current?.expand();
    },
    close: () => sheetRef.current?.close(),
  }));

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.4} />
    ),
    [],
  );

  const trimmed = name.replace(/\s+/g, ' ').trim();
  const canSave = !!poolId && trimmed.length > 0 && !saving;

  async function save() {
    if (!canSave || !poolId) return;
    setSaving(true);
    setError(null);
    try {
      await saveCrewFromPool(poolId, trimmed);
      // ⚠ Before the close, not after: the sheet is about to animate away and
      // the buzz belongs to the tap that sent it.
      hapticSuccess();
      sheetRef.current?.close();
      onSaved();
    } catch (e) {
      hapticFailure();
      setError(e instanceof Error ? e.message : 'Could not save the crew.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      enableDynamicSizing
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      {...sheetChrome}
    >
      <BottomSheetView
        style={{
          paddingHorizontal: theme.spacing.xl,
          paddingTop: theme.spacing.sm,
          paddingBottom: insets.bottom + theme.spacing.md,
          gap: theme.spacing.lg,
        }}
      >
        <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: theme.radii.xl,
              backgroundColor: withOpacity(theme.colors.primary, 0.1),
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="person.3.fill" color="primary" size={26} weight="semibold" />
          </View>
          <Text variant="cardTitle" align="center">
            Keep this group together?
          </Text>
          <Text variant="body" color="slate" align="center">
            Save these {people} as a crew. Next time any of you starts a pool, everyone gets a saved spot — nobody has
            to be chased.
          </Text>
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ fontFamily: fontFamilies.black, fontSize: 9.5, letterSpacing: 0.6, color: theme.colors.slate }}>
            CREW NAME
          </Text>
          <BottomSheetTextInput
            value={name}
            onChangeText={(v) => {
              setName(v.slice(0, NAME_MAX));
              setError(null);
            }}
            placeholder="Name your crew"
            placeholderTextColor={theme.colors.slate}
            autoCapitalize="words"
            autoCorrect={false}
            maxLength={NAME_MAX}
            returnKeyType="done"
            onSubmitEditing={() => void save()}
            style={{
              backgroundColor: theme.colors.mist,
              borderRadius: theme.radii.md,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.md,
              fontFamily: fontFamilies.semibold,
              fontSize: 16,
              color: theme.colors.ink,
            }}
          />
        </View>

        <View
          style={{
            flexDirection: 'row',
            gap: theme.spacing.sm,
            padding: theme.spacing.md,
            borderRadius: theme.radii.md,
            backgroundColor: theme.colors.mist,
          }}
        >
          <Icon name="lock.fill" size={14} tint={theme.colors.slate} />
          <Text variant="body" color="slate" style={{ flex: 1, fontSize: 12.5, lineHeight: 18 }}>
            Crew pools are private, so this pool won’t be listed in Discover. The competition’s over — nothing else
            about it changes.
          </Text>
        </View>

        {error ? (
          <View style={{ padding: theme.spacing.md, borderRadius: theme.radii.md, backgroundColor: theme.colors.redLight }}>
            <Text variant="body" color="red" align="center">
              {error}
            </Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => void save()}
          disabled={!canSave}
          accessibilityRole="button"
          style={({ pressed }) => ({
            height: 52,
            borderRadius: theme.radii.md,
            backgroundColor: theme.colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: !canSave ? 0.5 : pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ fontFamily: fontFamilies.bold, fontSize: 16, color: '#FFFFFF' }}>
            {saving ? 'Saving…' : 'Save as a crew'}
          </Text>
        </Pressable>
      </BottomSheetView>
    </BottomSheet>
  );
});
