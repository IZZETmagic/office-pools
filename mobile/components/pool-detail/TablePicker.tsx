import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Platform, Pressable, Text as RNText, View } from 'react-native';
import {
  NestedReorderableList,
  ScrollViewContainer,
  reorderItems,
  useReorderableDrag,
  type ReorderableListReorderEvent,
} from 'react-native-reorderable-list';

import { Icon, Text } from '@/components/ui';
import { saveTablePrediction, type SeasonClub, type TableSettings } from '@/lib/api';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// TWENTY CLUBS, ONE ORDER — the pre-deadline half of table mode
// =============================================================
// The other half of `LeagueMyTableTab`: before the lock you drag, after it you
// watch. Two screens that are really one screen at two points in time.
//
// ## Autosave, coalesced — NOT debounced
//
// Twenty clubs is a lot of dragging, and a Save button after each one is the
// friction that leaves a table half-ordered. So every reorder writes.
//
// ⚠ The difference between coalescing and debouncing is the whole reliability
// argument. A debounce holds the newest order in a TIMER, so a member who drags
// and immediately backgrounds the app loses the change that triggered it,
// silently. Here the request goes out at once; if one is in flight the next is
// marked pending and fires the moment it returns. At most one write is queued,
// the last always wins, and the newest order never exists only in a timer.
//
// `orderRef` is what gets sent, not the `order` closure — a save that starts
// mid-drag must post the order as it stands when the request is built.
//
// ## The lock is a database trigger, and it does not raise
//
// `enforce_league_table_before_lock` RETURN NULLs, the house pattern for every
// prediction lock here. A write after the deadline therefore "succeeds" having
// stored nothing. The route turns that into a 403; this screen reports it and
// stops accepting drags, because a member looking at twenty clubs the database
// does not have is the exact failure the silent skip creates.
// =============================================================

/**
 * ⚠ THE ROW HEIGHT IS FIXED, AND THE LIST'S HEIGHT IS COMPUTED FROM IT.
 *
 * A `NestedReorderableList` with `scrollable={false}` does not size itself to
 * its content — without an explicit height it lays out short, so the parent
 * has nothing to scroll and the list reads as frozen. `BracketPickerWizard`
 * has always passed `GROUP_ROW_HEIGHT * items` for exactly this reason; this
 * screen did not, which is why twenty clubs would not scroll.
 *
 * So the row must actually BE this tall. It is set explicitly rather than
 * left to padding, because the arithmetic above is only true if it holds.
 */
const ROW_HEIGHT = 58;
const ROW_GAP = 6;

type Props = {
  poolId: string;
  entryId: string | null;
  clubs: SeasonClub[];
  /** The saved ordering, or the alphabetical seed when nothing is filed. */
  initialOrder: string[];
  settings: TableSettings;
  savedAt: string | null;
  /** True once a row exists in the database — "Saved" is a claim about it. */
  initiallySaved: boolean;
};

