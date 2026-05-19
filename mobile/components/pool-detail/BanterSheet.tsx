// Banter chat surface. Architecture:
//
//   gorhom BottomSheetModal (outer shell)        ← slide-up animation,
//   └── custom header row                          on both platforms;
//   └── GiftedChat (chat list + composer)          consistent UX
//
// We're using `react-native-gifted-chat` for the chat list + composer
// because hand-rolling the inverted FlatList + keyboard avoidance +
// scroll-to-bottom + bubble layout on RN is a sea of platform quirks.
// gifted-chat ships all of it pre-tuned. We keep our Supabase-backed
// `pool_messages` data layer; gifted-chat is just the renderer.
//
// FIRST-PASS SCOPE (text-only chat):
//   ✓ Send / receive text messages
//   ✓ Realtime updates via existing usePoolBanter sub
//   ✓ Mark-as-read on open
//   ✓ Slide-up bottom-sheet shell (gorhom)
//   ✓ Imperative open() / close() ref API
//
// LATER PASSES (each layered back in its own commit):
//   1. Rich cards (badge_flex / prediction_share / standings_drop)
//      via `renderBubble` override
//   2. Reactions via long-press → existing ReactionPicker overlay
//   3. @mention autocomplete via `renderComposer` or
//      `renderInputToolbar` override
//   4. Quick-actions (+) menu via gifted-chat's `Actions` prop;
//      hooks back into existing shareStandings / flexBadges /
//      sharePrediction helpers (kept alive below for re-wiring).

import BottomSheet, {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Alert, Pressable, TextInput, View } from 'react-native';
import { Bubble, GiftedChat, type IMessage } from 'react-native-gifted-chat';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text } from '@/components/ui';
import { fetchLeaderboard, type LeaderboardEntry } from '@/lib/api';
import { useHomeData } from '@/lib/HomeDataProvider';
import { supabase } from '@/lib/supabase';
import { usePoolBanter, type BanterMessage } from '@/lib/usePoolBanter';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

export type BanterSheetHandle = {
  open: () => void;
  close: () => void;
};

type Props = {
  poolId: string | undefined;
  poolName: string | undefined;
};

