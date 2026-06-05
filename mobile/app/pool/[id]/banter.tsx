import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  Text as RNText,
  useWindowDimensions,
  View,
} from 'react-native';
// Drop-in replacement for RN's KeyboardAvoidingView that's driven by the
// keyboard's actual per-frame position via UIKit's keyboard animation block
// on iOS and WindowInsetsAnimation on Android — so the composer and the
// keyboard share the exact same motion curve, no mid-animation drift.
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BanterRichCard, isRichMessageType } from '@/components/pool-detail/BanterRichCard';
import {
  FlexBadgesSheet,
  type FlexBadgeOption,
  type FlexBadgesSheetHandle,
} from '@/components/pool-detail/FlexBadgesSheet';
import { QuickActionsMenu, type QuickAction } from '@/components/pool-detail/QuickActionsMenu';
import { ReactionPicker } from '@/components/pool-detail/ReactionPicker';
import { ReactionPills } from '@/components/pool-detail/ReactionPills';
import {
  SharePredictionSheet,
  type PredictionOption,
  type SharePredictionSheetHandle,
} from '@/components/pool-detail/SharePredictionSheet';
import { useHomeData } from '@/lib/HomeDataProvider';
import { supabase } from '@/lib/supabase';
import { Icon, Text } from '@/components/ui';
import { fetchLeaderboard, type BadgeInfo, type LeaderboardEntry } from '@/lib/api';
import {
  buildFlexBadgeOptions,
  buildFlexBadgePayload,
  loadFlexBadges,
} from '@/lib/flexBadges';
import {
  detectMentionQuery,
  parseMentionSegments,
  replaceMentionQuery,
  usePoolBanter,
  type BanterMessage,
  type PoolMember,
} from '@/lib/usePoolBanter';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type Row =
  | { kind: 'date'; key: string; label: string }
  | {
      kind: 'message';
      key: string;
      message: BanterMessage;
      isOwn: boolean;
      showSenderName: boolean;
      showAvatar: boolean;
    };

const GROUP_GAP_MS = 5 * 60 * 1000;

