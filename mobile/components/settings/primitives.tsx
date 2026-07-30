// Shared building blocks for the settings screens. SectionWrapper, Divider and
// NotificationRow were all duplicated verbatim between the profile tab and the
// old notification-settings screen; this is the one copy.

import { ActivityIndicator, Switch, Text as RNText, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

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

export type NotificationOption = {
  key: string;
  label: string;
  desc: string;
  icon: string;
};

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
  return (
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
        <Icon name={option.icon as never} tint={theme.colors.primary} size={13} weight="semibold" />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <RNText style={{ fontFamily: fontFamilies.semibold, fontSize: 14, color: theme.colors.ink }}>
          {option.label}
        </RNText>
        <RNText
          style={{ fontFamily: fontFamilies.medium, fontSize: 11, color: theme.colors.slate }}
        >
          {option.desc}
        </RNText>
      </View>
      {updating ? (
        <ActivityIndicator size="small" color={theme.colors.primary} />
      ) : (
        <Switch
          value={enabled}
          onValueChange={onToggle}
          trackColor={{ false: theme.colors.mist, true: theme.colors.primary }}
        />
      )}
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