export const BanterSheet = forwardRef<BanterSheetHandle, Props>(function BanterSheet(
  { poolId, poolName },
  ref,
) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet | null>(null);
  const banter = usePoolBanter(poolId);
  const { clearPoolUnread } = useHomeData();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Keyboard-aware bottom padding. `progress` animates 0 → 1 as the
  // keyboard opens; `height` is the keyboard's height as a negative
  // shared value (closed = 0, open = -keyboardHeight) per
  // react-native-keyboard-controller's convention. Both driven
  // frame-by-frame by UIKit's keyboard block on iOS and
  // WindowInsetsAnimation on Android.
  //
  // The sheet is locked at 92% (no `keyboardBehavior` on the
  // BottomSheetModal), so we push the composer up WITHIN the sheet
  // by the keyboard height:
  //
  // - closed: paddingBottom = 0 + insets.bottom (composer clears home indicator)
  // - open:   paddingBottom = keyboardHeight + 0 (composer flush with keyboard top)
  const { progress: keyboardProgress, height: keyboardHeight } =
    useReanimatedKeyboardAnimation();
  const wrapperPaddingStyle = useAnimatedStyle(() => ({
    paddingBottom:
      -keyboardHeight.value + insets.bottom * (1 - keyboardProgress.value),
  }));

  // Imperative open/close — same pattern the other gorhom sheets in
  // the app use (JoinPoolSheet, PoolCreateJoinSheet, etc.).
  useImperativeHandle(ref, () => ({
    open: () => sheetRef.current?.expand(),
    close: () => sheetRef.current?.close(),
  }));

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.4} />
    ),
    [],
  );

  // Snap point — 100% of the available area below the status bar.
  // Combined with `topInset={insets.top}` on the BottomSheetModal,
  // the sheet's top edge lands exactly at the bottom of the status
  // bar / notch. Sheet stays locked there permanently; keyboard
  // does not move it.
  const snapPoints = useMemo<(string | number)[]>(() => ['100%'], []);

  // Clear the unread badge the moment the sheet opens. Mirrors what
  // the old screen route did on mount.
  useLayoutEffect(() => {
    if (!sheetOpen) return;
    if (banter.appUserId && banter.unreadCount > 0) {
      void banter.markAsRead();
      if (poolId) clearPoolUnread(poolId);
    }
  }, [sheetOpen, banter, poolId, clearPoolUnread]);

  // Map our BanterMessage[] (chronological, oldest first) to
  // gifted-chat's IMessage[] (reverse-chronological, newest first
  // — gifted-chat renders bottom-up via an inverted FlatList).
  const giftedMessages = useMemo<IMessage[]>(() => {
    const out: IMessage[] = [];
    for (const m of banter.messages) {
      out.push({
        _id: m.messageId,
        text: m.content,
        createdAt: new Date(m.createdAt),
        user: {
          _id: m.userId,
          name: m.senderName,
        },
      });
    }
    // Gifted-chat expects newest first. The source is already in
    // chronological order, so reverse a shallow copy.
    return out.reverse();
  }, [banter.messages]);

  // Gifted-chat fires onSend with an array of new messages (it
  // supports batched sends, but we only ever ship one at a time).
  // The optimistic message it builds is discarded — our realtime
  // sub will pull the canonical row back from Supabase.
  async function handleSend(newMessages: IMessage[]) {
    const m = newMessages[0];
    if (!m) return;
    const value = m.text?.trim();
    if (!value) return;
    const result = await banter.sendMessage(value);
    if (result.error) {
      Alert.alert("Couldn't send message", result.error);
    }
  }

  // Gifted-chat's `user` prop tells it which messages are "mine" so
  // they render in the primary color on the right. Matching is by
  // user._id only; the name shown on the bubble for received
  // messages comes from each message's own user field.
  const me = useMemo(
    () => ({ _id: banter.appUserId ?? 'anonymous' }),
    [banter.appUserId],
  );

  return (
    // pointerEvents wrapper — when the sheet is closed (translated
    // off-screen but still mounted), gorhom keeps a full-parent
    // container in the tree that absorbs taps on Android. Wrapping
    // in a View with `box-none` (passes touches through unless a
    // child captures them) lets the pool detail screen behind us
    // stay interactive when the sheet's not in use.
    <View
      pointerEvents={sheetOpen ? 'auto' : 'box-none'}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
    >
      <BottomSheet
        ref={sheetRef}
        // Start closed; expand() / close() drive open/close.
        index={-1}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        // Sheet's top edge lands exactly at insets.top (status
        // bar / notch bottom). Combined with snapPoints `['100%']`,
        // this gives the maximum sheet height that doesn't overlap
        // the status bar. Sheet stays locked here — no
        // keyboardBehavior, no shifting when the keyboard opens.
        topInset={insets.top}
        handleIndicatorStyle={{ backgroundColor: theme.colors.silver }}
        backgroundStyle={{ backgroundColor: theme.colors.snow }}
        onChange={(idx) => setSheetOpen(idx >= 0)}
      >
      <Animated.View
        style={[
          { flex: 1 },
          // Top padding ramps up to insets.top as keyboard opens
          // (header clears the status bar when sheet hits full-screen).
          // Bottom padding ramps down to 0 (composer flush with
          // keyboard). Both interpolate frame-by-frame in lockstep
          // with the OS keyboard animation.
          wrapperPaddingStyle,
        ]}
      >
        {/* Header — pool name + message count + close X. Sits inside
            the sheet, not as a native nav header. Same chrome both
            platforms. */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.md,
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.xs,
            paddingBottom: theme.spacing.sm,
            borderBottomWidth: 0.5,
            borderBottomColor: withOpacity(theme.colors.silver, 0.6),
            backgroundColor: theme.colors.snow,
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
            onPress={() => sheetRef.current?.close()}
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

        {/* GiftedChat is mounted from the moment BanterSheet first
            renders (along with the pool detail screen), so its
            FlatList layout pass happens off-screen — invisible to
            the user. Every open of the sheet shows an already-laid-
            out chat, no jitter. State (composer draft, scroll
            position) persists across open/close cycles. */}
        <GiftedChat
          messages={giftedMessages}
          onSend={(msgs) => void handleSend(msgs)}
          user={me}
          textInputProps={{ placeholder: 'Banter' }}
          maxComposerHeight={120}
          renderAvatar={null}
          // Disable gifted-chat's internal KAV — gorhom owns the
          // keyboard via the BottomSheetTextInput we render below.
          keyboardAvoidingViewProps={{ enabled: false }}
          // Bubble styling — match the app's theme. Sent bubbles
          // (right side) use `theme.colors.primary` with white text;
          // received bubbles (left side) use `theme.colors.mist` with
          // ink text. Timestamps inside bubbles are suppressed
          // (renderTime returns null) — they read awkwardly in the
          // gifted-chat default; if we want timestamps later they
          // should be grouped above date headers, not per-bubble.
          renderBubble={(bubbleProps) => (
            <Bubble
              {...bubbleProps}
              wrapperStyle={{
                left: {
                  backgroundColor: theme.colors.mist,
                  borderRadius: theme.radii.md,
                  paddingHorizontal: theme.spacing.xs,
                  paddingVertical: theme.spacing.xxs,
                },
                right: {
                  backgroundColor: theme.colors.primary,
                  borderRadius: theme.radii.md,
                  paddingHorizontal: theme.spacing.xs,
                  paddingVertical: theme.spacing.xxs,
                },
              }}
              textStyle={{
                left: {
                  color: theme.colors.ink,
                  fontFamily: fontFamilies.regular,
                  // 15/20 is a chat-bubble-specific size — sits
                  // between typography.body (14/20) and
                  // typography.cardTitle (16/20). No token matches;
                  // matches what the original BanterRichCard and the
                  // legacy banter screen used.
                  fontSize: 15,
                  lineHeight: 20,
                },
                right: {
                  // '#FFFFFF' is the codebase convention for text
                  // on `theme.colors.primary` (BanterFab, Join
                  // button, etc.). Primary blue doesn't theme-flip,
                  // so the text must stay white in dark mode too —
                  // a theme token (which would flip) would be wrong.
                  color: '#FFFFFF',
                  fontFamily: fontFamilies.regular,
                  fontSize: 15,
                  lineHeight: 20,
                },
              }}
              renderTime={() => null}
            />
          )}
          // Custom composer using a plain RN TextInput (not gorhom's
          // BottomSheetTextInput). The sheet is locked at insets.top
          // and we DON'T want gorhom to do any keyboard handling on
          // focus — our animated paddingBottom on the wrapper is the
          // sole driver of composer-rise. BottomSheetTextInput would
          // dispatch keyboard-state events to the parent sheet that
          // can introduce a second source of motion.
          renderComposer={(composerProps) => (
            <TextInput
              value={composerProps.text}
              multiline
              underlineColorAndroid="transparent"
              enablesReturnKeyAutomatically
              {...composerProps.textInputProps}
              style={[
                {
                  flex: 1,
                  fontSize: 16,
                  lineHeight: 22,
                  paddingTop: 8,
                  paddingBottom: 10,
                  paddingHorizontal: 8,
                  color: theme.colors.ink,
                },
                composerProps.textInputProps?.style,
              ]}
              placeholderTextColor={
                composerProps.textInputProps?.placeholderTextColor ?? theme.colors.slate
              }
            />
          )}
        />
      </Animated.View>
      </BottomSheet>
    </View>
  );
});

