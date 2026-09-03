import { Pressable, ScrollView, Text as RNText, View } from 'react-native';

import { Icon } from '@/components/ui';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

export type FilterMode = 'date' | 'round' | 'team' | 'group' | 'competition';

type Props = {
  mode: FilterMode;
  selectedTeamName: string | null;
  selectedGroupLetter: string | null;
  /**
   * What the second pill is called. A World Cup has rounds; a league has
   * matchweeks. The caller decides from what is actually in the list — see
   * `roundPillLabel` in the Results screen.
   */
  roundLabel: string;
  /**
   * ⚠ Whether to show the Group pill at all, and it is not cosmetic.
   *
   * A club has no group. With a league-only list the pill was still there,
   * filtered to nothing, and `GroupPickerSheet` has NO empty state — so tapping
   * it opened a blank sheet, which reads as broken rather than as inapplicable.
   * A control that does nothing is worse than one that is not there.
   */
  showGroup: boolean;
  /** The chosen competition's name, when one is chosen. */
  selectedCompetitionName: string | null;
  /**
   * ⚠ Whether to show the Competition pill, on the same rule as the Group one.
   *
   * The list is scoped to the member's own pools, so most members hold exactly
   * one competition and a control offering to narrow it to that one answers a
   * question they do not have. The caller passes `distinctCompetitions(...)
   * .length > 1` — not "is this a league", which would show the pill to every
   * single-league member.
   */
  showCompetition: boolean;
  onSelectDate: () => void;
  onSelectRound: () => void;
  onSelectTeam: () => void;
  onSelectGroup: () => void;
  onSelectCompetition: () => void;
};

export function ResultsFilterBar({
  mode,
  selectedTeamName,
  selectedGroupLetter,
  roundLabel,
  showGroup,
  selectedCompetitionName,
  showCompetition,
  onSelectDate,
  onSelectRound,
  onSelectTeam,
  onSelectGroup,
  onSelectCompetition,
}: Props) {
  const theme = useTheme();
  const teamLabel = mode === 'team' && selectedTeamName ? selectedTeamName : 'Team';
  const groupLabel = mode === 'group' && selectedGroupLetter ? `Group ${selectedGroupLetter}` : 'Group';
  const competitionLabel =
    mode === 'competition' && selectedCompetitionName ? selectedCompetitionName : 'Competition';

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
        {/* ⚠ SECOND, ahead of the matchweek pill, and that is a judgement about
            order of questions rather than about importance. A member holding
            several leagues asks "which league" before "which week" — and the
            matchweek pill is the one that most needs a competition chosen
            first, since its sections are keyed on the number alone and two
            leagues' Matchweek 3 merge into one. */}
        {showCompetition ? (
          <Pill
            label={competitionLabel}
            active={mode === 'competition'}
            onPress={onSelectCompetition}
            suffix={
              mode === 'competition' && selectedCompetitionName ? (
                <FilterIcon kind="clear" tint={theme.colors.primary} />
              ) : (
                <FilterIcon kind="chevron" tint={theme.colors.ink} />
              )
            }
          />
        ) : null}
        <Pill label={roundLabel} active={mode === 'round'} onPress={onSelectRound} />
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
        {showGroup ? (
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
        ) : null}
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
  return (
    <Icon
      name={kind === 'clear' ? 'xmark.circle.fill' : 'chevron.down'}
      size={kind === 'clear' ? 11 : 8}
      tint={tint}
      weight="semibold"
    />
  );
}