export default function BanterScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id, poolName } = useLocalSearchParams<{ id: string; poolName?: string }>();
  const banter = usePoolBanter(id);
  const { clearPoolUnread } = useHomeData();
  const [text, setText] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  const [flexOptions, setFlexOptions] = useState<FlexBadgeOption[]>([]);
  const [predictionOptions, setPredictionOptions] = useState<PredictionOption[]>([]);
  const [reactionTargetId, setReactionTargetId] = useState<string | null>(null);
  // When a long-press fires we measure the bubble's screen-space position and
  // render the picker as a SCREEN-LEVEL overlay above a transparent scrim.
  // RN's `zIndex` doesn't cross stacking contexts so the picker can't sit
  // inside the ScrollView and still draw above a scrim hosted at the screen
  // level — lifting it out is the only reliable way to make "tap anywhere
  // dismisses" work without the scrim swallowing emoji taps.
  const [pickerAnchor, setPickerAnchor] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
    alignRight: boolean;
  } | null>(null);

  function dismissReactionPicker() {
    setReactionTargetId(null);
    setPickerAnchor(null);
  }
  const [showScrollDown, setShowScrollDown] = useState(false);
  const scrollRef = useRef<ScrollView | null>(null);
  const flexSheetRef = useRef<FlexBadgesSheetHandle | null>(null);
  const predictionSheetRef = useRef<SharePredictionSheetHandle | null>(null);
  const inputRef = useRef<TextInput | null>(null);
  const ownEntryRef = useRef<LeaderboardEntry | null>(null);
  const predictionByMatchRef = useRef<Map<string, PredictionOption>>(new Map());
  const stuckToBottomRef = useRef(true);
  const hadInitialContentRef = useRef(false);

  // Drive `keyboardOpen` from native Keyboard events. `keyboardWillShow` (iOS)
  // fires just before the animation starts WITH the eventual keyboard frame;
  // `keyboardDidShow` (Android) fires after the system finishes resizing.
  //
  // We also use the event's `endCoordinates.height` to scroll the chat by
  // the exact lift amount in parallel with the keyboard's rise — `scrollToEnd`
  // alone is not enough because it computes its target against the current
  // (unshrunken) viewport, so tall rich cards at the bottom end up clipped
  // by the keyboard.
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardOpen(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardOpen(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useLayoutEffect(() => {
    if (banter.appUserId && banter.unreadCount > 0) {
      void banter.markAsRead();
      // Clear the dashboard's unread badge for this pool right away instead
      // of waiting for the next stale-refresh. The server-side last_read_at
      // update is async; this local state update makes the badge disappear
      // the moment the user opens the banter screen.
      if (id) clearPoolUnread(id);
    }
  }, [banter.appUserId, banter.unreadCount, banter, id, clearPoolUnread]);

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    const messages = banter.messages;
    let prev: BanterMessage | null = null;
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      const prevTs = prev ? new Date(prev.createdAt).getTime() : 0;
      const ts = new Date(m.createdAt).getTime();
      const sameDay = prev && isSameDay(prev.createdAt, m.createdAt);
      const gapTooBig = !prev || ts - prevTs >= GROUP_GAP_MS;
      const showDate = !prev || !sameDay || gapTooBig;
      if (showDate) {
        out.push({
          kind: 'date',
          key: `date-${m.messageId}`,
          label: formatDateLabel(m.createdAt),
        });
      }
      const next = messages[i + 1];
      const isOwn = m.userId === banter.appUserId;
      const samePrev = prev && prev.userId === m.userId && !showDate;
      const sameNext =
        next &&
        next.userId === m.userId &&
        isSameDay(m.createdAt, next.createdAt) &&
        new Date(next.createdAt).getTime() - ts < GROUP_GAP_MS;
      out.push({
        kind: 'message',
        key: `m-${m.messageId}`,
        message: m,
        isOwn,
        showSenderName: !isOwn && !samePrev,
        showAvatar: !isOwn && !sameNext,
      });
      prev = m;
    }
    return out;
  }, [banter.messages, banter.appUserId]);

  // Scroll-on-keyboard-open is handled inside the keyboardWillShow listener
  // above — it uses the event's `endCoordinates.height` to compute the exact
  // lift amount, which `scrollToEnd` alone can't do (the viewport hasn't
  // shrunk yet at this point in the rise).


  function handleChangeText(next: string) {
    setText(next);
    setMentionQuery(detectMentionQuery(next));
  }

  function handlePickMention(member: PoolMember) {
    const next = replaceMentionQuery(text, member.username);
    setText(next);
    setMentionQuery(null);
  }

  async function handleSend() {
    const value = text;
    setText('');
    setMentionQuery(null);
    const result = await banter.sendMessage(value);
    if (result.error) {
      setText(value);
      Alert.alert("Couldn't send message", result.error);
    }
  }

  async function shareStandings() {
    if (!id) return;
    try {
      const lb = await fetchLeaderboard(id);
      if (!lb.entries || lb.entries.length === 0) {
        Alert.alert('Nothing to share yet', 'No leaderboard entries.');
        return;
      }
      const top5 = lb.entries.slice(0, 5).map((e: LeaderboardEntry, i: number) => ({
        rank: i + 1,
        user_id: e.user_id,
        name: e.full_name || e.username || e.entry_name,
        points: e.total_points,
      }));
      const leader = top5[0];
      const content = `📊 Current standings — ${leader.name} leads with ${leader.points} pts!`;
      const metadata: Record<string, unknown> = {
        leader_user_id: leader.user_id,
        leader_name: leader.name,
        leader_points: leader.points,
        top_entries: top5,
      };
      const result = await banter.sendMessage(content, {
        messageType: 'standings_drop',
        metadata,
      });
      if (result.error) {
        Alert.alert("Couldn't share standings", result.error);
      }
    } catch (err) {
      Alert.alert(
        "Couldn't share standings",
        err instanceof Error ? err.message : 'Unknown error',
      );
    }
  }


  async function sendBadgeFlex(payload: {
    content: string;
    metadata: Record<string, unknown>;
  }) {
    const result = await banter.sendMessage(payload.content, {
      messageType: 'badge_flex',
      metadata: payload.metadata,
    });
    if (result.error) {
      Alert.alert("Couldn't share badges", result.error);
    }
  }

  function flexAllPayload(own: LeaderboardEntry) {
    const badgeCount = own.exact_count;
    const noun = badgeCount === 1 ? 'badge' : 'badges';
    return {
      content: `🏆 Flexing my badges — ${badgeCount} ${noun} earned!`,
      metadata: {
        badge_count: badgeCount,
        level: own.level,
        level_name: own.level_name,
      } as Record<string, unknown>,
    };
  }

  const earnedBadgesRef = useRef<BadgeInfo[]>([]);

  async function flexBadges() {
    if (!id || !banter.appUserId) return;
    let own: LeaderboardEntry | undefined;
    try {
      const lb = await fetchLeaderboard(id);
      own = (lb.entries ?? []).find(
        (e: LeaderboardEntry) => e.user_id === banter.appUserId,
      );
    } catch (err) {
      Alert.alert(
        "Couldn't load badges",
        err instanceof Error ? err.message : 'Unknown error',
      );
      return;
    }
    if (!own) {
      Alert.alert("You're not on the board", "Join the pool to flex your badges.");
      return;
    }
    ownEntryRef.current = own;
    const ctx = await loadFlexBadges(id, banter.appUserId);
    if (!ctx) return;
    earnedBadgesRef.current = ctx.earnedBadges;
    const totalBadges = ctx.earnedBadges.length;
    const allDescription = `${totalBadges} ${totalBadges === 1 ? 'badge' : 'badges'} · Level ${own.level}`;
    const options: FlexBadgeOption[] = [
      { key: 'all', emoji: '🏆', label: 'Flex all badges', description: allDescription },
      ...buildFlexBadgeOptions(ctx.earnedBadges),
    ];
    setFlexOptions(options);
    requestAnimationFrame(() => flexSheetRef.current?.open());
  }

  function handleFlexPick(key: string) {
    const own = ownEntryRef.current;
    if (!own) return;
    if (key === 'all') {
      void sendBadgeFlex(flexAllPayload(own));
      return;
    }
    const badge = earnedBadgesRef.current.find((b) => b.id === key);
    if (badge) void sendBadgeFlex(buildFlexBadgePayload(badge));
  }

  const quickActions: QuickAction[] = [
    {
      key: 'standings',
      emoji: '📊',
      label: 'Share standings',
      description: "Drop the current leaderboard's top 5",
    },
    {
      key: 'flex',
      emoji: '🏆',
      label: 'Flex badges',
      description: 'Show off the badges you’ve earned',
    },
    {
      key: 'prediction',
      emoji: '🎯',
      label: 'Share prediction',
      description: 'Show a score you’ve locked in',
    },
  ];

  function toggleQuickActions() {
    setQuickActionsOpen((v) => !v);
  }

  function handleQuickActionPick(key: string) {
    setQuickActionsOpen(false);
    if (key === 'standings') void shareStandings();
    else if (key === 'flex') void flexBadges();
    else if (key === 'prediction') void sharePrediction();
  }

  async function sharePrediction() {
    if (!id || !banter.appUserId) return;
    let predictions: PredictionOption[];
    try {
      predictions = await fetchSharablePredictions(id, banter.appUserId);
    } catch (err) {
      Alert.alert(
        "Couldn't load predictions",
        err instanceof Error ? err.message : 'Unknown error',
      );
      return;
    }
    if (predictions.length === 0) {
      Alert.alert(
        'Nothing to share yet',
        "You haven't predicted a complete score for any match yet.",
      );
      return;
    }
    predictionByMatchRef.current = new Map(predictions.map((p) => [p.key, p]));
    setPredictionOptions(predictions);
    requestAnimationFrame(() => predictionSheetRef.current?.open());
  }

  function handlePredictionPick(matchId: string) {
    const opt = predictionByMatchRef.current.get(matchId);
    if (!opt) return;
    const outcomeLabel =
      opt.outcome === 'exact' ? 'EXACT' : opt.outcome === 'correct' ? 'CORRECT' : 'MISS';
    const content = `Match ${opt.matchNumber}: ${opt.homeName} ${opt.actualHome}-${opt.actualAway} ${opt.awayName} (Predicted ${opt.predictedHome}-${opt.predictedAway}) — ${outcomeLabel}`;
    void banter.sendMessage(content, {
      messageType: 'prediction_share',
      metadata: {
        match_id: matchId,
        match_number: opt.matchNumber,
        stage: opt.stage,
        home_team_name: opt.homeName,
        away_team_name: opt.awayName,
        home_flag_url: opt.homeFlag,
        away_flag_url: opt.awayFlag,
        predicted_home: opt.predictedHome,
        predicted_away: opt.predictedAway,
        actual_home: opt.actualHome,
        actual_away: opt.actualAway,
        outcome: opt.outcome,
      },
    }).then((result) => {
      if (result.error) Alert.alert("Couldn't share prediction", result.error);
    });
  }

  function handleOpenReactionPicker(
    messageId: string,
    anchor: { x: number; y: number; width: number; height: number; alignRight: boolean },
  ) {
    if (reactionTargetId === messageId) {
      dismissReactionPicker();
      return;
    }
    setReactionTargetId(messageId);
    setPickerAnchor(anchor);
  }

  function handlePickReaction(messageId: string, emoji: string) {
    dismissReactionPicker();
    void banter.toggleReaction(messageId, emoji);
  }

  function handleToggleReaction(messageId: string, emoji: string) {
    void banter.toggleReaction(messageId, emoji);
  }

  const mentionSuggestions = useMemo<PoolMember[]>(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    const matches = banter.members.filter(
      (m) =>
        m.userId !== banter.appUserId &&
        (q === '' ||
          m.username.toLowerCase().startsWith(q) ||
          m.fullName.toLowerCase().includes(q)),
    );
    return matches;
  }, [mentionQuery, banter.members, banter.appUserId]);

  const trimmedLength = text.trim().length;
  const canSend = trimmedLength > 0 && !banter.sending && !!banter.appUserId;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      {/* Header sits OUTSIDE the KeyboardAvoidingView so it stays anchored at
          the top of the screen when the keyboard rises. zIndex/elevation lift
          it above the chat — with `behavior="position"`, the chat translates
          up and would otherwise draw OVER the header (later JSX siblings win
          stacking order in RN). The header's solid `snow` background and
          higher z-stack now occlude any chat content sliding up behind it. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          paddingTop: theme.spacing.sm,
          paddingBottom: theme.spacing.sm,
          borderBottomWidth: 0.5,
          borderBottomColor: withOpacity(theme.colors.silver, 0.6),
          backgroundColor: theme.colors.snow,
          zIndex: 10,
          elevation: 10,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text variant="cardTitle" numberOfLines={1}>
            {poolName ?? 'Banter'}
          </Text>
          <Text variant="detail" color="slate">
            {banter.messages.length} {banter.messages.length === 1 ? 'message' : 'messages'}
          </Text>
        </View>
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
          <Icon name="xmark" size={14} tint={theme.colors.ink} weight="bold" />
        </Pressable>
      </View>

      {/* iOS owns the keyboard's animation block — padding the KAV's bottom
          inside that block keeps the lift in lockstep with the keyboard's
          visual rise. `keyboardVerticalOffset={insets.bottom}` cancels out
          the safe-area portion of the system keyboard height so the composer
          ends up flush with the keyboard's top edge instead of floating
          ~34px above it. */}
      <KeyboardAvoidingView
        // `behavior="position"` slides the entire chat+composer block up as
        // one unit instead of squeezing the ScrollView from the bottom.
        // That's the iMessage / WhatsApp / Messenger / Instagram pattern:
        // the chat doesn't shrink, the bottom messages stay anchored just
        // above the composer, and the top of the chat slides up behind the
        // header (visually clipped by the header's solid background).
        // No scroll math, no padding tricks — the view just translates.
        behavior="position"
        keyboardVerticalOffset={insets.bottom}
        style={{ flex: 1 }}
        contentContainerStyle={{ flex: 1 }}
      >
      <View style={{ flex: 1 }}>
      <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: theme.spacing.md,
            paddingTop: theme.spacing.md,
            paddingBottom: theme.spacing.md,
            gap: 2,
          }}
          keyboardDismissMode="interactive"
          // Without this, when the keyboard is up the default 'never' policy
          // turns every tap on a ScrollView child into a "dismiss keyboard"
          // gesture — the long-press never propagates to the bubble. With
          // 'handled', taps that a child handles (like our bubble's
          // onLongPress / Pressable.onPress) work normally and the keyboard
          // stays put; only taps that fall through still dismiss it.
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={(_w, h) => {
            if (h === 0 || banter.messages.length === 0) return;
            if (!stuckToBottomRef.current) return;
            const isFirst = !hadInitialContentRef.current;
            hadInitialContentRef.current = true;
            scrollRef.current?.scrollToEnd({ animated: !isFirst });
          }}
          onScroll={(e) => {
            const { contentSize, layoutMeasurement, contentOffset } = e.nativeEvent;
            const distance = contentSize.height - layoutMeasurement.height - contentOffset.y;
            stuckToBottomRef.current = distance < 80;
            const shouldShow = distance > 240;
            if (shouldShow !== showScrollDown) setShowScrollDown(shouldShow);
          }}
          scrollEventThrottle={64}
        >
          {banter.loading && banter.messages.length === 0 ? (
            <View style={{ paddingVertical: theme.spacing.xxl, alignItems: 'center' }}>
              <ActivityIndicator color={theme.colors.primary} />
            </View>
          ) : banter.messages.length === 0 ? (
            <EmptyState />
          ) : (
            rows.map((row) =>
              row.kind === 'date' ? (
                <DateHeader key={row.key} label={row.label} />
              ) : (
                <MessageRow
                  key={row.key}
                  message={row.message}
                  isOwn={row.isOwn}
                  showSenderName={row.showSenderName}
                  showAvatar={row.showAvatar}
                  reactions={banter.reactions.get(row.message.messageId) ?? []}
                  currentUserId={banter.appUserId}
                  pickerOpen={reactionTargetId === row.message.messageId}
                  dimmedByOtherPicker={
                    reactionTargetId !== null && reactionTargetId !== row.message.messageId
                  }
                  onLongPressBubble={handleOpenReactionPicker}
                  onPickReaction={handlePickReaction}
                  onToggleReaction={handleToggleReaction}
                  onDismissPicker={dismissReactionPicker}
                />
              ),
            )
          )}
        </ScrollView>

        {showScrollDown ? (
          <Pressable
            onPress={() => scrollRef.current?.scrollToEnd({ animated: true })}
            style={({ pressed }) => ({
              position: 'absolute',
              right: 16,
              bottom: 16,
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: theme.colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 0.5,
              borderColor: withOpacity(theme.colors.silver, 0.6),
              opacity: pressed ? 0.7 : 1,
              ...theme.shadows.card,
            })}
          >
            <Icon name="chevron.down" size={14} tint={theme.colors.ink} weight="bold" />
          </Pressable>
        ) : null}
      </View>

      {mentionSuggestions.length > 0 ? (
        <MentionDropdown members={mentionSuggestions} onPick={handlePickMention} />
      ) : null}

      <Composer
        inputRef={inputRef}
        value={text}
        onChange={handleChangeText}
        onSend={handleSend}
        onQuickActions={toggleQuickActions}
        quickActionsOpen={quickActionsOpen}
        quickActionsMenu={
          <QuickActionsMenu
            open={quickActionsOpen}
            actions={quickActions}
            onPick={handleQuickActionPick}
            onDismiss={() => setQuickActionsOpen(false)}
          />
        }
        disabled={!canSend}
        sending={banter.sending}
      />

      </KeyboardAvoidingView>

      {/* Screen-level reaction picker overlay. The scrim sits BELOW the
          picker in JSX order so the picker's emoji buttons capture taps
          first; everything else (chat area, header, composer) falls through
          to the scrim's onPress, which dismisses. */}
      {reactionTargetId !== null && pickerAnchor ? (
        <ReactionPickerOverlay
          anchor={pickerAnchor}
          onPick={(emoji) =>
            reactionTargetId ? handlePickReaction(reactionTargetId, emoji) : null
          }
          onDismiss={dismissReactionPicker}
        />
      ) : null}

      <FlexBadgesSheet ref={flexSheetRef} options={flexOptions} onPick={handleFlexPick} />
      <SharePredictionSheet
        ref={predictionSheetRef}
        options={predictionOptions}
        onPick={handlePredictionPick}
      />
    </View>
  );
}

