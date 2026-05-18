import { router, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text as RNText,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type {
  BreakdownBonusEntry,
  BreakdownMatchResult,
  BreakdownPoolSettings,
  BreakdownResponse,
} from '@/lib/api';
import { Icon } from '@/components/ui';
import { useBreakdown } from '@/lib/useBreakdown';
import { useEntryAdjustments, type EntryAdjustment } from '@/lib/useEntryAdjustments';
import { fontFamilies, typography, useTheme, withOpacity } from '@/theme';

const STAGE_ORDER = [
  'group',
  'round_32',
  'round_16',
  'quarter_final',
  'semi_final',
  'third_place',
  'final',
];

const STAGE_LABELS: Record<string, string> = {
  group: 'Group Stage',
  round_32: 'Round of 32',
  round_16: 'Round of 16',
  quarter_final: 'Quarter Finals',
  semi_final: 'Semi Finals',
  third_place: 'Third Place',
  final: 'Final',
};

const TYPE_LABELS: Record<BreakdownMatchResult['type'], string> = {
  exact: 'Exact',
  winner_gd: 'W+GD',
  winner: 'Winner',
  miss: 'Miss',
};

const BONUS_CATEGORY_ORDER = [
  'group_standings',
  'qualification',
  'bracket',
  'tournament',
];

const BONUS_CATEGORY_LABELS: Record<string, string> = {
  group_standings: 'Group Standings Bonus',
  qualification: 'Overall Qualification Bonus',
  bracket: 'Knockout & Bracket Bonus',
  tournament: 'Tournament Podium',
  bp_group: 'Group Rankings',
  bp_third_place: 'Third-Place Rankings',
  bp_knockout: 'Knockout Bracket',
  bp_bonus: 'Bracket Picker Bonus',
};

function bonusCategoryLabel(category: string): string {
  if (BONUS_CATEGORY_LABELS[category]) return BONUS_CATEGORY_LABELS[category];
  return category
    .split('_')
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

const BP_CATEGORY_ORDER = [
  'bp_group',
  'bp_third_place',
  'bp_knockout',
  'bp_bonus',
];

type BPPickStatus = 'correct' | 'miss' | 'pending';

function bpPickStatus(entry: BreakdownBonusEntry): BPPickStatus {
  if (entry.points_earned > 0) return 'correct';
  if (entry.bonus_type.endsWith('_pending')) return 'pending';
  return 'miss';
}

function formatAdjustmentDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

const MONO_BOLD = Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace';
const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

export default function BreakdownScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id, entryId } = useLocalSearchParams<{ id: string; entryId: string }>();
  const { data, loading, error } = useBreakdown(id, entryId);
  const { adjustments } = useEntryAdjustments(entryId);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <Header insetTop={insets.top} data={data} />
      {loading && !data ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : error ? (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: theme.spacing.xl,
          }}
        >
          <RNText
            style={{ ...typography.body, color: theme.colors.slate, textAlign: 'center' }}
          >
            {error}
          </RNText>
        </View>
      ) : data ? (
        <Content data={data} adjustments={adjustments} bottomInset={insets.bottom} />
      ) : null}
    </View>
  );
}

