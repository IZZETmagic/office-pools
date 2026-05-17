import { SymbolView } from 'expo-symbols';
import { Platform, Text as RNText, View } from 'react-native';

import { fontFamilies, useTheme, withOpacity } from '@/theme';

type Props = {
  messageType: string;
  metadata: Record<string, unknown> | null;
  content: string;
  isOwn: boolean;
  /**
   * The user_id of the person who sent this message. Used to highlight
   * the sender's own row inside a standings card when they're in the
   * top 5 — visible to both the sender and everyone else.
   */
  senderUserId?: string | null;
};

type CardSpec = {
  icon: string;
  title: string;
  accentToken: 'primary' | 'accent' | 'green' | 'amber' | 'red';
};

const CARD_SPECS: Record<string, CardSpec> = {
  standings_drop: { icon: 'chart.bar.fill', title: 'Standings', accentToken: 'green' },
  badge_flex: { icon: 'trophy.fill', title: 'Badge flex', accentToken: 'primary' },
  prediction_share: { icon: 'sparkles', title: 'Prediction', accentToken: 'accent' },
};

export function BanterRichCard({
  messageType,
  metadata,
  content,
  isOwn,
  senderUserId,
}: Props) {
  const theme = useTheme();
  const spec = CARD_SPECS[messageType];
  if (!spec) return null;
  const accent = theme.colors[spec.accentToken];

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: withOpacity(theme.colors.silver, 0.4),
        overflow: 'hidden',
        width: 280,
        ...theme.shadows.card,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            backgroundColor: accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {Platform.OS === 'ios' ? (
            <SymbolView
              name={spec.icon as never}
              size={18}
              tintColor="#FFFFFF"
              weight="bold"
              resizeMode="scaleAspectFit"
            />
          ) : (
            <View style={{ width: 18, height: 18 }} />
          )}
        </View>
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 13,
            color: accent,
            letterSpacing: 0.7,
            textTransform: 'uppercase',
          }}
        >
          {spec.title}
        </RNText>
      </View>
      <View style={{ height: 0.5, backgroundColor: withOpacity(theme.colors.silver, 0.4), marginHorizontal: 14 }} />
      <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
        {messageType === 'standings_drop' ? (
          <StandingsBody
            metadata={metadata}
            fallback={content}
            accent={accent}
            senderUserId={senderUserId ?? null}
            viewerIsSender={isOwn}
          />
        ) : messageType === 'badge_flex' ? (
          <BadgeBody metadata={metadata} fallback={content} accent={accent} isOwn={isOwn} />
        ) : messageType === 'prediction_share' ? (
          <PredictionBody metadata={metadata} fallback={content} accent={accent} />
        ) : (
          <RNText
            style={{
              fontFamily: fontFamilies.regular,
              fontSize: 14,
              lineHeight: 19,
              color: theme.colors.ink,
            }}
          >
            {content}
          </RNText>
        )}
      </View>
    </View>
  );
}

type TopEntry = { rank: number; name: string; points: number; userId: string | null };

function StandingsBody({
  metadata,
  fallback,
  accent,
  senderUserId,
  viewerIsSender,
}: {
  metadata: Record<string, unknown> | null;
  fallback: string;
  accent: string;
  senderUserId: string | null;
  viewerIsSender: boolean;
}) {
  const theme = useTheme();
  const topEntries = arrayField(metadata, ['top_entries', 'topEntries'])
    .map((e) => parseTopEntry(e))
    .filter((e): e is TopEntry => !!e);

  if (topEntries.length === 0) {
    const leaderName = stringField(metadata, ['leader_name', 'leaderName']);
    const leaderId = stringField(metadata, ['leader_user_id', 'leaderUserId']);
    const leaderPoints = numberField(metadata, ['leader_points', 'leaderPoints']);
    if (leaderName && leaderPoints !== null) {
      topEntries.push({ rank: 1, name: leaderName, points: leaderPoints, userId: leaderId });
    }
    const runnerName = stringField(metadata, ['runner_up_name', 'runnerUpName']);
    const runnerId = stringField(metadata, ['runner_up_user_id', 'runnerUpUserId']);
    const runnerPoints = numberField(metadata, ['runner_up_points', 'runnerUpPoints']);
    if (runnerName && runnerPoints !== null) {
      topEntries.push({ rank: 2, name: runnerName, points: runnerPoints, userId: runnerId });
    }
  }

  if (topEntries.length === 0) {
    return (
      <RNText
        style={{
          fontFamily: fontFamilies.regular,
          fontSize: 14,
          lineHeight: 19,
          color: theme.colors.ink,
        }}
      >
        {fallback}
      </RNText>
    );
  }

  return (
    <View style={{ gap: 4 }}>
      {topEntries.map((e) => {
        const isSenderRow = !!senderUserId && e.userId === senderUserId;
        return (
          <StandingsRow
            key={`${e.rank}-${e.name}`}
            entry={e}
            accent={accent}
            isSender={isSenderRow}
            youLabel={isSenderRow && viewerIsSender}
          />
        );
      })}
    </View>
  );
}

