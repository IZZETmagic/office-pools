// Shared building blocks for the settings screens. SectionWrapper, Divider and
// NotificationRow were all duplicated verbatim between the profile tab and the
// old notification-settings screen; this is the one copy.

import { useState } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text as RNText,
  UIManager,
  View,
} from 'react-native';

import { Icon, Text } from '@/components/ui';
import { hapticToggle } from '@/lib/haptics';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// LayoutAnimation needs switching on once for Android (as GroupCollapsibleSection does).
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export function SectionWrapper({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm + 4 }}>
      <Text variant="sectionHeader" style={{ paddingHorizontal: theme.spacing.xl }}>
        {title}
      </Text>
      <View style={{ paddingHorizontal: theme.spacing.xl }}>{children}</View>
    </View>
  );
}

export function Divider() {
  const theme = useTheme();
  return (
    <View
      style={{
        height: 0.5,
        marginHorizontal: theme.spacing.md - 2,
        backgroundColor: withOpacity(theme.colors.mist, 0.5),
      }}
    />
  );
}

/** A card that groups rows on the shared `surface` background. */
export function SettingsCard({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ backgroundColor: theme.colors.surface, borderRadius: theme.radii.lg }}>
      {children}
    </View>
  );
}

/** Renders `items` into a SettingsCard with a Divider between each. */
export function DividedList<T>({
  items,
  keyOf,
  render,
}: {
  items: T[];
  keyOf: (item: T) => string;
  render: (item: T) => React.ReactNode;
}) {
  return (
    <SettingsCard>
      {items.map((item, idx) => (
        <View key={keyOf(item)}>
          {render(item)}
          {idx < items.length - 1 ? <Divider /> : null}
        </View>
      ))}
    </SettingsCard>
  );
}

/** One notice under a switch: its short name, and the sentence saying how it works. */
export type SwitchNoticeLine = { title: string | null; sentence: string };

export type NotificationOption = {
  key: string;
  label: string;
  /** One plain line about what the switch covers — all a closed row says. */
  desc: string;
  icon: string;
  /**
   * What this switch actually sends (N2), in reading order. Undefined when the
   * list couldn't be read: the row keeps `desc` and doesn't open. An empty list
   * is a real answer — the switch sends nothing right now.
   */
  notices?: SwitchNoticeLine[];
};

/**
 * One switch, closed until asked (Ryan, 2026-10-07: the full lists were "quite
 * long"). Closed: the name and one line on what the switch covers. Open: every
 * notice it sends, each a short title over its sentence.
 *
 * ⚠ THE SWITCH IS OUTSIDE THE TAP TARGET. Opening a row must never be able to
 * flip what it controls, so the pressable area stops where the switch begins.
 */
export function NotificationRow({
  option,
  enabled,
  updating,
  onToggle,
}: {
  option: NotificationOption;
  enabled: boolean;
  updating: boolean;
  onToggle: () => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const notices = option.notices;
  const count = notices?.length ?? 0;
  const canOpen = count > 0;
  const sendsNothing = notices !== undefined && count === 0;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((o) => !o);
  };

  return (
    <View style={{ paddingHorizontal: theme.spacing.md - 2, paddingVertical: theme.spacing.sm + 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm + 4 }}>
        <Pressable
          onPress={canOpen ? toggle : undefined}
          disabled={!canOpen}
          accessibilityRole={canOpen ? 'button' : undefined}
          accessibilityState={canOpen ? { expanded: open } : undefined}
          accessibilityHint={canOpen ? `${open ? 'Hides' : 'Shows'} what this switch sends` : undefined}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm + 4 }}
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
            <Icon name={option.icon as never} tint={theme.colors.primary} size={13} weight="semibold" />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <RNText style={{ fontFamily: fontFamilies.semibold, fontSize: 14, color: theme.colors.ink }}>
              {option.label}
            </RNText>
            <RNText
              style={{ fontFamily: fontFamilies.medium, fontSize: 12, lineHeight: 16, color: theme.colors.slate }}
            >
              {sendsNothing ? 'Nothing is sent under this switch at the moment.' : option.desc}
            </RNText>
            {canOpen ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                <RNText style={{ fontFamily: fontFamilies.semibold, fontSize: 12, color: theme.colors.primary }}>
                  {open ? 'Hide' : count === 1 ? 'Details' : `See all ${count}`}
                </RNText>
                <Icon
                  name={open ? 'chevron.up' : 'chevron.down'}
                  tint={theme.colors.primary}
                  size={11}
                  weight="bold"
                />
              </View>
            ) : null}
          </View>
        </Pressable>
        {/* Centred on the icon, so it sits level with the name however tall the row grows. */}
        <View style={{ minHeight: 32, justifyContent: 'center' }}>
          {updating ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : (
            <Switch
              value={enabled}
              // ⭐ The ONE control where the two directions should not feel
              // alike — you should be able to tell which way you moved it
              // without looking. `value` is the switch's state BEFORE this
              // change on some platforms and after on others, so the feel is
              // taken from the value RN hands the callback, never from
              // `enabled`.
              onValueChange={(next) => {
                hapticToggle(next);
                onToggle();
              }}
              accessibilityLabel={option.label}
              trackColor={{ false: theme.colors.mist, true: theme.colors.primary }}
            />
          )}
        </View>
      </View>

      {open && notices ? (
        <View
          style={{
            marginTop: theme.spacing.md,
            // Under the text, not the icon: the list reads as part of this switch.
            marginLeft: 32 + theme.spacing.sm + 4,
            paddingTop: theme.spacing.md,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: theme.colors.silver,
            gap: theme.spacing.md,
          }}
        >
          {notices.map((n, i) => (
            <View key={`${i}-${n.title ?? ''}`} style={{ gap: 2 }}>
              {n.title ? (
                <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 13, lineHeight: 18, color: theme.colors.ink }}>
                  {n.title}
                </RNText>
              ) : null}
              <RNText
                style={{ fontFamily: fontFamilies.medium, fontSize: 12, lineHeight: 17, color: theme.colors.slate }}
              >
                {n.sentence}
              </RNText>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function LoadingRow({ label = 'Loading preferences...' }: { label?: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.xl,
      }}
    >
      <ActivityIndicator size="small" color={theme.colors.primary} />
      <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 13, color: theme.colors.slate }}>
        {label}
      </RNText>
    </View>
  );
}