function Header({
  insetTop,
  data,
}: {
  insetTop: number;
  data: BreakdownResponse | null;
}) {
  const theme = useTheme();
  const rank = data?.entry.current_rank ?? null;
  const name = data?.user.full_name ?? '';
  const entryName = data?.entry.entry_name ?? '';
  const username = data?.user.username ?? '';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
        paddingTop: insetTop + theme.spacing.sm,
        paddingBottom: theme.spacing.lg,
        backgroundColor: theme.colors.surface,
        ...theme.shadows.card,
      }}
    >
      <RankChip rank={rank} />
      <View style={{ flex: 1, gap: 2 }}>
        <RNText
          style={{
            ...typography.cardTitle,
            color: theme.colors.ink,
          }}
          numberOfLines={1}
        >
          {name || 'Breakdown'}
        </RNText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {entryName ? (
            <RNText
              style={{
                ...typography.body,
                color: theme.colors.slate,
              }}
              numberOfLines={1}
            >
              {entryName}
            </RNText>
          ) : null}
          {username ? (
            <RNText
              style={{
                ...typography.detail,
                color: theme.colors.slate,
              }}
              numberOfLines={1}
            >
              @{username}
            </RNText>
          ) : null}
        </View>
      </View>
      <Pressable
        onPress={() => router.back()}
        hitSlop={theme.spacing.md}
        accessibilityLabel="Close"
        accessibilityRole="button"
        style={({ pressed }) => ({
          width: 32,
          height: 32,
          borderRadius: theme.radii.pill,
          backgroundColor: withOpacity(theme.colors.ink, 0.06),
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Icon name="xmark" size={14} tint={theme.colors.ink} weight="semibold" />
      </Pressable>
    </View>
  );
}

function RankChip({ rank }: { rank: number | null }) {
  const theme = useTheme();
  const bg = rankColor(theme, rank ?? 0);
  const digits = rank !== null ? String(rank).length : 1;
  const fontSize = digits >= 3 ? 15 : digits === 2 ? 17 : 18;
  return (
    <View
      style={{
        minWidth: 52,
        height: 44,
        paddingHorizontal: 12,
        borderRadius: theme.radii.pill,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <RNText
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={{
          fontFamily: MONO_BOLD,
          fontSize,
          fontWeight: '900',
          color: '#fff',
          fontVariant: ['tabular-nums'],
        }}
      >
        {rank !== null ? `#${rank}` : '—'}
      </RNText>
    </View>
  );
}

function Content({
  data,
  adjustments,
  bottomInset,
}: {
  data: BreakdownResponse;
  adjustments: EntryAdjustment[];
  bottomInset: number;
}) {
  const theme = useTheme();
  const isBP = data.prediction_mode === 'bracket_picker';
  return (
    <ScrollView
      contentContainerStyle={{
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.lg,
        paddingBottom: bottomInset + theme.spacing.xl,
        gap: theme.spacing.lg,
      }}
    >
      <SummaryCard data={data} isBP={isBP} />
      {data.entry.point_adjustment !== 0 ? (
        <AdjustmentsSection
          amount={data.entry.point_adjustment}
          reason={data.entry.adjustment_reason}
          adjustments={adjustments}
        />
      ) : null}
      {!isBP ? <MatchPointsSection results={data.match_results} /> : null}
      <BonusPointsSection entries={data.bonus_entries} isBP={isBP} />
      {isBP ? (
        <BPScoringRulesSection settings={data.pool_settings} />
      ) : (
        <ScoringRulesSection settings={data.pool_settings} />
      )}
    </ScrollView>
  );
}

// MARK: - Summary

function SummaryCard({ data, isBP }: { data: BreakdownResponse; isBP: boolean }) {
  const theme = useTheme();
  const adjustment = data.entry.point_adjustment;
  const hasAdjustment = adjustment !== 0;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        paddingVertical: 14,
        ...theme.shadows.card,
      }}
    >
      <SummaryCell
        label={isBP ? 'PICKS' : 'MATCH'}
        value={data.summary.match_points}
        color={theme.colors.primary}
      />
      <VDivider />
      <SummaryCell
        label="BONUS"
        value={data.summary.bonus_points}
        color={theme.colors.amber}
      />
      {hasAdjustment ? (
        <>
          <VDivider />
          <SummaryCell
            label="ADJ."
            value={adjustment}
            color={adjustment > 0 ? theme.colors.green : theme.colors.red}
            signed
          />
        </>
      ) : null}
      <VDivider />
      <SummaryCell
        label="TOTAL"
        value={data.summary.total_points}
        color={theme.colors.ink}
        bold
      />
    </View>
  );
}

