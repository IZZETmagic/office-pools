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
  BottomSheetScrollView,
} from '@gorhom/bottom-sheet';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
} from 'react-native';
// rn-emoji-keyboard ships a single default export — a modal-rendered
// emoji picker with categories, search, and skin-tone variants. The
// onEmojiSelected callback fires with `{ emoji, name, slug, ... }`.
import EmojiPicker from 'rn-emoji-keyboard';
import {
  Bubble,
  type BubbleProps,
  GiftedChat,
  InputToolbar,
  Send,
  type IMessage,
} from 'react-native-gifted-chat';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text } from '@/components/ui';
import { fetchLeaderboard, type LeaderboardEntry } from '@/lib/api';
import {
  buildFlexBadgeOptions,
  buildFlexBadgePayload,
  loadFlexBadges,
} from '@/lib/flexBadges';
import { useHomeData } from '@/lib/HomeDataProvider';
import { supabase } from '@/lib/supabase';
import {
  detectMentionQuery,
  replaceMentionQuery,
  type PoolMember,
  usePoolBanter,
} from '@/lib/usePoolBanter';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

import { BanterRichCard, isRichMessageType } from './BanterRichCard';
import {
  FlexBadgesSheet,
  type FlexBadgeOption,
  type FlexBadgesSheetHandle,
} from './FlexBadgesSheet';
import { QuickActionsMenu, type QuickAction } from './QuickActionsMenu';
import { ReactionPicker } from './ReactionPicker';
import { ReactionPills } from './ReactionPills';
import {
  SharePredictionSheet,
  type PredictionOption,
  type SharePredictionSheetHandle,
} from './SharePredictionSheet';

// Reactions support — for type-only imports to keep BanterBubble's
// signature precise without pulling the whole hook surface.
import type { ReactionAggregate } from '@/lib/usePoolBanter';

export type BanterSheetHandle = {
  open: () => void;
  close: () => void;
};

// Our extension of gifted-chat's IMessage. The extra `_showSenderName`
// flag is computed once during the BanterMessage → IMessage mapping
// and read inside renderBubble to decide whether to show the
// sender's name above this bubble (first-in-group only).
type BanterIMessage = IMessage & {
  _showSenderName: boolean;
  // True when this is the chronologically LAST message in a sender's
  // consecutive run (the one that gets the avatar). Used to apply
  // the small bottom-left "tail" flick on the bubble that points
  // toward the avatar, iMessage-style.
  _isLastOfGroup: boolean;
  // Rich-card plumbing — carried from the original BanterMessage so
  // renderBubble can switch on type and render `BanterRichCard` for
  // non-'text' messages instead of the default text Bubble. Default
  // `'text'` keeps the regular bubble path for chat messages that
  // pre-date the rich-card pass.
  _messageType: string;
  _metadata: Record<string, unknown> | null;
};

type Props = {
  poolId: string | undefined;
  poolName: string | undefined;
};