function StandingsRow({
  entry,
  accent,
  isSender,
  youLabel,
}: {
  entry: TopEntry;
  accent: string;
  isSender: boolean;
  youLabel: boolean;
}) {
  const theme = useTheme();
  const isLeader = entry.rank === 1;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: isSender ? 8 : 0,
        paddingVertical: isSender ? 4 : 2,
        marginHorizontal: isSender ? -8 : 0,
        borderRadius: 10,
        backgroundColor: isSender ? withOpacity(accent, 0.12) : 'transparent',
        borderWidth: isSender ? 1 : 0,
        borderColor: isSender ? withOpacity(accent, 0.3) : 'transparent',
      }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: isLeader ? theme.colors.primary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 11,
            color: isLeader ? '#FFFFFF' : theme.colors.slate,
          }}
        >
          {entry.rank}
        </RNText>
      </View>
      <RNText
        numberOfLines={1}
        style={{
          flex: 1,
          fontFamily: isLeader || isSender ? fontFamilies.bold : fontFamilies.semibold,
          fontSize: 14,
          color: isSender ? accent : theme.colors.ink,
        }}
      >
        {entry.name}
        {youLabel ? '  •  you' : ''}
      </RNText>
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 13,
          color: isLeader || isSender ? accent : theme.colors.slate,
          fontVariant: ['tabular-nums'],
        }}
      >
        {entry.points} pts
      </RNText>
    </View>
  );
}

function BadgeBody({
  metadata,
  fallback,
  accent,
  isOwn,
}: {
  metadata: Record<string, unknown> | null;
  fallback: string;
  accent: string;
  isOwn: boolean;
}) {
  const theme = useTheme();
  const badgeCount = numberField(metadata, ['badge_count', 'badgeCount']);
  const badgeLabel = stringField(metadata, ['badge_label', 'badgeLabel']);
  const badgeDescription = stringField(metadata, ['badge_description', 'badgeDescription']);
  const level = numberField(metadata, ['level']);
  const levelName = stringField(metadata, ['level_name', 'levelName']);

  if (badgeCount === null) {
    return (
      <RNText
        style={{
          fontFamily: fontFamilies.regular,
          fontSize: 14,
          lineHeight: 19,
          color: theme.colors.ink,
        }}
      >
        {fallback}
      </RNText>
    );
  }

  const isSpecific = !!badgeLabel;
  const badgeNoun = badgeCount === 1 ? 'badge' : 'badges';
  const title = isSpecific ? badgeLabel : `${badgeCount} ${badgeNoun} earned`;
  const subtitle = isSpecific
    ? (badgeDescription ?? '')
    : level !== null && levelName
      ? `Level ${level} · ${levelName}`
      : level !== null
        ? `Level ${level}`
        : levelName
          ? levelName
          : isOwn
            ? 'Your collection'
            : 'Their collection';

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <View
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          backgroundColor: withOpacity(accent, 0.15),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <RNText
          style={{
            fontFamily: fontFamilies.black,
            fontSize: 24,
            color: accent,
            lineHeight: 26,
          }}
        >
          {badgeCount}
        </RNText>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <RNText
          numberOfLines={1}
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 17,
            color: theme.colors.ink,
          }}
        >
          {title}
        </RNText>
        {subtitle ? (
          <RNText
            style={{
              fontFamily: fontFamilies.semibold,
              fontSize: 12,
              color: theme.colors.slate,
            }}
          >
            {subtitle}
          </RNText>
        ) : null}
      </View>
    </View>
  );
}

const PREDICTION_OUTCOME_TOKENS: Record<
  string,
  { token: 'amber' | 'green' | 'red'; label: string }
> = {
  exact: { token: 'amber', label: '★ EXACT' },
  correct: { token: 'green', label: '✓ CORRECT' },
  miss: { token: 'red', label: '✗ MISS' },
};