// ReactionPicker dimensions — kept in sync with ReactionPicker.tsx:
//   6 emojis × 32 + 5 × 2 gap + 4 × 2 padding + 0.5 × 2 border ≈ 211 wide
//   32 button + 4 × 2 padding + 0.5 × 2 border ≈ 41 tall.
const PICKER_WIDTH = 211;
const PICKER_HEIGHT = 41;
const PICKER_GAP = 6;
const PICKER_EDGE_MARGIN = 12;

function ReactionPickerOverlay({
  anchor,
  onPick,
  onDismiss,
}: {
  anchor: { x: number; y: number; width: number; height: number; alignRight: boolean };
  onPick: (emoji: string) => void;
  onDismiss: () => void;
}) {
  const { width: screenWidth } = useWindowDimensions();

  // Anchor the picker's edge to the bubble's edge, then clamp to screen so
  // it never spills off the side.
  const rawLeft = anchor.alignRight
    ? anchor.x + anchor.width - PICKER_WIDTH
    : anchor.x;
  const left = Math.max(
    PICKER_EDGE_MARGIN,
    Math.min(rawLeft, screenWidth - PICKER_WIDTH - PICKER_EDGE_MARGIN),
  );
  const top = anchor.y - PICKER_HEIGHT - PICKER_GAP;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 100,
        elevation: 100,
      }}
    >
      <Pressable
        onPress={onDismiss}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top,
          left,
        }}
      >
        <ReactionPicker visible onPick={onPick} />
      </View>
    </View>
  );
}