function SummaryCell({
  label,
  value,
  color,
  bold,
  signed,
}: {
  label: string;
  value: number;
  color: string;
  bold?: boolean;
  signed?: boolean;
}) {
  const theme = useTheme();
  const display = signed && value > 0 ? `+${value}` : `${value}`;
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
      <RNText
        style={{
          ...typography.caption,
          color: theme.colors.slate,
        }}
      >
        {label}
      </RNText>
      <RNText
        style={{
          fontFamily: MONO_BOLD,
          fontSize: bold ? 24 : 20,
          fontWeight: bold ? '900' : '800',
          color,
          fontVariant: ['tabular-nums'],
        }}
      >
        {display}
      </RNText>
    </View>
  );
}

function VDivider() {
  const theme = useTheme();
  return (
    <View
      style={{
        width: 1,
        height: 36,
        backgroundColor: withOpacity(theme.colors.silver, 0.4),
      }}
    />
  );
}

// MARK: - Adjustments

function AdjustmentsSection({
  amount,
  reason,
  adjustments,
}: {
  amount: number;
  reason: string | null;
  adjustments: EntryAdjustment[];
}) {
  const theme = useTheme();
  const positive = amount > 0;
  const totalColor = positive ? theme.colors.green : theme.colors.red;
  const hasLedger = adjustments.length > 0;

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: 16,
        gap: 10,
        ...theme.shadows.card,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <RNText
          style={{
            ...typography.sectionHeader,
            color: theme.colors.ink,
          }}
        >
          Point Adjustments
        </RNText>
        <RNText
          style={{
            fontFamily: MONO_BOLD,
            fontSize: 17,
            fontWeight: '800',
            color: totalColor,
            fontVariant: ['tabular-nums'],
          }}
        >
          {positive ? `+${amount}` : `${amount}`}
        </RNText>
      </View>

      <View
        style={{
          height: 1,
          backgroundColor: withOpacity(theme.colors.silver, 0.5),
        }}
      />

      {hasLedger ? (
        <View style={{ gap: theme.spacing.sm }}>
          {adjustments.map((adj) => (
            <AdjustmentRow key={adj.id} adjustment={adj} />
          ))}
        </View>
      ) : reason ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 10,
            padding: 10,
            borderRadius: theme.radii.sm,
            backgroundColor: theme.colors.amberLight,
          }}
        >
          <Icon name="info.circle.fill" size={14} tint={theme.colors.amber} weight="semibold" />
          <View style={{ flex: 1, gap: 4 }}>
            <RNText
              style={{
                ...typography.caption,
                color: theme.colors.slate,
              }}
            >
              REASON
            </RNText>
            <RNText
              style={{
                ...typography.body,
                color: theme.colors.ink,
              }}
            >
              {reason}
            </RNText>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function AdjustmentRow({ adjustment }: { adjustment: EntryAdjustment }) {
  const theme = useTheme();
  const positive = adjustment.amount > 0;
  const color = positive ? theme.colors.green : theme.colors.red;
  const dateLabel = formatAdjustmentDate(adjustment.createdAt);

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        padding: 10,
        borderRadius: theme.radii.sm,
        backgroundColor: theme.colors.amberLight,
      }}
    >
      <RNText
        style={{
          width: 44,
          textAlign: 'right',
          fontFamily: MONO_BOLD,
          fontSize: 14,
          fontWeight: '800',
          color,
          fontVariant: ['tabular-nums'],
        }}
      >
        {positive ? `+${adjustment.amount}` : `${adjustment.amount}`}
      </RNText>
      <View style={{ flex: 1, gap: 2 }}>
        <RNText
          style={{
            ...typography.body,
            color: theme.colors.ink,
          }}
        >
          {adjustment.reason || 'No reason provided'}
        </RNText>
        {dateLabel ? (
          <RNText
            style={{
              ...typography.detail,
              color: theme.colors.slate,
            }}
          >
            {dateLabel}
          </RNText>
        ) : null}
      </View>
    </View>
  );
}