// memo wrap — the pool detail screen's horizontal-pager onScroll fires
// at 60fps during tab swipes/taps, and BanterSheet sits permanently in
// that tree carrying a full GiftedChat (heavy FlatList + bubble tree).
// Without memo, every parent re-render reconciles through this whole
// component and tanks the swipe animation. Props are referentially
// stable strings so the default shallow equality is correct.
export const BanterSheet = memo(forwardRef<BanterSheetHandle, Props>(function BanterSheet(
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
  // When the user closes the sheet WITH THE KEYBOARD UP, we have two
  // animations racing: the sheet's translateY going down, AND the
  // wrapperPaddingStyle (keyboard dismiss) shrinking. Different
  // durations + easing curves means the composer's position
  // RELATIVE TO the sheet bobs around for a few frames — visible
  // jitter. To prevent that, we capture the current paddingBottom
  // at the moment the sheet starts closing and lock it there for
  // the duration of the close animation. The sheet then slides
  // down as a rigid unit with the composer fixed inside it; the
  // keyboard dismisses below, off-screen.
  const sheetClosingSV = useSharedValue(0);
  const frozenPaddingSV = useSharedValue(0);

  const wrapperPaddingStyle = useAnimatedStyle(() => {
    if (sheetClosingSV.value === 1) {
      return { paddingBottom: frozenPaddingSV.value };
    }
    return {
      paddingBottom:
        -keyboardHeight.value + insets.bottom * (1 - keyboardProgress.value),
    };
  });

  // Translate any ABSOLUTE-positioned overlay (mention autocomplete,
  // quick-actions menu) up so it tracks the COMPOSER'S TOP EDGE
  // through the keyboard transition. RN doesn't re-layout absolute
  // children when Reanimated mutates paddingBottom on the outer
  // wrapper, so the overlay's initial-layout position (relative to
  // the screen's border-box bottom, ignoring padding) is what we
  // shift FROM.
  //
  // Target: overlay bottom = composer top = paddingBottom +
  // COMPOSER_HEIGHT, where paddingBottom = -keyboardHeight +
  // insets.bottom*(1-progress). Since `bottom: COMPOSER_HEIGHT` on
  // the overlay was already set in the wrapper style, we shift by
  // the paddingBottom value (which is what the composer rose by):
  //   shift = paddingBottom = -keyboardHeight + insets.bottom*(1-progress)
  //   translateY = -shift = keyboardHeight - insets.bottom*(1-progress)
  //
  //   - closed: 0 - 34*1 = -34           (overlay rides above the safe-area inset)
  //   - open:   -300 - 34*0 = -300       (overlay rides 300pt up, matches keyboard rise)
  const overlayKeyboardTransform = useAnimatedStyle(() => ({
    transform: [
      {
        translateY:
          keyboardHeight.value -
          insets.bottom * (1 - keyboardProgress.value),
      },
    ],
  }));

  // Imperative open/close — same pattern the other gorhom sheets in
  // the app use (JoinPoolSheet, PoolCreateJoinSheet, etc.).
  useImperativeHandle(ref, () => ({
    open: () => sheetRef.current?.expand(),
    close: () => sheetRef.current?.close(),
  }));

  // -------------------------------------------------------------
  // Quick-actions state — the `+` button in the composer opens a
  // dropdown of three actions (standings drop / badge flex /
  // share prediction). Two of those open inner picker sheets
  // (`FlexBadgesSheet`, `SharePredictionSheet`) — refs + the
  // option lists they consume live here.
  // -------------------------------------------------------------
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  // Lazy-mount flags for the two inner gorhom BottomSheets. They
  // can't be permanently mounted (plain BottomSheet at index=-1
  // absorbs touches on Android, blocking interaction with the chat
  // underneath) — so we mount each one ON FIRST USE and keep it
  // mounted afterward. This trades the open/close stutter (which
  // was hitting EVERY banter open/close because the sheets
  // remounted) for a one-time mount cost when the user first taps
  // the relevant quick-action. Touch absorption isn't an issue
  // because by then the user is interacting with the sheets
  // intentionally.
  const [flexBadgesMounted, setFlexBadgesMounted] = useState(false);
  const [sharePredictionMounted, setSharePredictionMounted] = useState(false);
  const flexBadgesSheetRef = useRef<FlexBadgesSheetHandle | null>(null);
  const sharePredictionSheetRef = useRef<SharePredictionSheetHandle | null>(null);
  const [flexBadgeOptions, setFlexBadgeOptions] = useState<FlexBadgeOption[]>([]);
  const [predictionOptions, setPredictionOptions] = useState<PredictionOption[]>([]);
  // "Pending open" flags — set when the user triggers an action that
  // should open one of the lazy-mounted inner sheets. The useEffect
  // below watches these alongside the mounted flag and calls the
  // ref's open() method once the sheet is mounted (and its ref
  // therefore attached). Lets us collapse "mount + open" into a
  // single async path that works on FIRST use AND subsequent uses.
  const [pendingFlexBadgesOpen, setPendingFlexBadgesOpen] = useState(false);
  const [pendingSharePredictionOpen, setPendingSharePredictionOpen] = useState(false);

  useEffect(() => {
    if (
      flexBadgesMounted &&
      pendingFlexBadgesOpen &&
      flexBadgesSheetRef.current
    ) {
      flexBadgesSheetRef.current.open();
      setPendingFlexBadgesOpen(false);
    }
  }, [flexBadgesMounted, pendingFlexBadgesOpen]);

  useEffect(() => {
    if (
      sharePredictionMounted &&
      pendingSharePredictionOpen &&
      sharePredictionSheetRef.current
    ) {
      sharePredictionSheetRef.current.open();
      setPendingSharePredictionOpen(false);
    }
  }, [sharePredictionMounted, pendingSharePredictionOpen]);

  // -------------------------------------------------------------
  // Reactions state.
  //
  // `reactionAnchor` — when set, the ReactionPicker is anchored to
  // the screen position of the long-pressed bubble. `y` and `h`
  // come from measureInWindow on the bubble's wrapper, so the
  // picker can be positioned just above (or below if there's no
  // room above) the message it targets — iMessage style. Setting
  // this to null dismisses the picker.
  //
  // `emojiKeyboardOpen` — full Unicode emoji picker (rn-emoji-
  // keyboard) modal toggle. The "+" affordance on the quick-reaction
  // row opens it. When it commits an emoji we apply it against the
  // same anchored message.
  // -------------------------------------------------------------
  // The message currently staged as a reply target. When non-null,
  // gifted-chat renders a "Replying to @user — [preview]" pill
  // above the composer (driven by `reply.message` on GiftedChat).
  // Set by swipe-to-reply, cleared on send-success or the pill's
  // close button.
  const [replyTarget, setReplyTarget] = useState<BanterIMessage | null>(null);

  // -------------------------------------------------------------
  // @mention plumbing.
  //
  // `composerText` — we own the composer text state so we can both
  // observe it (to detect an in-flight @mention query) AND set it
  // (when the user picks a member from the autocomplete). Passing
  // it to GiftedChat via the `text` prop puts gifted-chat into
  // controlled mode. The renderComposer below intercepts
  // onChangeText to keep this in sync.
  //
  // `mentionQuery` — the partial @username currently being typed
  // (the chars after the most-recent @ that hasn't been ended by a
  // space). Empty string when the user just typed @ with nothing
  // after it; null when no mention context is active. Drives the
  // MentionAutocomplete dropdown's visibility + filtering.
  // -------------------------------------------------------------
  const [composerText, setComposerText] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);

  const handleComposerTextChange = useCallback((nextText: string) => {
    setComposerText(nextText);
    setMentionQuery(detectMentionQuery(nextText));
  }, []);

  const handlePickMention = useCallback(
    (username: string) => {
      const nextText = replaceMentionQuery(composerText, username);
      setComposerText(nextText);
      setMentionQuery(null);
    },
    [composerText],
  );

  const [reactionAnchor, setReactionAnchor] = useState<
    | {
        id: string;
        x: number;
        y: number;
        w: number;
        h: number;
        position: 'left' | 'right';
      }
    | null
  >(null);
  const reactingMessageId = reactionAnchor?.id ?? null;
  const [emojiKeyboardOpen, setEmojiKeyboardOpen] = useState(false);

  // Animated progress driver for the blur + clone tap-back. Single
  // shared value so the BlurView fades in, the bubble clone appears,
  // and the picker spring-enters all on the same 150ms/100ms timer
  // — no jank from independent animations.
  const reactionUIProgress = useSharedValue(0);
  useEffect(() => {
    reactionUIProgress.value = withTiming(reactionAnchor ? 1 : 0, {
      duration: reactionAnchor ? 150 : 100,
    });
  }, [reactionAnchor, reactionUIProgress]);
  const dimAnimatedStyle = useAnimatedStyle(() => ({
    opacity: reactionUIProgress.value,
  }));

  const handleBubbleLongPress = useCallback(
    (
      messageId: string,
      geom: { x: number; y: number; w: number; h: number },
      position: 'left' | 'right',
    ) => {
      // Dismiss the keyboard before showing the picker. With the
      // keyboard up, the bubble's measured y-position can be hidden
      // behind the keyboard, leaving the picker visible above empty
      // space. Dismissing first ensures the chat re-lays out and the
      // bubble we measured is actually visible underneath the picker.
      Keyboard.dismiss();
      setReactionAnchor({ id: messageId, ...geom, position });
    },
    [],
  );

  // Cache toggleReaction's stable identity (it's wrapped in
  // useCallback inside usePoolBanter, keyed on [appUserId]). Without
  // this indirection, depending on `banter` would re-create
  // handleToggleReaction on every BanterSheet render — which in
  // turn would re-render every BanterBubble, defeating the
  // pull-out we just did for tab-switch jitter.
  const toggleReaction = banter.toggleReaction;
  const handleToggleReaction = useCallback(
    (messageId: string, emoji: string) => {
      void toggleReaction(messageId, emoji);
      // Close both surfaces after a pick — the quick row dismisses
      // immediately; the full-keyboard modal also closes since the
      // pick is the terminal action.
      setReactionAnchor(null);
      setEmojiKeyboardOpen(false);
    },
    [toggleReaction],
  );

  const dismissReactionPicker = useCallback(() => {
    setReactionAnchor(null);
  }, []);

  const handleOpenEmojiKeyboard = useCallback(() => {
    setEmojiKeyboardOpen(true);
    // We keep `reactingMessageId` set — when the keyboard modal
    // commits, handleToggleReaction reads it to target the right
    // message. Backdrop tap on the keyboard's own dismiss path
    // doesn't reset reactingMessageId; the picker overlay below
    // stays primed if the user closes the keyboard without picking.
  }, []);

  // Quick-actions dispatcher. The menu is closed immediately on pick
  // — the actual work runs async, so we don't want the menu hanging
  // open while the leaderboard or predictions request is in flight.
  const handlePickQuickAction = useCallback(
    async (key: string) => {
      setQuickActionsOpen(false);
      if (!poolId || !banter.appUserId) return;
      if (key === 'standings') {
        await sendStandings(poolId, banter.sendMessage);
      } else if (key === 'flex') {
        await openFlexBadges(poolId, banter.appUserId, (opts) => {
          // Set options + mark mounted + mark pending-open. The
          // useEffect above invokes flexBadgesSheetRef.open() once
          // both `mounted` and `pendingOpen` are true (and the ref
          // is attached). Calling .open() directly here would
          // race the mount on first use.
          setFlexBadgeOptions(opts);
          setFlexBadgesMounted(true);
          setPendingFlexBadgesOpen(true);
        });
      } else if (key === 'prediction') {
        await openSharePrediction(poolId, banter.appUserId, (opts) => {
          setPredictionOptions(opts);
          setSharePredictionMounted(true);
          setPendingSharePredictionOpen(true);
        });
      }
    },
    [poolId, banter.appUserId, banter.sendMessage],
  );

  // Fired from inside FlexBadgesSheet when a badge is picked. We need
  // to re-fetch the leaderboard to get the live entry — the user's
  // points may have changed between opening the sheet and picking.
  const handlePickFlexBadge = useCallback(
    async (key: string) => {
      if (!poolId || !banter.appUserId) return;
      await sendFlexBadge(poolId, banter.appUserId, key, banter.sendMessage);
    },
    [poolId, banter.appUserId, banter.sendMessage],
  );

  // Fired from inside SharePredictionSheet. Predictions are already
  // hydrated in state from when the sheet was opened — no re-fetch
  // needed, just look it up by key.
  const handlePickSharePrediction = useCallback(
    (key: string) => {
      const pred = predictionOptions.find((p) => p.key === key);
      if (!pred) return;
      void sendSharePrediction(pred, banter.sendMessage);
    },
    [predictionOptions, banter.sendMessage],
  );

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

  // Dismiss the keyboard whenever the sheet closes. If the user was
  // mid-composition (keyboard up), pan-down-to-close / backdrop tap /
  // X button would otherwise leave the keyboard floating awkwardly
  // over the pool detail page behind. Calling Keyboard.dismiss() on
  // a closed keyboard is a no-op, so the unconditional dismiss on
  // sheetOpen=false (including initial mount) is safe.
  useEffect(() => {
    if (!sheetOpen) {
      Keyboard.dismiss();
    }
  }, [sheetOpen]);

  // Map our BanterMessage[] (chronological, oldest first) to
  // gifted-chat's IMessage[] (reverse-chronological, newest first
  // — gifted-chat renders bottom-up via an inverted FlatList).
  //
  // We also compute `_showSenderName` per message — true when this
  // is the FIRST message in a sender's consecutive run (i.e. the
  // chronologically previous message was from someone else, or
  // there is no previous message). Drives the conditional sender-
  // label in the renderBubble override below: name appears once
  // per block of messages from the same person, not repeated on
  // every bubble.
  const giftedMessages = useMemo<BanterIMessage[]>(() => {
    const out: BanterIMessage[] = [];
    const msgs = banter.messages;
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      const prev = i > 0 ? msgs[i - 1] : null;
      const next = i < msgs.length - 1 ? msgs[i + 1] : null;
      out.push({
        _id: m.messageId,
        text: m.content,
        createdAt: new Date(m.createdAt),
        user: {
          // Display the @handle (e.g. "IZZETmagic") rather than the
          // full name. Falls back to senderName if username is null
          // (legacy messages or members without a set username).
          // Drives both the sender label above the first bubble in a
          // run AND the initials in the avatar circle on the last
          // bubble.
          _id: m.userId,
          name: m.senderUsername ?? m.senderName,
        },
        _showSenderName: !prev || prev.userId !== m.userId,
        _isLastOfGroup: !next || next.userId !== m.userId,
        _messageType: m.messageType,
        _metadata: m.metadata,
        // gifted-chat's Bubble renders a quoted-reply pill above the
        // bubble when `replyMessage` is set on currentMessage. The
        // shape is Pick<IMessage, '_id' | 'text' | 'user' | ...>;
        // we only need _id / text / user for plain text replies.
        replyMessage: m.replyTo
          ? {
              _id: m.replyTo.messageId,
              text: m.replyTo.content,
              user: {
                _id: m.replyTo.userId,
                name: m.replyTo.senderUsername ?? m.replyTo.senderName,
              },
            }
          : undefined,
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
    // Snapshot the reply target's id BEFORE the async send. If the
    // user dismissed the pill mid-send (or clear-on-success races a
    // re-set), we still attribute this message to the correct
    // parent. Don't pass tmp- ids — usePoolBanter also guards but
    // clearing the target eagerly is a UX nicety.
    const replyToId =
      replyTarget && !String(replyTarget._id).startsWith('tmp-')
        ? String(replyTarget._id)
        : undefined;
    const result = await banter.sendMessage(value, {
      replyToMessageId: replyToId,
    });
    if (result.error) {
      Alert.alert("Couldn't send message", result.error);
      // Keep replyTarget so the user can retry without re-swiping.
      // Don't clear composerText either — user can retry without
      // re-typing.
      return;
    }
    setReplyTarget(null);
    // Clear the controlled composer. gifted-chat used to do this
    // for us when it owned the text state; with `text={...}` we
    // own it, so we have to clear explicitly.
    setComposerText('');
    setMentionQuery(null);
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
        onChange={(idx) => {
          setSheetOpen(idx >= 0);
          // Unfreeze padding AFTER the close animation completes
          // (onChange fires on snap-end). Doing this in onAnimate
          // on the next OPEN would cause a one-frame jump because
          // the worklet flips from the frozen keyboard-up padding
          // (~300pt) back to the live value (~34pt) instantly.
          // Unfreezing here, while the sheet is already off-screen,
          // hides that transition entirely.
          if (idx < 0) {
            sheetClosingSV.value = 0;
          }
        }}
        // onAnimate fires at the START of a snap animation (gorhom's
        // earliest hook). We use it for close-time setup:
        //   1. Dismiss the keyboard in parallel with the sheet close.
        //   2. Snapshot the current keyboard-aware paddingBottom and
        //      freeze it for the duration of the close — eliminates
        //      jitter from composer riding up (keyboard dismiss) while
        //      sheet slides down (sheet close).
        //   3. Tear down any active overlays (mention dropdown / quick
        //      actions) so they don't visually jitter alongside the
        //      sheet either.
        // On reopen we do nothing here — the unfreeze already
        // happened in onChange when the previous close finished, so
        // the live keyboard-aware padding is in effect from frame 0.
        onAnimate={(_fromIndex, toIndex) => {
          if (toIndex < 0) {
            frozenPaddingSV.value =
              -keyboardHeight.value +
              insets.bottom * (1 - keyboardProgress.value);
            sheetClosingSV.value = 1;
            Keyboard.dismiss();
            setMentionQuery(null);
            setQuickActionsOpen(false);
          }
        }}
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
          // Controlled composer text — lets us swap in the full
          // @handle when the user picks from MentionAutocomplete.
          // Updated by renderComposer's intercepted onChangeText.
          text={composerText}
          user={me}
          textInputProps={{ placeholder: 'Banter' }}
          maxComposerHeight={120}
          // We own the avatar slot for every received message. With
          // `isAvatarVisibleForEveryMessage={true}` gifted-chat calls
          // `renderAvatar` on every row (instead of just last-of-group),
          // and our AvatarSlot decides whether to render the visible
          // initials circle or a same-sized transparent placeholder.
          // This guarantees every received row has an identical 36pt
          // avatar column, so bubbles align flush regardless of where
          // the visible circle lands.
          isAvatarVisibleForEveryMessage
          // Keep the send button slot in the toolbar even when the
          // composer is empty — we render a greyed-out circle so the
          // input row's right edge doesn't collapse and pop back in
          // the moment the user types. `disabled={!text}` on Send
          // below still blocks empty submits.
          alwaysShowSend
          // Reply functionality. gifted-chat handles the swipe
          // gesture, the action icon, and rendering the "Replying
          // to" preview pill above the input toolbar — we just
          // wire state. The quoted-bubble above each message
          // renders automatically because the message mapper sets
          // `replyMessage` on every IMessage that has a `replyTo`.
          reply={{
            message: replyTarget
              ? {
                  _id: replyTarget._id,
                  text: replyTarget.text,
                  user: replyTarget.user,
                }
              : null,
            onClear: () => setReplyTarget(null),
            // Custom preview component with a Reanimated mount
            // animation. gifted-chat's default ReplyPreview has no
            // animation, so its appearance was reading as a jittery
            // snap. Our version animates height + opacity from 0 to
            // natural over 180ms — the chat above sees a smooth
            // progressive reflow rather than an instant push.
            renderPreview: ({ replyMessage }) => (
              <AnimatedReplyPreview
                replyMessage={replyMessage}
                onClear={() => setReplyTarget(null)}
              />
            ),
            swipe: {
              // Only register the per-message swipe gesture handlers
              // while the banter sheet is open. When closed, the
              // BanterSheet is still mounted (we kept it mounted to
              // avoid first-open jitter), so the ~15 visible bubbles
              // would otherwise have active gesture handlers stealing
              // priority from the pool detail page's horizontal pager
              // — that's the tab-switch jitter we saw return.
              isEnabled: sheetOpen,
              direction: 'left',
              onSwipe: (msg) => {
                // Don't allow replying to optimistic (tmp-) messages
                // — they don't have a persisted message_id yet, so
                // an FK on reply_to_message_id would fail.
                if (String(msg._id).startsWith('tmp-')) return;
                // gifted-chat fires this from onSwipeableWillOpen,
                // i.e. WHILE the swipe animation is still running.
                // Calling setReplyTarget synchronously triggers a
                // React reconcile through the heavy bubble tree,
                // which starves the UI thread and makes the swipe
                // visibly jitter. Deferring one frame lets the
                // animation finish first.
                requestAnimationFrame(() => {
                  setReplyTarget(msg as BanterIMessage);
                });
              },
            },
            // Custom quote rendering — WhatsApp-style integrated
            // header at the top of the bubble. Default gifted-chat
            // MessageReply uses margins + its own borderRadius that
            // make the quote look like a separate floating element.
            // Our version is flush against the bubble's inner edge
            // with a colored vertical accent bar, sender name in
            // accent color, and quoted text muted. Lives inside the
            // bubble's Pressable (gifted-chat puts renderMessageReply
            // right before renderMessageText in the content tree).
            renderMessageReply: (replyProps) => {
              const replyMsg = replyProps.currentMessage?.replyMessage;
              if (!replyMsg) return null;
              const isOwn = replyProps.position === 'right';
              const accentColor = isOwn ? '#FFFFFF' : theme.colors.accent;
              const usernameColor = accentColor;
              // The quoted text sits one shade off the surrounding
              // text color so it reads as secondary content. On the
              // sent (primary blue) side, white @ 0.85; on the
              // received side, ink @ 0.7.
              const quotedTextColor = isOwn
                ? withOpacity('#FFFFFF', 0.85)
                : withOpacity(theme.colors.ink, 0.7);
              const stripeBgColor = isOwn
                ? withOpacity('#FFFFFF', 0.18)
                : withOpacity(theme.colors.ink, 0.05);
              return (
                <View
                  style={{
                    flexDirection: 'row',
                    alignSelf: 'stretch',
                    // minWidth forces the BUBBLE WRAPPER to grow to
                    // at least this many pt — without it the bubble
                    // sizes to the (short) message text, squeezing
                    // the reply pill into a narrow column where the
                    // username truncates to "IZ..." and the quoted
                    // text wraps to 2-3 lines of single words. 220
                    // gives the quote room for ~25 chars on one
                    // line, matching WhatsApp's natural width.
                    minWidth: 220,
                    backgroundColor: stripeBgColor,
                    // Smaller radius than the bubble (xs = 6 vs the
                    // bubble's sm = 12). The pill reads as a snappy
                    // inner element with light rounding nested
                    // inside the more rounded bubble — clean
                    // visual hierarchy.
                    borderRadius: theme.radii.xs,
                    // Positive marginTop pushes the pill DOWN inside
                    // the bubble, forcing the bubble wrapper to grow
                    // taller above it. The bubble's natural
                    // paddingVertical (xxs = 2pt) plus this 3pt
                    // gives ~5pt of breathing room between the
                    // bubble's top edge and the reply pill — a
                    // tighter, more snug feel than the original 8pt.
                    // marginBottom keeps the gap between the quote
                    // and the message body text below.
                    marginTop: 3,
                    marginBottom: 4,
                    marginHorizontal: 0,
                    overflow: 'hidden',
                  }}
                >
                  <View style={{ width: 3, backgroundColor: accentColor }} />
                  <View
                    style={{
                      flex: 1,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                    }}
                  >
                    <RNText
                      numberOfLines={1}
                      style={{
                        fontFamily: fontFamilies.bold,
                        fontSize: 13,
                        color: usernameColor,
                        marginBottom: 1,
                      }}
                    >
                      {replyMsg.user?.name || 'User'}
                    </RNText>
                    <RNText
                      numberOfLines={2}
                      style={{
                        fontFamily: fontFamilies.regular,
                        fontSize: 13,
                        lineHeight: 17,
                        color: quotedTextColor,
                      }}
                    >
                      {replyMsg.text}
                    </RNText>
                  </View>
                </View>
              );
            },
          }}
          renderAvatar={(avatarProps) => {
            // No avatar slot on the sent (right) side.
            if (avatarProps.position === 'right') return null;
            const msg = avatarProps.currentMessage as BanterIMessage | undefined;
            return (
              <AvatarSlot
                userId={String(msg?.user._id ?? '')}
                name={String(msg?.user.name ?? '?')}
                visible={!!msg?._isLastOfGroup}
              />
            );
          }}
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
          // Delegate to the BanterBubble component (defined below the
          // BanterSheet export). Extracted so each bubble can hold its
          // own state — long-press handler, reaction pills below — and
          // so we don't accidentally call hooks inside a render-callback.
          renderBubble={(bubbleProps) => (
            <BanterBubble
              bubbleProps={bubbleProps as BubbleProps<BanterIMessage>}
              aggregates={
                banter.reactions.get(
                  String((bubbleProps.currentMessage as BanterIMessage | undefined)?._id ?? ''),
                ) ?? EMPTY_REACTIONS
              }
              currentUserId={banter.appUserId}
              onLongPress={handleBubbleLongPress}
              onToggleReaction={handleToggleReaction}
            />
          )}
          // -------------------------------------------------------
          // Input toolbar — iMessage / WhatsApp / Messenger style:
          //
          //   [+ circle]   [_____ pill TextInput _____]   [↑ circle]
          //
          // The "+" on the left is the future quick-actions slot
          // (badge flex / standings drop / share prediction). The
          // pill in the middle is the composer. The blue "↑" on the
          // right appears only when there's text to send (default
          // Send behavior — `alwaysShowSend` left off).
          //
          // The three slots are vertically aligned to the BOTTOM
          // (`primaryStyle: { alignItems: 'flex-end' }`) so when the
          // TextInput grows to two/three lines the circular buttons
          // stay anchored next to the most recent line of text — same
          // as iMessage.
          // -------------------------------------------------------
          renderInputToolbar={(toolbarProps) => (
            <InputToolbar
              {...toolbarProps}
              containerStyle={{
                backgroundColor: theme.colors.snow,
                borderTopColor: withOpacity(theme.colors.silver, 0.5),
                borderTopWidth: 0.5,
                paddingHorizontal: 4,
                paddingTop: 4,
                paddingBottom: 4,
              }}
              primaryStyle={{ alignItems: 'flex-end' }}
            />
          )}
          // Quick-actions trigger — opens the `QuickActionsMenu`
          // popover with three actions: Share standings / Flex
          // badges / Share prediction. Each action dispatches via
          // handlePickQuickAction (defined above) which either
          // sends a message directly (standings) or opens one of
          // the inner picker sheets (badges, predictions). Toggle
          // tint when open so the user gets a visible "active"
          // affordance on the trigger.
          renderActions={() => (
            <Pressable
              hitSlop={6}
              onPress={() => setQuickActionsOpen((v) => !v)}
              style={({ pressed }) => ({
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: quickActionsOpen
                  ? withOpacity(theme.colors.primary, 0.12)
                  : theme.colors.mist,
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: 4,
                marginRight: 4,
                marginBottom: 4,
                opacity: pressed ? 0.6 : 1,
                // Subtle rotation when open turns the + into an x,
                // mirroring the iMessage / Messenger affordance.
                transform: [{ rotate: quickActionsOpen ? '45deg' : '0deg' }],
              })}
            >
              <Icon
                name="plus"
                size={18}
                tint={quickActionsOpen ? theme.colors.primary : theme.colors.slate}
                weight="bold"
              />
            </Pressable>
          )}
          // Custom composer using a plain RN TextInput (not gorhom's
          // BottomSheetTextInput). The sheet is locked at insets.top
          // and we DON'T want gorhom to do any keyboard handling on
          // focus — our animated paddingBottom on the wrapper is the
          // sole driver of composer-rise. BottomSheetTextInput would
          // dispatch keyboard-state events to the parent sheet that
          // can introduce a second source of motion.
          //
          // The TextInput sits inside a pill-shaped View
          // (theme.colors.mist background, borderRadius: 20). The
          // pill grows vertically with the text up to maxHeight: 120
          // (~5 lines), then scrolls internally — same cap iMessage
          // uses before forcing a scroll.
          renderComposer={(composerProps) => (
            <View
              style={{
                flex: 1,
                backgroundColor: theme.colors.mist,
                borderRadius: 20,
                paddingHorizontal: 14,
                marginVertical: 4,
                minHeight: 36,
                maxHeight: 120,
                justifyContent: 'center',
              }}
            >
              <TextInput
                value={composerProps.text}
                multiline
                underlineColorAndroid="transparent"
                enablesReturnKeyAutomatically
                {...composerProps.textInputProps}
                // Intercept onChangeText AFTER spreading textInputProps
                // (gifted-chat's own onChangeText is in there). Forward
                // to gifted-chat so it stays in sync, AND drive our
                // controlled state + mention-query detection.
                onChangeText={(nextText) => {
                  composerProps.textInputProps?.onChangeText?.(nextText);
                  handleComposerTextChange(nextText);
                }}
                style={[
                  {
                    fontSize: 16,
                    lineHeight: 22,
                    // iOS multiline TextInput pads asymmetrically by
                    // default; explicit symmetric padding keeps the
                    // caret centered in the pill at one line and
                    // reads cleanly when it grows.
                    paddingTop: 8,
                    paddingBottom: 8,
                    color: theme.colors.ink,
                    maxHeight: 120,
                  },
                  composerProps.textInputProps?.style,
                ]}
                placeholderTextColor={
                  composerProps.textInputProps?.placeholderTextColor ?? theme.colors.slate
                }
              />
            </View>
          )}
          // Custom send button — blue circle with an up-arrow.
          // Only rendered when the composer has text (default Send
          // behavior). Tapping it triggers gifted-chat's internal
          // submit which calls our onSend → handleSend.
          renderSend={(sendProps) => {
            const hasText = !!sendProps.text?.trim();
            return (
              <Send
                {...sendProps}
                // Send's internal opacity animation hides the button
                // when the composer is empty unless this prop is set
                // (the GiftedChat-level `alwaysShowSend` doesn't reach
                // here once we provide a custom renderSend). With it
                // set, the button stays at opacity 1 and our greyed
                // backgroundColor is what conveys the disabled state.
                isSendButtonAlwaysVisible
                disabled={!hasText}
                containerStyle={{
                  width: 36,
                  height: 36,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: 2,
                  marginRight: 4,
                  marginBottom: 4,
                }}
              >
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 16,
                    // Primary blue when actionable, muted silver when
                    // empty — the button stays in place so the right
                    // edge of the toolbar doesn't reflow.
                    backgroundColor: hasText
                      ? theme.colors.primary
                      : withOpacity(theme.colors.silver, 0.6),
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="arrow.up" size={18} tint="#FFFFFF" weight="bold" />
                </View>
              </Send>
            );
          }}
        />
        {/* Mention autocomplete — floats as an ABSOLUTE OVERLAY
            above the composer (and above the reply preview if
            active) so the chat list isn't pushed up when it
            appears. The chat continues to flow underneath; the
            overlay sits on top of the bottom-most messages. The
            internal ScrollView lets it handle pools with many
            members without truncation. */}
        {mentionQuery !== null ? (
          <Animated.View
            pointerEvents="box-none"
            style={[
              {
                position: 'absolute',
                // Horizontal insets give the dropdown a floating-card
                // feel, like QuickActionsMenu, instead of a full-width
                // sheet jammed against the edges.
                left: theme.spacing.md,
                right: theme.spacing.md,
                // Sit just above the composer, plus the reply preview
                // height when a reply is staged so we don't overlap
                // the preview pill.
                bottom:
                  MENTION_COMPOSER_OFFSET +
                  (replyTarget ? REPLY_PREVIEW_HEIGHT : 0),
                maxHeight: MENTION_OVERLAY_MAX_HEIGHT,
              },
              // Ride up with the keyboard so the overlay stays just
              // above the composer regardless of keyboard state.
              overlayKeyboardTransform,
            ]}
          >
            <MentionAutocomplete
              query={mentionQuery}
              members={banter.members}
              currentUserId={banter.appUserId}
              onPick={handlePickMention}
            />
          </Animated.View>
        ) : null}
        {/* Quick-actions dropdown — wrapped in a keyboard-aware
            Animated.View. We want the menu card's bottom edge to
            land at the SAME height as the mention autocomplete
            (MENTION_COMPOSER_OFFSET = 56pt above the input area).
            QuickActionsMenu has an internal `bottom: 36` for its
            own anchoring, so the wrapper's bottom must be
            (target - 36) = 20pt to land the menu's actual bottom
            at 56pt. Without this subtraction the menu floated 36pt
            higher than the mention dropdown. */}
        <Animated.View
          pointerEvents="box-none"
          style={[
            {
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: MENTION_COMPOSER_OFFSET - 36,
            },
            overlayKeyboardTransform,
          ]}
        >
          <QuickActionsMenu
            open={quickActionsOpen}
            actions={QUICK_ACTIONS}
            onPick={(key) => void handlePickQuickAction(key)}
            onDismiss={() => setQuickActionsOpen(false)}
          />
        </Animated.View>
        {/* Full Unicode emoji keyboard. Renders as a portaled modal
            (rn-emoji-keyboard handles its own portal), so it
            appears on top of the banter sheet without needing
            anything special from us. onEmojiSelected fires with
            `{ emoji: string, name, slug, ... }`. The user can also
            close without picking; we don't reset reactingMessageId
            in that case so the quick-row picker stays primed
            underneath. */}
        <EmojiPicker
          open={emojiKeyboardOpen}
          onClose={() => setEmojiKeyboardOpen(false)}
          onEmojiSelected={(e) => {
            if (reactingMessageId) {
              handleToggleReaction(reactingMessageId, e.emoji);
            }
          }}
          enableSearchBar
          categoryPosition="top"
        />
        {/* Inner picker sheets — both plain gorhom BottomSheets.
            Gated on `sheetOpen` (the banter sheet's own open state)
            so they don't mount EVERY banter open/close — that was
            hitting the user with a perceivable stutter on each
            open/close cycle. We now mount each one ON FIRST USE
            (driven by the `*Mounted` flags set from
            handlePickQuickAction) and keep them mounted afterward.
            The original touch-absorption concern (plain BottomSheet
            at index=-1 absorbing taps on Android) doesn't apply
            here because by the time we mount, the user is
            actively interacting with the quick-actions flow. The
            sheets each render at index=-1 (closed) by default, and
            the useEffect above expands them via the ref once the
            mount completes. */}
        {flexBadgesMounted ? (
          <FlexBadgesSheet
            ref={flexBadgesSheetRef}
            options={flexBadgeOptions}
            onPick={(key) => void handlePickFlexBadge(key)}
          />
        ) : null}
        {sharePredictionMounted ? (
          <SharePredictionSheet
            ref={sharePredictionSheetRef}
            options={predictionOptions}
            onPick={handlePickSharePrediction}
          />
        ) : null}
      </Animated.View>
      </BottomSheet>
      {/* ----------------------------------------------------------
          Reaction tap-back UI — WhatsApp-style blur + clone.
          Rendered at the TOP level of the banter sheet's wrapper
          (sibling of BottomSheet) so the BlurView and clone position
          in screen-space coords from measureInWindow.
          Stack order (bottom → top):
            1. Full-screen BlurView — fades in over 150ms, blurs
               everything behind it (the chat).
            2. Full-screen Pressable that catches outside taps to
               dismiss. Tapping anywhere outside the picker (incl.
               the un-blurred clone) closes the overlay.
            3. Bubble clone — a 1:1 duplicate of the long-pressed
               message rendered at the EXACT measured (x, y, w)
               coords. No scale, no offset — visually it reads as
               the original bubble "punching through" the blur. The
               original underneath is hidden by the blur, so any
               minor styling mismatch between live Bubble and clone
               is invisible.
            4. ReactionPicker quick-row + "+" affordance,
               positioned just above the long-pressed bubble (or
               below if no room above the header).
          ---------------------------------------------------------- */}
      {reactionAnchor ? (
        <>
          {/* `tint="dark"` + intensity 20 matches WhatsApp's overlay.
              expo-blur uses UIVisualEffectView on iOS and the
              hardware-accelerated RenderEffect on Android 12+
              (falls back to a flat dim on older Android — still
              looks intentional, just less dramatic). */}
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, dimAnimatedStyle]}
          >
            {/* Cross-platform blur. iOS uses UIVisualEffectView at
              intensity 60 — sweet spot for "blurred enough to hide
              text" without going opaque. Android needs a higher
              numerical intensity to read the same visually (the
              intensity prop maps to RenderEffect's blurRadius, which
              scales differently than iOS). `experimentalBlurMethod`
              opts into expo-blur's Dimezis-backed JS BlurView,
              which actually does Gaussian blur on Android < 12
              (where RenderEffect doesn't exist) AND produces
              deeper, more iOS-like blur on Android 12+. Small
              perf cost vs hardware blur but unnoticeable for a
              single overlay shown for a few seconds. */}
          <BlurView
              tint="dark"
              intensity={Platform.OS === 'ios' ? 60 : 95}
              experimentalBlurMethod="dimezisBlurView"
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
          <Pressable
            onPress={dismissReactionPicker}
            style={StyleSheet.absoluteFill}
          />
          {/* Bubble clone — rendered at the original measured Y so
              the bubble appears to stay PUT while the surrounding
              chat blurs out. Looked up by id from the live messages
              list so realtime updates (e.g. an incoming reaction
              mid-press) are reflected. Padding values match
              gifted-chat's internal Bubble + MessageText combined
              padding so the clone's size matches the live bubble
              exactly. pointerEvents=none so the dismiss Pressable
              underneath still receives the tap. */}
          {(() => {
            const ghostMsg = banter.messages.find(
              (m) => m.messageId === reactionAnchor.id,
            );
            if (!ghostMsg) return null;
            const isOwn = reactionAnchor.position === 'right';
            const ghostIsRich = isRichMessageType(ghostMsg.messageType);
            return (
              <Animated.View
                pointerEvents="none"
                style={[
                  {
                    position: 'absolute',
                    top: reactionAnchor.y,
                    left: reactionAnchor.x,
                    width: reactionAnchor.w,
                  },
                  dimAnimatedStyle,
                ]}
              >
                {/* alignSelf shrinks the inner clone to its content
                    on left/right of the row, matching the bubble's
                    actual rendered position. Without this the
                    clone would span the full row width on Android
                    because gifted-chat's Bubble container uses
                    flex: 1. */}
                {ghostIsRich ? (
                  <View
                    style={{
                      alignSelf: isOwn ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <BanterRichCard
                      messageType={ghostMsg.messageType}
                      metadata={ghostMsg.metadata}
                      content={ghostMsg.content}
                      isOwn={isOwn}
                      senderUserId={ghostMsg.userId}
                    />
                  </View>
                ) : (
                  // Padding here equals our wrapperStyle padding
                  // (xs/xxs) PLUS gifted-chat's MessageText internal
                  // padding (10/5). Wrapper-padding is contained in
                  // the clone wrapper, MessageText padding is folded
                  // in here so the rendered bubble dimensions match
                  // the live one within ~1pt.
                  <View
                    style={{
                      alignSelf: isOwn ? 'flex-end' : 'flex-start',
                      // No maxWidth — gifted-chat's actual Bubble
                      // wrapper has no maxWidth either; the 70%
                      // cap lives on the Message ROW container
                      // (relative to screen). The parent
                      // Animated.View is sized to reactionAnchor.w
                      // — already the bubble container's bounds in
                      // the live chat — so this clone can grow to
                      // the same natural width as the original
                      // and won't wrap any earlier.
                      backgroundColor: isOwn
                        ? theme.colors.primary
                        : theme.colors.mist,
                      borderRadius: theme.radii.sm,
                      paddingHorizontal: theme.spacing.xs + 10,
                      paddingVertical: theme.spacing.xxs + 5,
                    }}
                  >
                    <RNText
                      style={{
                        color: isOwn ? '#FFFFFF' : theme.colors.ink,
                        fontFamily: fontFamilies.medium,
                        fontSize: 16,
                        lineHeight: 22,
                      }}
                    >
                      {ghostMsg.content}
                    </RNText>
                  </View>
                )}
              </Animated.View>
            );
          })()}
          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              // Picker anchors above the bubble at its measured Y
              // (not a fixed screen position — clone stays in place
              // so picker follows). If there's no room above the
              // status bar + header, fall back to below the bubble.
              top: (() => {
                const PICKER_HEIGHT = 50;
                const MIN_TOP = insets.top + 80; // status bar + handle + custom header
                const above = reactionAnchor.y - PICKER_HEIGHT - 8;
                if (above >= MIN_TOP) return above;
                return reactionAnchor.y + reactionAnchor.h + 8;
              })(),
              alignItems: 'center',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <ReactionPicker
                visible
                onPick={(emoji) => handleToggleReaction(reactionAnchor.id, emoji)}
              />
              <Pressable
                onPress={handleOpenEmojiKeyboard}
                hitSlop={6}
                style={({ pressed }) => ({
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: theme.colors.surface,
                  borderWidth: 0.5,
                  borderColor: withOpacity(theme.colors.silver, 0.6),
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.7 : 1,
                  ...theme.shadows.card,
                })}
              >
                <Icon name="plus" size={16} tint={theme.colors.slate} weight="bold" />
              </Pressable>
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}));

// =============================================================
// BanterBubble — extracted from the inline renderBubble so each
// bubble has its own component instance. This is what lets us:
//   - Attach an outer Pressable to capture long-press without
//     fighting gifted-chat's internal Bubble Pressable.
//   - Render ReactionPills as a sibling below the bubble.
//   - (Future) hold per-bubble refs for swipe-to-reply or
//     measureInWindow-driven popovers.
// Returning a component (not a function call) inside renderBubble
// also keeps hook ordering safe — we can't call useTheme / useRef
// inside the renderBubble callback because React tracks hooks by
// invocation order at the parent component scope.
// =============================================================

// Stable empty-array sentinel for messages with no reactions —
// returned by the reaction lookup so React doesn't see a new
// array reference each render and re-trigger pills' memoization.
const EMPTY_REACTIONS: ReactionAggregate[] = [];

type BanterBubbleProps = {
  bubbleProps: BubbleProps<BanterIMessage>;
  aggregates: ReactionAggregate[];
  currentUserId: string | null;
  // Long-press payload. measureInWindow gives screen-space (x, y,
  // w, h). y/h anchor the picker; x/w position the bubble clone
  // overlaid on the blur; position tells the clone whether to
  // style as a sent (right/primary) or received (left/mist) bubble.
  onLongPress: (
    messageId: string,
    geom: { x: number; y: number; w: number; h: number },
    position: 'left' | 'right',
  ) => void;
  onToggleReaction: (messageId: string, emoji: string) => void;
};

function BanterBubble({
  bubbleProps,
  aggregates,
  currentUserId,
  onLongPress,
  onToggleReaction,
}: BanterBubbleProps) {
  const theme = useTheme();
  const msg = bubbleProps.currentMessage as BanterIMessage | undefined;
  // Ref to the bubble's wrapper View — used by measureInWindow on
  // long-press so the parent can anchor the reaction picker to this
  // bubble's screen position. `collapsable={false}` on the View is
  // critical for Android: without it, RN may flatten the View into
  // its parent, making measureInWindow return wrong coords.
  const bubbleAnchorRef = useRef<View>(null);
  if (!msg) return null;

  // Sender name ABOVE the bubble (outside the colored wrapper),
  // shown only on the first message in a sender's consecutive run
  // on the received side.
  const showName = bubbleProps.position === 'left' && !!msg._showSenderName;
  // iMessage-style tail flick: smaller bottom-left radius on the
  // LAST bubble of a received sender-run (the one sitting next to
  // the avatar), so the corner points toward the avatar.
  const isLeftTail = bubbleProps.position === 'left' && !!msg._isLastOfGroup;
  const tailRadius = theme.spacing.xs;
  const isOwn = bubbleProps.position === 'right';
  // Rich-card branch — non-'text' message types bypass the
  // gifted-chat Bubble entirely and render BanterRichCard.
  const isRich = isRichMessageType(msg._messageType);

  // Measure the bubble's bounds in screen coords and hand them up.
  // measureInWindow gives (x, y, width, height) in window-space on
  // both iOS and Android. Parent uses y/h to anchor the picker and
  // x/y/w/position to render the un-blurred clone overlaid on the
  // BlurView.
  const handleLongPress = () => {
    bubbleAnchorRef.current?.measureInWindow((x, y, w, h) => {
      onLongPress(String(msg._id), { x, y, w, h }, bubbleProps.position);
    });
  };
  const handleToggle = (emoji: string) => onToggleReaction(String(msg._id), emoji);

  const nameLabel = showName ? (
    <RNText
      style={{
        fontFamily: fontFamilies.semibold,
        fontSize: 11,
        color: theme.colors.slate,
        letterSpacing: 0.3,
        marginBottom: 2,
      }}
    >
      {msg.user.name}
    </RNText>
  ) : null;

  return (
    <View>
      {nameLabel}
      {/* Bubble anchor — measureInWindow targets this View to position
          the reaction picker. collapsable={false} is required on
          Android, otherwise RN flattens single-child Views and
          measure returns wrong coords.
          ----------------------------------------------------------
          Long-press wiring is split by branch because gifted-chat's
          Bubble has its own internal Pressable that absorbs the
          gesture before any outer Pressable can fire (RN's responder
          system gives the child responder priority). For text
          bubbles we inject our long-press into THAT inner Pressable
          via Bubble's `touchableProps` — spread after Bubble's own
          onPress/onLongPress, so it wins. For BanterRichCard (no
          internal Pressable) we wrap in our own Pressable. Both
          branches call the same handleLongPress so the picker
          anchors identically. */}
      <View ref={bubbleAnchorRef} collapsable={false}>
        {isRich ? (
          <Pressable onLongPress={handleLongPress} delayLongPress={350}>
            <BanterRichCard
              messageType={msg._messageType}
              metadata={msg._metadata}
              content={msg.text}
              isOwn={isOwn}
              senderUserId={String(msg.user._id ?? '')}
            />
          </Pressable>
        ) : (
          <Bubble
            {...bubbleProps}
            touchableProps={{
              onLongPress: handleLongPress,
              delayLongPress: 350,
            }}
            wrapperStyle={{
              left: {
                backgroundColor: theme.colors.mist,
                borderTopLeftRadius: theme.radii.sm,
                borderTopRightRadius: theme.radii.sm,
                borderBottomLeftRadius: isLeftTail ? tailRadius : theme.radii.sm,
                borderBottomRightRadius: theme.radii.sm,
                paddingHorizontal: theme.spacing.xs,
                paddingVertical: theme.spacing.xxs,
              },
              right: {
                backgroundColor: theme.colors.primary,
                borderTopLeftRadius: theme.radii.sm,
                borderTopRightRadius: theme.radii.sm,
                borderBottomLeftRadius: theme.radii.sm,
                borderBottomRightRadius: theme.radii.sm,
                paddingHorizontal: theme.spacing.xs,
                paddingVertical: theme.spacing.xxs,
              },
            }}
            textStyle={{
              left: {
                color: theme.colors.ink,
                fontFamily: fontFamilies.medium,
                fontSize: 16,
                lineHeight: 22,
              },
              right: {
                color: '#FFFFFF',
                fontFamily: fontFamilies.medium,
                fontSize: 16,
                lineHeight: 22,
              },
            }}
            // gifted-chat's Bubble renders a "bottom" container
            // inside the wrapper that holds username + time + ticks.
            // We suppress time via `renderTime` and have no username,
            // but the container View is still mounted with
            // `paddingBottom: 5, paddingHorizontal: 10` baked into
            // gifted-chat's stylesheet (Bubble/styles.js:bottom).
            // Those 5pt of empty space push the visible text UP
            // inside the bubble. Zeroing the padding here collapses
            // the empty container so the message reads vertically
            // centered in the bubble.
            bottomContainerStyle={{
              left: { paddingHorizontal: 0, paddingBottom: 0 },
              right: { paddingHorizontal: 0, paddingBottom: 0 },
            }}
            // Enable @mention parsing inside MessageText. gifted-chat
            // wraps the text in its built-in LinkParser; setting
            // mention={true} detects `@username` patterns and styles
            // them with linkStyle. On received bubbles we use the
            // theme's accent color so the mention stands out against
            // the mist background; on sent bubbles we keep white but
            // bump weight to bold for emphasis against primary blue.
            messageTextProps={{
              mention: true,
              linkStyle: {
                left: {
                  color: theme.colors.accent,
                  fontFamily: fontFamilies.bold,
                  textDecorationLine: 'none',
                },
                right: {
                  color: '#FFFFFF',
                  fontFamily: fontFamilies.bold,
                  textDecorationLine: 'none',
                },
              },
            }}
            renderTime={() => null}
          />
        )}
      </View>
      {/* Reactions row — only renders something when there's at least
          one reaction (ReactionPills returns null on empty). */}
      <ReactionPills
        aggregates={aggregates}
        currentUserId={currentUserId}
        isOwn={isOwn}
        onToggle={handleToggle}
      />
    </View>
  );
}

// =============================================================
// AnimatedReplyPreview — custom replacement for gifted-chat's
// default ReplyPreview. gifted-chat's version renders with no
// animation, so when `reply.message` flips from null to an object
// the preview pops into the layout tree with full height and the
// chat above snaps up by ~50pt. That sudden reflow reads as
// "jittery slide-up" even though there's no actual slide.
//
// This version animates height (0 → natural) and opacity (0 → 1)
// over 180ms via Reanimated, so the chat above sees a progressive
// height change and the user sees a smooth slide-up. Mount-only
// (exit unmounts instantly — gifted-chat's renderPreview path
// doesn't give us an exit hook). Acceptable trade-off since users
// dismissing the preview want it gone fast.
// =============================================================

const REPLY_PREVIEW_HEIGHT = 56;

function AnimatedReplyPreview({
  replyMessage,
  onClear,
}: {
  replyMessage: { _id: string | number; text: string; user?: { name?: string } };
  onClear: () => void;
}) {
  const theme = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, { duration: 180 });
  }, [progress]);

  const wrapperAnimatedStyle = useAnimatedStyle(() => ({
    height: progress.value * REPLY_PREVIEW_HEIGHT,
    opacity: progress.value,
  }));

  return (
    <Animated.View
      style={[
        {
          overflow: 'hidden',
          backgroundColor: theme.colors.snow,
          borderBottomWidth: 0.5,
          borderBottomColor: withOpacity(theme.colors.silver, 0.5),
        },
        wrapperAnimatedStyle,
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: theme.spacing.md,
          paddingVertical: 8,
          height: REPLY_PREVIEW_HEIGHT,
        }}
      >
        <View
          style={{
            width: 3,
            alignSelf: 'stretch',
            backgroundColor: theme.colors.primary,
            borderRadius: 1.5,
            marginRight: 10,
          }}
        />
        <View style={{ flex: 1 }}>
          <RNText
            numberOfLines={1}
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 13,
              color: theme.colors.primary,
              marginBottom: 1,
            }}
          >
            Replying to {replyMessage.user?.name ?? 'User'}
          </RNText>
          <RNText
            numberOfLines={1}
            style={{
              fontFamily: fontFamilies.regular,
              fontSize: 13,
              color: theme.colors.slate,
            }}
          >
            {replyMessage.text}
          </RNText>
        </View>
        <Pressable
          onPress={onClear}
          hitSlop={8}
          style={({ pressed }) => ({
            width: 26,
            height: 26,
            borderRadius: 13,
            backgroundColor: withOpacity(theme.colors.ink, 0.06),
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: 10,
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Icon name="xmark" size={12} tint={theme.colors.slate} weight="bold" />
        </Pressable>
      </View>
    </Animated.View>
  );
}

// =============================================================
// MentionAutocomplete — dropdown that surfaces matching pool
// members when the user is typing an @mention in the composer.
// Rendered as a FLOATING absolute-positioned overlay above the
// composer (in BanterSheet's JSX) so the chat list underneath
// keeps flowing — the autocomplete just sits on top of the
// bottom-most messages while open.
//
// Filtering: prefix-match against either @username OR full name,
// case-insensitive. Excludes the caller. No result cap — uses a
// ScrollView so pools with many members can scroll through.
// =============================================================

// Composer toolbar's natural height (paddingTop 4 + minHeight 36
// pill + paddingBottom 4 + a couple pt for borders/margins). We
// anchor the mention overlay this many pt above the bottom of
// the Animated.View so it sits just above the composer.
const MENTION_COMPOSER_OFFSET = 56;
// Cap the overlay's height so it never devours the chat. Roughly
// 5 rows visible at once; scroll for more.
const MENTION_OVERLAY_MAX_HEIGHT = 240;

function MentionAutocomplete({
  query,
  members,
  currentUserId,
  onPick,
}: {
  query: string;
  members: PoolMember[];
  currentUserId: string | null;
  onPick: (username: string) => void;
}) {
  const theme = useTheme();
  const matches = useMemo(() => {
    const lower = query.toLowerCase();
    return members
      .filter((m) => m.userId !== currentUserId)
      .filter(
        (m) =>
          m.username.toLowerCase().startsWith(lower) ||
          m.fullName.toLowerCase().startsWith(lower),
      );
  }, [query, members, currentUserId]);

  if (matches.length === 0) return null;

  return (
    // BottomSheetScrollView (vs RN's ScrollView) is required when
    // the scrollable content lives INSIDE a gorhom BottomSheet on
    // Android. gorhom's sheet owns a pan gesture that closes the
    // sheet on downward drags, and by default it eats any nested
    // pan — so a plain ScrollView either won't scroll OR drags the
    // entire sheet down with it. BottomSheetScrollView coordinates
    // with the parent sheet's gesture so vertical scrolls stay
    // inside the autocomplete and only fall through to the sheet
    // when at the top of scroll. `nestedScrollEnabled` on a vanilla
    // ScrollView is insufficient here — gorhom's gesture wins.
    <BottomSheetScrollView
      style={{
        // Match the QuickActionsMenu's card aesthetic — rounded,
        // bordered, shadowed surface that floats above the chat.
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.md,
        borderWidth: 0.5,
        borderColor: withOpacity(theme.colors.silver, 0.6),
        overflow: 'hidden',
        ...theme.shadows.card,
      }}
      contentContainerStyle={{ paddingVertical: 2 }}
      // Critical when the keyboard is up: by default ScrollView
      // dismisses the keyboard on tap, which fires before our
      // onPick. `handled` lets the inner Pressable handle the
      // tap first.
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {matches.map((member, idx) => {
        const gradient =
          AVATAR_GRADIENTS[hashUserIdToIndex(member.userId, AVATAR_GRADIENTS.length)];
        return (
          <Pressable
            key={member.userId}
            onPress={() => onPick(member.username)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: theme.spacing.lg,
              paddingVertical: 10,
              backgroundColor: pressed
                ? withOpacity(theme.colors.ink, 0.05)
                : 'transparent',
              borderTopWidth: idx === 0 ? 0 : 0.5,
              borderTopColor: withOpacity(theme.colors.silver, 0.3),
            })}
          >
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                overflow: 'hidden',
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 10,
              }}
            >
              <LinearGradient
                colors={gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                }}
              />
              <RNText
                style={{
                  color: '#FFFFFF',
                  fontFamily: fontFamilies.bold,
                  fontSize: 12,
                }}
              >
                {getInitials(member.fullName || member.username)}
              </RNText>
            </View>
            <View style={{ flex: 1 }}>
              <RNText
                numberOfLines={1}
                style={{
                  fontFamily: fontFamilies.bold,
                  fontSize: 14,
                  color: theme.colors.ink,
                }}
              >
                {member.fullName || member.username}
              </RNText>
              <RNText
                numberOfLines={1}
                style={{
                  fontFamily: fontFamilies.regular,
                  fontSize: 12,
                  color: theme.colors.slate,
                  marginTop: 1,
                }}
              >
                @{member.username}
              </RNText>
            </View>
          </Pressable>
        );
      })}
    </BottomSheetScrollView>
  );
}

