// The notifications popup — shown once per phone, on Home (see PushAskGate and lib/pushAsk.ts).
//
// It says what the member would actually get, and that it only asks once. Two states, because the
// way back differs:
//
//   prompt     "Turn on notifications" shows the OS's own permission box
//   settings   the OS won't show that box again, so "Open Settings" — and the steps
//
// ⚠ EVERY LINE IS SOMETHING WE SEND TODAY (checked against notification_types, 2026-10-07):
// matchweek_opened / lms_pick_open, lock_reminder / lms_pick_reminder (a day before and in the
// last two hours, only if unpicked), matchweek_completed, chat_message and chat_mention. Chat is
// listed because every push switch starts ON — leaving it out would make the busiest one a
// surprise. A new line here needs a notice behind it first.
//
// The shell is ActionSheet's: a transparent Modal so it covers the tab bar, a dim that FADES in
// place and a sheet that slides (Ryan, 2026-10-02), on core Animated's native driver.

import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, SHEET_HANDLE_WIDTH, SHEET_RADIUS } from '@/components/ui';
import type { PushAskMode } from '@/lib/pushAsk';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

const GETS: { icon: string; title: string; body: string }[] = [
  { icon: 'calendar', title: 'A matchweek opens', body: 'When it’s time to pick in your pools.' },
  {
    icon: 'clock.badge.exclamationmark.fill',
    title: 'Before it locks',
    body: 'A day before and in the last two hours, only if you haven’t picked.',
  },
  {
    icon: 'bubble.left.and.bubble.right.fill',
    title: 'Results and chat',
    body: 'When your week is scored, and when someone posts or @mentions you.',
  },
];

/** Where the switch is once the app is open in Settings — the deep link lands on SportPool's page. */
const SETTINGS_STEPS =
  Platform.OS === 'ios'
    ? 'In Settings, tap Notifications, then turn on Allow Notifications.'
    : 'In Settings, tap Notifications and switch them on.';

export function PushAskSheet({
  visible,
  mode,
  busy = false,
  onTurnOn,
  onClose,
}: {
  visible: boolean;
  mode: PushAskMode;
  /** The OS box is up; the button waits for its answer. */
  busy?: boolean;
  onTurnOn: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  // 0 = closed, 1 = open: the dim's opacity and the sheet's position, together.
  const progress = useRef(new Animated.Value(0)).current;
  // The Modal stays up while the close plays out, then goes.
  const [shown, setShown] = useState(visible);
  if (visible && !shown) setShown(true);

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 280 : 200,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && !visible) setShown(false);
    });
  }, [visible, progress]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [windowHeight, 0] });
  const blocked = mode === 'settings';
  // While the OS box is up, a tap on the dim must not close the sheet out from under the answer.
  const close = busy ? () => {} : onClose;

  return (
    <Modal visible={shown} animationType="none" transparent onRequestClose={close} statusBarTranslucent>
      <View style={{ flex: 1 }}>
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.4)', opacity: progress }]}
        />
        <Pressable onPress={close} style={{ flex: 1 }} accessibilityLabel="Not now" />
        <Animated.View
          accessibilityViewIsModal
          style={{
            transform: [{ translateY }],
            // ⚠ Never taller than the screen: on a small phone the body scrolls instead.
            maxHeight: windowHeight - insets.top - theme.spacing.xl,
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: SHEET_RADIUS,
            borderTopRightRadius: SHEET_RADIUS,
            // ⚠ A SQUIRCLE, AND CLIPPED — see `sheetChrome`.
            borderCurve: 'continuous' as const,
            overflow: 'hidden',
            paddingTop: theme.spacing.md,
            ...Platform.select({
              ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: -2 },
                shadowOpacity: 0.1,
                shadowRadius: 12,
              },
              android: { elevation: 16 },
              default: {},
            }),
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: SHEET_HANDLE_WIDTH,
              height: 4,
              borderRadius: 2,
              backgroundColor: theme.colors.silver,
              marginBottom: theme.spacing.lg,
            }}
          />
          <ScrollView
            bounces={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{
              paddingHorizontal: theme.spacing.xl,
              paddingBottom: Math.max(insets.bottom, theme.spacing.lg),
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                alignSelf: 'center',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: withOpacity(theme.colors.primary, 0.12),
                marginBottom: theme.spacing.md + 2,
              }}
            >
              <Icon name={blocked ? 'bell.slash' : 'bell.fill'} tint={theme.colors.primary} size={30} weight="semibold" />
            </View>
            <RNText
              accessibilityRole="header"
              style={{
                fontFamily: fontFamilies.black,
                fontSize: 24,
                lineHeight: 30,
                color: theme.colors.ink,
                textAlign: 'center',
                marginBottom: theme.spacing.xs + 2,
              }}
            >
              {blocked ? 'Notifications are off for SportPool' : 'Turn on notifications?'}
            </RNText>
            <RNText
              style={{
                fontFamily: fontFamilies.medium,
                fontSize: 15,
                lineHeight: 21,
                color: theme.colors.slate,
                textAlign: 'center',
                marginBottom: theme.spacing.lg + 2,
              }}
            >
              {blocked
                ? 'They’re switched off in your phone’s settings. With them on, your pools would tell you:'
                : 'Here’s what your pools would tell you.'}
            </RNText>

            <View style={{ gap: theme.spacing.sm, marginBottom: theme.spacing.xl - 4 }}>
              {GETS.map((g) => (
                <View
                  key={g.title}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.spacing.md + 2,
                    paddingVertical: theme.spacing.md,
                    paddingHorizontal: theme.spacing.md + 2,
                    borderRadius: theme.radii.md,
                    backgroundColor: theme.colors.snow,
                  }}
                >
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: withOpacity(theme.colors.primary, 0.12),
                    }}
                  >
                    <Icon name={g.icon} tint={theme.colors.primary} size={20} weight="semibold" />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 15, lineHeight: 20, color: theme.colors.ink }}>
                      {g.title}
                    </RNText>
                    <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 13, lineHeight: 18, color: theme.colors.slate }}>
                      {g.body}
                    </RNText>
                  </View>
                </View>
              ))}
            </View>

            <Button
              title={blocked ? 'Open Settings' : 'Turn on notifications'}
              size="lg"
              fullWidth
              loading={busy}
              onPress={onTurnOn}
            />
            <Pressable
              onPress={close}
              disabled={busy}
              hitSlop={8}
              accessibilityRole="button"
              style={({ pressed }) => ({
                alignItems: 'center',
                paddingVertical: theme.spacing.md,
                marginTop: theme.spacing.xs,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 15, color: theme.colors.slate }}>Not now</RNText>
            </Pressable>
            <RNText
              style={{
                fontFamily: fontFamilies.medium,
                fontSize: 12,
                lineHeight: 17,
                color: theme.colors.slate,
                textAlign: 'center',
                marginTop: theme.spacing.xs,
              }}
            >
              {blocked
                ? `${SETTINGS_STEPS} We only ask once.`
                : 'We only ask once. Pick exactly which ones in Profile → Notifications.'}
            </RNText>
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}
