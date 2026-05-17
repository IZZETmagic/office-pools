import { LayoutAnimation, Platform, Pressable, Text as RNText, UIManager, View } from 'react-native';
import { useEffect, useState } from 'react';

import { GroupStandingsTable } from './GroupStandingsTable';
import { MatchPredictionRow } from './MatchPredictionRow';
import { Icon, Text } from '@/components/ui';
import type { Match, ScoreEntry, Team } from '@/lib/bracket/tournament';
import { isPredictionComplete } from '@/lib/bracket/tournament';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type Props = {
  letter: string;
  matches: Match[];
  teams: Team[];
  predictions: Map<string, ScoreEntry>;
  onChange: (matchId: string, patch: Partial<ScoreEntry>) => void;
  disabled?: boolean;
  startExpanded?: boolean;
  expandSignal?: number;
};

export function GroupCollapsibleSection({
  letter,
  matches,
  teams,
  predictions,
  onChange,
  disabled,
  startExpanded = true,
  expandSignal,
}: Props) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(startExpanded);

  useEffect(() => {
    if (expandSignal === undefined) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(expandSignal % 2 === 1);
  }, [expandSignal]);

  const completed = matches.filter((m) => isPredictionComplete(predictions.get(m.match_id))).length;
  const total = matches.length;
  const progress = total > 0 ? completed / total : 0;
  const ringColor =
    completed === total && total > 0
      ? theme.colors.green
      : completed > 0
        ? theme.colors.amber
        : theme.colors.silver;

  function toggle() {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  }

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.md,
        overflow: 'hidden',
        ...theme.shadows.card,
      }}
    >
      <Pressable
        onPress={toggle}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.md,
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Icon
          name={expanded ? 'chevron.down' : 'chevron.right'}
          color="slate"
          size={12}
          weight="semibold"
        />
        <Text variant="cardTitle" style={{ flex: 1 }}>
          Group {letter}
        </Text>
        <ProgressRing
          size={26}
          strokeWidth={2.5}
          progress={progress}
          color={ringColor}
          label={`${completed}`}
        />
      </Pressable>
      {expanded ? (
        <View style={{ paddingHorizontal: theme.spacing.xs, paddingBottom: theme.spacing.sm, gap: 2 }}>
          {matches.map((m) => {
            const pred = predictions.get(m.match_id);
            return (
              <MatchPredictionRow
                key={m.match_id}
                home={{
                  countryName: m.home_team?.country_name ?? m.home_team_placeholder ?? 'TBD',
                  flagUrl: m.home_team?.flag_url ?? null,
                }}
                away={{
                  countryName: m.away_team?.country_name ?? m.away_team_placeholder ?? 'TBD',
                  flagUrl: m.away_team?.flag_url ?? null,
                }}
                homeScore={pred?.home ?? null}
                awayScore={pred?.away ?? null}
                onHomeChange={(n) => onChange(m.match_id, { home: n })}
                onAwayChange={(n) => onChange(m.match_id, { away: n })}
                disabled={disabled}
              />
            );
          })}
          <GroupStandingsTable
            letter={letter}
            teams={teams}
            matches={matches}
            predictions={predictions}
          />
        </View>
      ) : null}
    </View>
  );
}

function ProgressRing({
  size,
  strokeWidth,
  progress,
  color,
  label,
}: {
  size: number;
  strokeWidth: number;
  progress: number;
  color: string;
  label: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: strokeWidth,
        borderColor:
          progress >= 1
            ? color
            : progress > 0
              ? withOpacity(color, 0.7)
              : theme.colors.silver,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <RNText
        style={{
          fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
          fontSize: 10,
          fontWeight: '800',
          color,
        }}
      >
        {label}
      </RNText>
    </View>
  );
}