// =============================================================
// Quick-actions helpers — power the `+` button in the composer.
// All three actions ultimately call sendMessage with a non-'text'
// messageType + a metadata payload; renderBubble routes those to
// BanterRichCard.
// =============================================================

// Narrowed shape of usePoolBanter().sendMessage. Passing it explicitly
// keeps these helpers callable from anywhere without pulling the whole
// hook's ReturnType.
type SendMessage = (
  content: string,
  opts?: { messageType?: string; metadata?: Record<string, unknown> | null },
) => Promise<{ error?: string }>;

// The three actions surfaced by the `+` menu (in order).
const QUICK_ACTIONS: QuickAction[] = [
  {
    key: 'standings',
    emoji: '📊',
    label: 'Share standings',
    description: "Drop the leaderboard's top 5",
  },
  {
    key: 'flex',
    emoji: '🏆',
    label: 'Flex badges',
    description: "Show off a badge you've earned",
  },
  {
    key: 'prediction',
    emoji: '🎯',
    label: 'Share prediction',
    description: "Drop a score you've locked in",
  },
];

// "Share standings" — fetch leaderboard, send a `standings_drop`
// rich-card with top 5 entries as metadata. BanterRichCard's
// StandingsBody reads `top_entries` (or falls back to the leader
// fields if `top_entries` is missing).
async function sendStandings(poolId: string, sendMessage: SendMessage) {
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
    const result = await sendMessage(content, {
      messageType: 'standings_drop',
      metadata: {
        leader_user_id: leader.user_id,
        leader_name: leader.name,
        leader_points: leader.points,
        top_entries: top5,
      },
    });
    if (result.error) Alert.alert("Couldn't share standings", result.error);
  } catch (err) {
    Alert.alert(
      "Couldn't share standings",
      err instanceof Error ? err.message : 'Unknown error',
    );
  }
}

