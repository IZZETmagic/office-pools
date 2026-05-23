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
  /**
   * Optional Penalty Shootout (PSO) inputs. Surface a second score row
   * below the main row when ALL of:
   *   - psoEnabled is true (pool admin turned on PSO scoring),
   *   - isKnockout is true (group-stage draws don't go to penalties),
   *   - homeScore === awayScore and both are non-null (tie after 90/120
   *     minutes is the only path to a shootout in real life).
   * If those are false the PSO fields render nothing and the row is
   * visually identical to before.
   */
  psoEnabled?: boolean;
  isKnockout?: boolean;
  homePso?: number | null;
  awayPso?: number | null;
  onHomePsoChange?: (n: number) => void;
  onAwayPsoChange?: (n: number) => void;
};

export function MatchPredictionRow({
  home,
  away,
  homeScore,
  awayScore,
  onHomeChange,
  onAwayChange,
  disabled,
  psoEnabled,
  isKnockout,
  homePso,
  awayPso,
  onHomePsoChange,
  onAwayPsoChange,
}: Props) {
  const theme = useTheme();
  const isComplete = homeScore !== null && awayScore !== null;
  const isTied = isComplete && homeScore === awayScore;
  // Only surface PSO inputs when the admin opted into PSO scoring, the
  // match is in the knockout phase, AND the user has predicted a tie.
  // A tie is the only path to a shootout in real knockout play, so the
  // inputs only become relevant in that scenario.
  const showPso =
    !!psoEnabled &&
    !!isKnockout &&
    isTied &&
    !!onHomePsoChange &&
    !!onAwayPsoChange;

  return (
    <View
      style={{
        gap: showPso ? theme.spacing.xs : 0,
        paddingVertical: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        backgroundColor: isComplete
          ? withOpacity(theme.colors.primary, 0.06)
          : 'transparent',
        borderRadius: theme.radii.md,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
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
      {showPso ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.sm,
            paddingTop: theme.spacing.xs,
            marginTop: 2,
            borderTopWidth: 1,
            borderTopColor: withOpacity(theme.colors.primary, 0.12),
          }}
        >
          <RNText
            style={{
              fontFamily: fontFamilies.semibold,
              fontSize: 10,
              letterSpacing: 1.4,
              color: theme.colors.slate,
              textTransform: 'uppercase',
              marginRight: theme.spacing.xs,
            }}
          >
            Penalties
          </RNText>
          <TapScoreField
            value={homePso ?? null}
            onChange={onHomePsoChange!}
            disabled={disabled}
          />
          <RNText
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 14,
              color: theme.colors.slate,
            }}
          >
            –
          </RNText>
          <TapScoreField
            value={awayPso ?? null}
            onChange={onAwayPsoChange!}
            disabled={disabled}
          />
        </View>
      ) : null}
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
