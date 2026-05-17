import { SymbolView } from 'expo-symbols';
import { useState, type ComponentType } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  Text as RNText,
  View,
} from 'react-native';

import { Text } from '@/components/ui';
import {
  changeRoundState,
  type ChangeRoundStateAction,
  type PoolRound,
} from '@/lib/api';
import { usePoolRounds, roundLabel } from '@/lib/usePoolRounds';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// Native date picker is lazy-loaded so this screen survives dev clients that
// haven't been rebuilt with the new native deps.
let DateTimePicker: ComponentType<{
  value: Date;
  mode?: 'date' | 'time' | 'datetime' | 'countdown';
  display?: 'default' | 'spinner' | 'clock' | 'calendar' | 'compact' | 'inline';
  onChange?: (event: unknown, date?: Date) => void;
}> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  DateTimePicker = require('@react-native-community/datetimepicker').default;
} catch {
  DateTimePicker = null;
}

type Props = { poolId: string };

type SheetState =
  | { kind: 'open'; round: PoolRound; deadline: Date }
  | { kind: 'extend'; round: PoolRound; deadline: Date }
  | null;

export function RoundsTab({ poolId }: Props) {
  const theme = useTheme();
  const { data, loading, refresh, error } = usePoolRounds(poolId);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);

  async function runAction(
    round: PoolRound,
    action: ChangeRoundStateAction,
    deadline?: string,
  ) {
    setBusyKey(round.round_key);
    try {
      await changeRoundState(poolId, round.round_key, action, deadline);
      await refresh();
    } catch (err) {
      Alert.alert(
        `Couldn't ${action.replace('_', ' ')} round`,
        err instanceof Error ? err.message : 'Unknown error',
      );
    } finally {
      setBusyKey(null);
    }
  }

  if (loading && !data) {
    return (
      <View style={{ paddingVertical: theme.spacing.xxxl, alignItems: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View
        style={{
          alignItems: 'center',
          gap: theme.spacing.sm,
          paddingHorizontal: theme.spacing.xl,
          paddingVertical: theme.spacing.xxxl,
        }}
      >
        {Platform.OS === 'ios' ? (
          <SymbolView
            name="calendar.badge.clock"
            size={36}
            tintColor={theme.colors.silver}
            weight="light"
            resizeMode="scaleAspectFit"
          />
        ) : null}
        <Text variant="cardTitle" align="center">
          Rounds unavailable
        </Text>
        <Text variant="body" color="slate" align="center">
          {error ?? 'This pool may not be using progressive mode.'}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.md,
        paddingBottom: theme.spacing.xxxl,
        gap: theme.spacing.lg,
      }}
    >
      {data.rounds.map((round) => (
        <RoundCard
          key={round.round_key}
          round={round}
          busy={busyKey === round.round_key}
          onOpen={() =>
            setSheet({
              kind: 'open',
              round,
              deadline: new Date(Date.now() + 48 * 3600 * 1000),
            })
          }
          onExtend={() => {
            const existing = round.deadline ? new Date(round.deadline) : new Date();
            setSheet({
              kind: 'extend',
              round,
              deadline: new Date(existing.getTime() + 24 * 3600 * 1000),
            });
          }}
          onClose={() => void runAction(round, 'close')}
          onComplete={() => void runAction(round, 'complete')}
        />
      ))}

      <DeadlineSheet
        sheet={sheet}
        busy={busyKey !== null}
        onClose={() => setSheet(null)}
        onPickDate={(d) => setSheet((cur) => (cur ? { ...cur, deadline: d } : cur))}
        onConfirm={async () => {
          if (!sheet) return;
          const iso = sheet.deadline.toISOString();
          const action: ChangeRoundStateAction =
            sheet.kind === 'open' ? 'open' : 'extend_deadline';
          await runAction(sheet.round, action, iso);
          setSheet(null);
        }}
      />
    </View>
  );
}

