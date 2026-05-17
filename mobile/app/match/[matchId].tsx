import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text as RNText,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui';
import {
  type BracketPickInfo,
  type GroupStanding,
  type MatchPredictionInfo,
  useMatchDetail,
} from '@/lib/useMatchDetail';
import type { BracketStatsResponse, MatchStatsResponse } from '@/lib/api';
import type { ResultsMatch } from '@/lib/useTournamentMatches';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

const MONO_BOLD = Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace';
const MONO = Platform.OS === 'ios' ? 'Menlo' : 'monospace';

export default function MatchDetailScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const {
    match,
    predictionInfos,
    matchStats,
    bracketStats,
    groupStandings,
    loading,
    error,
    refresh,
  } = useMatchDetail(matchId);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      {/* Full-bleed blue header band — extends behind the status bar. The
          status-bar safe-area inset is added as paddingTop here (not by a
          parent SafeAreaView) so the tint actually fills it. Contains the
          back button row and (once loaded) the teams/score header content. */}
      <View
        style={{
          paddingTop: insets.top,
          backgroundColor: withOpacity(theme.colors.primary, 0.08),
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 4,
          }}
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: withOpacity(theme.colors.ink, 0.06),
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            {Platform.OS === 'ios' ? (
              <SymbolView
                name="chevron.left"
                size={16}
                tintColor={theme.colors.ink}
                weight="semibold"
              />
            ) : (
              <RNText
                style={{
                  fontSize: 18,
                  fontFamily: fontFamilies.bold,
                  color: theme.colors.ink,
                  lineHeight: 18,
                }}
              >
                ‹
              </RNText>
            )}
          </Pressable>
        </View>
        {match ? <MatchHeader match={match} /> : null}
      </View>

      {loading && !match ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : error && !match ? (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 32,
            gap: 12,
          }}
        >
          <Text variant="cardTitle" align="center">
            Unable to load match
          </Text>
          <Text variant="body" color="slate" align="center">
            {error}
          </Text>
        </View>
      ) : match ? (
        <ScrollView
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 32, gap: 16 }}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={refresh}
              tintColor={theme.colors.primary}
            />
          }
        >
          <MatchInfoCard match={match} />
          {groupStandings.length > 0 ? (
            <GroupStandingsCard groupLetter={match.groupLetter} standings={groupStandings} />
          ) : null}
          {(matchStats && matchStats.total_predictions > 0) ||
          hasBracketGroupStats(bracketStats) ? (
            <PredictionStatsSection
              match={match}
              stats={matchStats}
              bracketStats={bracketStats}
            />
          ) : null}
          <YourPredictionsSection match={match} predictionInfos={predictionInfos} />
        </ScrollView>
      ) : null}
    </View>
  );
}

// MARK: - Helpers