// MARK: - Match Points

function MatchPointsSection({ results }: { results: BreakdownMatchResult[] }) {
  const theme = useTheme();
  const grouped = new Map<string, BreakdownMatchResult[]>();
  for (const r of results) {
    const arr = grouped.get(r.stage) ?? [];
    arr.push(r);
    grouped.set(r.stage, arr);
  }

  return (
    <View style={{ gap: theme.spacing.md }}>
      <SectionHeader label="Match Points" />
      {results.length === 0 ? (
        <EmptyPlaceholder
          title="No completed matches with predictions yet"
          subtitle="Match points appear here once results are scored."
        />
      ) : (
        STAGE_ORDER.map((stage) => {
          const stageResults = grouped.get(stage);
          if (!stageResults || stageResults.length === 0) return null;
          return <StageCard key={stage} stage={stage} results={stageResults} />;
        })
      )}
    </View>
  );
}

function StageCard({
  stage,
  results,
}: {
  stage: string;
  results: BreakdownMatchResult[];
}) {
  const theme = useTheme();
  const stageTotal = results.reduce((s, r) => s + r.total_points, 0);
  const counts = {
    exact: results.filter((r) => r.type === 'exact').length,
    winner_gd: results.filter((r) => r.type === 'winner_gd').length,
    winner: results.filter((r) => r.type === 'winner').length,
    miss: results.filter((r) => r.type === 'miss').length,
  };
  const multiplier = results[0]?.multiplier ?? 1;
  const sorted = [...results].sort((a, b) => a.match_number - b.match_number);
  const hasPills =
    counts.exact > 0 || counts.winner_gd > 0 || counts.winner > 0 || counts.miss > 0;

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        ...theme.shadows.card,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          gap: 8,
        }}
      >
        <RNText
          style={{
            ...typography.cardTitle,
            color: theme.colors.ink,
          }}
        >
          {STAGE_LABELS[stage] ?? stage}
        </RNText>
        {multiplier > 1 ? (
          <View
            style={{
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: theme.radii.pill,
              backgroundColor: theme.colors.primaryLight,
            }}
          >
            <RNText
              style={{
                fontFamily: fontFamilies.bold,
                fontSize: 10,
                color: theme.colors.primary,
              }}
            >
              {multiplier.toFixed(1)}x
            </RNText>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        <RNText
          style={{
            fontFamily: MONO_BOLD,
            fontSize: 14,
            fontWeight: '800',
            color: theme.colors.primary,
            fontVariant: ['tabular-nums'],
          }}
        >
          {stageTotal} pts
        </RNText>
      </View>

      {hasPills ? (
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 6,
            paddingHorizontal: 16,
            paddingVertical: 10,
          }}
        >
          {counts.exact > 0 ? (
            <CountPill label={`${counts.exact} Exact`} color={theme.colors.tierExact} />
          ) : null}
          {counts.winner_gd > 0 ? (
            <CountPill
              label={`${counts.winner_gd} W+GD`}
              color={theme.colors.tierWinnerGd}
            />
          ) : null}
          {counts.winner > 0 ? (
            <CountPill
              label={`${counts.winner} Winner`}
              color={theme.colors.tierWinner}
            />
          ) : null}
          {counts.miss > 0 ? (
            <CountPill label={`${counts.miss} Miss`} color={theme.colors.slate} />
          ) : null}
        </View>
      ) : null}

      <View>
        {sorted.map((r) => (
          <MatchRow key={r.match_number} result={r} />
        ))}
      </View>

      <View style={{ height: 8 }} />
    </View>
  );
}

