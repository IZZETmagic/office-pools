// Consolidated notification preferences. Lifted out of the Profile tab
// so push permission, push categories, and email preferences live in one
// dedicated page instead of three scrolled-past sections.

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  DividedList,
  LoadingRow,
  NotificationRow,
  SectionWrapper,
  SettingsCard,
  SettingsHeader,
  type NotificationOption,
} from '@/components/settings';
import { Icon } from '@/components/ui';
import {
  fetchNotificationPrefs,
  fetchPushPrefs,
  updateNotificationPref,
  updatePushPref,
} from '@/lib/api';
import { usePushPermission, type PushPermissionStatus } from '@/lib/usePushPermission';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

const PUSH_PREF_OPTIONS: NotificationOption[] = [
  { key: 'POOL_ACTIVITY', label: 'Pool Activity', desc: 'Join/leave a pool, invitations', icon: 'person.3.fill' },
  { key: 'PREDICTIONS', label: 'Predictions', desc: 'Deadline reminders, confirmations', icon: 'target' },
  { key: 'MATCH_RESULTS', label: 'Match Results', desc: 'Per-match outcomes, matchday recaps', icon: 'sportscourt.fill' },
  { key: 'LEADERBOARD', label: 'Leaderboard', desc: 'Rank changes and shake-ups', icon: 'chart.bar.fill' },
  { key: 'ADMIN', label: 'Admin Alerts', desc: 'Settings changed, points adjusted', icon: 'gearshape.fill' },
  { key: 'COMMUNITY', label: 'Community', desc: '@mentions and pool chat', icon: 'bubble.left.and.bubble.right.fill' },
  { key: 'GAMIFICATION', label: 'Achievements', desc: 'Badges, level-ups, streaks, MVP', icon: 'rosette' },
];

const EMAIL_PREF_OPTIONS: NotificationOption[] = [
  { key: 'POOL_ACTIVITY', label: 'Pool Activity', desc: 'Join/leave pool, invitations', icon: 'person.3.fill' },
  { key: 'PREDICTIONS', label: 'Predictions', desc: 'Deadline reminders, confirmations', icon: 'target' },
  { key: 'MATCH_RESULTS', label: 'Match Results', desc: 'Results and points earned', icon: 'sportscourt.fill' },
  { key: 'LEADERBOARD', label: 'Leaderboard Updates', desc: 'Rank changes, weekly standings', icon: 'chart.bar.fill' },
  { key: 'ADMIN', label: 'Admin Notifications', desc: 'Settings changed, member removed', icon: 'gearshape.fill' },
  { key: 'COMMUNITY', label: 'Community & Mentions', desc: '@mentions in pool chat', icon: 'bubble.left.and.bubble.right.fill' },
];

export default function NotificationSettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <SettingsHeader title="Notifications" />
      <ScrollView
        contentContainerStyle={{
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.xxl + insets.bottom,
          gap: theme.spacing.xl,
        }}
      >
        <Intro />
        <PushPermissionSection />
        <PushCategoriesSection />
        <EmailPreferencesSection />
      </ScrollView>
    </View>
  );
}

function Intro() {
  const theme = useTheme();
  return (
    <View style={{ paddingHorizontal: theme.spacing.xl, gap: 4 }}>
      <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 13, color: theme.colors.slate }}>
        Control how SportPool reaches you. Push alerts handle the urgent
        stuff; email keeps you in the loop without opening the app.
      </RNText>
    </View>
  );
}

