// Post-auth onboarding screen — the soft-ask for push notifications.
// Frames what notifications will be used for with three concrete examples
// before triggering the OS prompt. iOS only gives one shot at the native
// `requestPermissionsAsync()` prompt, so we only fire it when the user
// taps "Turn on" — "Maybe later" exits without burning that one-shot.

import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { HugeiconsIcon } from '@hugeicons/react-native';
import {
  BubbleChatIcon,
  ClockAlertIcon,
  FootballIcon,
  Notification01Icon,
} from '@hugeicons/core-free-icons';

import { Button, Text } from '@/components/ui';
import { markNotificationsPrompted } from '@/lib/useOnboardingProgress';
import { usePushPermission } from '@/lib/usePushPermission';
import { useTheme, withOpacity } from '@/theme';

const EXAMPLES = [
  {
    icon: ClockAlertIcon,
    title: 'Picks lock in 2 hours',
    body: 'Last call before your group-stage picks lock at kickoff.',
  },
  {
    icon: FootballIcon,
    title: 'GOAL — Mbappé 67’',
    body: 'France 1–1 Brazil. Live match alerts as they happen.',
  },
  {
    icon: BubbleChatIcon,
    title: 'Sarah replied to your banter',
    body: 'Stay in the conversation without opening the app.',
  },
];

export default function OnboardingNotifications() {
  const theme = useTheme();
  const { request } = usePushPermission();
  const [submitting, setSubmitting] = useState(false);

  // Both CTAs mark the prompted flag and let the root-layout gate route
  // out of (onboarding) — Turn on triggers the OS prompt first.
  const finish = useCallback(() => {
    void markNotificationsPrompted();
  }, []);

  const handleTurnOn = useCallback(async () => {
    setSubmitting(true);
    try {
      await request();
    } finally {
      setSubmitting(false);
      finish();
    }
  }, [request, finish]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <View
          style={{
            flex: 1,
            paddingHorizontal: theme.spacing.xl,
            paddingTop: theme.spacing.xxl,
            gap: theme.spacing.xxl,
          }}
        >
          <View style={{ alignItems: 'center', gap: theme.spacing.lg }}>
            <View
              style={{
                width: 96,
                height: 96,
                borderRadius: 48,
                backgroundColor: withOpacity(theme.colors.primary, 0.12),
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <HugeiconsIcon
                icon={Notification01Icon}
                size={48}
                color={theme.colors.primary}
                strokeWidth={2}
              />
            </View>

            <Text variant="caption" color="primary" align="center">
              Stay in the game
            </Text>

            <Text variant="pageTitle" color="ink" align="center">
              Don’t miss a pick deadline or a comeback goal.
            </Text>

            <Text variant="body" color="slate" align="center">
              Pick which alerts you get later in Settings — turn on
              notifications to get started.
            </Text>
          </View>

          <View style={{ gap: theme.spacing.md }}>
            {EXAMPLES.map((example, i) => (
              <View
                key={i}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spacing.lg,
                  padding: theme.spacing.lg,
                  borderRadius: theme.radii.md,
                  backgroundColor: theme.colors.surface,
                }}
              >
                <View
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    backgroundColor: withOpacity(theme.colors.primary, 0.12),
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <HugeiconsIcon
                    icon={example.icon}
                    size={22}
                    color={theme.colors.primary}
                    strokeWidth={2}
                  />
                </View>
                <View style={{ flex: 1, gap: theme.spacing.xxs }}>
                  <Text variant="cardTitle" color="ink">
                    {example.title}
                  </Text>
                  <Text variant="body" color="slate">
                    {example.body}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <SafeAreaView edges={['bottom']}>
          <View
            style={{
              paddingHorizontal: theme.spacing.xl,
              paddingTop: theme.spacing.lg,
              paddingBottom: theme.spacing.lg,
              gap: theme.spacing.md,
            }}
          >
            <Button
              title="Turn on notifications"
              size="lg"
              fullWidth
              loading={submitting}
              onPress={handleTurnOn}
            />
            <Pressable
              onPress={finish}
              disabled={submitting}
              hitSlop={8}
              style={({ pressed }) => ({
                alignItems: 'center',
                paddingVertical: theme.spacing.md,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <Text variant="cardTitle" color="slate">
                Maybe later
              </Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </SafeAreaView>
    </View>
  );
}