export function TablePicker({
  poolId,
  entryId,
  clubs,
  initialOrder,
  settings,
  savedAt,
  initiallySaved,
}: Props) {
  const theme = useTheme();
  const byId = useMemo(() => new Map(clubs.map((c) => [c.club_id, c])), [clubs]);

  // Seeded ONCE. Re-deriving from props on every render would fight a drag in
  // progress — the parent refetches, and the answer would jump back.
  const [order, setOrder] = useState<string[]>(() =>
    initialOrder.filter((id) => byId.has(id)),
  );
  const [hasSaved, setHasSaved] = useState(initiallySaved);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(savedAt);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const orderRef = useRef(order);
  orderRef.current = order;
  const inFlight = useRef(false);
  const pending = useRef(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const flush = useCallback(async () => {
    if (!entryId || inFlight.current) {
      if (entryId) pending.current = true;
      return;
    }
    inFlight.current = true;
    try {
      const res = await saveTablePrediction(poolId, entryId, orderRef.current);
      if (!alive.current) return;
      setHasSaved(true);
      setLastSavedAt(res.savedAt);
      setError(null);
    } catch (err) {
      if (!alive.current) return;
      const message = err instanceof Error ? err.message : 'That could not be saved.';
      // The route says "The table prediction for this pool has closed." on a
      // 403. Once closed, nothing further will save, so stop pretending.
      if (/closed/i.test(message)) setLocked(true);
      setError(message);
    } finally {
      inFlight.current = false;
      if (pending.current && alive.current) {
        pending.current = false;
        void flush();
      }
    }
  }, [poolId, entryId]);

  const handleReorder = useCallback(
    ({ from, to }: ReorderableListReorderEvent) => {
      setOrder((prev) => {
        const next = reorderItems(prev, from, to);
        orderRef.current = next;
        return next;
      });
      void flush();
    },
    [flush],
  );

  const rows = useMemo(
    () => order.map((id, i) => ({ club: byId.get(id)!, position: i + 1 })).filter((r) => r.club),
    [order, byId],
  );

  return (
    // Its own scroller, like the wizard's — and it needs a parent with real
    // height, which `app/pool/[id].tsx` gives this one tab.
    <ScrollViewContainer
      style={{ flex: 1 }}
      // ⚠ NO `paddingHorizontal` HERE, and that is the whole reason the dragged
      // row was clipped.
      //
      // The library scales the active cell to 1.025 while you hold it. With the
      // inset on this content container, the FlatList inside is only
      // `pageWidth - 32` wide — and a FlatList is a ScrollView, so it CLIPS its
      // children. The grown row needed ~9px more than the list had and got cut
      // flat on both sides.
      //
      // The inset lives on the rows instead (`marginHorizontal` in PickerRow).
      // The list now spans the full page width, so the scale grows into that
      // margin rather than into a clip.
      contentContainerStyle={{
        paddingTop: theme.spacing.md,
        paddingBottom: theme.spacing.xxxl,
      }}
    >
      <View style={{ gap: 4, paddingBottom: theme.spacing.md, paddingHorizontal: theme.spacing.lg }}>
        <Text variant="cardTitle">Order every club</Text>
        <Text variant="detail" color="slate">
          Long press a club to pick it up, then drag. It saves as you go — there is nothing to
          submit.
        </Text>
        <StatusLine
          locked={locked}
          error={error}
          hasSaved={hasSaved}
          savedAt={lastSavedAt}
          lockAt={settings.lockAt}
        />
      </View>

      <NestedReorderableList
        data={rows}
        scrollable={false}
        keyExtractor={(r) => r.club.club_id}
        onReorder={handleReorder}
        // The library's own way to refuse a drag — not an absent handler.
        dragEnabled={!locked}
        // ⚠ See ROW_HEIGHT. This is what makes the content tall enough for the
        // container above to scroll.
        style={{ height: (ROW_HEIGHT + ROW_GAP) * rows.length }}
        renderItem={({ item }) => (
          <PickerRow
            club={item.club}
            position={item.position}
            clubCount={rows.length}
            settings={settings}
            disabled={locked}
          />
        )}
      />
    </ScrollViewContainer>
  );
}

/**
 * ⚠ "Saved" IS A CLAIM ABOUT THE DATABASE and has to be answerable from it —
 * which is why it tracks a stored row rather than "the user dragged something".
 */
function StatusLine({
  locked,
  error,
  hasSaved,
  savedAt,
  lockAt,
}: {
  locked: boolean;
  error: string | null;
  hasSaved: boolean;
  savedAt: string | null;
  lockAt: string | null;
}) {
  if (locked || error) {
    return (
      <Text variant="detail" color="red">
        {error ?? 'The deadline has passed.'}
      </Text>
    );
  }
  return (
    <Text variant="detail" color="slate">
      {hasSaved
        ? savedAt
          ? `Saved ${formatWhen(savedAt)}`
          : 'Saved'
        : 'Not saved yet'}
      {lockAt ? ` · closes ${formatWhen(lockAt)}` : ''}
    </Text>
  );
}

function PickerRow({
  club,
  position,
  clubCount,
  settings,
  disabled,
}: {
  club: SeasonClub;
  position: number;
  clubCount: number;
  settings: TableSettings;
  disabled: boolean;
}) {
  const theme = useTheme();
  // The library's own hook — it only works inside a list item, which is why
  // this is a component rather than an inline renderItem. It is handed to the
  // GRIP below, not to the row.
  const drag = useReorderableDrag();
  const band = bandOf(position, settings, clubCount);

  return (
    // ⚠ THE ROW IS NOT THE DRAG TRIGGER — the grip is.
    //
    // With the whole row long-pressable, a finger that pauses even slightly
    // while starting a scroll picks a club up and flings it somewhere else. The
    // list is the thing you scroll and the grip is the thing you grab, and they
    // have to be different targets or scrolling twenty clubs is a minefield.
    //
    // (`BracketPickerWizard` long-presses the whole row, but its groups are four
    // rows and never scroll — the conflict cannot arise there.)
    <View
      accessibilityLabel={`${club.club_name}, position ${position}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        // ⚠ FIXED, not derived from padding. The list's height is
        // `(ROW_HEIGHT + ROW_GAP) * rows`, and that is only true if a row is
        // exactly this tall — a row that grows by a pixel leaves twenty pixels
        // of the list unreachable.
        height: ROW_HEIGHT,
        paddingHorizontal: theme.spacing.sm,
        // The list's own inset, moved here so the 1.025 drag scale has somewhere
        // to grow. See the note on ScrollViewContainer above.
        marginHorizontal: theme.spacing.lg,
        marginBottom: ROW_GAP,
        borderRadius: theme.radii.lg,
        backgroundColor: theme.colors.surface,
        // The stripe belongs to the POSITION — it is what dragging a club into
        // this row would earn, which is the point of showing it while picking.
        borderLeftWidth: 3,
        borderLeftColor: band ? bandColor(band, theme) : 'transparent',
        opacity: disabled ? 0.5 : 1,
        ...theme.shadows.card,
      }}
    >
      <View style={{ width: 24, alignItems: 'center' }}>
        <RNText
          style={{
            fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
            fontSize: 13,
            fontWeight: '900',
            color: theme.colors.slate,
          }}
        >
          {position}
        </RNText>
      </View>

      {club.crest_url ? (
        <Image source={{ uri: club.crest_url }} style={{ width: 22, height: 22 }} resizeMode="contain" />
      ) : (
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: theme.colors.mist }} />
      )}

      <RNText
        numberOfLines={1}
        style={{
          flex: 1,
          fontFamily: fontFamilies.semibold,
          fontSize: 14,
          color: theme.colors.ink,
        }}
      >
        {club.club_name}
      </RNText>

      {/*
        THE HANDLE. Long press rather than press, and that delay IS the
        protection Ryan asked for: a flick that grazes this icon is over in well
        under 200ms, so it scrolls; a deliberate hold picks the club up.

        `hitSlop` widens the target beyond the 34px box without widening the
        area that steals a scroll, because hitSlop only extends the touch
        region, not the visual one.
      */}
      <Pressable
        onLongPress={disabled ? undefined : drag}
        delayLongPress={220}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Move ${club.club_name}. Currently ${position}.`}
        hitSlop={{ top: 8, bottom: 8, left: 10, right: 10 }}
        style={({ pressed }) => ({
          width: 38,
          height: 38,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: theme.radii.pill,
          backgroundColor: pressed ? withOpacity(theme.colors.primary, 0.15) : 'transparent',
        })}
      >
        <Icon name="line.3.horizontal" color={disabled ? 'silver' : 'slate'} size={17} />
      </Pressable>
    </View>
  );
}

/**
 * Which band this POSITION pays, read from the pool's own bounds — 4 and 3 are
 * Premier League numbers and a league relegating one club would shade three.
 */
function bandOf(
  position: number,
  s: TableSettings,
  clubCount: number,
): 'champion' | 'top' | 'europa' | 'conference' | 'relegation' | null {
  if (position === 1) return 'champion';
  if (position <= s.topN) return 'top';
  if (s.europaFrom !== null && s.europaTo !== null && position >= s.europaFrom && position <= s.europaTo) {
    return 'europa';
  }
  if (
    s.conferenceFrom !== null && s.conferenceTo !== null &&
    position >= s.conferenceFrom && position <= s.conferenceTo
  ) {
    return 'conference';
  }
  if (clubCount > 0 && position > clubCount - s.relegationN) return 'relegation';
  return null;
}

function bandColor(
  band: 'champion' | 'top' | 'europa' | 'conference' | 'relegation',
  theme: ReturnType<typeof useTheme>,
): string {
  switch (band) {
    case 'champion': return theme.colors.accent;
    case 'top': return theme.colors.primary;
    case 'europa': return theme.colors.green;
    case 'conference': return theme.colors.slate;
    case 'relegation': return theme.colors.red;
  }
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'soon';
  return d.toLocaleString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}