function parsedDate(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function homeDisplayName(match: ResultsMatch): string {
  return match.homeTeam?.countryName ?? match.homeTeamPlaceholder ?? 'Home';
}

function awayDisplayName(match: ResultsMatch): string {
  return match.awayTeam?.countryName ?? match.awayTeamPlaceholder ?? 'Away';
}

function stageLabel(match: ResultsMatch): string {
  const label = (() => {
    if (match.groupLetter) return `Group ${match.groupLetter}`;
    switch (match.stage) {
      case 'round_32':
      case 'round_of_32':
        return 'Round of 32';
      case 'round_16':
      case 'round_of_16':
        return 'Round of 16';
      case 'quarter_final':
        return 'Quarter Finals';
      case 'semi_final':
        return 'Semi Finals';
      case 'third_place':
        return 'Third Place';
      case 'final':
        return 'Final';
      default:
        return match.stage.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }
  })();
  return `${label} · Match #${match.matchNumber}`;
}

function formattedFullDate(iso: string): string {
  const d = parsedDate(iso);
  if (!d) return iso;
  return d.toLocaleString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formattedTime(iso: string): string {
  const d = parsedDate(iso);
  if (!d) return '--:--';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function formattedShortDate(iso: string): string {
  const d = parsedDate(iso);
  if (!d) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function FlagView({ url, size = 56 }: { url: string | null | undefined; size?: number }) {
  const theme = useTheme();
  const w = size;
  const h = Math.round(size * 0.67);
  if (!url) {
    return (
      <View
        style={{ width: w, height: h, borderRadius: 4, backgroundColor: theme.colors.mist }}
      />
    );
  }
  return (
    <Image
      source={{ uri: url }}
      style={{ width: w, height: h, borderRadius: 4 }}
      contentFit="cover"
      cachePolicy="memory-disk"
    />
  );
}

// MARK: - Match Header

function MatchHeader({ match }: { match: ResultsMatch }) {
  const theme = useTheme();
  const isLive = match.status === 'live';
  const isFinished = match.status === 'completed';

  return (
    <View
      style={{
        // Outer wrapper (in MatchDetailScreen) owns the blue band + status-bar
        // extension. This view is just the teams/score content laid out
        // inside that band.
        paddingHorizontal: 20,
        paddingTop: 4,
        paddingBottom: 20,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {/* Home team */}
        <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
          <FlagView url={match.homeTeam?.flagUrl} />
          <RNText
            numberOfLines={2}
            style={{
              fontFamily: fontFamilies.semibold,
              fontSize: 14,
              color: theme.colors.ink,
              textAlign: 'center',
            }}
          >
            {homeDisplayName(match)}
          </RNText>
        </View>

        {/* Center: score / time / LIVE / PSO */}
        <View style={{ width: 110, alignItems: 'center', gap: 4 }}>
          {isLive ? (
            <>
              <ScoreRow home={match.homeScoreFt ?? 0} away={match.awayScoreFt ?? 0} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: theme.colors.red,
                  }}
                />
                <RNText
                  style={{
                    fontFamily: fontFamilies.bold,
                    fontSize: 11,
                    color: theme.colors.red,
                    letterSpacing: 0.3,
                  }}
                >
                  LIVE
                </RNText>
              </View>
            </>
          ) : isFinished ? (
            <>
              <ScoreRow home={match.homeScoreFt ?? 0} away={match.awayScoreFt ?? 0} />
              {match.homeScorePso !== null && match.awayScorePso !== null ? (
                <RNText
                  style={{
                    fontFamily: fontFamilies.medium,
                    fontSize: 11,
                    color: theme.colors.primary,
                  }}
                >
                  ({match.homeScorePso}-{match.awayScorePso} PSO)
                </RNText>
              ) : null}
              <RNText
                style={{
                  fontFamily: fontFamilies.medium,
                  fontSize: 10,
                  color: theme.colors.slate,
                }}
              >
                Full Time
              </RNText>
            </>
          ) : (
            <>
              <RNText
                style={{
                  fontFamily: fontFamilies.bold,
                  fontSize: 22,
                  color: theme.colors.ink,
                }}
              >
                {formattedTime(match.matchDate)}
              </RNText>
              <RNText
                style={{
                  fontFamily: fontFamilies.medium,
                  fontSize: 11,
                  color: theme.colors.slate,
                }}
              >
                {formattedShortDate(match.matchDate)}
              </RNText>
            </>
          )}
        </View>

        {/* Away team */}
        <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
          <FlagView url={match.awayTeam?.flagUrl} />
          <RNText
            numberOfLines={2}
            style={{
              fontFamily: fontFamilies.semibold,
              fontSize: 14,
              color: theme.colors.ink,
              textAlign: 'center',
            }}
          >
            {awayDisplayName(match)}
          </RNText>
        </View>
      </View>
    </View>
  );
}

function ScoreRow({ home, away }: { home: number; away: number }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <RNText
        style={{
          fontFamily: MONO_BOLD,
          fontSize: 28,
          color: theme.colors.ink,
          fontVariant: ['tabular-nums'],
        }}
      >
        {home}
      </RNText>
      <RNText style={{ fontFamily: MONO_BOLD, fontSize: 28, color: theme.colors.slate }}>-</RNText>
      <RNText
        style={{
          fontFamily: MONO_BOLD,
          fontSize: 28,
          color: theme.colors.ink,
          fontVariant: ['tabular-nums'],
        }}
      >
        {away}
      </RNText>
    </View>
  );
}

// MARK: - Match Info Card

function MatchInfoCard({ match }: { match: ResultsMatch }) {
  const theme = useTheme();
  const rows: Array<{ icon: string; emoji: string; label: string }> = [
    { icon: 'sportscourt', emoji: '🏟', label: stageLabel(match) },
    { icon: 'calendar', emoji: '📅', label: formattedFullDate(match.matchDate) },
  ];
  if (match.venue) {
    rows.push({ icon: 'mappin.and.ellipse', emoji: '📍', label: match.venue });
  }

  return (
    <View
      style={{
        marginHorizontal: 20,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        ...theme.shadows.card,
        overflow: 'hidden',
      }}
    >
      {rows.map((r, i) => (
        <View key={r.icon}>
          {i > 0 ? (
            <View
              style={{
                height: 0.5,
                marginHorizontal: 14,
                backgroundColor: withOpacity(theme.colors.mist, 0.5),
              }}
            />
          ) : null}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
          >
            {Platform.OS === 'ios' ? (
              <SymbolView
                name={r.icon as never}
                size={14}
                tintColor={theme.colors.slate}
                weight="medium"
                resizeMode="scaleAspectFit"
                style={{ width: 24, height: 16 }}
              />
            ) : (
              <RNText style={{ width: 24, fontSize: 14 }}>{r.emoji}</RNText>
            )}
            <RNText
              style={{
                flex: 1,
                fontFamily: fontFamilies.medium,
                fontSize: 14,
                color: theme.colors.ink,
              }}
            >
              {r.label}
            </RNText>
          </View>
        </View>
      ))}
    </View>
  );
}

// MARK: - Group Standings

function GroupStandingsCard({
  groupLetter,
  standings,
}: {
  groupLetter: string | null;
  standings: GroupStanding[];
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 12 }}>
      <RNText
        style={{
          marginHorizontal: 20,
          fontFamily: fontFamilies.bold,
          fontSize: 16,
          color: theme.colors.ink,
        }}
      >
        Group {groupLetter ?? ''} Standings
      </RNText>
      <View
        style={{
          marginHorizontal: 20,
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.lg,
          ...theme.shadows.card,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 12,
            paddingVertical: 8,
          }}
        >
          <RNText style={[headerCell, { width: 24, color: theme.colors.slate }]}>#</RNText>
          <RNText style={[headerCell, { flex: 1, color: theme.colors.slate, textAlign: 'left' }]}>
            Team
          </RNText>
          <RNText style={[headerCell, { width: 28, color: theme.colors.slate }]}>P</RNText>
          <RNText style={[headerCell, { width: 34, color: theme.colors.slate }]}>GD</RNText>
          <RNText style={[headerCell, { width: 34, color: theme.colors.slate }]}>Pts</RNText>
        </View>
        <View
          style={{
            height: 0.5,
            marginHorizontal: 12,
            backgroundColor: theme.colors.mist,
          }}
        />
        {standings.map((s, i) => {
          const position = i + 1;
          const positionColor =
            position <= 2 ? theme.colors.green : position === 3 ? theme.colors.amber : theme.colors.slate;
          const rowBg =
            position <= 2
              ? withOpacity(theme.colors.green, 0.04)
              : position === 3
                ? withOpacity(theme.colors.amber, 0.04)
                : 'transparent';
          return (
            <View key={s.teamId}>
              {i > 0 ? (
                <View
                  style={{
                    height: 0.5,
                    marginHorizontal: 12,
                    backgroundColor: withOpacity(theme.colors.mist, 0.5),
                  }}
                />
              ) : null}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  backgroundColor: rowBg,
                }}
              >
                <RNText
                  style={{
                    width: 24,
                    textAlign: 'center',
                    fontFamily: MONO_BOLD,
                    fontSize: 12,
                    color: positionColor,
                  }}
                >
                  {position}
                </RNText>
                {s.flagUrl ? (
                  <Image
                    source={{ uri: s.flagUrl }}
                    style={{ width: 22, height: 15, borderRadius: 3, marginRight: 8 }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                ) : (
                  <View
                    style={{
                      width: 22,
                      height: 15,
                      borderRadius: 3,
                      marginRight: 8,
                      backgroundColor: theme.colors.mist,
                    }}
                  />
                )}
                <RNText
                  numberOfLines={1}
                  style={{
                    flex: 1,
                    fontFamily: fontFamilies.medium,
                    fontSize: 13,
                    color: theme.colors.ink,
                  }}
                >
                  {s.teamName}
                </RNText>
                <RNText
                  style={{
                    width: 28,
                    textAlign: 'center',
                    fontFamily: MONO,
                    fontSize: 12,
                    color: theme.colors.slate,
                  }}
                >
                  {s.played}
                </RNText>
                <RNText
                  style={{
                    width: 34,
                    textAlign: 'center',
                    fontFamily: MONO,
                    fontSize: 12,
                    color:
                      s.goalDifference > 0
                        ? theme.colors.green
                        : s.goalDifference < 0
                          ? theme.colors.red
                          : theme.colors.slate,
                  }}
                >
                  {s.goalDifference > 0 ? `+${s.goalDifference}` : s.goalDifference}
                </RNText>
                <RNText
                  style={{
                    width: 34,
                    textAlign: 'center',
                    fontFamily: MONO_BOLD,
                    fontSize: 13,
                    color: theme.colors.ink,
                  }}
                >
                  {s.points}
                </RNText>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const headerCell = {
  fontFamily: fontFamilies.semibold,
  fontSize: 10,
  textAlign: 'center' as const,
};

// MARK: - Prediction Stats ("How Others Predicted")

function hasBracketGroupStats(bracketStats: BracketStatsResponse | null): boolean {
  const gp = bracketStats?.group_predictions;
  if (!gp) return false;
  const home = gp.home_team?.total_predictions ?? 0;
  const away = gp.away_team?.total_predictions ?? 0;
  return home > 0 || away > 0;
}

function PredictionStatsSection({
  match,
  stats,
  bracketStats,
}: {
  match: ResultsMatch;
  stats: MatchStatsResponse | null;
  bracketStats: BracketStatsResponse | null;
}) {
  const theme = useTheme();
  const hasScoreStats = stats !== null && stats.total_predictions > 0;
  const showBracket = hasBracketGroupStats(bracketStats);
  return (
    <View style={{ gap: 12 }}>
      <RNText
        style={{
          marginHorizontal: 20,
          fontFamily: fontFamilies.bold,
          fontSize: 16,
          color: theme.colors.ink,
        }}
      >
        How Others Predicted
      </RNText>
      {hasScoreStats && stats ? (
        <>
          <ResultDistributionCard match={match} stats={stats} />
          {stats.top_scores.length > 0 ? <TopScoresCard stats={stats} /> : null}
          {stats.exact_correct_pct !== null || stats.result_correct_pct !== null ? (
            <AccuracyCard stats={stats} />
          ) : null}
        </>
      ) : null}
      {showBracket && bracketStats?.group_predictions ? (
        <BracketGroupPositionsCard prediction={bracketStats.group_predictions} />
      ) : null}
    </View>
  );
}

function ResultDistributionCard({
  match,
  stats,
}: {
  match: ResultsMatch;
  stats: MatchStatsResponse;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        marginHorizontal: 20,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: 16,
        gap: 12,
        ...theme.shadows.card,
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.medium,
          fontSize: 12,
          color: theme.colors.slate,
        }}
      >
        {stats.total_predictions} predictions
      </RNText>
      <ResultBar stats={stats} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <ResultLabel
          team={match.homeTeam?.countryName ?? stats.home_team ?? 'Home'}
          pct={stats.home_win_pct}
          color={theme.colors.primary}
          align="flex-start"
        />
        <ResultLabel team="Draw" pct={stats.draw_pct} color={theme.colors.slate} align="center" />
        <ResultLabel
          team={match.awayTeam?.countryName ?? stats.away_team ?? 'Away'}
          pct={stats.away_win_pct}
          color={theme.colors.red}
          align="flex-end"
        />
      </View>
    </View>
  );
}

function ResultBar({ stats }: { stats: MatchStatsResponse }) {
  const theme = useTheme();
  return (
    <View
      style={{
        height: 8,
        flexDirection: 'row',
        gap: 2,
        overflow: 'hidden',
      }}
    >
      {stats.home_win_pct > 0 ? (
        <View
          style={{
            flex: stats.home_win_pct,
            backgroundColor: theme.colors.primary,
            borderRadius: 4,
          }}
        />
      ) : null}
      {stats.draw_pct > 0 ? (
        <View
          style={{
            flex: stats.draw_pct,
            backgroundColor: withOpacity(theme.colors.slate, 0.4),
            borderRadius: 4,
          }}
        />
      ) : null}
      {stats.away_win_pct > 0 ? (
        <View
          style={{
            flex: stats.away_win_pct,
            backgroundColor: theme.colors.red,
            borderRadius: 4,
          }}
        />
      ) : null}
    </View>
  );
}

function ResultLabel({
  team,
  pct,
  color,
  align,
}: {
  team: string;
  pct: number;
  color: string;
  align: 'flex-start' | 'center' | 'flex-end';
}) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: align, gap: 2 }}>
      <RNText
        style={{
          fontFamily: MONO_BOLD,
          fontSize: 20,
          color,
          fontVariant: ['tabular-nums'],
        }}
      >
        {Math.round(pct * 100)}%
      </RNText>
      <RNText
        numberOfLines={1}
        style={{
          fontFamily: fontFamilies.medium,
          fontSize: 10,
          color: theme.colors.slate,
          textAlign: align === 'center' ? 'center' : align === 'flex-start' ? 'left' : 'right',
        }}
      >
        {team}
      </RNText>
    </View>
  );
}

