import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
  type BottomSheetBackgroundProps,
} from '@gorhom/bottom-sheet';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSheetChrome, useSheetHeight } from '@/components/ui';

// =============================================================
// The shell every scout report slides up in
// =============================================================
// ⚠ GORHOM, NOT A VANILLA `Modal`, AND THAT IS A REVERSAL. Both scout sheets
// shipped on `PlayerStatSheet`'s shell, whose own comment argued the library
// "buys gesture dismissal and a snap-point stack, and this sheet wants
// neither". That was true of a player card you open, read and close. It is not
// true here: Ryan asked for the Banter sheet's feel — grab it and throw it
// down — and drag-to-dismiss is exactly what gorhom is for. 2026-09-10.
//
// ⚠ ONE SHELL FOR BOTH REPORTS. The Modal version was already copied twice and
// carried three subtle decisions in each copy (sibling backdrop, definite
// height, fixed-height header gradient). Two copies of a shell is two places to
// get a gesture wrong.
//
// ## ⚠⚠ IT IS NOT A SCOUTING SHELL ANY MORE — `PlayerStatSheet` CAME BACK
//
// Ryan, 2026-10-01: make the player detail sheet like the scouting sheets. So
// the Modal this shell was once copied FROM is now a caller of it, and the
// quote above is a historical note rather than a description of that file. Four
// sheets open on this shell: the two scout reports, the onboarding practice
// report, and one player card that is not a report at all.
//
// ⚠ SO THE NAME IS NOW THE ODD THING, NOT THE LOCATION. A fifth non-scouting
// caller is the trigger to move this to `components/ui` and call it what it is;
// renaming it for one is churn. `PracticeScoutSheet` already imports it from
// outside `components/scouting/`, so the import direction is established.
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

/**
 * The shortest a scout report is allowed to be, in points.
 *
 * ⚠ IT EXISTS FOR SMALL SCREENS, AND IT IS A FLOOR, NOT A HEIGHT. 88% of a
 * 932pt phone leaves 112pt of context behind the sheet, which is the intent. 88%
 * of a 568pt SE leaves 68pt — not enough to read as "the screen you came from",
 * and taken off a report that already scrolls. Above this floor the fraction
 * rules; below it the sheet takes everything the window has, which is what a
 * native sheet does on a small screen too.
 *
 * ⚠ `useSheetHeight` CLAMPS TO THE AVAILABLE HEIGHT AFTER THIS, so a number
 * larger than the window cannot push the sheet under the status bar.
 */
const MIN_REPORT_HEIGHT = 560;

export function ScoutSheet({
  open,
  onClose,
  /**
   * How tall, as a share of the screen it has to work on.
   *
   * ⚠ BOTH REPORTS ARE 0.88 NOW, AND THE PROP STAYS ANYWAY. It used to carry a
   * real split — the match scout was 72% so the picker stayed visible behind a
   * "peek", the dossier 88% because it is something you sit and read. Ryan,
   * 2026-10-01: bring the match scout up to the dossier's height. The report
   * outgrew the peek argument; see `MatchScoutSheet`.
   *
   * The prop is not inlined because the callers are the things that get to
   * disagree about this. `PlayerStatSheet` states 0.88 as well — a player card
   * is a thing you sit and read too — and only `PracticeScoutSheet` takes the
   * default, because during onboarding it is showing off the live sheet and
   * should get whatever the live sheet currently is.
   *
   * ⚠⚠ A FRACTION, NOT A `'88%'` SNAP POINT, and that is the whole fix for small
   * screens — `useSheetHeight` turns it into points against the LIVE window and
   * floors it, so a short phone or a landscape window gets a usable sheet
   * instead of 88% of not very much. See that hook for the argument.
   */
  heightFraction = 0.88,
  /**
   * What the sheet is painted on — BEHIND the grab handle as well as the body.
   *
   * ## ⚠⚠ THE ONLY PLACE A COLOURED HEADER BAND CAN GO, AND THE REASON IS gorhom'S
   * ## OWN TREE
   *
   * `PlayerStatSheet` opens on a 220pt club-coloured gradient that must reach
   * the sheet's top edge and respect its corners. Put that gradient in
   * `children` and it starts 24pt too low: gorhom lays the handle out ABOVE the
   * children (`BottomSheetBody` is `column-reverse`, handle last), so a child at
   * `top: 0` begins under it — leaving a snow strip with the sheet's rounded
   * corners in it and a flat colour edge starting below. The background
   * component is `StyleSheet.absoluteFill` behind BOTH, which is exactly where a
   * surface treatment belongs.
   *
   * ⚠ IT RECEIVES `backgroundStyle` ALREADY APPLIED — snow plus the two top
   * radii from `useSheetChrome`. A caller composing on top of it must spread the
   * `style` it is handed and add `overflow: 'hidden'`, or its own band will
   * square off the corners the style just rounded.
   *
   * ⚠ MEMOISE IT. gorhom memoises its background container on this component's
   * IDENTITY, so an inline arrow remounts the background on every render of the
   * caller.
   */
  background,
  children,
}: {
  open: boolean;
  onClose: () => void;
  heightFraction?: number;
  /** ⚠ `FC`, NOT `ComponentType` — gorhom's own prop is narrower than that. */
  background?: React.FC<BottomSheetBackgroundProps>;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const ref = useRef<BottomSheet | null>(null);
  const sheetChrome = useSheetChrome('snow');

  const sheetHeight = useSheetHeight(heightFraction, { min: MIN_REPORT_HEIGHT });
  const snapPoints = useMemo(() => [sheetHeight], [sheetHeight]);

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
        // ⚠ `undefined` FALLS BACK TO THE LIBRARY'S OWN BACKGROUND, which is
        // what three of the four callers want — gorhom reads
        // `backgroundComponent ?? BottomSheetBackground`, and only an explicit
        // `null` would remove the surface altogether.
        backgroundComponent={background}
        // ⚠ SNOW, NOT SURFACE. Cards in this app are `surface` on `snow`; make
        // the sheet body a screen and the cards inside can just be cards. The
        // corners and the handle are `sheetChrome`'s — every sheet in the app
        // shares them, so they can only be got wrong in one place.
        {...sheetChrome}
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
export function ScoutSheetBody({
  /**
   * Whether to draw the scrollbar.
   *
   * ⚠ OFF FOR A REPORT, ON FOR A LIST, AND THE DEFAULT IS THE REPORT. A scout
   * report is four cards a reader scrolls through once; the indicator is chrome
   * over content. `PlayerStatSheet` asks for it because Ryan could not tell that
   * one scrolled at all — the real fault there was that it did not, but a long
   * list of figures with no indicator gives a reader nothing to go on either
   * way. That note is in `PlayerStatSheet`; this prop is what honours it.
   */
  scrollIndicator = false,
  children,
}: {
  scrollIndicator?: boolean;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <BottomSheetScrollView
      contentContainerStyle={{
        paddingTop: 4,
        paddingBottom: insets.bottom + 24,
        gap: 16,
      }}
      showsVerticalScrollIndicator={scrollIndicator}
    >
      {children}
    </BottomSheetScrollView>
  );
}
