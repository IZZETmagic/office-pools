// The Pools tab's sort-and-filter sheet — one live half-sheet holding every
// axis at once (Concept E, picked 2026-10-09).
//
// ## ⭐ LIVE, NOT APPLY
//
// Every tap writes straight to the screen's filter state, so the list above the
// sheet changes as you go and there is no "Show N pools" step to forget. That
// is why the backdrop is barely there: the list behind it IS the preview.
// Tapping it closes the sheet, as does Done or a swipe down.
//
// ## ⚠ IN FRONT OF THE TAB BAR, SO IT IS INSIDE A <Modal>
//
// Ryan, 2026-10-09: "the filter should rise in front of the navigation tab
// bar". A plain gorhom `BottomSheet` renders where it sits in the tree, and the
// Pools screen ends at the top of the tab bar — so the sheet stopped there and
// the tab bar stayed in view below it. A transparent `Modal` is above
// everything, tab bar included. The list behind still updates live: the Modal
// is a window, not a different tree, so `filters` flows straight through.
//
// ⚠ THE MODAL BRINGS ITS OWN GestureHandlerRootView. It mounts outside the
// app's root one, so without it neither the sheet's pan nor the horizontal
// rows scroll on Android — the same note as `ZoomablePhoto`.
//
// ⚠ NOT `BottomSheetModal`. That portal route was tried for the scout sheets
// and never became visible (see the header of components/scouting/ScoutSheet).
//
// The Modal stays up while the sheet slides away and goes on gorhom's
// `onClose`, so closing is never cut off mid-slide.
//
// ## Shape
//
// The corners and handle come from `sheetChrome`, like every other sheet. Every
// control inside takes its height and radii from `./controlShape`, where the
// concentric rule is written out — read that before changing a radius here.
//
// Replaces the single-axis picker that four header chips used to open one at a
// time (`PoolsFilterBar`, deleted with this change).

import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, useWindowDimensions, View, type StyleProp, type TextStyle } from 'react-native';
import { GestureHandlerRootView, ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BADGE_GAP,
  BADGE_RADIUS,
  BADGE_SIZE,
  CONTROL_HEIGHT,
  CONTROL_RADIUS,
  SELECTION_BORDER,
  THUMB_HEIGHT,
  THUMB_RADIUS,
  TILE_HEIGHT,
  TRACK_INSET,
} from './controlShape';
import { Icon, Pressable, Text, useSheetChrome } from '@/components/ui';
import { LEAGUE_MODES as LEAGUE_MODE_OPTIONS, WC_MODES } from '@/lib/createPool';
import { getCompetitionColor } from '@/lib/design/competition';
import { withLightness } from '@/lib/design/oklch';
import { getModeChip, getModeName } from '@/lib/design/poolMode';
import {
  competitionOptions,
  DEFAULT_FILTERS,
  modePairOf,
  showsCompetitionRow,
  showsTypeRow,
  typeOptions,
  withCompetition,
  type FilterablePool,
  type PoolsFilters,
  type PoolType,
  type PredictionFilter,
  type SortMode,
  type StatusFilter,
} from '@/lib/poolsFilter';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

export type PoolsFilterSheetHandle = {
  open: () => void;
  close: () => void;
};

type PoolsFilterSheetProps = {
  /** All the member's pools. The options are built from these, never from the filtered list. */
  pools: FilterablePool[];
  filters: PoolsFilters;
  onChange: (next: PoolsFilters) => void;
};

const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'completed', label: 'Completed' },
];

const PICKS_OPTIONS: Array<{ value: PredictionFilter; label: string }> = [
  { value: 'all', label: 'Any' },
  { value: 'pending', label: 'To pick' },
  { value: 'submitted', label: 'Picked' },
];

// "Joined" because that is what it sorts by — `pool_members.joined_at` — and
// the old "Newest" read as the pool's age.
const SORT_OPTIONS: Array<{ value: SortMode; label: string; icon: string; a11y: string }> = [
  { value: 'smart', label: 'Smart', icon: 'sparkles', a11y: 'Smart: pools waiting on your picks first, then most points' },
  { value: 'newest', label: 'Joined', icon: 'calendar', a11y: 'Recently joined first' },
  { value: 'name', label: 'Name', icon: 'textformat.abc', a11y: 'Name, A to Z' },
  { value: 'points', label: 'Points', icon: 'chart.xyaxis.line', a11y: 'Most points first' },
];

