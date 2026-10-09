import { useCallback, useMemo, useState } from 'react';
import type { LayoutChangeEvent, RefreshControlProps } from 'react-native';
import Animated, {
  scrollTo,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';

import { alignedTabOffset, minContentHeight, SYNC_TAB_HEADER } from '@/lib/collapsibleTabs';

// =============================================================
// ONE PAGE OF A PAGER UNDER A COLLAPSING HEADER
// =============================================================
// Shared by the pool screen (the Showdown band) and the Match Detail Centre,
// which carried two identical copies of this as `TabPage` until 2026-10-09.
//
// Each page is a vertical ScrollView that reports its offset to the screen's
// `scrollY`, which the header folds against. What changed on 2026-10-09 (Ryan):
// the fold now belongs to the SCREEN. Before a page slides in it is scrolled to
// line up with the header as it already is — the rule is `alignedTabOffset` —
// so swiping from a half-read Duel tab to The Room no longer springs the header
// back open. Every page also gets just enough room to hold the header folded
// (`minContentHeight`), measured on the device.
//
// ## ⚠ BACKOUT
//
// `SYNC_TAB_HEADER = false` in `lib/collapsibleTabs.ts` restores the old
// behaviour exactly — both alignment steps below skip and no page gets extra
// room, leaving the old `TabPage`'s two moves: track your own offset, hand it to
// the header on arrival. Then an OTA. For a faster way back with no new code,
// republish the previous OTA group; to remove it entirely, revert the commit.
//
// ## ⚠ NOTHING HERE MAY RE-RENDER DURING A SWIPE
//
// iOS + Reanimated 4.1 stalls an animation on ANY React commit while a finger
// is down. The alignment runs in worklets off `pageOffset` and moves pages with
// Reanimated's `scrollTo` on the UI thread — no state, no props, no commit. The
// only React state is the page's own measured height, which changes on layout,
// not on scroll.
// =============================================================

/**
 * How far the pager must leave a page before a swipe counts as begun. Small
 * enough that the incoming page is lined up before any of it is on screen.
 */
const LEAVING = 0.01;

/** Below this a page is already where it should be — do not issue a scroll. */
const SETTLED_PT = 0.5;

export function CollapsibleTabPage({
  index,
  width,
  pageOffset,
  scrollY,
  collapseDistance,
  paddingTop,
  paddingBottom,
  refreshControl,
  children,
}: {
  index: number;
  width: number;
  /** The pager's fractional page — 0 on the first tab, 1.5 halfway to the third. */
  pageOffset: SharedValue<number>;
  /** The header's fold, as the active page's offset. */
  scrollY: SharedValue<number>;
  /**
   * How far the header folds, MEASURED by the header and reported up. 0 when
   * the screen has no folding header (every pool mode but Showdown) — then this
   * page behaves exactly as it did before 2026-10-09.
   */
  collapseDistance: number;
  paddingTop: number;
  paddingBottom: number;
  refreshControl: React.ReactElement<RefreshControlProps>;
  children: React.ReactNode;
}) {
  const ref = useAnimatedRef<Animated.ScrollView>();
  /**
   * This page's own offset.
   *
   * ⚠ WHY EACH PAGE KEEPS ITS OWN TOO. Only the visible page emits scroll
   * events, so a single shared value keeps whatever the PREVIOUS tab left there.
   * Each page remembers `mine` and hands it to the header when it becomes the
   * active page — after lining it up, so handing it over moves nothing.
   */
  const mine = useSharedValue(0);

  const handler = useAnimatedScrollHandler({
    onScroll: (e) => {
      'worklet';
      mine.value = e.contentOffset.y;
      // ⚠ THE GUARD MATTERS AS MUCH AS THE REACTIONS. A page scrolled while
      // off-screen — by the alignment below, a refresh, a keyboard — must not
      // write over the visible page's offset.
      if (Math.round(pageOffset.value) === index) scrollY.value = mine.value;
    },
  });

  /**
   * 1 — THE PAGER HAS STARTED TO LEAVE SOME OTHER PAGE: line up now.
   *
   * At the START of the move rather than on arrival, so this page slides in
   * already in place instead of jumping once it lands. A pill tap from tab 1 to
   * tab 5 animates past 2, 3 and 4 — they all line up too, which is right, as
   * they are all briefly on screen.
   *
   * Only the page being LEFT is exempt: it is the one the header is reading.
   */
  useAnimatedReaction(
    () => pageOffset.value,
    (offset, previous) => {
      'worklet';
      if (!SYNC_TAB_HEADER || previous === null) return;
      const from = Math.round(previous);
      if (from === index) return;
      const wasSettled = Math.abs(previous - from) < LEAVING;
      const nowMoving = Math.abs(offset - from) >= LEAVING;
      if (!wasSettled || !nowMoving) return;
      const target = alignedTabOffset(scrollY.value, mine.value, collapseDistance);
      if (Math.abs(target - mine.value) < SETTLED_PT) return;
      scrollTo(ref, 0, target, false);
      mine.value = target;
    },
    [index, collapseDistance],
  );

  /**
   * 2 — THIS PAGE BECOMES THE ACTIVE ONE: hand its offset to the header.
   *
   * Lined up once more first. Step 1 ran when the swipe began; if the page being
   * left was still gliding then, the header kept moving after this page was
   * placed. Re-aligning here costs nothing when nothing drifted.
   */
  useAnimatedReaction(
    () => Math.round(pageOffset.value) === index,
    (isActive, wasActive) => {
      'worklet';
      if (!isActive || wasActive) return;
      if (SYNC_TAB_HEADER) {
        const target = alignedTabOffset(scrollY.value, mine.value, collapseDistance);
        if (Math.abs(target - mine.value) >= SETTLED_PT) {
          scrollTo(ref, 0, target, false);
          mine.value = target;
        }
      }
      scrollY.value = mine.value;
    },
    [index, collapseDistance],
  );

  /**
   * This page's visible height, measured — the other half of the room it needs
   * to hold the header folded. Per page and from layout, so it follows the
   * phone, the safe areas and anything that resizes the pager.
   *
   * ⚠ GUARDED, so a re-layout at the same height is not a re-render.
   */
  const [viewport, setViewport] = useState(0);
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    setViewport((prev) => (prev === h ? prev : h));
  }, []);
  const minHeight = minContentHeight(viewport, collapseDistance);

  // ⚠ MEMOISED, BOTH OF THEM. A fresh style object is a changed prop, and a
  // changed prop on five to eight mounted ScrollViews is native work on the main
  // thread — which is the thread a header's collapse is waiting on.
  const outerStyle = useMemo(() => ({ width }), [width]);
  const contentStyle = useMemo(
    () => ({ paddingTop, paddingBottom, flexGrow: 1, minHeight }),
    [paddingTop, paddingBottom, minHeight],
  );

  return (
    <Animated.ScrollView
      ref={ref}
      style={outerStyle}
      contentContainerStyle={contentStyle}
      onScroll={handler}
      onLayout={onLayout}
      // ⚠ NOT A THROTTLE. Verified in RN 0.81: `RCTScrollViewComponentView.mm`
      // maps anything ≤ 16.67ms to 0, and Android's `ReactScrollViewHelper.kt`
      // only throttles at `>= 17` — so this reads as "every frame" on both.
      // Left at 16 because that is the documented way to say so.
      scrollEventThrottle={16}
      refreshControl={refreshControl}
    >
      {children}
    </Animated.ScrollView>
  );
}
