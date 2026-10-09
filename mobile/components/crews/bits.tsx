// Small building blocks shared by My Crews and the crew page — the same card, row and section
// shapes the Seasons screen uses, so the Profile hub's pages read as one family.

import { Text as RNText, View } from 'react-native';

import { Pressable } from '@/components/ui';
import { crewStatusText, type CrewCard } from '@/lib/crews';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

/**
 * A crew's status chip — a saved spot, then a season being played, then the last one. One copy for
 * My Crews and for Home's Your Crews, so the two cards can't drift apart.
 */
export function CrewStatusChip({ status }: { status: CrewCard['status'] }) {
  const theme = useTheme();
  const tone =
    status.kind === 'seat'
      ? { bg: theme.colors.primaryLight, ink: theme.colors.primary }
      : status.kind === 'live'
        ? { bg: theme.colors.greenLight, ink: theme.colors.green }
        : { bg: theme.colors.mist, ink: theme.colors.slate };
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: tone.bg,
        borderRadius: theme.radii.pill,
        paddingHorizontal: 10,
        paddingVertical: 5,
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone.ink }} />
      <RNText numberOfLines={1} style={{ flexShrink: 1, fontFamily: fontFamilies.bold, fontSize: 12, color: tone.ink }}>
        {crewStatusText(status)}
      </RNText>
    </View>
  );
}

export function Notice({ text, action, onAction }: { text: string; action?: string; onAction?: () => void }) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.xl,
        gap: theme.spacing.md,
        alignItems: 'center',
      }}
    >
      <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 13, lineHeight: 19, color: theme.colors.slate, textAlign: 'center' }}>
        {text}
      </RNText>
      {action && onAction ? (
        <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8}>
          <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 13.5, color: theme.colors.primary }}>{action}</RNText>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Section({
  title,
  action,
  onAction,
  children,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <RNText style={{ flex: 1, fontFamily: fontFamilies.black, fontSize: 15, color: theme.colors.ink }}>{title}</RNText>
        {action && onAction ? (
          <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8}>
            <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 13, color: theme.colors.primary }}>{action}</RNText>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function Card({ children, padded = true }: { children: React.ReactNode; padded?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: padded ? theme.spacing.lg : 0,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

export function Row({ children, divider, onPress }: { children: React.ReactNode; divider: boolean; onPress?: () => void }) {
  const theme = useTheme();
  const inner = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingHorizontal: theme.spacing.md,
        paddingVertical: theme.spacing.md - 2,
      }}
    >
      {children}
    </View>
  );
  return (
    <View>
      {divider ? (
        <View style={{ height: 0.5, marginLeft: theme.spacing.md, backgroundColor: withOpacity(theme.colors.slate, 0.15) }} />
      ) : null}
      {onPress ? (
        <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
          {inner}
        </Pressable>
      ) : (
        inner
      )}
    </View>
  );
}

export function Hint({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 11.5, lineHeight: 16, color: theme.colors.slate, paddingHorizontal: 4 }}>
      {text}
    </RNText>
  );
}
