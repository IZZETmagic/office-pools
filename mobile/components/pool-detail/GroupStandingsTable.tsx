import { Image, View, Text as RNText } from 'react-native';
import { useMemo } from 'react';

import type { GroupStanding, Match, ScoreEntry, Team } from '@/lib/bracket/tournament';
import { calculateGroupStandings } from '@/lib/bracket/tournament';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type Props = {
  letter: string;
  teams: Team[];
  matches: Match[];
  predictions: Map<string, ScoreEntry>;
};

export function GroupStandingsTable({ letter, teams, matches, predictions }: Props) {
  const theme = useTheme();
  const standings = useMemo(
    () => calculateGroupStandings(letter, matches, predictions, teams),
    [letter, matches, predictions, teams],
  );

  if (standings.length === 0) return null;

  return (
    <View
      style={{
        backgroundColor: withOpacity(theme.colors.ink, 0.03),
        borderRadius: theme.radii.sm,
        marginHorizontal: theme.spacing.xs,
        marginTop: theme.spacing.md,
        marginBottom: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
      }}
    >
      <HeaderRow />
      {standings.map((s, i) => (
        <StandingRow key={s.team_id} rank={i + 1} standing={s} />
      ))}
    </View>
  );
}

function HeaderRow() {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: 6,
        borderBottomWidth: 0.5,
        borderBottomColor: withOpacity(theme.colors.silver, 0.6),
      }}
    >
      <View style={{ width: 18, alignItems: 'center' }}>
        <StatHead label="#" />
      </View>
      <View style={{ flex: 1, paddingLeft: 10 }}>
        <StatHead label="Team" align="left" />
      </View>
      <StatHead label="P" />
      <StatHead label="W" />
      <StatHead label="D" />
      <StatHead label="L" />
      <StatHead label="Pts" wide bold />
    </View>
  );
}

function StatHead({
  label,
  wide,
  bold,
  align = 'center',
}: {
  label: string;
  wide?: boolean;
  bold?: boolean;
  align?: 'center' | 'left';
}) {
  const theme = useTheme();
  return (
    <RNText
      style={{
        width: align === 'left' ? undefined : wide ? 28 : 20,
        textAlign: align,
        fontFamily: bold ? fontFamilies.bold : fontFamilies.semibold,
        fontSize: 10,
        color: theme.colors.slate,
        letterSpacing: 0.3,
      }}
    >
      {label}
    </RNText>
  );
}

function StandingRow({ rank, standing }: { rank: number; standing: GroupStanding }) {
  const theme = useTheme();
  const advances = rank <= 2;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: 5,
      }}
    >
      <View
        style={{
          width: 18,
          alignItems: 'center',
        }}
      >
        <View
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: advances
              ? withOpacity(theme.colors.green, 0.18)
              : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <RNText
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 9,
              color: advances ? theme.colors.green : theme.colors.slate,
            }}
          >
            {rank}
          </RNText>
        </View>
      </View>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10 }}>
        {standing.flag_url ? (
          <Image
            source={{ uri: standing.flag_url }}
            style={{ width: 16, height: 12, borderRadius: 1.5 }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={{
              width: 16,
              height: 12,
              borderRadius: 1.5,
              backgroundColor: theme.colors.mist,
            }}
          />
        )}
        <RNText
          style={{
            fontFamily: fontFamilies.semibold,
            fontSize: 12,
            color: theme.colors.ink,
            flexShrink: 1,
          }}
          numberOfLines={1}
        >
          {standing.country_name}
        </RNText>
      </View>
      <Stat value={standing.played} />
      <Stat value={standing.wins} />
      <Stat value={standing.draws} />
      <Stat value={standing.losses} />
      <Stat value={standing.points} wide bold />
    </View>
  );
}

function Stat({
  value,
  wide,
  bold,
}: {
  value: number | string;
  wide?: boolean;
  bold?: boolean;
}) {
  const theme = useTheme();
  return (
    <RNText
      style={{
        width: wide ? 28 : 20,
        textAlign: 'center',
        fontFamily: bold ? fontFamilies.bold : fontFamilies.medium,
        fontSize: 11,
        color: bold ? theme.colors.ink : theme.colors.slate,
      }}
    >
      {value}
    </RNText>
  );
}
