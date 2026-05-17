import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text } from '@/components/ui';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

export const WIZARD_STAGES = [
  'group',
  'r32',
  'r16',
  'qf',
  'sf',
  'third_final',
  'summary',
] as const;
export type WizardStage = (typeof WIZARD_STAGES)[number];

export const STAGE_LABEL: Record<WizardStage, string> = {
  group: 'Group',
  r32: 'R32',
  r16: 'R16',
  qf: 'QF',
  sf: 'SF',
  third_final: '3rd/F',
  summary: 'Submit',
};

type Props = {
  stage: WizardStage;
  onStageChange: (s: WizardStage) => void;
  onSubmit?: () => void;
  canSubmit?: boolean;
  canAdvance?: boolean;
  submitting?: boolean;
};

export function StageNavBar({
  stage,
  onStageChange,
  onSubmit,
  canSubmit,
  canAdvance = true,
  submitting,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const idx = WIZARD_STAGES.indexOf(stage);
  const isFirst = idx === 0;
  const isLast = idx === WIZARD_STAGES.length - 1;

  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.sm,
        paddingBottom: Math.max(theme.spacing.md, insets.bottom),
        backgroundColor: theme.colors.snow,
        gap: theme.spacing.sm,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: -4 },
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing.xs,
        }}
      >
        {WIZARD_STAGES.map((s) => {
          const sIdx = WIZARD_STAGES.indexOf(s);
          const active = s === stage;
          const completed = sIdx < idx;
          const blocked = sIdx > idx && !canAdvance;
          return (
            <Pressable
              key={s}
              onPress={() => !blocked && onStageChange(s)}
              disabled={blocked}
              style={({ pressed }) => ({
                flex: 1,
                alignItems: 'center',
                paddingVertical: 6,
                borderRadius: theme.radii.pill,
                backgroundColor: active
                  ? withOpacity(theme.colors.primary, 0.12)
                  : 'transparent',
                opacity: blocked ? 0.35 : pressed ? 0.6 : 1,
              })}
            >
              <Text
                style={{
                  fontFamily: fontFamilies.bold,
                  fontSize: 11,
                  color: active
                    ? theme.colors.primary
                    : completed
                      ? theme.colors.primary
                      : theme.colors.slate,
                }}
              >
                {STAGE_LABEL[s]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        {!isFirst ? (
          <Pressable
            onPress={() => onStageChange(WIZARD_STAGES[idx - 1])}
            style={({ pressed }) => ({
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingVertical: theme.spacing.md,
              borderRadius: theme.radii.md,
              backgroundColor: theme.colors.mist,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Icon name="chevron.left" color="ink" size={14} weight="semibold" />
            <Text
              style={{ fontFamily: fontFamilies.bold, fontSize: 14, color: theme.colors.ink }}
            >
              Back
            </Text>
          </Pressable>
        ) : null}

        {stage === 'summary' ? (
          <Pressable
            onPress={onSubmit}
            disabled={!canSubmit || submitting}
            style={({ pressed }) => ({
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingVertical: theme.spacing.md,
              borderRadius: theme.radii.md,
              backgroundColor: theme.colors.primary,
              opacity: !canSubmit || submitting ? 0.5 : pressed ? 0.85 : 1,
              shadowColor: theme.colors.primary,
              shadowOpacity: canSubmit ? 0.3 : 0,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
            })}
          >
            <Icon name="checkmark.circle.fill" color="ink" size={14} />
            <Text
              style={{ fontFamily: fontFamilies.bold, fontSize: 14, color: '#FFFFFF' }}
            >
              {submitting ? 'Submitting…' : 'Submit'}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => !isLast && canAdvance && onStageChange(WIZARD_STAGES[idx + 1])}
            disabled={isLast || !canAdvance}
            style={({ pressed }) => ({
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingVertical: theme.spacing.md,
              borderRadius: theme.radii.md,
              backgroundColor: theme.colors.primary,
              opacity: isLast || !canAdvance ? 0.4 : pressed ? 0.85 : 1,
            })}
          >
            <Text style={{ fontFamily: fontFamilies.bold, fontSize: 14, color: '#FFFFFF' }}>
              Next
            </Text>
            <Icon name="chevron.right" color="ink" size={14} weight="semibold" />
          </Pressable>
        )}
      </View>
    </View>
  );
}