function MatchRow({ result }: { result: BreakdownMatchResult }) {
  const theme = useTheme();
  const typeColor = matchTypeColor(theme, result.type);
  const teamMismatch =
    !result.teams_match &&
    result.predicted_home_team !== null &&
    result.predicted_away_team !== null;

  return (
    <View
      style={{
        paddingHorizontal: 16,
        paddingVertical: 6,
        gap: 4,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View
          style={{
            width: 52,
            alignItems: 'center',
            paddingHorizontal: 6,
            paddingVertical: 3,
            borderRadius: theme.radii.pill,
            backgroundColor: withOpacity(typeColor, 0.12),
          }}
        >
          <RNText
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 9,
              color: typeColor,
            }}
          >
            {TYPE_LABELS[result.type]}
          </RNText>
        </View>

        <View style={{ width: 36, alignItems: 'center', gap: 1 }}>
          <RNText
            style={{
              fontFamily: MONO,
              fontSize: 12,
              color: theme.colors.ink,
            }}
          >
            {result.predicted_home}-{result.predicted_away}
          </RNText>
          <RNText
            style={{
              fontFamily: fontFamilies.medium,
              fontSize: 8,
              color: theme.colors.slate,
            }}
          >
            Pred
          </RNText>
        </View>

        <View style={{ width: 40, alignItems: 'center', gap: 1 }}>
          <RNText
            style={{
              fontFamily: MONO,
              fontSize: 12,
              color: theme.colors.ink,
            }}
          >
            {result.actual_home}-{result.actual_away}
          </RNText>
          <RNText
            style={{
              fontFamily: fontFamilies.medium,
              fontSize: 8,
              color: theme.colors.slate,
            }}
          >
            Actual
          </RNText>
        </View>

        <RNText
          style={{
            flex: 1,
            ...typography.detail,
            color: theme.colors.slate,
          }}
          numberOfLines={1}
        >
          {result.home_team} v {result.away_team}
        </RNText>

        <RNText
          style={{
            fontFamily: MONO_BOLD,
            fontSize: 12,
            fontWeight: '800',
            color: result.total_points > 0 ? theme.colors.green : theme.colors.slate,
            fontVariant: ['tabular-nums'],
          }}
        >
          {result.total_points > 0 ? `+${result.total_points}` : '0'}
        </RNText>
      </View>

      {teamMismatch ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 60 }}>
          <Icon name="arrow.triangle.branch" size={8} tint={theme.colors.amber} weight="medium" />
          <RNText
            style={{
              ...typography.detail,
              color: theme.colors.amber,
            }}
            numberOfLines={1}
          >
            You predicted: {result.predicted_home_team} v {result.predicted_away_team}
          </RNText>
        </View>
      ) : null}
    </View>
  );
}

function CountPill({ label, color }: { label: string; color: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: theme.radii.pill,
        backgroundColor: withOpacity(color, 0.12),
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.semibold,
          fontSize: 10,
          color,
        }}
      >
        {label}
      </RNText>
    </View>
  );
}

// MARK: - Bonus Points

function statusColor(theme: ReturnType<typeof useTheme>, status: BPPickStatus): string {
  if (status === 'correct') return theme.colors.green;
  if (status === 'pending') return theme.colors.amber;
  return theme.colors.slate;
}

function statusLabel(status: BPPickStatus): string {
  if (status === 'correct') return 'Correct';
  if (status === 'pending') return 'Pending';
  return 'Miss';
}

function StatusPill({ status }: { status: BPPickStatus }) {
  const theme = useTheme();
  const color = statusColor(theme, status);
  return (
    <View
      style={{
        width: 56,
        alignItems: 'center',
        paddingHorizontal: 6,
        paddingVertical: 3,
        borderRadius: theme.radii.pill,
        backgroundColor: withOpacity(color, 0.12),
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 9,
          color,
        }}
      >
        {statusLabel(status).toUpperCase()}
      </RNText>
    </View>
  );
}

