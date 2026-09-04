import { router } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useDuel, type Sheet } from '@/lib/useDuel';
import { fontFamilies, useTheme } from '@/theme';

// =============================================================
// THE DUEL TAB — being rebuilt, one card at a time
// =============================================================
// Ryan, 2026-09-03: strip it back to the Your Sheet card and add the rest
// deliberately.
//
// ## ⚠ THE BOUT ITSELF IS NOT HERE ANY MORE, AND THAT IS THE POINT
//
// The matchup, the countdown, both corners and the scoreline all live in
// `ShowdownDuelHeader`, which is pinned above this tab and never leaves the
// screen. A `BoutCard` underneath it was the same fight said twice, three
// centimetres apart — and two surfaces naming an opponent are two surfaces that
// can disagree about one.
//
// So this tab is for what the header cannot hold: the things a member DOES, and
// the season behind them. Right now that is one card.
//
// ## ⚠ IT DERIVES NOTHING — `useDuel` DOES
//
// The header reads the same hook. If you are about to add a `useMemo` over
// `showdown.duels` or the season in this file, put it in `lib/useDuel.ts`
// instead. That shared derivation is the only reason the two surfaces cannot
// drift apart about who is playing whom.
//
// ## ⚠ A MISSING MATCHWEEK IS SEALED, NOT EMPTY
//
// Migration 116 seals the draw in RLS and the contract reads it with the
// VIEWER's client, so `showdown.duels` holds the weeks this member may see and
// no others. A week with no row is HIDDEN, not a bye — a bye is a row that
// exists with nobody on the other side. Whatever comes back here next has to
// keep telling those two apart.
// =============================================================

type Props = {
  poolId: string;
};

export function DuelTab({ poolId }: Props) {
  const theme = useTheme();
  const { loading, error, isShowdown, sheet, ownEntryId } = useDuel(poolId);

  if (loading) {
    return (
      <View style={{ paddingVertical: theme.spacing.xxxl, alignItems: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <Empty
        icon="exclamationmark.triangle"
        title="The duel could not be loaded"
        caption="Pull down to try again."
      />
    );
  }

  // Not a Showdown pool at all. The tab is never offered for one, so this is a
  // guard rather than a state anybody is meant to reach.
  if (!isShowdown) {
    return <Empty icon="person.2.fill" title="This pool has no duels" caption="" />;
  }

  if (!sheet || !ownEntryId) {
    return (
      <Empty
        icon="pencil.line"
        title="Nothing to pick right now"
        caption="The next matchweek opens on its own the moment this one locks."
      />
    );
  }

  return (
    <View style={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
      <SheetCard poolId={poolId} entryId={ownEntryId} sheet={sheet} />
    </View>
  );
}

// --------------------------------------------------------------- your sheet

function SheetCard({
  poolId,
  entryId,
  sheet,
}: {
  poolId: string;
  entryId: string;
  sheet: Sheet;
}) {
  const theme = useTheme();
  const finished = sheet.open.length === 0;

  /**
   * ⚠ No `mw` on the route. The picker resolves the week itself, so the two
   * screens cannot drift and a member does not land on a week they can no
   * longer change — the same call `LeaguePickemEntriesTab` makes.
   */
  const openPicker = () => router.navigate(`/pool/${poolId}/pickem/${entryId}`);

  return (
    <Card>
      <Row>
        <Label>Your sheet</Label>
        <Text
          style={{
            fontFamily: fontFamilies.black,
            fontSize: 15,
            lineHeight: 20,
            color: theme.colors.ink,
            fontVariant: ['tabular-nums'],
          }}
        >
          {sheet.done}
          <Text
            style={{
              fontFamily: fontFamilies.black,
              fontSize: 15,
              lineHeight: 20,
              color: theme.colors.slate,
              fontVariant: ['tabular-nums'],
            }}
          >
            {' / '}
            {sheet.total}
          </Text>
        </Text>
      </Row>

      {/* The bar. Two flexed children rather than a percentage width, so the
          fill cannot disagree with its own track by a rounding error. */}
      <View
        style={{
          height: 8,
          borderRadius: theme.radii.pill,
          backgroundColor: theme.colors.mist,
          overflow: 'hidden',
          marginTop: theme.spacing.sm,
          flexDirection: 'row',
        }}
      >
        <View
          style={{
            flex: Math.max(sheet.done, 0),
            backgroundColor: theme.colors.primary,
            borderRadius: theme.radii.pill,
          }}
        />
        <View style={{ flex: Math.max(sheet.total - sheet.done, 0) }} />
      </View>

      <Text variant="body" color="slate" style={{ marginTop: theme.spacing.md }}>
        {finished ? 'Your sheet is in. Nothing left to pick.' : openList(sheet.open)}
      </Text>

      {/*
        ⚠ THE SAME BLUE BUTTON IN BOTH STATES. A finished sheet gets a way IN,
        not a task — we do not ask for something already done — but reviewing is
        not asking, and demoting it to an outline just made the card look like it
        had nothing to offer. Ryan's call on the web; kept here so the two agree.
      */}
      <Pressable
        onPress={openPicker}
        accessibilityRole="button"
        style={({ pressed }) => ({
          marginTop: theme.spacing.md,
          backgroundColor: theme.colors.primary,
          borderRadius: theme.radii.pill,
          paddingVertical: 13,
          alignItems: 'center',
          opacity: pressed ? 0.85 : 1,
        })}
      >
        <Text
          style={{
            fontFamily: fontFamilies.black,
            fontSize: 12,
            lineHeight: 16,
            letterSpacing: 1.2,
            textTransform: 'uppercase',
            color: '#FFFFFF',
          }}
        >
          {finished ? 'See your picks' : 'Finish your picks'}
        </Text>
      </Pressable>
    </Card>
  );
}

/** "Arsenal v Forest and Chelsea v Fulham and 3 more still open." */
function openList(open: Sheet['open']): string {
  // ⚠ `country_name` IS THE CLUB'S NAME, and `country_code` its abbreviation —
  // a league fixture travels through types written for national teams, so the
  // field names lie. Name first, to match the web card; the code is a fallback
  // rather than the preference, because "ARS v NFO" is a worse sentence than
  // the one the web already says.
  const name = (m: Sheet['open'][number]) =>
    `${m.home_team?.country_name ?? m.home_team?.country_code ?? 'TBD'} v ${
      m.away_team?.country_name ?? m.away_team?.country_code ?? 'TBD'
    }`;
  const first = open.slice(0, 2).map(name).join(' and ');
  const rest = open.length > 2 ? ` and ${open.length - 2} more` : '';
  return `${first}${rest} still open.`;
}

// -------------------------------------------------------------- furniture

function Card({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.md,
        borderWidth: 1,
        borderColor: theme.colors.silver,
        padding: theme.spacing.lg,
      }}
    >
      {children}
    </View>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <Text
      style={{
        fontFamily: fontFamilies.bold,
        fontSize: 9,
        letterSpacing: 1.3,
        textTransform: 'uppercase',
        color: theme.colors.slate,
      }}
    >
      {children}
    </Text>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}
    >
      {children}
    </View>
  );
}

function Empty({ icon, title, caption }: { icon: string; title: string; caption: string }) {
  const theme = useTheme();
  return (
    <View style={{ padding: theme.spacing.xxxl, alignItems: 'center', gap: theme.spacing.sm }}>
      <Icon name={icon} color="slate" size={34} />
      <Text variant="cardTitle">{title}</Text>
      {caption ? (
        <Text variant="body" color="slate" style={{ textAlign: 'center' }}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}
