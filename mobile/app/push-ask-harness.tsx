// DEV ONLY — the notifications-off ask (lib/pushAsk.ts), on demand.
//
// A phone with notifications on never draws the popup, the Activity card or the Off tile, and the
// phone this is reviewed on has them on. So: the popup in both states, and a switch that redraws
// the real card and the real tile in either state until it is turned off or the app reloads.
//
// ⚠⚠ IT NEVER ASKS THE PHONE. iOS shows its own permission box once per install, and spending that
// on a preview can't be undone short of reinstalling. Nothing here reads or requests the
// permission (a guard test holds it to that): the popup's buttons only close it, and in a preview
// the card's button says what it would have done.
//
// Reached from Profile → Developer, because deep links don't reach a physical phone.

import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Alert, ScrollView, Text as RNText, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PushAskSheet } from '@/components/notifications';
import { Text, Pressable } from '@/components/ui';
import type { PushAskMode } from '@/lib/pushAsk';
import { resetPushAsk, setPushAskPreview, usePushAskPreview } from '@/lib/usePushAsk';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

const STATES: { mode: PushAskMode; label: string; hint: string }[] = [
  { mode: 'prompt', label: 'Never asked', hint: '“Turn on” shows the phone’s own permission box' },
  { mode: 'settings', label: 'Said no before', hint: '“Open Settings”, with the steps' },
];

export default function PushAskHarness() {
  const theme = useTheme();
  const preview = usePushAskPreview();
  const [sheet, setSheet] = useState<{ mode: PushAskMode; visible: boolean } | null>(null);
  const closeSheet = () => setSheet((s) => (s ? { ...s, visible: false } : s));

  const card = (children: ReactNode) => (
    <View style={{ gap: theme.spacing.md, padding: theme.spacing.lg, borderRadius: theme.radii.md, backgroundColor: theme.colors.surface }}>
      {children}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: theme.spacing.xl, gap: theme.spacing.lg, paddingBottom: theme.spacing.xxl }}>
          <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'flex-start' }}>
            <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 15, color: theme.colors.primary }}>‹ Back</RNText>
          </Pressable>
          <View style={{ gap: theme.spacing.sm }}>
            <Text variant="caption" color="primary">
              Harness · dev only
            </Text>
            <Text variant="pageTitle" color="ink">
              Notifications off
            </Text>
            <Text variant="body" color="slate">
              What a member whose notifications are off sees. Nothing here asks your phone for
              permission.
            </Text>
          </View>

          {card(
            <>
              <Text variant="cardTitle">The popup</Text>
              <Text variant="body" color="slate">
                Once per phone, on Home, after the launch screen. Its buttons only close it here.
              </Text>
              {STATES.map((s) => (
                <Option key={s.mode} label={s.label} hint={s.hint} onPress={() => setSheet({ mode: s.mode, visible: true })} />
              ))}
            </>,
          )}

          {card(
            <>
              <Text variant="cardTitle">The card and the tile</Text>
              <Text variant="body" color="slate">
                Redraws the card on Activity and the Notifications tile on Profile, until you switch
                back or the app reloads.
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
                <Chip label="Your phone" active={preview === null} onPress={() => setPushAskPreview(null)} />
                {STATES.map((s) => (
                  <Chip key={s.mode} label={s.label} active={preview === s.mode} onPress={() => setPushAskPreview(s.mode)} />
                ))}
              </View>
            </>,
          )}

          {card(
            <>
              <Text variant="cardTitle">Start over on this phone</Text>
              <Text variant="body" color="slate">
                Forgets that this phone had the popup or closed the card. They only come back if
                notifications are really off.
              </Text>
              <Option
                label="Forget the popup and the card"
                hint="On a phone with notifications off, the popup opens next time Home does"
                onPress={() => {
                  void resetPushAsk().then(() => Alert.alert('Done', 'This phone hasn’t had the popup or closed the card.'));
                }}
              />
            </>,
          )}
        </ScrollView>
      </SafeAreaView>

      {sheet ? (
        <PushAskSheet visible={sheet.visible} mode={sheet.mode} onTurnOn={closeSheet} onClose={closeSheet} />
      ) : null}
    </View>
  );
}

function Option({ label, hint, onPress }: { label: string; hint: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        gap: 2,
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.md + 2,
        borderRadius: theme.radii.sm,
        backgroundColor: pressed ? withOpacity(theme.colors.primary, 0.16) : withOpacity(theme.colors.primary, 0.08),
      })}
    >
      <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 15, color: theme.colors.primary }}>{label}</RNText>
      <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 12, color: theme.colors.slate }}>{hint}</RNText>
    </Pressable>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => ({
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.xs + 3,
        borderRadius: theme.radii.pill,
        backgroundColor: active ? theme.colors.ink : theme.colors.mist,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 12, color: active ? theme.colors.snow : theme.colors.slate }}>
        {label}
      </RNText>
    </Pressable>
  );
}