function StatusCountPill({
  status,
  count,
}: {
  status: BPPickStatus;
  count: number;
}) {
  const theme = useTheme();
  const color = statusColor(theme, status);
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: theme.radii.pill,
        backgroundColor: withOpacity(color, 0.12),
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.semibold,
          fontSize: 10,
          color,
        }}
      >
        {count} {statusLabel(status)}
      </RNText>
    </View>
  );
}

function BonusPointsSection({
  entries,
  isBP,
}: {
  entries: BreakdownBonusEntry[];
  isBP: boolean;
}) {
  const theme = useTheme();
  const grouped = new Map<string, BreakdownBonusEntry[]>();
  for (const e of entries) {
    const arr = grouped.get(e.bonus_category) ?? [];
    arr.push(e);
    grouped.set(e.bonus_category, arr);
  }
  const order = isBP ? BP_CATEGORY_ORDER : BONUS_CATEGORY_ORDER;
  const knownOrdered = order.filter((c) => grouped.has(c));
  const extras = [...grouped.keys()].filter((c) => !order.includes(c)).sort();
  const orderedCategories = [...knownOrdered, ...extras];

  const sectionLabel = isBP ? 'Points Breakdown' : 'Bonus Points';
  const emptyTitle = isBP
    ? 'No points calculated yet'
    : 'No bonus points earned yet';
  const emptySubtitle = isBP
    ? 'Points are calculated as tournament stages complete.'
    : 'Bonus points are calculated as tournament stages complete.';

  return (
    <View style={{ gap: theme.spacing.md }}>
      <SectionHeader label={sectionLabel} />
      {entries.length === 0 ? (
        <EmptyPlaceholder title={emptyTitle} subtitle={emptySubtitle} />
      ) : (
        orderedCategories.map((category) => (
          <BonusCategoryCard
            key={category}
            category={category}
            entries={grouped.get(category) ?? []}
            isBP={isBP}
          />
        ))
      )}
    </View>
  );
}

