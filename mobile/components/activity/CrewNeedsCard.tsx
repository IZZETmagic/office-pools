// A crew decision in Activity → Needs you: a saved spot, an invite, or "Keep this group together?".
//
// Same visual language as NeedsYouCard (primary border, title + subtitle, a deadline pill when there
// is a clock) so crew cards and pick cards read as one list. Two differences, both on purpose:
//   · a small eyebrow naming the crew — the card is about a GROUP, not a pool;
//   · two buttons where a pick card has one, because every crew decision can be a no.
// The card itself is not a button; its actions are. The server decides which actions a card has
// (lib/crews/needs.ts); the screen decides what each one calls.

import { useState } from 'react';
import { ActivityIndicator, Pressable, Text as RNText, View } from 'react-native';

import { Icon } from '@/components/ui';
import type { NeedAction, NeedsYouItem } from '@/lib/api';
import { fontFamilies, useTheme } from '@/theme';

import { deadlineLabel } from './NeedsYouCard';

export function CrewNeedsCard({
  item,
  onAction,
}: {
  item: NeedsYouItem;
  /** Resolves when the action has finished (and the list has refreshed); throws to keep the card. */
  onAction: (item: NeedsYouItem, action: NeedAction) => Promise<void>;
}) {
  const theme = useTheme();
  const [busy, setBusy] = useState<NeedAction['id'] | null>(null);
  const urgent = item.deadline_at !== null && Date.parse(item.deadline_at) - Date.now() < 86_400_000;

  const eyebrow =
    item.kind === 'crew_save' ? (item.pool_name || 'Your pool').toUpperCase() : (item.crew?.name ?? 'Crew').toUpperCase();
  const footnote =
    item.kind === 'crew_seat'
      ? `${item.made} of ${item.total} in`
      : item.kind === 'crew_save'
        ? 'Only you see this'
        : 'Join once';

  async function run(action: NeedAction) {
    if (busy) return;
    setBusy(action.id);
    try {
      await onAction(item, action);
    } finally {
      setBusy(null);
    }
  }

  return (
    <View
      accessibilityLabel={`${item.title}, ${item.subtitle}`}
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.md,
        borderWidth: 1.5,
        borderColor: theme.colors.primary,
        padding: theme.spacing.md + 2,
        gap: theme.spacing.sm + 2,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Icon name="person.3.fill" size={11} tint={theme.colors.primary} />
            <RNText
              numberOfLines={1}
              style={{ flexShrink: 1, fontFamily: fontFamilies.black, fontSize: 9.5, letterSpacing: 0.6, color: theme.colors.primary }}
            >
              {eyebrow}
            </RNText>
          </View>
          <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 15, color: theme.colors.ink }}>{item.title}</RNText>
          <RNText numberOfLines={1} style={{ fontFamily: fontFamilies.medium, fontSize: 12, color: theme.colors.slate }}>
            {item.subtitle}
          </RNText>
        </View>
        {item.deadline_at !== null ? (
          <View
            style={{
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: 3,
              borderRadius: theme.radii.pill,
              backgroundColor: urgent ? theme.colors.redLight : theme.colors.amberLight,
            }}
          >
            <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 11, color: urgent ? theme.colors.red : theme.colors.amber }}>
              {deadlineLabel(item.deadline_at)}
            </RNText>
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <RNText style={{ flex: 1, fontFamily: fontFamilies.medium, fontSize: 12, color: theme.colors.slate }}>{footnote}</RNText>
        {(item.actions ?? []).map((a) => {
          const primary = a.style === 'primary';
          return (
            <Pressable
              key={a.id}
              onPress={() => void run(a)}
              disabled={busy !== null}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              style={({ pressed }) => ({
                minWidth: 64,
                alignItems: 'center',
                paddingHorizontal: theme.spacing.md,
                paddingVertical: 6,
                borderRadius: theme.radii.pill,
                backgroundColor: primary ? theme.colors.primary : theme.colors.mist,
                opacity: busy !== null && busy !== a.id ? 0.5 : pressed ? 0.85 : 1,
              })}
            >
              {busy === a.id ? (
                <ActivityIndicator size="small" color={primary ? '#FFFFFF' : theme.colors.ink} />
              ) : (
                <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 12, color: primary ? '#FFFFFF' : theme.colors.ink }}>
                  {a.label}
                </RNText>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