function PredictionBody({
  metadata,
  fallback,
}: {
  metadata: Record<string, unknown> | null;
  fallback: string;
  accent: string;
}) {
  const theme = useTheme();
  const homeName = stringField(metadata, [
    'home_team_name',
    'homeTeamName',
    'home_team',
    'homeTeam',
    'home_name',
  ]);
  const awayName = stringField(metadata, [
    'away_team_name',
    'awayTeamName',
    'away_team',
    'awayTeam',
    'away_name',
  ]);
  const predictedHome = numberField(metadata, ['predicted_home', 'predictedHome', 'home_score', 'homeScore']);
  const predictedAway = numberField(metadata, ['predicted_away', 'predictedAway', 'away_score', 'awayScore']);
  const actualHome = numberField(metadata, ['actual_home', 'actualHome']);
  const actualAway = numberField(metadata, ['actual_away', 'actualAway']);
  const outcomeStr = stringField(metadata, ['outcome']);
  const matchNumber = numberField(metadata, ['match_number', 'matchNumber']);
  const stage = stringField(metadata, ['stage']);

  if (!homeName || !awayName) {
    return (
      <RNText
        style={{
          fontFamily: fontFamilies.regular,
          fontSize: 14,
          lineHeight: 19,
          color: theme.colors.ink,
        }}
      >
        {fallback}
      </RNText>
    );
  }

  const outcome = outcomeStr ? PREDICTION_OUTCOME_TOKENS[outcomeStr] : null;
  const outcomeColor = outcome ? theme.colors[outcome.token] : null;
  const hasActual = actualHome !== null && actualAway !== null;

  return (
    <View style={{ gap: 8 }}>
      {(matchNumber !== null || outcome) ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          {matchNumber !== null ? (
            <RNText
              style={{
                fontFamily: fontFamilies.semibold,
                fontSize: 11,
                color: theme.colors.slate,
                letterSpacing: 0.2,
              }}
            >
              Match {matchNumber}
              {stage ? ` · ${stage}` : ''}
            </RNText>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          {outcome && outcomeColor ? (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 12,
                backgroundColor: withOpacity(outcomeColor, 0.14),
              }}
            >
              <RNText
                style={{
                  fontFamily: fontFamilies.bold,
                  fontSize: 10,
                  color: outcomeColor,
                  letterSpacing: 0.5,
                }}
              >
                {outcome.label}
              </RNText>
            </View>
          ) : null}
        </View>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <RNText
          numberOfLines={1}
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 13,
            color: theme.colors.ink,
            flex: 1,
            textAlign: 'right',
          }}
        >
          {homeName}
        </RNText>
        <View
          style={{
            alignItems: 'center',
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 10,
            backgroundColor: withOpacity(theme.colors.ink, 0.04),
            minWidth: 60,
          }}
        >
          <RNText
            style={{
              fontFamily: fontFamilies.regular,
              fontSize: 11,
              color: theme.colors.slate,
              fontVariant: ['tabular-nums'],
            }}
          >
            {predictedHome ?? '–'}–{predictedAway ?? '–'}
          </RNText>
          {hasActual ? (
            <RNText
              style={{
                fontFamily: fontFamilies.bold,
                fontSize: 16,
                color: theme.colors.ink,
                fontVariant: ['tabular-nums'],
                lineHeight: 18,
              }}
            >
              {actualHome}–{actualAway}
            </RNText>
          ) : null}
        </View>
        <RNText
          numberOfLines={1}
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 13,
            color: theme.colors.ink,
            flex: 1,
          }}
        >
          {awayName}
        </RNText>
      </View>
    </View>
  );
}

function stringField(metadata: Record<string, unknown> | null, keys: string[]): string | null {
  if (!metadata) return null;
  for (const k of keys) {
    const v = metadata[k];
    if (typeof v === 'string' && v.trim().length > 0) return v;
  }
  return null;
}

function numberField(metadata: Record<string, unknown> | null, keys: string[]): number | null {
  if (!metadata) return null;
  for (const k of keys) {
    const v = metadata[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim().length > 0) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function arrayField(metadata: Record<string, unknown> | null, keys: string[]): unknown[] {
  if (!metadata) return [];
  for (const k of keys) {
    const v = metadata[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

function parseTopEntry(raw: unknown): TopEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const rankRaw = r.rank ?? r.position;
  const nameRaw = r.name ?? r.full_name ?? r.entry_name ?? r.username;
  const pointsRaw = r.points ?? r.total_points ?? r.score;
  const userIdRaw = r.user_id ?? r.userId;
  const rank = typeof rankRaw === 'number' ? rankRaw : Number(rankRaw);
  const points = typeof pointsRaw === 'number' ? pointsRaw : Number(pointsRaw);
  const name = typeof nameRaw === 'string' ? nameRaw.trim() : '';
  const userId =
    typeof userIdRaw === 'string' && userIdRaw.trim().length > 0 ? userIdRaw : null;
  if (!Number.isFinite(rank) || !Number.isFinite(points) || !name) return null;
  return { rank, name, points, userId };
}

export function isRichMessageType(messageType: string): boolean {
  return messageType in CARD_SPECS;
}