function BonusCategoryCard({
  category,
  entries,
  isBP,
}: {
  category: string;
  entries: BreakdownBonusEntry[];
  isBP: boolean;
}) {
  const theme = useTheme();
  const subtotal = entries.reduce((s, e) => s + e.points_earned, 0);

  const bpStats = isBP
    ? entries.reduce(
        (acc, e) => {
          acc[bpPickStatus(e)] += 1;
          return acc;
        },
        { correct: 0, miss: 0, pending: 0 } as Record<BPPickStatus, number>,
      )
    : null;
  const hasStatsRow =
    !!bpStats && (bpStats.correct > 0 || bpStats.miss > 0 || bpStats.pending > 0);

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        ...theme.shadows.card,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        <RNText
          style={{
            ...typography.cardTitle,
            color: theme.colors.ink,
            flexShrink: 1,
          }}
          numberOfLines={1}
        >
          {bonusCategoryLabel(category)}
        </RNText>
        <RNText
          style={{
            fontFamily: MONO_BOLD,
            fontSize: 14,
            fontWeight: '800',
            color: theme.colors.amber,
            fontVariant: ['tabular-nums'],
          }}
        >
          {subtotal} pts
        </RNText>
      </View>

      {hasStatsRow ? (
        <View
          style={{
            flexDirection: 'row',
            gap: 6,
            paddingHorizontal: 16,
            paddingVertical: 10,
          }}
        >
          {bpStats!.correct > 0 ? (
            <StatusCountPill status="correct" count={bpStats!.correct} />
          ) : null}
          {bpStats!.miss > 0 ? (
            <StatusCountPill status="miss" count={bpStats!.miss} />
          ) : null}
          {bpStats!.pending > 0 ? (
            <StatusCountPill status="pending" count={bpStats!.pending} />
          ) : null}
        </View>
      ) : null}

      <View>
        {entries.map((e, i) => (
          <View
            key={`${e.bonus_type}-${i}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 16,
              paddingVertical: 6,
            }}
          >
            {isBP ? <StatusPill status={bpPickStatus(e)} /> : null}
            <RNText
              style={{
                flex: 1,
                ...typography.body,
                color: theme.colors.slate,
              }}
            >
              {e.description}
            </RNText>
            <RNText
              style={{
                fontFamily: MONO_BOLD,
                fontSize: 12,
                fontWeight: '800',
                color: e.points_earned > 0 ? theme.colors.amber : theme.colors.slate,
                fontVariant: ['tabular-nums'],
              }}
            >
              {e.points_earned > 0 ? `+${e.points_earned}` : '0'}
            </RNText>
          </View>
        ))}
      </View>

      <View style={{ height: 6 }} />
    </View>
  );
}

// MARK: - Scoring Rules

function ScoringRulesSection({ settings }: { settings: BreakdownPoolSettings }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.md }}>
      <SectionHeader label="Scoring Rules" />
      <RuleCard title="Group Stage Points">
        <RuleRow label="Exact Score" value={`${settings.group_exact_score} pts`} />
        <RuleRow
          label="Correct Winner + GD"
          value={`${settings.group_correct_difference} pts`}
        />
        <RuleRow
          label="Correct Result Only"
          value={`${settings.group_correct_result} pts`}
        />
      </RuleCard>
      <RuleCard title="Knockout Base Points">
        <RuleRow label="Exact Score" value={`${settings.knockout_exact_score} pts`} />
        <RuleRow
          label="Correct Winner + GD"
          value={`${settings.knockout_correct_difference} pts`}
        />
        <RuleRow
          label="Correct Result Only"
          value={`${settings.knockout_correct_result} pts`}
        />
      </RuleCard>
      <RuleCard title="Round Multipliers">
        <RuleRow label="Round of 32" value={`${settings.round_32_multiplier.toFixed(1)}x`} accent />
        <RuleRow label="Round of 16" value={`${settings.round_16_multiplier.toFixed(1)}x`} accent />
        <RuleRow
          label="Quarter Finals"
          value={`${settings.quarter_final_multiplier.toFixed(1)}x`}
          accent
        />
        <RuleRow
          label="Semi Finals"
          value={`${settings.semi_final_multiplier.toFixed(1)}x`}
          accent
        />
        <RuleRow
          label="Third Place"
          value={`${settings.third_place_multiplier.toFixed(1)}x`}
          accent
        />
        <RuleRow label="Final" value={`${settings.final_multiplier.toFixed(1)}x`} accent />
      </RuleCard>
      {settings.pso_enabled ? (
        <RuleCard title="Penalty Shootout Bonus">
          {settings.pso_exact_score !== null ? (
            <RuleRow label="Exact PSO Score" value={`${settings.pso_exact_score} pts`} />
          ) : null}
          {settings.pso_correct_difference !== null ? (
            <RuleRow
              label="Correct PSO Winner + GD"
              value={`${settings.pso_correct_difference} pts`}
            />
          ) : null}
          {settings.pso_correct_result !== null ? (
            <RuleRow
              label="Correct PSO Winner"
              value={`${settings.pso_correct_result} pts`}
            />
          ) : null}
        </RuleCard>
      ) : null}
    </View>
  );
}

function BPScoringRulesSection({ settings }: { settings: BreakdownPoolSettings }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.md }}>
      <SectionHeader label="Scoring Rules" />
      <RuleCard title="Group Stage Rankings">
        <RuleRow
          label="Correct 1st Place"
          value={`${settings.bp_group_correct_1st ?? 4} pts`}
        />
        <RuleRow
          label="Correct 2nd Place"
          value={`${settings.bp_group_correct_2nd ?? 3} pts`}
        />
        <RuleRow
          label="Correct 3rd Place"
          value={`${settings.bp_group_correct_3rd ?? 2} pts`}
        />
        <RuleRow
          label="Correct 4th Place"
          value={`${settings.bp_group_correct_4th ?? 1} pts`}
        />
      </RuleCard>
      <RuleCard title="Third-Place Rankings">
        <RuleRow
          label="Correct qualifier"
          value={`${settings.bp_third_correct_qualifier ?? 2} pts`}
        />
        <RuleRow
          label="Correct eliminated"
          value={`${settings.bp_third_correct_eliminated ?? 1} pts`}
        />
        <RuleRow
          label="All 8 qualifiers correct bonus"
          value={`${settings.bp_third_all_correct_bonus ?? 10} pts`}
        />
      </RuleCard>
      <RuleCard title="Knockout Stage">
        <RuleRow label="Round of 32" value={`${settings.bp_r32_correct ?? 1} pts`} />
        <RuleRow label="Round of 16" value={`${settings.bp_r16_correct ?? 2} pts`} />
        <RuleRow label="Quarter Finals" value={`${settings.bp_qf_correct ?? 4} pts`} />
        <RuleRow label="Semi Finals" value={`${settings.bp_sf_correct ?? 8} pts`} />
        <RuleRow
          label="3rd Place Match"
          value={`${settings.bp_third_place_match_correct ?? 10} pts`}
        />
        <RuleRow label="Final" value={`${settings.bp_final_correct ?? 20} pts`} />
      </RuleCard>
      <RuleCard title="Bonus Points">
        <RuleRow
          label="Champion correct"
          value={`${settings.bp_champion_bonus ?? 50} pts`}
        />
        <RuleRow
          label="Penalty prediction"
          value={`${settings.bp_penalty_correct ?? 1} pts`}
        />
      </RuleCard>
    </View>
  );
}

function RuleCard({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        ...theme.shadows.card,
      }}
    >
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 12,
        }}
      >
        <RNText
          style={{
            ...typography.cardTitle,
            color: theme.colors.ink,
          }}
        >
          {title}
        </RNText>
      </View>
      <View>{children}</View>
      <View style={{ height: 6 }} />
    </View>
  );
}

function RuleRow({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 6,
      }}
    >
      <RNText
        style={{
          ...typography.body,
          color: theme.colors.slate,
        }}
      >
        {label}
      </RNText>
      <RNText
        style={{
          fontFamily: MONO,
          fontSize: 12,
          color: accent ? theme.colors.primary : theme.colors.slate,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </RNText>
    </View>
  );
}

// MARK: - Section Header

function SectionHeader({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        paddingHorizontal: 16,
        paddingVertical: 10,
        ...theme.shadows.card,
      }}
    >
      <RNText
        style={{
          ...typography.sectionHeader,
          color: theme.colors.ink,
        }}
      >
        {label}
      </RNText>
    </View>
  );
}

function EmptyPlaceholder({ title, subtitle }: { title: string; subtitle: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        gap: theme.spacing.xs,
        paddingVertical: theme.spacing.xl,
        paddingHorizontal: theme.spacing.lg,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        ...theme.shadows.card,
      }}
    >
      <RNText
        style={{
          ...typography.cardTitle,
          color: theme.colors.slate,
          textAlign: 'center',
        }}
      >
        {title}
      </RNText>
      <RNText
        style={{
          ...typography.body,
          color: theme.colors.slate,
          textAlign: 'center',
        }}
      >
        {subtitle}
      </RNText>
    </View>
  );
}

function rankColor(theme: ReturnType<typeof useTheme>, rank: number): string {
  if (rank === 1) return theme.colors.accent;
  if (rank === 2) return theme.colors.silver;
  if (rank === 3) return theme.colors.bronze;
  return theme.colors.slate;
}

function matchTypeColor(
  theme: ReturnType<typeof useTheme>,
  type: BreakdownMatchResult['type'],
): string {
  switch (type) {
    case 'exact':
      return theme.colors.tierExact;
    case 'winner_gd':
      return theme.colors.tierWinnerGd;
    case 'winner':
      return theme.colors.tierWinner;
    case 'miss':
    default:
      return theme.colors.slate;
  }
}