// "Flex badges" — loads the caller's earned badges via
// fetchEntryAnalytics and invokes `onReady` with one picker option
// per earned badge. Caller is responsible for opening the sheet
// once options are in state.
async function openFlexBadges(
  poolId: string,
  appUserId: string,
  onReady: (options: FlexBadgeOption[]) => void,
) {
  const ctx = await loadFlexBadges(poolId, appUserId);
  if (!ctx) return;
  onReady(buildFlexBadgeOptions(ctx.earnedBadges));
}

// Re-loads earned badges (vs caching from openFlexBadges) so a
// freshly-unlocked badge is reflected if the user dawdles between
// opening the sheet and picking.
async function sendFlexBadge(
  poolId: string,
  appUserId: string,
  badgeKey: string,
  sendMessage: SendMessage,
) {
  const ctx = await loadFlexBadges(poolId, appUserId);
  if (!ctx) return;
  const badge = ctx.earnedBadges.find((b) => b.id === badgeKey);
  if (!badge) return;
  const { content, metadata } = buildFlexBadgePayload(badge);
  const result = await sendMessage(content, {
    messageType: 'badge_flex',
    metadata,
  });
  if (result.error) Alert.alert("Couldn't flex badge", result.error);
}

// Fetches the caller's complete-score predictions for played matches
// (matches where both predicted_home/away AND actual home/away are
// non-null). Shape matches SharePredictionSheet's PredictionOption.
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
    const predH = row.predicted_home_score;
    const predA = row.predicted_away_score;
    const actualH = match.home_score_ft;
    const actualA = match.away_score_ft;
    let outcome: 'exact' | 'correct' | 'miss';
    if (predH === actualH && predA === actualA) outcome = 'exact';
    else {
      const predWinner = predH > predA ? 'home' : predA > predH ? 'away' : 'draw';
      const actualWinner =
        actualH > actualA ? 'home' : actualA > actualH ? 'away' : 'draw';
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

// "Share prediction" — surfaces the picker with the caller's
// shareable predictions. Caller hydrates state from `onReady` then
// imperatively expands the sheet.
async function openSharePrediction(
  poolId: string,
  appUserId: string,
  onReady: (options: PredictionOption[]) => void,
) {
  try {
    const opts = await fetchSharablePredictions(poolId, appUserId);
    if (opts.length === 0) {
      Alert.alert(
        'No predictions to share yet',
        "Make a few complete-score predictions for matches that have finished — then come back.",
      );
      return;
    }
    onReady(opts);
  } catch (err) {
    Alert.alert(
      "Couldn't load predictions",
      err instanceof Error ? err.message : 'Unknown error',
    );
  }
}

// Sends a `prediction_share` rich-card. The metadata shape matches
// what BanterRichCard's PredictionBody reads (home_team_name /
// away_team_name / predicted_home / actual_home / outcome / etc).
async function sendSharePrediction(pred: PredictionOption, sendMessage: SendMessage) {
  const outcomeBadge =
    pred.outcome === 'exact' ? '★' : pred.outcome === 'correct' ? '✓' : '✗';
  const content = `${outcomeBadge} ${pred.homeName} ${pred.predictedHome}–${pred.predictedAway} ${pred.awayName} (actual ${pred.actualHome}–${pred.actualAway})`;
  const result = await sendMessage(content, {
    messageType: 'prediction_share',
    metadata: {
      match_id: pred.key,
      match_number: pred.matchNumber,
      stage: pred.stage,
      home_team_name: pred.homeName,
      away_team_name: pred.awayName,
      predicted_home: pred.predictedHome,
      predicted_away: pred.predictedAway,
      actual_home: pred.actualHome,
      actual_away: pred.actualAway,
      outcome: pred.outcome,
    },
  });
  if (result.error) Alert.alert("Couldn't share prediction", result.error);
}

// --- Helpers --------------------------------------------------------

// Avatar column slot. Exactly 36×36 + 4pt marginRight (total 40pt
// horizontal footprint) regardless of whether the visible circle is
// shown — middle-of-group rows render a transparent placeholder of
// the same dimensions as the visible last-of-group circle, so all
// bubbles in a sender's run align at the same left edge. The 4pt
// gap (down from 8) snugs the bubble up against the avatar
// iMessage-style; an 8pt gap left the bubble visibly floating
// away from the circle.
//
// Visible mode: gradient circle (deterministic per userId — same
// person always gets the same colors) with two-letter username
// initials.
// Invisible mode: same-sized transparent View (no children).
function AvatarSlot({
  userId,
  name,
  visible,
}: {
  userId: string;
  name: string;
  visible: boolean;
}) {
  // Pick a gradient based on userId hash so every viewer sees the
  // same colors for the same person. useMemo keeps the gradient
  // stable across re-renders of this slot.
  const gradient = useMemo(
    () => AVATAR_GRADIENTS[hashUserIdToIndex(userId, AVATAR_GRADIENTS.length)],
    [userId],
  );
  return (
    <View
      style={{
        width: 36,
        height: 36,
        marginRight: 4,
        borderRadius: 18,
        // Transparent on invisible slots — only the visible-mode
        // gradient backgrounds get color via LinearGradient below.
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {visible ? (
        <>
          <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          />
          <RNText
            style={{
              color: '#FFFFFF',
              fontFamily: fontFamilies.bold,
              fontSize: 13,
            }}
          >
            {getInitials(name)}
          </RNText>
        </>
      ) : null}
    </View>
  );
}

// Curated gradient palette for user avatars. Each pair is a
// diagonal gradient (top-left → bottom-right). Tuned so the
// initials remain legible at the 36×36 size — saturated mid-tones
// with enough contrast for white text. Length and order
// intentionally fixed so existing users keep their assigned color
// across app updates.
const AVATAR_GRADIENTS: readonly [string, string][] = [
  ['#FF6B6B', '#EE5A6F'], // coral / rose
  ['#4ECDC4', '#44A08D'], // teal / sea
  ['#5B8AFF', '#3B6EFF'], // sky / primary blue
  ['#FFB347', '#FF8C42'], // peach / amber
  ['#A855F7', '#7C3AED'], // violet / purple
  ['#10B981', '#059669'], // emerald
  ['#F472B6', '#EC4899'], // pink
  ['#6366F1', '#4F46E5'], // indigo
  ['#FB7185', '#E11D48'], // rose / red
  ['#06B6D4', '#0891B2'], // cyan
];

// Deterministic hash → palette index. Same userId always lands on
// the same gradient. djb2 variant — small, stable, no crypto needed.
function hashUserIdToIndex(userId: string, count: number): number {
  let h = 5381;
  for (let i = 0; i < userId.length; i++) {
    h = ((h << 5) + h + userId.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % count;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