function PushPermissionSection() {
  const theme = useTheme();
  const { status, request, openSettings } = usePushPermission();

  const { label, ctaLabel, onCtaPress, statusBadge } = pushSectionState(
    status,
    request,
    openSettings,
    theme,
  );

  return (
    <SectionWrapper title="Push Notifications">
      <SettingsCard>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm + 4,
            paddingHorizontal: theme.spacing.md - 2,
            paddingVertical: theme.spacing.sm + 2,
          }}
        >
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              backgroundColor: theme.colors.primaryLight,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="bell.fill" tint={theme.colors.primary} size={13} weight="semibold" />
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <RNText
              style={{ fontFamily: fontFamilies.semibold, fontSize: 14, color: theme.colors.ink }}
            >
              Push Notifications
            </RNText>
            <RNText
              style={{ fontFamily: fontFamilies.medium, fontSize: 11, color: theme.colors.slate }}
            >
              {label}
            </RNText>
          </View>
          {statusBadge}
          {onCtaPress ? (
            <Pressable
              onPress={onCtaPress}
              hitSlop={8}
              style={({ pressed }) => ({
                paddingHorizontal: theme.spacing.sm + 2,
                paddingVertical: 6,
                borderRadius: theme.radii.pill,
                backgroundColor: withOpacity(theme.colors.primary, 0.12),
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <RNText
                style={{
                  fontFamily: fontFamilies.semibold,
                  fontSize: 13,
                  color: theme.colors.primary,
                }}
              >
                {ctaLabel}
              </RNText>
            </Pressable>
          ) : null}
        </View>
      </SettingsCard>
    </SectionWrapper>
  );
}

function pushSectionState(
  status: PushPermissionStatus | null,
  request: () => Promise<PushPermissionStatus>,
  openSettings: () => Promise<void>,
  theme: ReturnType<typeof useTheme>,
): {
  label: string;
  ctaLabel: string | null;
  onCtaPress: (() => void) | null;
  statusBadge: React.ReactNode;
} {
  if (status === null) {
    return { label: 'Checking…', ctaLabel: null, onCtaPress: null, statusBadge: null };
  }
  if (status === 'granted') {
    return {
      label: 'Receiving push notifications',
      ctaLabel: null,
      onCtaPress: null,
      statusBadge: (
        <Icon name="checkmark.circle.fill" tint={theme.colors.green} size={20} weight="regular" />
      ),
    };
  }
  if (status === 'denied') {
    return {
      label: 'Disabled — open Settings to re-enable',
      ctaLabel: 'Settings',
      onCtaPress: () => void openSettings(),
      statusBadge: null,
    };
  }
  return {
    label: 'Get alerts for mentions, results & deadlines',
    ctaLabel: 'Enable',
    onCtaPress: () => void request(),
    statusBadge: null,
  };
}

function PushCategoriesSection() {
  const { status } = usePushPermission();
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);

  // Only meaningful when push permission is granted — otherwise the toggles
  // would be misleading (the OS would suppress everything regardless).
  const enabled = status === 'granted';

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetchPushPrefs()
      .then((res) => {
        if (cancelled) return;
        setPrefs(res.preferences);
      })
      .catch((err) => console.warn('[settings/notifications] failed to load push prefs', err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  async function handleToggle(key: string) {
    const next = !(prefs[key] ?? true);
    setUpdatingKey(key);
    setPrefs((p) => ({ ...p, [key]: next }));
    try {
      await updatePushPref(key, next);
    } catch (err) {
      setPrefs((p) => ({ ...p, [key]: !next }));
      console.warn('[settings/notifications] push pref toggle failed', err);
    } finally {
      setUpdatingKey(null);
    }
  }

  if (!enabled) return null;

  return (
    <SectionWrapper title="Push Categories">
      {loading ? (
        <SettingsCard>
          <LoadingRow />
        </SettingsCard>
      ) : (
        <DividedList
          items={PUSH_PREF_OPTIONS}
          keyOf={(o) => o.key}
          render={(o) => (
            <NotificationRow
              option={o}
              enabled={prefs[o.key] ?? true}
              updating={updatingKey === o.key}
              onToggle={() => handleToggle(o.key)}
            />
          )}
        />
      )}
    </SectionWrapper>
  );
}

function EmailPreferencesSection() {
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchNotificationPrefs()
      .then((res) => {
        if (cancelled) return;
        setPrefs(res.preferences);
      })
      .catch((err) => {
        console.warn('[settings/notifications] failed to load notification prefs', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggle(key: string) {
    const next = !(prefs[key] ?? true);
    setUpdatingKey(key);
    setPrefs((p) => ({ ...p, [key]: next }));
    try {
      await updateNotificationPref(key, next);
    } catch (err) {
      setPrefs((p) => ({ ...p, [key]: !next }));
      console.warn('[settings/notifications] toggle failed', err);
    } finally {
      setUpdatingKey(null);
    }
  }

  return (
    <SectionWrapper title="Email Notifications">
      {loading ? (
        <SettingsCard>
          <LoadingRow />
        </SettingsCard>
      ) : (
        <DividedList
          items={EMAIL_PREF_OPTIONS}
          keyOf={(o) => o.key}
          render={(o) => (
            <NotificationRow
              option={o}
              enabled={prefs[o.key] ?? true}
              updating={updatingKey === o.key}
              onToggle={() => handleToggle(o.key)}
            />
          )}
        />
      )}
    </SectionWrapper>
  );
}