function RoundCard({
  round,
  busy,
  onOpen,
  onExtend,
  onClose,
  onComplete,
}: {
  round: PoolRound;
  busy: boolean;
  onOpen: () => void;
  onExtend: () => void;
  onClose: () => void;
  onComplete: () => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.lg,
        gap: 12,
        ...theme.shadows.card,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="sectionHeader">{roundLabel(round.round_key)}</Text>
        <StateBadge state={round.state} />
      </View>

      {round.match_count > 0 ? (
        <DetailRow
          iosIcon="sportscourt"
          emoji="🏟"
          text={`${round.completed_match_count}/${round.match_count} matches completed`}
        />
      ) : null}

      {round.deadline ? (
        <DetailRow
          iosIcon="clock"
          emoji="⏰"
          text={`Deadline: ${formatLongDate(round.deadline)}`}
        />
      ) : null}

      {round.admin_stats ? (
        <DetailRow
          iosIcon="person.3"
          emoji="👥"
          text={`${round.admin_stats.submitted_entries}/${round.admin_stats.total_entries} entries submitted`}
        />
      ) : null}

      <View style={{ height: 0.5, backgroundColor: withOpacity(theme.colors.silver, 0.5) }} />

      <RoundActions
        state={round.state}
        busy={busy}
        onOpen={onOpen}
        onExtend={onExtend}
        onClose={onClose}
        onComplete={onComplete}
      />
    </View>
  );
}

function RoundActions({
  state,
  busy,
  onOpen,
  onExtend,
  onClose,
  onComplete,
}: {
  state: PoolRound['state'];
  busy: boolean;
  onOpen: () => void;
  onExtend: () => void;
  onClose: () => void;
  onComplete: () => void;
}) {
  const theme = useTheme();

  if (state === 'completed') {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {Platform.OS === 'ios' ? (
          <SymbolView
            name="checkmark.circle.fill"
            size={14}
            tintColor={theme.colors.green}
            weight="semibold"
            resizeMode="scaleAspectFit"
          />
        ) : (
          <RNText style={{ fontSize: 14, color: theme.colors.green }}>✓</RNText>
        )}
        <RNText
          style={{
            fontFamily: fontFamilies.medium,
            fontSize: 13,
            color: theme.colors.slate,
          }}
        >
          Round completed
        </RNText>
        <View style={{ flex: 1 }} />
        {busy ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
      </View>
    );
  }

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {state === 'locked' ? (
        <ActionButton
          label="Open Round"
          iosIcon="lock.open"
          emoji="🔓"
          color={theme.colors.primary}
          onPress={onOpen}
          disabled={busy}
        />
      ) : null}
      {state === 'open' ? (
        <>
          <ActionButton
            label="Extend"
            iosIcon="clock.arrow.circlepath"
            emoji="⏳"
            color={theme.colors.amber}
            onPress={onExtend}
            disabled={busy}
          />
          <ActionButton
            label="Close"
            iosIcon="lock"
            emoji="🔒"
            color={theme.colors.red}
            onPress={onClose}
            disabled={busy}
          />
          <ActionButton
            label="Complete"
            iosIcon="checkmark.circle"
            emoji="✓"
            color={theme.colors.green}
            onPress={onComplete}
            disabled={busy}
          />
        </>
      ) : null}
      {state === 'in_progress' ? (
        <ActionButton
          label="Complete Round"
          iosIcon="checkmark.circle"
          emoji="✓"
          color={theme.colors.green}
          onPress={onComplete}
          disabled={busy}
        />
      ) : null}
      <View style={{ flex: 1 }} />
      {busy ? <ActivityIndicator size="small" color={theme.colors.primary} /> : null}
    </View>
  );
}

function ActionButton({
  label,
  iosIcon,
  emoji,
  color,
  onPress,
  disabled,
}: {
  label: string;
  iosIcon: string;
  emoji: string;
  color: string;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 18,
        backgroundColor: withOpacity(color, 0.12),
        borderWidth: 1,
        borderColor: withOpacity(color, 0.3),
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      {Platform.OS === 'ios' ? (
        <SymbolView
          name={iosIcon as never}
          size={12}
          tintColor={color}
          weight="semibold"
          resizeMode="scaleAspectFit"
        />
      ) : (
        <RNText style={{ fontSize: 12, color }}>{emoji}</RNText>
      )}
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 13,
          color,
        }}
      >
        {label}
      </RNText>
    </Pressable>
  );
}

function StateBadge({ state }: { state: PoolRound['state'] }) {
  const theme = useTheme();
  const map: Record<PoolRound['state'], { label: string; color: string }> = {
    locked: { label: 'Locked', color: theme.colors.silver },
    open: { label: 'Open', color: theme.colors.green },
    in_progress: { label: 'In Progress', color: theme.colors.amber },
    completed: { label: 'Completed', color: theme.colors.primary },
  };
  const { label, color } = map[state];
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 12,
        backgroundColor: withOpacity(color, 0.14),
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 10,
          color,
          letterSpacing: 0.4,
        }}
      >
        {label}
      </RNText>
    </View>
  );
}

