import { Image, Platform, Text as RNText, View } from 'react-native';

import { TapScoreField } from './TapScoreField';
import { Text } from '@/components/ui';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type TeamDisplay = {
  countryName: string;
  countryCode?: string | null;
  flagUrl?: string | null;
  subtitle?: string | null;
};

type Props = {
  home: TeamDisplay;
  away: TeamDisplay;
  homeScore: number | null;
  awayScore: number | null;
  onHomeChange: (n: number) => void;
  onAwayChange: (n: number) => void;
  disabled?: boolean;
};

export function MatchPredictionRow({
  home,
  away,
  homeScore,
  awayScore,
  onHomeChange,
  onAwayChange,
  disabled,
}: Props) {
  const theme = useTheme();
  const isComplete = homeScore !== null && awayScore !== null;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        backgroundColor: isComplete
          ? withOpacity(theme.colors.primary, 0.06)
          : 'transparent',
        borderRadius: theme.radii.md,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <TeamColumn team={home} align="right" />
      <TapScoreField value={homeScore} onChange={onHomeChange} disabled={disabled} />
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 16,
          color: theme.colors.slate,
        }}
      >
        –
      </RNText>
      <TapScoreField value={awayScore} onChange={onAwayChange} disabled={disabled} />
      <TeamColumn team={away} align="left" />
    </View>
  );
}

function TeamColumn({ team, align }: { team: TeamDisplay; align: 'left' | 'right' }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        flexDirection: align === 'right' ? 'row-reverse' : 'row',
        alignItems: 'center',
        gap: 8,
      }}
    >
      {team.flagUrl ? (
        <Image
          source={{ uri: team.flagUrl }}
          style={{ width: 22, height: 16, borderRadius: 2 }}
          resizeMode="cover"
        />
      ) : (
        <View
          style={{
            width: 22,
            height: 16,
            borderRadius: 2,
            backgroundColor: theme.colors.mist,
          }}
        />
      )}
      <View
        style={{
          flex: 1,
          alignItems: align === 'right' ? 'flex-end' : 'flex-start',
          gap: 2,
        }}
      >
        <RNText
          style={{
            fontFamily: fontFamilies.semibold,
            fontSize: 14,
            color: theme.colors.ink,
            textAlign: align,
          }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          {team.countryName}
        </RNText>
        {team.subtitle ? (
          <Text
            variant="detail"
            color="slate"
            numberOfLines={1}
            style={{ textAlign: align, fontSize: 10 }}
          >
            {team.subtitle}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