// =============================================================
// Helpers preserved from the prior implementation — UNUSED in this
// first pass but kept alive (rather than deleted) so the follow-up
// passes that re-wire rich cards / share-prediction / flex-badges /
// quick-actions can call them without re-deriving the SQL or the
// payload shapes.
// =============================================================

/* eslint-disable @typescript-eslint/no-unused-vars */

// Quick-actions menu items (used by the + button in the composer).
// Re-wire: gifted-chat exposes `renderActions={() => ...}` which
// fires the picker.
const _QUICK_ACTIONS_PLACEHOLDER = [
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

// "Share standings" — fetches the leaderboard top 5 and sends a
// `standings_drop` rich-card message. Re-wire in the quick-actions
// pass.
async function _shareStandings(
  poolId: string,
  sendMessage: BanterTypes['sendMessage'],
) {
  try {
    const lb = await fetchLeaderboard(poolId);
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
    await sendMessage(content, {
      messageType: 'standings_drop',
      metadata: {
        leader_user_id: leader.user_id,
        leader_name: leader.name,
        leader_points: leader.points,
        top_entries: top5,
      },
    });
  } catch (err) {
    Alert.alert(
      "Couldn't share standings",
      err instanceof Error ? err.message : 'Unknown error',
    );
  }
}

// Badge-flex option set + sender. Re-wire in the quick-actions pass.
type _BadgeOption = {
  key: string;
  label: string;
  emoji: string;
  show: (e: LeaderboardEntry) => boolean;
  build: (e: LeaderboardEntry) => { content: string; metadata: Record<string, unknown> };
};
const _BADGE_OPTIONS: _BadgeOption[] = [
  {
    key: 'bullseye',
    label: 'Bullseye',
    emoji: '🎯',
    show: (e) => e.exact_count > 0,
    build: (e) => ({
      content: `🎯 Bullseye — ${e.exact_count} exact ${e.exact_count === 1 ? 'pick' : 'picks'}!`,
      metadata: {
        badge_type: 'bullseye',
        badge_label: 'Bullseye',
        badge_count: e.exact_count,
        badge_description: `${e.exact_count} exact ${e.exact_count === 1 ? 'pick' : 'picks'}`,
      },
    }),
  },
  {
    key: 'hot_streak',
    label: 'Hot streak',
    emoji: '🔥',
    show: (e) => e.current_streak?.type === 'hot' && e.current_streak.length > 0,
    build: (e) => ({
      content: `🔥 Hot streak — ${e.current_streak.length} in a row!`,
      metadata: {
        badge_type: 'hot_streak',
        badge_label: 'Hot streak',
        badge_count: e.current_streak.length,
        badge_description: `${e.current_streak.length} ${e.current_streak.length === 1 ? 'pick' : 'picks'} in a row`,
      },
    }),
  },
  {
    key: 'underdog',
    label: 'Underdog',
    emoji: '🎰',
    show: (e) => e.contrarian_wins > 0,
    build: (e) => ({
      content: `🎰 Underdog — ${e.contrarian_wins} contrarian ${e.contrarian_wins === 1 ? 'win' : 'wins'}!`,
      metadata: {
        badge_type: 'underdog',
        badge_label: 'Underdog',
        badge_count: e.contrarian_wins,
        badge_description: `${e.contrarian_wins} contrarian ${e.contrarian_wins === 1 ? 'win' : 'wins'}`,
      },
    }),
  },
];

// "Share prediction" — fetches the caller's complete-score
// predictions for the pool and surfaces a picker. Re-wire in the
// quick-actions pass.
type _PredictionOption = {
  key: string;
  homeName: string;
  homeFlag: string | null;
  awayName: string;
  awayFlag: string | null;
  predictedHome: number;
  predictedAway: number;
  actualHome: number;
  actualAway: number;
  outcome: 'exact' | 'correct' | 'miss';
  matchNumber: number;
  stage: string;
};

async function _fetchSharablePredictions(
  poolId: string,
  appUserId: string,
): Promise<_PredictionOption[]> {
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

  const out: _PredictionOption[] = [];
  for (const row of ((data as Row[] | null) ?? [])) {
    const match = Array.isArray(row.matches) ? row.matches[0] : row.matches;
    if (!match) continue;
    if (match.home_score_ft == null || match.away_score_ft == null) continue;
    const home = Array.isArray(match.home_team) ? match.home_team[0] : match.home_team;
    const away = Array.isArray(match.away_team) ? match.away_team[0] : match.away_team;
    if (!home || !away) continue;
    const predH = row.predicted_home_score;
    const predA = row.predicted_away_score;
    const actualH = match.home_score_ft;
    const actualA = match.away_score_ft;
    let outcome: 'exact' | 'correct' | 'miss';
    if (predH === actualH && predA === actualA) outcome = 'exact';
    else {
      const predWinner = predH > predA ? 'home' : predA > predH ? 'away' : 'draw';
      const actualWinner = actualH > actualA ? 'home' : actualA > actualH ? 'away' : 'draw';
      outcome = predWinner === actualWinner ? 'correct' : 'miss';
    }
    out.push({
      key: row.match_id,
      homeName: home.country_name,
      homeFlag: home.flag_url ?? null,
      awayName: away.country_name,
      awayFlag: away.flag_url ?? null,
      predictedHome: predH,
      predictedAway: predA,
      actualHome: actualH,
      actualAway: actualA,
      outcome,
      matchNumber: match.match_number,
      stage: match.stage,
    });
  }
  return out;
}

// Minimal type for the helpers above — keeps them callable without
// pulling in the whole `usePoolBanter` ReturnType.
type BanterTypes = {
  sendMessage: (
    content: string,
    opts?: { messageType?: string; metadata?: Record<string, unknown> },
  ) => Promise<{ error?: string }>;
};

// Stop tsc complaining about an unused type-only export — the
// BanterMessage import is here so the rich-card re-wire pass can
// reach into the original message shape without re-importing.
type _BanterMessage = BanterMessage;

/* eslint-enable @typescript-eslint/no-unused-vars */
