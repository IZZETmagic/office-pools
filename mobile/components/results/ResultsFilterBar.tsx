import { SymbolView } from 'expo-symbols';
import { Platform, Pressable, ScrollView, Text as RNText, View } from 'react-native';

import { fontFamilies, useTheme, withOpacity } from '@/theme';

export type FilterMode = 'date' | 'round' | 'team' | 'group';

type Props = {
  mode: FilterMode;
  selectedTeamName: string | null;
  selectedGroupLetter: string | null;
  onSelectDate: () => void;
  onSelectRound: () => void;
  onSelectTeam: () => void;
  onSelectGroup: () => void;
};

export function ResultsFilterBar({
  mode,
  selectedTeamName,
  selectedGroupLetter,
  onSelectDate,
  onSelectRound,
  onSelectTeam,
  onSelectGroup,
}: Props) {
  const theme = useTheme();
  const teamLabel = mode === 'team' && selectedTeamName ? selectedTeamName : 'Team';
  const groupLabel = mode === 'group' && selectedGroupLetter ? `Group ${selectedGroupLetter}` : 'Group';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 8,
      }}
    >
      {/* A bare horizontal ScrollView inside a column flex parent stretches
          vertically (RN's default cross-axis sizing). Wrapping in this row
          View and pinning the ScrollView with `flex: 1` keeps it intrinsic
          height — matches the PoolsFilterBar pattern. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 6, alignItems: 'center' }}
        style={{ flex: 1 }}
      >
        <Pill label="Date" active={mode === 'date'} onPress={onSelectDate} />
        <Pill label="Round" active={mode === 'round'} onPress={onSelectRound} />
        <Pill
          label={teamLabel}
          active={mode === 'team'}
          onPress={onSelectTeam}
          suffix={
            mode === 'team' && selectedTeamName ? (
              <FilterIcon kind="clear" tint={theme.colors.primary} />
            ) : (
              <FilterIcon kind="chevron" tint={theme.colors.ink} />
            )
          }
        />
        <Pill
          label={groupLabel}
          active={mode === 'group'}
          onPress={onSelectGroup}
          suffix={
            mode === 'group' && selectedGroupLetter ? (
              <FilterIcon kind="clear" tint={theme.colors.primary} />
            ) : (
              <FilterIcon kind="chevron" tint={theme.colors.ink} />
            )
          }
        />
      </ScrollView>
    </View>
  );
}

function Pill({
  label,
  active,
  onPress,
  suffix,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  suffix?: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: theme.radii.pill,
        backgroundColor: active
          ? withOpacity(theme.colors.primary, 0.1)
          : withOpacity(theme.colors.ink, 0.04),
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <RNText
        style={{
          fontFamily: active ? fontFamilies.semibold : fontFamilies.medium,
          fontSize: 13,
          color: active ? theme.colors.primary : theme.colors.ink,
        }}
      >
        {label}
      </RNText>
      {suffix}
    </Pressable>
  );
}

function FilterIcon({ kind, tint }: { kind: 'clear' | 'chevron'; tint: string }) {
  if (Platform.OS === 'ios') {
    return (
      <SymbolView
        name={kind === 'clear' ? 'xmark.circle.fill' : 'chevron.down'}
        size={kind === 'clear' ? 11 : 8}
        tintColor={tint}
        weight="semibold"
      />
    );
  }
  return (
    <RNText style={{ fontSize: kind === 'clear' ? 11 : 8, color: tint, lineHeight: 14 }}>
      {kind === 'clear' ? '✕' : '▾'}
    </RNText>
  );
}