function DetailRow({
  iosIcon,
  emoji,
  text,
}: {
  iosIcon: string;
  emoji: string;
  text: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {Platform.OS === 'ios' ? (
        <SymbolView
          name={iosIcon as never}
          size={11}
          tintColor={theme.colors.slate}
          weight="semibold"
          resizeMode="scaleAspectFit"
        />
      ) : (
        <RNText style={{ fontSize: 11, color: theme.colors.slate }}>{emoji}</RNText>
      )}
      <RNText
        style={{
          fontFamily: fontFamilies.regular,
          fontSize: 13,
          color: theme.colors.slate,
        }}
      >
        {text}
      </RNText>
    </View>
  );
}

function DeadlineSheet({
  sheet,
  busy,
  onClose,
  onPickDate,
  onConfirm,
}: {
  sheet: SheetState;
  busy: boolean;
  onClose: () => void;
  onPickDate: (d: Date) => void;
  onConfirm: () => void;
}) {
  const theme = useTheme();
  if (!sheet) return null;
  const title = sheet.kind === 'open' ? 'Open Round' : 'Extend Deadline';
  const subtitle =
    sheet.kind === 'open'
      ? `Opening ${roundLabel(sheet.round.round_key)} will allow users to submit predictions until the deadline.`
      : `Move the deadline for ${roundLabel(sheet.round.round_key)} to a later time.`;
  const cta = sheet.kind === 'open' ? 'Open' : 'Extend';
  return (
    <Modal
      transparent
      visible
      animationType="fade"
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.45)',
          justifyContent: 'center',
          padding: theme.spacing.xl,
        }}
      >
        <View
          style={{
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radii.lg,
            padding: theme.spacing.lg,
            gap: theme.spacing.md,
          }}
        >
          <Text variant="sectionHeader">{title}</Text>
          <RNText
            style={{
              fontFamily: fontFamilies.regular,
              fontSize: 13,
              lineHeight: 18,
              color: theme.colors.slate,
            }}
          >
            {subtitle}
          </RNText>

          <View style={{ gap: 6 }}>
            <RNText
              style={{
                fontFamily: fontFamilies.medium,
                fontSize: 12,
                color: theme.colors.slate,
              }}
            >
              Deadline
            </RNText>
            {DateTimePicker ? (
              <DateTimePicker
                value={sheet.deadline}
                mode="datetime"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={(_e: unknown, picked?: Date) => {
                  if (picked) onPickDate(picked);
                }}
              />
            ) : (
              <View
                style={{
                  padding: theme.spacing.md,
                  borderRadius: theme.radii.md,
                  backgroundColor: theme.colors.mist,
                }}
              >
                <RNText
                  style={{
                    fontFamily: fontFamilies.medium,
                    fontSize: 13,
                    color: theme.colors.slate,
                  }}
                >
                  Date picker ships in the next dev build.
                </RNText>
                <RNText
                  style={{
                    marginTop: 4,
                    fontFamily: fontFamilies.bold,
                    fontSize: 14,
                    color: theme.colors.ink,
                  }}
                >
                  {sheet.deadline.toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </RNText>
              </View>
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            <Pressable
              onPress={onClose}
              disabled={busy}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 12,
                borderRadius: theme.radii.md,
                backgroundColor: withOpacity(theme.colors.ink, 0.06),
                alignItems: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <RNText
                style={{ fontFamily: fontFamilies.bold, fontSize: 14, color: theme.colors.ink }}
              >
                Cancel
              </RNText>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={busy}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 12,
                borderRadius: theme.radii.md,
                backgroundColor: withOpacity(theme.colors.primary, 0.18),
                borderWidth: 1,
                borderColor: withOpacity(theme.colors.primary, 0.3),
                alignItems: 'center',
                opacity: busy ? 0.5 : pressed ? 0.7 : 1,
              })}
            >
              <RNText
                style={{
                  fontFamily: fontFamilies.bold,
                  fontSize: 14,
                  color: theme.colors.primary,
                }}
              >
                {busy ? 'Saving…' : cta}
              </RNText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}
