import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useMemo, useRef } from 'react';
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
// ## ⚠⚠ `BottomSheetModal`, NOT A PLAIN `BottomSheet`, AND THAT IS STRUCTURAL
//
// A plain `BottomSheet` renders WHERE IT SITS IN THE TREE. In React Native
// `position: 'absolute'` fills the nearest ancestor, not the screen — so the
// house pattern's full-screen wrapper only works because `BanterSheet` is
// rendered at a screen root. These are not: the dossier opens from a card
// inside a tab inside a horizontal pager, and inside a scroll view "absolute"
// is relative to the CONTENT, not the viewport. A plain sheet there would be
// laid out inside the card that triggered it.
//
// `BottomSheetModal` portals to a host at the app root, so it is correct from
// anywhere — which is the property a component used from three unrelated
// places needs. It requires `BottomSheetModalProvider` in `app/_layout.tsx`.
//
// ⚠ IT IS IMPERATIVE — `present()` / `dismiss()`, not an `index` prop — so the
// `open` prop is bridged to those in an effect rather than passed through.
//
// ⚠ `onDismiss` FIRES WHEN THE ANIMATION FINISHES, not when the gesture crosses
// the threshold, so telling the caller then cannot cut the sheet off mid-slide.
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
  const ref = useRef<BottomSheetModal | null>(null);

  const snapPoints = useMemo(() => [height], [height]);

  // ⚠ THE PROP DRIVES THE IMPERATIVE API, and `present()` is safe to call on a
  // sheet already presented — gorhom no-ops rather than re-animating.
  useEffect(() => {
    if (open) ref.current?.present();
    else ref.current?.dismiss();
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
    <BottomSheetModal
      ref={ref}
      snapPoints={snapPoints}
      enableDynamicSizing={false}
      enablePanDownToClose
      // ⚠ TELLS THE CALLER AFTER THE ANIMATION, so a drag-away and a backdrop
      // tap both land in the same place as an explicit close.
      onDismiss={onClose}
      backdropComponent={renderBackdrop}
      topInset={insets.top}
      handleIndicatorStyle={{ backgroundColor: theme.colors.silver }}
      // ⚠ SNOW, NOT SURFACE. Cards in this app are `surface` on `snow`; make the
      // sheet body a screen and the cards inside can just be cards.
      backgroundStyle={{ backgroundColor: theme.colors.snow }}
    >
      {children}
    </BottomSheetModal>
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
