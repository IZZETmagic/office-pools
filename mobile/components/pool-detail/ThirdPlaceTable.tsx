import { Fragment, useMemo } from 'react';
import { Image, View, Text as RNText } from 'react-native';

import { Icon, Text } from '@/components/ui';
import type { Match, ScoreEntry, Team, ThirdPlaceTeam } from '@/lib/bracket/tournament';
import { GROUP_LETTERS, calculateGroupStandings, rankThirdPlaceTeams } from '@/lib/bracket/tournament';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type Props = {
  teams: Team[];
  matches: Match[];
  predictions: Map<string, ScoreEntry>;
};

export function ThirdPlaceTable({ teams, matches, predictions }: Props) {
  const theme = useTheme();

  const ranked = useMemo(() => {
    const allStandings = new Map(
      GROUP_LETTERS.map((letter) => [
        letter,
        calculateGroupStandings(
          letter,
          matches.filter((m) => m.stage === 'group' && m.group_letter === letter),
          predictions,
          teams,
        ),
      ]),
    );
    return rankThirdPlaceTeams(allStandings);
  }, [teams, matches, predictions]);

  if (ranked.length === 0) return null;

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.md,
        overflow: 'hidden',
        ...theme.shadows.card,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.md,
        }}
      >
        <Icon name="medal.fill" color="amber" size={16} />
        <View style={{ flex: 1 }}>
          <Text variant="cardTitle">Best 3rd-place teams</Text>
          <Text variant="detail" color="slate">
            Top 8 advance to the Round of 32
          </Text>
        </View>
      </View>
      <View
        style={{
          backgroundColor: withOpacity(theme.colors.ink, 0.03),
          marginHorizontal: theme.spacing.sm,
          marginBottom: theme.spacing.sm,
          borderRadius: theme.radii.sm,
          paddingVertical: theme.spacing.xs,
        }}
      >
        <HeaderRow />
        {ranked.map((t, i) => (
          <Fragment key={t.team_id}>
            {i === 8 ? <EliminatedDivider /> : null}
            <ThirdPlaceRow rank={i + 1} team={t} />
          </Fragment>
        ))}
      </View>
    </View>
  );
}

function EliminatedDivider() {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.sm,
        paddingTop: theme.spacing.sm,
        paddingBottom: 4,
      }}
    >
      <View style={{ flex: 1, height: 1, backgroundColor: withOpacity(theme.colors.red, 0.6) }} />
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 10,
          letterSpacing: 0.6,
          color: theme.colors.red,
          textTransform: 'uppercase',
        }}
      >
        Eliminated
      </RNText>
      <View style={{ flex: 1, height: 1, backgroundColor: withOpacity(theme.colors.red, 0.6) }} />
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
      <View style={{ width: 16, alignItems: 'center' }}>
        <StatHead label="#" />
      </View>
      <View style={{ flex: 1, paddingLeft: 10 }}>
        <StatHead label="Team" align="left" />
      </View>
      <View style={{ width: 20, alignItems: 'center' }}>
        <StatHead label="Grp" />
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
        width: align === 'left' ? undefined : wide ? 26 : 18,
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

function ThirdPlaceRow({ rank, team }: { rank: number; team: ThirdPlaceTeam }) {
  const theme = useTheme();
  const advances = rank <= 8;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: 5,
      }}
    >
      <View style={{ width: 16, alignItems: 'center' }}>
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
        {team.flag_url ? (
          <Image
            source={{ uri: team.flag_url }}
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
          {team.country_name}
        </RNText>
      </View>
      <View style={{ width: 20, alignItems: 'center' }}>
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 11,
            color: theme.colors.slate,
          }}
        >
          {team.group_letter}
        </RNText>
      </View>
      <Stat value={team.played} />
      <Stat value={team.wins} />
      <Stat value={team.draws} />
      <Stat value={team.losses} />
      <Stat value={team.points} wide bold />
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
        width: wide ? 26 : 18,
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
