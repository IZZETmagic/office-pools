import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

// =============================================================
// The shell every scout report slides up in
// =============================================================
// ⚠ GORHOM, NOT A VANILLA `Modal`, AND THAT IS A REVERSAL. Both scout sheets
// shipped on `PlayerStatSheet`'s shell, whose own comment says the library
// "buys gesture dismissal and a snap-point stack, and this sheet wants
// neither". That is true of a player card you open, read and close. It is not
// true here: Ryan asked for the Banter sheet's feel — grab it and throw it
// down — and drag-to-dismiss is exactly what gorhom is for. 2026-09-10.
//
// ⚠ ONE SHELL FOR BOTH REPORTS. The Modal version was already copied twice and
// carried three subtle decisions in each copy (sibling backdrop, definite
// height, fixed-height header gradient). Two copies of a shell is two places to
// get a gesture wrong.
//
// ## ⚠⚠ `enableDynamicSizing={false}` IS LOAD-BEARING IN v5
//
// v5 turned dynamic sizing ON by default, and it fights explicit `snapPoints` —
// the sheet measures its content and ignores the height it was given.
// `BanterSheet` sets it false for the same reason. With a `BottomSheetScrollView`
// inside, dynamic sizing would also try to size to a scroll view that has no
// intrinsic height.
//
// ## ⚠⚠ IT MUST BE RENDERED AT A SCREEN ROOT. THIS IS NOT A PREFERENCE.
//
// A plain `BottomSheet` renders WHERE IT SITS IN THE TREE, and in React Native
// `position: 'absolute'` fills the nearest ancestor rather than the screen. So
// the wrapper below only works as a sibling of a screen's content — inside a
// ScrollView it would position against the scroll CONTENT and be clipped by
// the viewport; inside a card it would be laid out in the card.
//
// ⚠ `BottomSheetModal` WAS TRIED FOR EXACTLY THIS AND DID NOT WORK. It portals
// to a provider at the app root, which is the right shape — but with the
// provider mounted and `present()` demonstrably called (the API behind the
// sheet was hit five times, 200 each, while nothing appeared on screen) the
// sheet never became visible. Rather than keep guessing at a library path
// nothing else in this app uses, this is the pattern every working sheet here
// already uses: `BanterSheet`, `FlexBadgesSheet`, `PoolsFilterSheet`. If the
// modal route is revisited, that measurement is the starting point.
//
// ⚠ SO CALLERS THAT ARE NOT AT A SCREEN ROOT MUST HOIST. `DossierSheet` opens
// from a card inside a tab inside a pager; its state lives on the pool screen
// and the sheet is rendered beside the pager, not inside it.
//
// ⚠ IMPERATIVE, DRIVEN BY THE `open` PROP. `expand()` / `close()` on a ref,
// with `index={-1}` so it starts closed — the house pattern. `onClose` fires
// when the animation finishes, so telling the caller then cannot cut the sheet
// off mid-slide.
// =============================================================

export function ScoutSheet({
  open,
  onClose,
  /**
   * How tall, as a share of the screen.
   *
   * ⚠ A PEEK IS SHORTER THAN A REPORT. The match scout opens over the picker
   * mid-decision and leaves it visible behind; the dossier is something you sit
   * and read. Same shell, different height, and the caller owns the difference.
   */
  height = '72%',
  children,
}: {
  open: boolean;
  onClose: () => void;
  height?: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const ref = useRef<BottomSheet | null>(null);

  const snapPoints = useMemo(() => [height], [height]);

  // ⚠ THE PROP DRIVES THE IMPERATIVE API. Both are safe to call repeatedly —
  // gorhom no-ops on a sheet already at that snap point rather than re-animating.
  useEffect(() => {
    if (open) ref.current?.expand();
    else ref.current?.close();
  }, [open]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      // `pressBehavior="close"` is gorhom's default; stated because tapping
      // away is half of how this gets dismissed and it should not be a mystery
      // that it works.
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.45}
        pressBehavior="close"
      />
    ),
    [],
  );

  return (
    // ⚠ `box-none` WHEN CLOSED. gorhom keeps a full-parent container in the tree
    // at `index={-1}`, and on Android it absorbs taps on the screen behind —
    // `BanterSheet` carries the same wrapper for the same reason.
    <View
      pointerEvents={open ? 'auto' : 'box-none'}
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <BottomSheet
        ref={ref}
        // ⚠ STARTS CLOSED; the effect above opens it. Mounting at 0 would flash
        // the sheet open on every screen that holds one.
        index={-1}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose
        // ⚠ TELLS THE CALLER AFTER THE ANIMATION, so a drag-away and a backdrop
        // tap both land in the same place as an explicit close.
        onClose={onClose}
        backdropComponent={renderBackdrop}
        topInset={insets.top}
        handleIndicatorStyle={{ backgroundColor: theme.colors.silver }}
        // ⚠ SNOW, NOT SURFACE. Cards in this app are `surface` on `snow`; make
        // the sheet body a screen and the cards inside can just be cards.
        backgroundStyle={{ backgroundColor: theme.colors.snow }}
      >
        {children}
      </BottomSheet>
    </View>
  );
}

/**
 * The scrolling body of a scout sheet.
 *
 * ⚠⚠ `BottomSheetScrollView`, NEVER A PLAIN `ScrollView`. gorhom has to own the
 * scroll gesture to know when a downward drag is a scroll and when it is a
 * dismiss. A plain ScrollView inside takes the gesture for itself and the sheet
 * stops responding to pan-down entirely — which is the one thing this shell was
 * changed to get.
 */
export function ScoutSheetBody({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <BottomSheetScrollView
      contentContainerStyle={{
        paddingTop: 4,
        paddingBottom: insets.bottom + 24,
        gap: 16,
      }}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </BottomSheetScrollView>
  );
}