function MentionDropdown({
  members,
  onPick,
}: {
  members: PoolMember[];
  onPick: (m: PoolMember) => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        marginHorizontal: theme.spacing.md,
        marginBottom: 4,
        borderRadius: theme.radii.md,
        backgroundColor: theme.colors.surface,
        borderWidth: 0.5,
        borderColor: withOpacity(theme.colors.silver, 0.6),
        overflow: 'hidden',
        maxHeight: 220,
        ...theme.shadows.card,
      }}
    >
      <ScrollView
        keyboardShouldPersistTaps="always"
        showsVerticalScrollIndicator
        bounces={false}
      >
        {members.map((m, i) => (
          <Pressable
            key={m.userId}
            onPress={() => onPick(m)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.sm,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.sm,
              borderTopWidth: i === 0 ? 0 : 0.5,
              borderTopColor: withOpacity(theme.colors.silver, 0.4),
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Avatar name={m.fullName || m.username} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <RNText
                numberOfLines={1}
                style={{
                  fontFamily: fontFamilies.semibold,
                  fontSize: 14,
                  color: theme.colors.ink,
                }}
              >
                {m.fullName || m.username}
              </RNText>
              <RNText
                numberOfLines={1}
                style={{
                  fontFamily: fontFamilies.regular,
                  fontSize: 12,
                  color: theme.colors.slate,
                }}
              >
                @{m.username}
              </RNText>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function DateHeader({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: theme.spacing.sm }}>
      <RNText
        style={{
          fontFamily: fontFamilies.semibold,
          fontSize: 11,
          color: theme.colors.slate,
          letterSpacing: 0.3,
        }}
      >
        {label}
      </RNText>
    </View>
  );
}

function computeOutcome(
  predH: number,
  predA: number,
  actualH: number,
  actualA: number,
): 'exact' | 'correct' | 'miss' {
  if (predH === actualH && predA === actualA) return 'exact';
  const predWinner = predH > predA ? 'home' : predA > predH ? 'away' : 'draw';
  const actualWinner = actualH > actualA ? 'home' : actualA > actualH ? 'away' : 'draw';
  return predWinner === actualWinner ? 'correct' : 'miss';
}

const OUTCOME_RANK: Record<'exact' | 'correct' | 'miss', number> = {
  exact: 0,
  correct: 1,
  miss: 2,
};

async function fetchSharablePredictions(
  poolId: string,
  appUserId: string,
): Promise<PredictionOption[]> {
  const { data: memberRow } = await supabase
    .from('pool_members')
    .select('member_id')
    .eq('pool_id', poolId)
    .eq('user_id', appUserId)
    .maybeSingle();
  const memberId = (memberRow as { member_id: string } | null)?.member_id;
  if (!memberId) return [];

  const { data: entryRow } = await supabase
    .from('pool_entries')
    .select('entry_id')
    .eq('member_id', memberId)
    .order('entry_number', { ascending: true })
    .limit(1)
    .maybeSingle();
  const entryId = (entryRow as { entry_id: string } | null)?.entry_id;
  if (!entryId) return [];

  const { data } = await supabase
    .from('predictions')
    .select(
      'match_id, predicted_home_score, predicted_away_score, matches!inner(match_number, stage, home_score_ft, away_score_ft, home_team:teams!matches_home_team_id_fkey(country_name, flag_url), away_team:teams!matches_away_team_id_fkey(country_name, flag_url))',
    )
    .eq('entry_id', entryId)
    .not('predicted_home_score', 'is', null)
    .not('predicted_away_score', 'is', null);

  type Team = { country_name: string; flag_url: string | null };
  type MatchEmbed = {
    match_number: number;
    stage: string;
    home_score_ft: number | null;
    away_score_ft: number | null;
    home_team: Team | Team[] | null;
    away_team: Team | Team[] | null;
  };
  type Row = {
    match_id: string;
    predicted_home_score: number;
    predicted_away_score: number;
    matches: MatchEmbed | MatchEmbed[] | null;
  };

  const out: PredictionOption[] = [];
  for (const row of ((data as Row[] | null) ?? [])) {
    const match = Array.isArray(row.matches) ? row.matches[0] : row.matches;
    if (!match) continue;
    if (match.home_score_ft == null || match.away_score_ft == null) continue;
    const home = Array.isArray(match.home_team) ? match.home_team[0] : match.home_team;
    const away = Array.isArray(match.away_team) ? match.away_team[0] : match.away_team;
    if (!home || !away) continue;
    out.push({
      key: row.match_id,
      homeName: home.country_name,
      homeFlag: home.flag_url ?? null,
      awayName: away.country_name,
      awayFlag: away.flag_url ?? null,
      predictedHome: row.predicted_home_score,
      predictedAway: row.predicted_away_score,
      actualHome: match.home_score_ft,
      actualAway: match.away_score_ft,
      outcome: computeOutcome(
        row.predicted_home_score,
        row.predicted_away_score,
        match.home_score_ft,
        match.away_score_ft,
      ),
      matchNumber: match.match_number,
      stage: match.stage,
    });
  }
  out.sort((a, b) => {
    if (OUTCOME_RANK[a.outcome] !== OUTCOME_RANK[b.outcome]) {
      return OUTCOME_RANK[a.outcome] - OUTCOME_RANK[b.outcome];
    }
    return b.matchNumber - a.matchNumber;
  });
  return out;
}

function EmptyState() {
  const theme = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.xl,
        paddingVertical: theme.spacing.xxxl,
      }}
    >
      <Icon name="bubble.left.and.bubble.right" size={36} tint={theme.colors.silver} weight="regular" />
      <Text variant="cardTitle" align="center">
        No messages yet
      </Text>
      <Text variant="body" color="slate" align="center">
        Be the first to drop some banter.
      </Text>
    </View>
  );
}