/** The create-pool flow's glyph for each game, so a game looks the same in both places. */
const TYPE_ICON: Record<PoolType, string> = Object.fromEntries(
  [...LEAGUE_MODE_OPTIONS, ...WC_MODES].map((m) => [m.value, m.icon]),
) as Record<PoolType, string>;

export const PoolsFilterSheet = forwardRef<PoolsFilterSheetHandle, PoolsFilterSheetProps>(
  function PoolsFilterSheet({ pools, filters, onChange }, ref) {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const sheetChrome = useSheetChrome('surface');
    const sheetRef = useRef<BottomSheet | null>(null);
    // Whether the Modal is up. The sheet inside mounts at index 0 and animates
    // itself in; closing slides it out first and gorhom's `onClose` takes the
    // Modal down after.
    const [shown, setShown] = useState(false);
    const close = useCallback(() => sheetRef.current?.close(), []);

    useImperativeHandle(ref, () => ({
      open: () => (shown ? sheetRef.current?.expand() : setShown(true)),
      close,
    }));

    // ⚠ A WHISPER OF A BACKDROP, NOT NONE. The list behind is the preview, so it
    // must stay readable — but a white sheet on the snow background with no
    // separation at all loses its top edge. Still catches the tap that closes.
    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.15}
          pressBehavior="close"
        />
      ),
      [],
    );

    const competitions = useMemo(() => competitionOptions(pools), [pools]);
    const showCompetitions = useMemo(() => showsCompetitionRow(pools), [pools]);
    const showTypes = useMemo(() => showsTypeRow(pools), [pools]);
    const types = useMemo(() => typeOptions(pools, filters), [pools, filters]);

    const canReset =
      filters.status !== DEFAULT_FILTERS.status ||
      filters.type !== DEFAULT_FILTERS.type ||
      filters.predictions !== DEFAULT_FILTERS.predictions ||
      filters.competition !== DEFAULT_FILTERS.competition ||
      filters.sort !== DEFAULT_FILTERS.sort;

    return (
      <Modal
        visible={shown}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={close}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <BottomSheet
            ref={sheetRef}
            index={0}
            animateOnMount
            enableDynamicSizing
            enablePanDownToClose
            onClose={() => setShown(false)}
            backdropComponent={renderBackdrop}
            // ⚠ CORNERS AND HANDLE COME FROM ONE PLACE — see `sheetChrome`.
            {...sheetChrome}
          >
            {/* The sheet now reaches the bottom of the screen, so it clears the
                home indicator itself — the tab bar used to do that for it. */}
            <BottomSheetView
              style={{
                paddingBottom: Math.max(insets.bottom, theme.spacing.md) + theme.spacing.md,
                gap: theme.spacing.lg,
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingLeft: theme.spacing.xl,
                  paddingRight: theme.spacing.lg,
                }}
              >
                <Text style={{ fontFamily: fontFamilies.black, fontSize: 18, color: theme.colors.ink }}>
                  Filter & sort
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                  <Pressable
                    onPress={() => onChange(DEFAULT_FILTERS)}
                    disabled={!canReset}
                    accessibilityRole="button"
                    accessibilityLabel="Reset filters and sort"
                    hitSlop={4}
                    style={({ pressed }) => ({
                      height: 40,
                      justifyContent: 'center',
                      paddingHorizontal: theme.spacing.md,
                      borderRadius: 20,
                      opacity: !canReset ? 0.4 : pressed ? 0.6 : 1,
                    })}
                  >
                    <Text style={{ fontFamily: fontFamilies.bold, fontSize: 15, color: theme.colors.slate }}>Reset</Text>
                  </Pressable>
                  <Pressable
                    onPress={close}
                    accessibilityRole="button"
                    hitSlop={4}
                    style={({ pressed }) => ({
                      height: 40,
                      justifyContent: 'center',
                      paddingHorizontal: theme.spacing.lg,
                      borderRadius: 20,
                      borderCurve: 'continuous',
                      backgroundColor: theme.colors.primary,
                      opacity: pressed ? 0.8 : 1,
                    })}
                  >
                    <Text style={{ fontFamily: fontFamilies.black, fontSize: 15, color: '#FFFFFF' }}>Done</Text>
                  </Pressable>
                </View>
              </View>

              <SegmentedRow
                label="Status"
                options={STATUS_OPTIONS}
                value={filters.status}
                onChange={(status) => onChange({ ...filters, status })}
              />
              <SegmentedRow
                label="Picks"
                options={PICKS_OPTIONS}
                value={filters.predictions}
                onChange={(predictions) => onChange({ ...filters, predictions })}
              />

              {showCompetitions ? (
                <Section label="Competition">
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: theme.spacing.xl, gap: theme.spacing.sm }}
                  >
                    {competitions.map((c) => (
                      <CompetitionChip
                        key={c.id}
                        name={c.name}
                        monogram={c.monogram}
                        color={getCompetitionColor(c.id)}
                        selected={filters.competition === c.id}
                        onPress={() =>
                          onChange(withCompetition(pools, filters, filters.competition === c.id ? 'all' : c.id))
                        }
                      />
                    ))}
                  </ScrollView>
                </Section>
              ) : null}

              {showTypes ? (
                <Section label="Type">
                  <TypeTiles
                    types={types}
                    selected={filters.type}
                    onPick={(t) => onChange({ ...filters, type: filters.type === t ? 'all' : t })}
                  />
                </Section>
              ) : null}

              <Section label="Sort">
                <View style={{ flexDirection: 'row', gap: theme.spacing.sm, paddingHorizontal: theme.spacing.xl }}>
                  {SORT_OPTIONS.map((o) => {
                    const selected = filters.sort === o.value;
                    return (
                      <Pressable
                        key={o.value}
                        haptic="selection"
                        onPress={() => onChange({ ...filters, sort: o.value })}
                        accessibilityRole="button"
                        accessibilityLabel={o.a11y}
                        accessibilityState={{ selected }}
                        style={({ pressed }) => ({
                          flex: 1,
                          height: CONTROL_HEIGHT,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: theme.spacing.xs,
                          borderRadius: CONTROL_RADIUS,
                          borderWidth: SELECTION_BORDER,
                          borderColor: selected ? theme.colors.primary : 'transparent',
                          backgroundColor: selected
                            ? withOpacity(theme.colors.primary, 0.12)
                            : theme.colors.mist,
                          opacity: pressed ? 0.7 : 1,
                        })}
                      >
                        <Icon
                          name={o.icon}
                          size={15}
                          color={selected ? 'primary' : 'slate'}
                          weight="semibold"
                        />
                        <Text
                          style={{
                            fontFamily: selected ? fontFamilies.black : fontFamilies.bold,
                            fontSize: 13,
                            color: selected ? theme.colors.primary : theme.colors.ink,
                          }}
                        >
                          {o.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </Section>
            </BottomSheetView>
          </BottomSheet>
        </GestureHandlerRootView>
      </Modal>
    );
  },
);

function Section({ label, children }: { label: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <SectionLabel label={label} style={{ paddingHorizontal: theme.spacing.xl }} />
      {children}
    </View>
  );
}

function SectionLabel({ label, style }: { label: string; style?: StyleProp<TextStyle> }) {
  const theme = useTheme();
  return (
    <Text
      style={[
        {
          fontFamily: fontFamilies.bold,
          fontSize: 12,
          letterSpacing: 1.2,
          textTransform: 'uppercase',
          color: theme.colors.slate,
        },
        style,
      ]}
    >
      {label}
    </Text>
  );
}

/**
 * A label and a three-way segmented control on one row.
 *
 * The thumb is THUMB_RADIUS inside a CONTROL_RADIUS track — concentric, see
 * ./controlShape.
 */
function SegmentedRow<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
}) {
  const theme = useTheme();
  // In dark mode `surface` is DARKER than `mist`; `silver` is the step lighter.
  const thumb = theme.mode === 'dark' ? theme.colors.silver : theme.colors.surface;
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingHorizontal: theme.spacing.xl,
      }}
    >
      <SectionLabel label={label} style={{ width: 62 }} />
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={{
          flex: 1,
          flexDirection: 'row',
          height: CONTROL_HEIGHT,
          padding: TRACK_INSET,
          borderRadius: CONTROL_RADIUS,
          borderCurve: 'continuous',
          backgroundColor: theme.colors.mist,
        }}
      >
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              haptic="selection"
              onPress={() => onChange(o.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={({ pressed }) => ({
                flex: 1,
                height: THUMB_HEIGHT,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: THUMB_RADIUS,
                borderCurve: 'continuous',
                backgroundColor: selected ? thumb : 'transparent',
                opacity: pressed ? 0.7 : 1,
                ...(selected ? theme.shadows.card : null),
              })}
            >
              <Text
                numberOfLines={1}
                style={{
                  fontFamily: selected ? fontFamilies.black : fontFamilies.bold,
                  fontSize: 13,
                  color: selected ? theme.colors.ink : theme.colors.slate,
                }}
              >
                {o.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * A competition: its monogram in a disc of its colour, then its name.
 *
 * The disc is BADGE_RADIUS inside the chip's inner edge — concentric. It is a
 * monogram and not the competition's mark because the league marks came out of
 * the app on 2026-09-19 (see `MARK_PNG` in lib/design/competition.ts).
 */
function CompetitionChip({
  name,
  monogram,
  color,
  selected,
  onPress,
}: {
  name: string;
  monogram: string;
  color: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  // The Premier League's purple disappears on a dark sheet; the ring is lifted
  // to a lightness that reads there, the disc keeps the true colour.
  const ring = theme.mode === 'dark' ? withLightness(color, 0.72) : color;
  return (
    <Pressable
      haptic="selection"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={name}
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        height: CONTROL_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingLeft: BADGE_GAP,
        paddingRight: theme.spacing.lg,
        borderRadius: CONTROL_RADIUS,
        borderWidth: SELECTION_BORDER,
        borderColor: selected ? ring : 'transparent',
        backgroundColor: selected ? withOpacity(ring, 0.14) : theme.colors.mist,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: BADGE_SIZE,
          height: BADGE_SIZE,
          borderRadius: BADGE_RADIUS,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontFamily: fontFamilies.black, fontSize: 11, color: '#FFFFFF' }}>{monogram}</Text>
      </View>
      <Text
        style={{
          fontFamily: selected ? fontFamilies.black : fontFamilies.bold,
          fontSize: 14,
          color: theme.colors.ink,
        }}
      >
        {name}
      </Text>
    </Pressable>
  );
}

/**
 * The games, as tiles four to a row. A fifth scrolls rather than wrapping, so
 * the sheet is the same height whichever competition is chosen.
 *
 * ⚠ THE TILE WIDTH IS FIXED AT A QUARTER OF THE ROW, even when only two games
 * are offered. Stretching two tiles to fill the row would make the same tile a
 * different shape depending on the competition above it.
 */
function TypeTiles({
  types,
  selected,
  onPick,
}: {
  types: PoolType[];
  selected: PoolsFilters['type'];
  onPick: (t: PoolType) => void;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const tileWidth = Math.floor((width - theme.spacing.xl * 2 - theme.spacing.sm * 3) / 4);
  const isDark = theme.mode === 'dark';
  return (
    <ScrollView
      horizontal
      scrollEnabled={types.length > 4}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: theme.spacing.xl, gap: theme.spacing.sm }}
    >
      {types.map((t) => {
        const { mode, leagueMode } = modePairOf(t);
        const chip = getModeChip(mode, leagueMode, isDark);
        const isSelected = selected === t;
        return (
          <Pressable
            key={t}
            haptic="selection"
            onPress={() => onPick(t)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            style={({ pressed }) => ({
              width: tileWidth,
              height: TILE_HEIGHT,
              alignItems: 'center',
              justifyContent: 'center',
              gap: theme.spacing.xs + 2,
              borderRadius: theme.radii.md,
              borderCurve: 'continuous',
              borderWidth: SELECTION_BORDER,
              borderColor: isSelected ? chip.base : 'transparent',
              backgroundColor: isSelected ? withOpacity(chip.base, chip.tint) : theme.colors.mist,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Icon name={TYPE_ICON[t]} size={22} tint={isDark ? chip.ink : chip.base} weight="medium" />
            <Text
              numberOfLines={1}
              style={{
                fontFamily: isSelected ? fontFamilies.black : fontFamilies.bold,
                fontSize: 12,
                color: isSelected ? chip.ink : theme.colors.ink,
              }}
            >
              {getModeName(mode, leagueMode)}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