function TopScoresCard({ stats }: { stats: MatchStatsResponse }) {
  const theme = useTheme();
  return (
    <View
      style={{
        marginHorizontal: 20,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: 16,
        gap: 10,
        ...theme.shadows.card,
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 14,
          color: theme.colors.ink,
        }}
      >
        Most Predicted Scores
      </RNText>
      {stats.top_scores.slice(0, 5).map((s) => (
        <View
          key={`${s.home}-${s.away}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
        >
          <RNText
            style={{
              width: 44,
              fontFamily: MONO_BOLD,
              fontSize: 14,
              color: theme.colors.ink,
            }}
          >
            {s.home} - {s.away}
          </RNText>
          <View
            style={{
              flex: 1,
              height: 6,
              backgroundColor: withOpacity(theme.colors.primary, 0.15),
              borderRadius: 3,
            }}
          >
            <View
              style={{
                width: `${Math.max(2, Math.round(s.pct * 100))}%`,
                height: '100%',
                backgroundColor: theme.colors.primary,
                borderRadius: 3,
              }}
            />
          </View>
          <RNText
            style={{
              width: 28,
              textAlign: 'right',
              fontFamily: MONO,
              fontSize: 11,
              color: theme.colors.slate,
            }}
          >
            {s.count}
          </RNText>
          <RNText
            style={{
              width: 40,
              textAlign: 'right',
              fontFamily: fontFamilies.medium,
              fontSize: 10,
              color: theme.colors.slate,
            }}
          >
            ({Math.round(s.pct * 100)}%)
          </RNText>
        </View>
      ))}
    </View>
  );
}

function BracketGroupPositionsCard({
  prediction,
}: {
  prediction: NonNullable<BracketStatsResponse['group_predictions']>;
}) {
  const theme = useTheme();
  const teams = [prediction.home_team, prediction.away_team].filter(
    (t): t is NonNullable<typeof t> => t !== null && t.total_predictions > 0,
  );
  if (teams.length === 0) return null;
  const total = teams[0].total_predictions;
  return (
    <View
      style={{
        marginHorizontal: theme.spacing.xl,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.lg,
        gap: theme.spacing.lg,
        ...theme.shadows.card,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: theme.spacing.md,
        }}
      >
        <Text variant="cardTitle">Predicted Group Finish</Text>
        <Text variant="detail" color="slate">
          {total} {total === 1 ? 'pick' : 'picks'}
        </Text>
      </View>

      <View style={{ gap: theme.spacing.md }}>
        {teams.map((team) => (
          <PositionBar key={team.team_id} team={team} />
        ))}
      </View>

      {/* Legend pinned bottom-right — matches the Group Standings color
          language (1st & 2nd green, 3rd amber, 4th slate) so it reinforces
          what the bar colors mean without competing with the title row. */}
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'flex-end',
          flexWrap: 'wrap',
          gap: theme.spacing.md,
        }}
      >
        <LegendSwatch label="1st" color={theme.colors.green} />
        <LegendSwatch label="2nd" color={withOpacity(theme.colors.green, 0.55)} />
        <LegendSwatch label="3rd" color={theme.colors.amber} />
        <LegendSwatch label="4th" color={theme.colors.slate} />
      </View>
    </View>
  );
}

function LegendSwatch({ label, color }: { label: string; color: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: theme.radii.sm / 4,
          backgroundColor: color,
        }}
      />
      <Text variant="detail" color="slate">
        {label}
      </Text>
    </View>
  );
}

function PositionBar({
  team,
}: {
  team: NonNullable<
    NonNullable<BracketStatsResponse['group_predictions']>['home_team']
  >;
}) {
  const theme = useTheme();
  // Match the Group Standings card's color language (sitting just above
  // this on the same screen): top 2 green, 3rd amber, 4th slate. The user
  // already learned what these colors mean reading standings.
  const positionColor: Record<'1' | '2' | '3' | '4', string> = {
    '1': theme.colors.green,
    '2': withOpacity(theme.colors.green, 0.55),
    '3': theme.colors.amber,
    '4': theme.colors.slate,
  };

  // Drop inline labels under ~14% so the bar doesn't get crowded.
  const labelThreshold = 0.14;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        {team.flag_url ? (
          <Image
            source={{ uri: team.flag_url }}
            style={{ width: 22, height: 15, borderRadius: 2 }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View
            style={{ width: 22, height: 15, borderRadius: 2, backgroundColor: theme.colors.mist }}
          />
        )}
        <Text variant="body" style={{ flex: 1, fontFamily: fontFamilies.semibold }}>
          {team.team_name ?? 'Team'}
        </Text>
      </View>

      {(() => {
        // Build the list of visible segments first so we know which one is
        // the leftmost vs rightmost (those get the larger outer radius).
        // Segments are also separated by a 2px gap, so each one carries its
        // own radii on both sides.
        const visible = (['1', '2', '3', '4'] as const).filter(
          (pos) => team.position_pcts[pos] > 0,
        );
        // `sm` (12) on a 28-tall bar reads as a clear quarter-curve without
        // clamping to a pill. `xs` (6) for the segment-to-segment corners
        // gives a distinctly subtler curve so the outer/inner hierarchy is
        // still visible without the bar looking lozenge-y.
        const outerRadius = theme.radii.sm; // 12
        const innerRadius = theme.radii.xs; // 6
        return (
          <View
            style={{
              flexDirection: 'row',
              // 28 is the sweet spot where `md` outer radius still reads as
              // pill-rounded ends while `sm` inner radius renders as visible
              // quarter-curves rather than also clamping to pill. Below ~26
              // the md/sm distinction disappears and both look identical.
              height: 28,
              gap: 2,
            }}
          >
            {visible.map((pos, i) => {
              const pct = team.position_pcts[pos];
              const showLabel = pct >= labelThreshold;
              const isFirst = i === 0;
              const isLast = i === visible.length - 1;
              return (
                <View
                  key={pos}
                  style={{
                    flex: pct,
                    backgroundColor: positionColor[pos],
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 4,
                    borderTopLeftRadius: isFirst ? outerRadius : innerRadius,
                    borderBottomLeftRadius: isFirst ? outerRadius : innerRadius,
                    borderTopRightRadius: isLast ? outerRadius : innerRadius,
                    borderBottomRightRadius: isLast ? outerRadius : innerRadius,
                  }}
                >
                  {showLabel ? (
                    <RNText
                      numberOfLines={1}
                      style={{
                        fontFamily: fontFamilies.bold,
                        fontSize: 11,
                        color: '#FFFFFF',
                        letterSpacing: 0.2,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {Math.round(pct * 100)}%
                    </RNText>
                  ) : null}
                </View>
              );
            })}
          </View>
        );
      })()}
    </View>
  );
}

function AccuracyCard({ stats }: { stats: MatchStatsResponse }) {
  const theme = useTheme();
  return (
    <View
      style={{
        marginHorizontal: 20,
        flexDirection: 'row',
        gap: 16,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: 16,
        ...theme.shadows.card,
      }}
    >
      {stats.exact_correct_pct !== null ? (
        <AccuracyStat
          label="Exact Score"
          pct={stats.exact_correct_pct}
          color={theme.colors.accent}
        />
      ) : null}
      {stats.result_correct_pct !== null ? (
        <AccuracyStat
          label="Correct Result"
          pct={stats.result_correct_pct}
          color={theme.colors.primary}
        />
      ) : null}
    </View>
  );
}

function AccuracyStat({ label, pct, color }: { label: string; pct: number; color: string }) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 4 }}>
      <RNText
        style={{
          fontFamily: MONO_BOLD,
          fontSize: 24,
          color,
          fontVariant: ['tabular-nums'],
        }}
      >
        {Math.round(pct * 100)}%
      </RNText>
      <RNText
        style={{
          fontFamily: fontFamilies.medium,
          fontSize: 11,
          color: theme.colors.slate,
        }}
      >
        {label}
      </RNText>
    </View>
  );
}

// MARK: - Your Predictions

function YourPredictionsSection({
  match,
  predictionInfos,
}: {
  match: ResultsMatch;
  predictionInfos: MatchPredictionInfo[];
}) {
  const theme = useTheme();

  // Group by pool, preserving original order.
  const grouped = (() => {
    const seen: string[] = [];
    const byPool = new Map<string, MatchPredictionInfo[]>();
    for (const info of predictionInfos) {
      if (!byPool.has(info.poolName)) {
        seen.push(info.poolName);
        byPool.set(info.poolName, []);
      }
      byPool.get(info.poolName)!.push(info);
    }
    return seen.map((name) => ({ poolName: name, entries: byPool.get(name)! }));
  })();

  return (
    <View style={{ gap: 12 }}>
      <RNText
        style={{
          marginHorizontal: 20,
          fontFamily: fontFamilies.bold,
          fontSize: 16,
          color: theme.colors.ink,
        }}
      >
        Your Predictions
      </RNText>
      {predictionInfos.length === 0 ? (
        <View
          style={{
            marginHorizontal: 20,
            paddingVertical: 28,
            paddingHorizontal: 20,
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radii.lg,
            alignItems: 'center',
            gap: 8,
            ...theme.shadows.card,
          }}
        >
          <Text variant="cardTitle" align="center">
            No predictions yet
          </Text>
          <Text variant="body" color="slate" align="center">
            Join a pool and make your prediction for this match
          </Text>
        </View>
      ) : (
        grouped.map((group) => (
          <View
            key={group.poolName}
            style={{
              marginHorizontal: 20,
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radii.lg,
              ...theme.shadows.card,
              overflow: 'hidden',
            }}
          >
            <RNText
              style={{
                paddingHorizontal: 16,
                paddingTop: 14,
                paddingBottom: 10,
                fontFamily: fontFamilies.bold,
                fontSize: 14,
                color: theme.colors.ink,
              }}
            >
              {group.poolName}
            </RNText>
            <View
              style={{
                height: 0.5,
                marginHorizontal: 14,
                backgroundColor: theme.colors.mist,
              }}
            />
            {group.entries.map((info) =>
              info.isBracketPicker ? (
                <BracketPickerRow key={info.entryId} match={match} info={info} />
              ) : (
                <PredictionRow key={info.entryId} match={match} info={info} />
              ),
            )}
            <View style={{ height: 4 }} />
          </View>
        ))
      )}
    </View>
  );
}

function PredictionRow({ match, info }: { match: ResultsMatch; info: MatchPredictionInfo }) {
  const theme = useTheme();
  const isLive = match.status === 'live';
  const isFinished = match.status === 'completed';
  const isKnockout = match.groupLetter === null;
  const showResult = (isLive || isFinished) && info.prediction !== null;
  const pts = info.breakdownPoints ?? info.matchPoints;

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <RNText
          style={{
            flex: 1,
            fontFamily: fontFamilies.semibold,
            fontSize: 14,
            color: theme.colors.ink,
          }}
        >
          {info.entryName}
        </RNText>
        {showResult ? (
          <>
            <ResultBadge info={info} isKnockout={isKnockout} match={match} />
            {pts !== null ? (
              <RNText
                style={{
                  fontFamily: MONO_BOLD,
                  fontSize: 12,
                  color: pts > 0 ? theme.colors.green : theme.colors.slate,
                }}
              >
                +{pts} pts
              </RNText>
            ) : null}
          </>
        ) : null}
      </View>
      {info.prediction ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 4,
          }}
        >
          {isKnockout ? (
            <RNText
              numberOfLines={1}
              style={{
                fontFamily: fontFamilies.medium,
                fontSize: 12,
                color: theme.colors.slate,
              }}
            >
              {info.predictedHomeTeam ?? homeDisplayName(match)}
            </RNText>
          ) : null}
          <RNText
            style={{
              fontFamily: MONO_BOLD,
              fontSize: 15,
              color: theme.colors.ink,
              fontVariant: ['tabular-nums'],
            }}
          >
            {info.prediction.predictedHomeScore}
          </RNText>
          <RNText style={{ fontFamily: MONO_BOLD, fontSize: 13, color: theme.colors.mist }}>
            -
          </RNText>
          <RNText
            style={{
              fontFamily: MONO_BOLD,
              fontSize: 15,
              color: theme.colors.ink,
              fontVariant: ['tabular-nums'],
            }}
          >
            {info.prediction.predictedAwayScore}
          </RNText>
          {isKnockout ? (
            <RNText
              numberOfLines={1}
              style={{
                fontFamily: fontFamilies.medium,
                fontSize: 12,
                color: theme.colors.slate,
              }}
            >
              {info.predictedAwayTeam ?? awayDisplayName(match)}
            </RNText>
          ) : null}
          {info.prediction.predictedHomePso !== null &&
          info.prediction.predictedAwayPso !== null ? (
            <RNText
              style={{
                fontFamily: MONO,
                fontSize: 10,
                color: theme.colors.primary,
              }}
            >
              ({info.prediction.predictedHomePso}-{info.prediction.predictedAwayPso} PSO)
            </RNText>
          ) : null}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <RNText
            style={{
              fontFamily: fontFamilies.medium,
              fontSize: 12,
              color: theme.colors.slate,
              paddingHorizontal: 10,
              paddingVertical: 3,
              backgroundColor: withOpacity(theme.colors.mist, 0.5),
              borderRadius: 999,
              overflow: 'hidden',
            }}
          >
            Not predicted
          </RNText>
        </View>
      )}
    </View>
  );
}

function BracketPickerRow({ match, info }: { match: ResultsMatch; info: MatchPredictionInfo }) {
  const theme = useTheme();
  const isLive = match.status === 'live';
  const isFinished = match.status === 'completed';
  const isKnockout = match.groupLetter === null;
  const bp: BracketPickInfo | null = info.bracketPick;

  return (
    <View style={{ paddingHorizontal: 16, paddingVertical: 10, gap: 4 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <RNText
          style={{
            flex: 1,
            fontFamily: fontFamilies.semibold,
            fontSize: 14,
            color: theme.colors.ink,
          }}
        >
          {info.entryName}
        </RNText>
        {isKnockout &&
        bp?.predictedWinnerName &&
        (isLive || isFinished) &&
        bp.isCorrectWinner !== null ? (
          <Badge
            label={bp.isCorrectWinner ? 'Correct' : 'Miss'}
            color={bp.isCorrectWinner ? theme.colors.green : theme.colors.red}
          />
        ) : null}
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 4,
          flexWrap: 'wrap',
        }}
      >
        {bp && isKnockout ? (
          bp.predictedWinnerName ? (
            <>
              <RNText
                style={{ fontFamily: fontFamilies.medium, fontSize: 12, color: theme.colors.slate }}
              >
                Winner:
              </RNText>
              <RNText
                style={{
                  fontFamily: fontFamilies.semibold,
                  fontSize: 12,
                  color: theme.colors.ink,
                }}
              >
                {bp.predictedWinnerName}
              </RNText>
              {bp.predictedPenalty ? (
                <RNText
                  style={{
                    fontFamily: fontFamilies.medium,
                    fontSize: 10,
                    color: theme.colors.primary,
                  }}
                >
                  (PSO)
                </RNText>
              ) : null}
            </>
          ) : (
            <NoPickPill />
          )
        ) : bp && !isKnockout ? (
          bp.homeTeamPosition !== null || bp.awayTeamPosition !== null ? (
            <>
              {bp.homeTeamName && bp.homeTeamPosition !== null ? (
                <>
                  <RNText
                    style={{
                      fontFamily: fontFamilies.semibold,
                      fontSize: 12,
                      color: theme.colors.ink,
                    }}
                  >
                    {bp.homeTeamName}
                  </RNText>
                  <RNText
                    style={{
                      fontFamily: fontFamilies.medium,
                      fontSize: 11,
                      color: theme.colors.slate,
                    }}
                  >
                    {ordinal(bp.homeTeamPosition)}
                  </RNText>
                </>
              ) : null}
              {bp.homeTeamPosition !== null && bp.awayTeamPosition !== null ? (
                <RNText
                  style={{ fontFamily: fontFamilies.bold, fontSize: 12, color: theme.colors.mist }}
                >
                  ·
                </RNText>
              ) : null}
              {bp.awayTeamName && bp.awayTeamPosition !== null ? (
                <>
                  <RNText
                    style={{
                      fontFamily: fontFamilies.semibold,
                      fontSize: 12,
                      color: theme.colors.ink,
                    }}
                  >
                    {bp.awayTeamName}
                  </RNText>
                  <RNText
                    style={{
                      fontFamily: fontFamilies.medium,
                      fontSize: 11,
                      color: theme.colors.slate,
                    }}
                  >
                    {ordinal(bp.awayTeamPosition)}
                  </RNText>
                </>
              ) : null}
            </>
          ) : (
            <NoPickPill />
          )
        ) : (
          <NoPickPill />
        )}
      </View>
    </View>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <RNText
      style={{
        fontFamily: fontFamilies.bold,
        fontSize: 10,
        color,
        paddingHorizontal: 7,
        paddingVertical: 3,
        backgroundColor: withOpacity(color, 0.12),
        borderRadius: 999,
        overflow: 'hidden',
      }}
    >
      {label}
    </RNText>
  );
}

function NoPickPill() {
  const theme = useTheme();
  return (
    <RNText
      style={{
        fontFamily: fontFamilies.medium,
        fontSize: 12,
        color: theme.colors.slate,
        paddingHorizontal: 10,
        paddingVertical: 3,
        backgroundColor: withOpacity(theme.colors.mist, 0.5),
        borderRadius: 999,
        overflow: 'hidden',
      }}
    >
      No pick
    </RNText>
  );
}

function ordinal(n: number): string {
  const suffix = n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

function ResultBadge({
  info,
  isKnockout,
  match,
}: {
  info: MatchPredictionInfo;
  isKnockout: boolean;
  match: ResultsMatch;
}) {
  const theme = useTheme();
  const result = resolveResultType(info, isKnockout, match, theme);
  return <Badge label={result.label} color={result.color} />;
}

function resolveResultType(
  info: MatchPredictionInfo,
  isKnockout: boolean,
  match: ResultsMatch,
  theme: ReturnType<typeof useTheme>,
): { label: string; color: string } {
  // Server-provided breakdown wins for knockout (handles team mismatch).
  if (info.breakdownResultType && isKnockout) {
    if (info.teamsMatch === false) {
      return { label: 'Wrong Teams', color: theme.colors.amber };
    }
    return breakdownResultLabel(info.breakdownResultType, theme);
  }
  // Fallback: client-side calc.
  const pred = info.prediction;
  const homeActual = match.homeScoreFt;
  const awayActual = match.awayScoreFt;
  if (!pred || homeActual === null || awayActual === null) {
    return { label: 'Pending', color: theme.colors.amber };
  }
  if (pred.predictedHomeScore === homeActual && pred.predictedAwayScore === awayActual) {
    return { label: 'Exact', color: theme.colors.accent };
  }
  const actualOutcome =
    homeActual === awayActual ? 0 : homeActual > awayActual ? 1 : -1;
  const predOutcome =
    pred.predictedHomeScore === pred.predictedAwayScore
      ? 0
      : pred.predictedHomeScore > pred.predictedAwayScore
        ? 1
        : -1;
  if (actualOutcome === predOutcome) {
    const actualGD = homeActual - awayActual;
    const predGD = pred.predictedHomeScore - pred.predictedAwayScore;
    if (actualGD === predGD) return { label: 'Winner+GD', color: theme.colors.green };
    return { label: 'Winner', color: theme.colors.primary };
  }
  return { label: 'Miss', color: theme.colors.red };
}

function breakdownResultLabel(
  type: string,
  theme: ReturnType<typeof useTheme>,
): { label: string; color: string } {
  switch (type) {
    case 'exact':
      return { label: 'Exact', color: theme.colors.accent };
    case 'winner_gd':
      return { label: 'Winner+GD', color: theme.colors.green };
    case 'winner':
      return { label: 'Winner', color: theme.colors.primary };
    case 'miss':
      return { label: 'Miss', color: theme.colors.red };
    case 'wrong_teams':
      return { label: 'Wrong Teams', color: theme.colors.amber };
    default:
      return {
        label: type.charAt(0).toUpperCase() + type.slice(1),
        color: theme.colors.slate,
      };
  }
}