function MessageRow({
  message,
  isOwn,
  showSenderName,
  showAvatar,
  reactions,
  currentUserId,
  pickerOpen,
  dimmedByOtherPicker,
  onLongPressBubble,
  onPickReaction,
  onToggleReaction,
  onDismissPicker,
}: {
  message: BanterMessage;
  isOwn: boolean;
  showSenderName: boolean;
  showAvatar: boolean;
  reactions: import('@/lib/usePoolBanter').ReactionAggregate[];
  currentUserId: string | null;
  pickerOpen: boolean;
  dimmedByOtherPicker: boolean;
  onLongPressBubble: (
    messageId: string,
    anchor: { x: number; y: number; width: number; height: number; alignRight: boolean },
  ) => void;
  onPickReaction: (messageId: string, emoji: string) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onDismissPicker: () => void;
}) {
  const theme = useTheme();

  // The bubble pulses up to 1.04 while the picker is open and the rest of
  // the chat fades to 0.4 — the iMessage focus effect, achieved with two
  // shared values driven off prop changes.
  const scale = useSharedValue(1);
  const dimOpacity = useSharedValue(1);
  useEffect(() => {
    scale.value = withSpring(pickerOpen ? 1.04 : 1, {
      damping: 14,
      stiffness: 220,
      mass: 0.6,
    });
  }, [pickerOpen, scale]);
  useEffect(() => {
    dimOpacity.value = withTiming(dimmedByOtherPicker ? 0.4 : 1, { duration: 180 });
  }, [dimmedByOtherPicker, dimOpacity]);
  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  const rowStyle = useAnimatedStyle(() => ({
    opacity: dimOpacity.value,
  }));

  const bubbleRef = useRef<View | null>(null);
  function handleLongPress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {
      /* haptics unsupported on this device */
    });
    // Measure the bubble's screen-space position so the parent can render
    // the picker as a screen-level overlay anchored to it.
    bubbleRef.current?.measureInWindow((x, y, width, height) => {
      onLongPressBubble(message.messageId, { x, y, width, height, alignRight: isOwn });
    });
  }

  return (
    <Animated.View
      style={[
        {
          flexDirection: 'row',
          justifyContent: isOwn ? 'flex-end' : 'flex-start',
          alignItems: 'flex-end',
          paddingVertical: 1,
        },
        rowStyle,
      ]}
    >
      {isOwn ? <View style={{ width: 60 }} /> : null}

      <View
        style={{
          alignItems: isOwn ? 'flex-end' : 'flex-start',
          maxWidth: '78%',
          gap: 2,
        }}
      >
        {showSenderName ? (
          <RNText
            style={{
              fontFamily: fontFamilies.semibold,
              fontSize: 11,
              color: theme.colors.slate,
              paddingLeft: isOwn ? 0 : 34,
              marginBottom: 2,
            }}
          >
            {message.senderName}
          </RNText>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
          {!isOwn ? (
            showAvatar ? (
              <Avatar name={message.senderName} />
            ) : (
              <View style={{ width: 28, height: 28 }} />
            )
          ) : null}
          {/* The reaction picker itself is rendered at the screen level by
              the parent (so a tap-anywhere scrim can sit beneath it without
              swallowing emoji taps). The bubble stays here and gets the
              focus animations (scale, dim siblings) in place. */}
          <Animated.View ref={bubbleRef} style={bubbleStyle}>
            <Pressable
              onLongPress={handleLongPress}
              onPress={pickerOpen ? onDismissPicker : undefined}
              delayLongPress={250}
            >
              {isRichMessageType(message.messageType) ? (
                <BanterRichCard
                  messageType={message.messageType}
                  metadata={message.metadata}
                  content={message.content}
                  isOwn={isOwn}
                  senderUserId={message.userId}
                />
              ) : (
                <View
                  style={{
                    backgroundColor: isOwn ? theme.colors.primary : theme.colors.mist,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 16,
                    borderBottomRightRadius: isOwn && showAvatar ? 4 : 16,
                    borderBottomLeftRadius: !isOwn && showAvatar ? 4 : 16,
                  }}
                >
                  <RNText
                    style={{
                      fontFamily: fontFamilies.regular,
                      fontSize: 15,
                      lineHeight: 20,
                      color: isOwn ? '#FFFFFF' : theme.colors.ink,
                    }}
                  >
                    {parseMentionSegments(message.content).map((seg, i) =>
                      seg.isMention ? (
                        <RNText
                          key={i}
                          style={{
                            fontFamily: fontFamilies.bold,
                            color: isOwn ? theme.colors.accent : theme.colors.primary,
                          }}
                        >
                          {seg.text}
                        </RNText>
                      ) : (
                        <RNText key={i}>{seg.text}</RNText>
                      ),
                    )}
                  </RNText>
                </View>
              )}
            </Pressable>
          </Animated.View>
        </View>

        <ReactionPills
          aggregates={reactions}
          currentUserId={currentUserId}
          isOwn={isOwn}
          onToggle={(emoji) => onToggleReaction(message.messageId, emoji)}
        />
      </View>

      {!isOwn ? <View style={{ width: 60 }} /> : null}
    </Animated.View>
  );
}

function Avatar({ name }: { name: string }) {
  const theme = useTheme();
  const initials = getInitials(name);
  return (
    <View
      style={{
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: theme.colors.slate,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <RNText
        style={{
          color: '#FFFFFF',
          fontFamily: fontFamilies.bold,
          fontSize: 11,
        }}
      >
        {initials}
      </RNText>
    </View>
  );
}

function Composer({
  inputRef,
  value,
  onChange,
  onSend,
  onQuickActions,
  quickActionsOpen,
  quickActionsMenu,
  disabled,
  sending,
}: {
  inputRef: React.RefObject<TextInput | null>;
  value: string;
  onChange: (s: string) => void;
  onSend: () => void;
  onQuickActions: () => void;
  quickActionsOpen: boolean;
  quickActionsMenu: React.ReactNode;
  disabled: boolean;
  sending: boolean;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: theme.spacing.sm,
        paddingHorizontal: theme.spacing.md,
        paddingTop: theme.spacing.sm,
        // Constant paddingBottom — clears the home indicator at rest. When
        // the keyboard rises, KeyboardAvoidingView pads its OWN bottom by
        // `keyboardHeight - insets.bottom` (we pass insets.bottom as the
        // vertical offset), so this padding stays meaningful at rest and is
        // cancelled out when the keyboard is up. No JS-driven layout hops.
        paddingBottom: Math.max(theme.spacing.sm, insets.bottom),
        backgroundColor: theme.colors.snow,
        borderTopWidth: 0.5,
        borderTopColor: withOpacity(theme.colors.silver, 0.6),
      }}
    >
      <View
        style={{
          // Lock the wrapper to the + button's exact box so the absolutely
          // positioned quick-actions menu has a stable containing block.
          // Without this, the row's intrinsic height (which grows with the
          // multi-line input) leaks into the menu's `bottom` resolution and
          // the popover drifts away from the + button.
          position: 'relative',
          width: 32,
          height: 32,
          marginBottom: 6,
          // Lift the wrapper (and its popover) above the input bubble that
          // sits next to it — RN stacks siblings in DOM order otherwise.
          zIndex: 10,
          elevation: 10,
        }}
      >
        {quickActionsMenu}
        <Pressable
          onPress={onQuickActions}
          hitSlop={6}
          style={({ pressed }) => ({
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: quickActionsOpen
              ? withOpacity(theme.colors.ink, 0.14)
              : withOpacity(theme.colors.ink, 0.06),
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <PlusXIcon open={quickActionsOpen} theme={theme} />
        </Pressable>
      </View>
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: theme.spacing.xs,
          backgroundColor: theme.colors.mist,
          borderRadius: 18,
          paddingLeft: 14,
          paddingRight: 4,
          paddingVertical: 4,
        }}
      >
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChange}
          placeholder="Banter"
          placeholderTextColor={theme.colors.slate}
          multiline
          maxLength={500}
          style={{
            flex: 1,
            color: theme.colors.ink,
            fontFamily: fontFamilies.regular,
            fontSize: 15,
            lineHeight: 20,
            maxHeight: 120,
            paddingVertical: Platform.OS === 'ios' ? 8 : 4,
          }}
        />
        <Pressable
          onPress={onSend}
          disabled={disabled}
          hitSlop={6}
          style={({ pressed }) => ({
            width: 32,
            height: 32,
            borderRadius: 16,
            backgroundColor: disabled ? theme.colors.silver : theme.colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 2,
            opacity: pressed && !disabled ? 0.85 : 1,
          })}
        >
          <Icon name={sending ? 'ellipsis' : 'arrow.up'} size={14} tint="#FFFFFF" weight="bold" />
        </Pressable>
      </View>
    </View>
  );
}

function PlusXIcon({ open, theme }: { open: boolean; theme: ReturnType<typeof useTheme> }) {
  const progress = useSharedValue(open ? 1 : 0);
  useEffect(() => {
    progress.value = withSpring(open ? 1 : 0, {
      damping: 14,
      stiffness: 200,
      mass: 0.6,
    });
  }, [open, progress]);
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progress.value * 45}deg` }],
  }));
  return (
    <Animated.View style={style}>
      <Icon name="plus" size={14} tint={theme.colors.ink} weight="bold" />
    </Animated.View>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function isSameDay(aIso: string, bIso: string): boolean {
  const a = new Date(aIso);
  const b = new Date(bIso);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const time = d.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  if (isSameDay(d.toISOString(), today.toISOString())) {
    return `Today ${time}`;
  }
  if (isSameDay(d.toISOString(), yesterday.toISOString())) {
    return `Yesterday ${time}`;
  }
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
}

// silence unused import warning if shape changes later
void Image;
