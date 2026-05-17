import { ActivityIndicator, Text as RNText, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { usePoolSettings, type PoolSettings } from '@/lib/usePoolSettings';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type BonusRow = { label: string; pts: number };

function collectBonusRows(s: PoolSettings): BonusRow[] {
  const rows: BonusRow[] = [];
  const push = (label: string, v: number | null) => {
    if (v !== null && v !== undefined && v > 0) rows.push({ label, pts: v });
  };
  push('Winner & Runner-up', s.bonusGroupWinnerAndRunnerup);
  push('Winner Only', s.bonusGroupWinnerOnly);
  push('Runner-up Only', s.bonusGroupRunnerupOnly);
  push('Both Qualify (Swapped)', s.bonusBothQualifySwapped);
  push('One Qualifies (Wrong Pos)', s.bonusOneQualifiesWrongPosition);
  push('All 16 Qualified', s.bonusAll16Qualified);
  push('12-15 Qualified', s.bonus12_15Qualified);
  push('8-11 Qualified', s.bonus8_11Qualified);
  push('Correct Bracket Pairing', s.bonusCorrectBracketPairing);
  push('Match Winner Correct', s.bonusMatchWinnerCorrect);
  push('Champion Correct', s.bonusChampionCorrect);
  push('2nd Place Correct', s.bonusSecondPlaceCorrect);
  push('3rd Place Correct', s.bonusThirdPlaceCorrect);
  push('Top Scorer Correct', s.bonusTopScorerCorrect);
  push('Best Player Correct', s.bonusBestPlayerCorrect);
  return rows;
}

type Props = {
  poolId: string;
  predictionMode?: string | null;
};

export function ScoringTab({ poolId, predictionMode }: Props) {
  const theme = useTheme();
  const { settings, loading } = usePoolSettings(poolId);
  const isBP = predictionMode === 'bracket_picker';

  if (loading && !settings) {
    return (
      <View style={{ paddingVertical: theme.spacing.xxxl, alignItems: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (!settings) {
    return (
      <View
        style={{
          alignItems: 'center',
          gap: theme.spacing.sm,
          paddingHorizontal: theme.spacing.xl,
          paddingVertical: theme.spacing.xxxl,
        }}
      >
        <Icon name="list.number" color="silver" size={36} />
        <Text variant="cardTitle" align="center">
          No scoring rules
        </Text>
        <Text variant="body" color="slate" align="center">
          Scoring rules haven&apos;t been configured for this pool yet.
        </Text>
      </View>
    );
  }

  if (isBP) {
    return (
      <View
        style={{
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.xxxl,
          gap: theme.spacing.lg,
        }}
      >
        <Card>
          <SectionHeader title="Group Stage Rankings" />
          <ScoreRow
            label="Correct 1st Place"
            value={`${settings.bpGroupCorrect1st ?? 4} pts`}
          />
          <ScoreRow
            label="Correct 2nd Place"
            value={`${settings.bpGroupCorrect2nd ?? 3} pts`}
          />
          <ScoreRow
            label="Correct 3rd Place"
            value={`${settings.bpGroupCorrect3rd ?? 2} pts`}
          />
          <ScoreRow
            label="Correct 4th Place"
            value={`${settings.bpGroupCorrect4th ?? 1} pts`}
          />
        </Card>

        <Card>
          <SectionHeader title="Third-Place Rankings" />
          <ScoreRow
            label="Correct Qualifier"
            value={`${settings.bpThirdCorrectQualifier ?? 2} pts`}
          />
          <ScoreRow
            label="Correct Eliminated"
            value={`${settings.bpThirdCorrectEliminated ?? 1} pts`}
          />
          <ScoreRow
            label="All 8 Qualifiers Bonus"
            value={`${settings.bpThirdAllCorrectBonus ?? 10} pts`}
          />
        </Card>

        <Card>
          <SectionHeader title="Knockout Stage" />
          <ScoreRow label="Round of 32" value={`${settings.bpR32Correct ?? 1} pts`} />
          <ScoreRow label="Round of 16" value={`${settings.bpR16Correct ?? 2} pts`} />
          <ScoreRow label="Quarter Finals" value={`${settings.bpQfCorrect ?? 4} pts`} />
          <ScoreRow label="Semi Finals" value={`${settings.bpSfCorrect ?? 8} pts`} />
          <ScoreRow
            label="3rd Place Match"
            value={`${settings.bpThirdPlaceMatchCorrect ?? 10} pts`}
          />
          <ScoreRow label="Final" value={`${settings.bpFinalCorrect ?? 20} pts`} />
        </Card>

        <Card>
          <SectionHeader title="Bonus Points" />
          <ScoreRow
            label="Champion Correct"
            value={`${settings.bpChampionBonus ?? 50} pts`}
          />
          <ScoreRow
            label="Penalty Prediction"
            value={`${settings.bpPenaltyCorrect ?? 1} pts`}
          />
        </Card>
      </View>
    );
  }

  const bonusRows = collectBonusRows(settings);

  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.md,
        paddingBottom: theme.spacing.xxxl,
        gap: theme.spacing.lg,
      }}
    >
      <Card>
        <SectionHeader title="Group Stage" />
        <ScoreRow label="Exact Score" value={`${settings.groupExactScore} pts`} />
        <ScoreRow label="Correct Difference" value={`${settings.groupCorrectDifference} pts`} />
        <ScoreRow label="Correct Result" value={`${settings.groupCorrectResult} pts`} />
      </Card>

      <Card>
        <SectionHeader title="Knockout Stage" />
        <ScoreRow label="Exact Score" value={`${settings.knockoutExactScore} pts`} />
        <ScoreRow label="Correct Difference" value={`${settings.knockoutCorrectDifference} pts`} />
        <ScoreRow label="Correct Result" value={`${settings.knockoutCorrectResult} pts`} />

        <Divider />

        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 13,
            color: theme.colors.slate,
            letterSpacing: 0.3,
            textTransform: 'uppercase',
            marginTop: 4,
          }}
        >
          Round Multipliers
        </RNText>
        <MultiplierRow label="Round of 32" value={settings.round32Multiplier} />
        <MultiplierRow label="Round of 16" value={settings.round16Multiplier} />
        <MultiplierRow label="Quarter Final" value={settings.quarterFinalMultiplier} />
        <MultiplierRow label="Semi Final" value={settings.semiFinalMultiplier} />
        <MultiplierRow label="3rd Place" value={settings.thirdPlaceMultiplier} />
        <MultiplierRow label="Final" value={settings.finalMultiplier} />
      </Card>

      {settings.psoEnabled ? (
        <Card>
          <SectionHeader title="Penalty Shootout" />
          {settings.psoExactScore !== null ? (
            <ScoreRow label="Exact Score" value={`${settings.psoExactScore} pts`} />
          ) : null}
          {settings.psoCorrectDifference !== null ? (
            <ScoreRow label="Correct Difference" value={`${settings.psoCorrectDifference} pts`} />
          ) : null}
          {settings.psoCorrectResult !== null ? (
            <ScoreRow label="Correct Result" value={`${settings.psoCorrectResult} pts`} />
          ) : null}
        </Card>
      ) : null}

      {bonusRows.length > 0 ? (
        <Card>
          <SectionHeader title="Bonus Points" />
          {bonusRows.map((row) => (
            <ScoreRow key={row.label} label={row.label} value={`${row.pts} pts`} />
          ))}
        </Card>
      ) : null}
    </View>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.lg,
        gap: 10,
        ...theme.shadows.card,
      }}
    >
      {children}
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <Text variant="sectionHeader">{title}</Text>
      <View
        style={{
          height: 0.5,
          backgroundColor: withOpacity(theme.colors.silver, 0.6),
        }}
      />
    </View>
  );
}

function Divider() {
  const theme = useTheme();
  return (
    <View
      style={{
        height: 0.5,
        backgroundColor: withOpacity(theme.colors.silver, 0.5),
        marginVertical: 4,
      }}
    />
  );
}

function ScoreRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 4,
      }}
    >
      <Text variant="body" color="slate" style={{ flex: 1 }}>
        {label}
      </Text>
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 14,
          color: theme.colors.ink,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </RNText>
    </View>
  );
}

function MultiplierRow({ label, value }: { label: string; value: number }) {
  const theme = useTheme();
  const display = value === Math.floor(value) ? `×${value}` : `×${value.toFixed(1)}`;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 4,
      }}
    >
      <Text variant="body" color="slate" style={{ flex: 1 }}>
        {label}
      </Text>
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 14,
          color: theme.colors.ink,
          fontVariant: ['tabular-nums'],
        }}
      >
        {display}
      </RNText>
    </View>
  );
}
