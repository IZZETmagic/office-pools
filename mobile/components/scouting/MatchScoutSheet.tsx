import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MONO_BOLD } from '@/components/match/matchDisplay';
import { Icon, Text } from '@/components/ui';
import type {
  H2HSummary,
  MatchScoutResponse,
  ScoutClubRef,
  ScoutFormOutcome,
  ScoutVenueForm,
} from '@/lib/api';
import { useMatchScout } from '@/lib/useMatchScout';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// A peek under the hood
// =============================================================
// Slides up over the prediction flow when somebody taps the binoculars on a
// fixture. It is a GLANCE, not a report: two cards, no tabs, no navigation, and
// the picker is still behind it when it closes.
//
// ⚠ THE SHELL IS `PlayerStatSheet`'s, as `DossierSheet`'s is — vanilla RN
// `Modal` over gorhom, a SIBLING backdrop so the list can scroll, and a
// DEFINITE height so Yoga has a box to hand the ScrollView. All three were bugs
// on that sheet first; see `DossierSheet` for the long version.
//
// ⚠ SHORTER THAN THE OTHER TWO SHEETS, DELIBERATELY. A dossier is something you
// read; this is something you check. 72% leaves the picker visible behind it,
// which is the whole difference between a peek and a page.
//
// ## ⚠⚠ THE TWO HALVES GO MISSING FOR OPPOSITE REASONS
//
// Head to head is absent for a PAIRING — two promoted clubs have never met
// however late in the season. Form is absent for a DATE — nobody has played
// anybody in the second week of August. Each card states its own absence, and
// neither one missing removes the other.
//
// ⚠ AND A NULL IS NOT AN EMPTY RECORD. `h2h === null` means the provider could
// not be reached; `enough === false` means they really have barely met. Those
// are different sentences and the card says whichever is true.
// =============================================================

export function MatchScoutSheet({
  fixtureId,
  onClose,
}: {
  /** Null closes the sheet, matching `PlayerStatSheet`'s `stat` prop. */
  fixtureId: string | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const { data, loading, error, refresh } = useMatchScout(fixtureId);

  // ⚠ `useState`, not `useRef` — interpolated during render to build the
  // transform, and reading a ref while rendering is what `react-hooks/refs`
  // objects to.
  const [slide] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(slide, {
      toValue: fixtureId ? 1 : 0,
      duration: fixtureId ? 220 : 160,
      easing: fixtureId ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [fixtureId, slide]);

  if (!fixtureId) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* ⚠⚠ A SIBLING, NOT A PARENT. A `Pressable` claims the touch responder
            on touch-START, so a ScrollView inside one never receives the scroll
            gesture. This is what lets the cards below scroll at all. */}
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
        />

        <Animated.View
          style={{
            // ⚠ DEFINITE, NOT `maxHeight` — `flex: 1` distributes what REMAINS,
            // and nothing remains until something is definite.
            height: screenHeight * 0.72,
            backgroundColor: theme.colors.snow,
            borderTopLeftRadius: theme.radii.lg,
            borderTopRightRadius: theme.radii.lg,
            overflow: 'hidden',
            transform: [
              { translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
            ],
          }}
        >
          <Header data={data} onClose={onClose} />

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingTop: 4, paddingBottom: insets.bottom + 24, gap: 16 }}
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <View style={{ paddingTop: 40, alignItems: 'center' }}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            ) : error ? (
              <Pressable
                onPress={() => void refresh()}
                style={{ marginHorizontal: 20, paddingVertical: 28, alignItems: 'center', gap: 8 }}
              >
                <RNText
                  style={{ fontFamily: fontFamilies.bold, fontSize: 15, color: theme.colors.ink }}
                >
                  Could not load the scout report
                </RNText>
                <Text variant="detail" color="slate">
                  Tap to try again
                </Text>
              </Pressable>
            ) : data ? (
              <>
                <FormCard form={data.form} />
                <H2HCard
                  h2h={data.h2h}
                  homeName={data.fixture.home.name}
                  awayName={data.fixture.away.name}
                  venue={data.fixture.venue}
                />
              </>
            ) : null}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** The fixture itself, so the sheet says which match you are peeking at. */
function Header({ data, onClose }: { data: MatchScoutResponse | null; onClose: () => void }) {
  const theme = useTheme();

  return (
    <View
      style={{
        paddingTop: 18,
        paddingBottom: 14,
        paddingHorizontal: 20,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: withOpacity(theme.colors.mist, 0.8),
      }}
    >
      {/* ⚠ NO GRAB HANDLE — it implies a drag this sheet does not support. The
          X says the same thing honestly, and the backdrop still closes it. */}
      <Pressable
        onPress={onClose}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel="Close"
        style={({ pressed }) => ({
          position: 'absolute',
          top: 10,
          right: 12,
          width: 30,
          height: 30,
          borderRadius: theme.radii.pill,
          backgroundColor: withOpacity(theme.colors.ink, 0.08),
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.6 : 1,
          zIndex: 2,
        })}
      >
        <Icon name="xmark" size={11} tint={theme.colors.ink} weight="semibold" />
      </Pressable>

      <Text variant="caption" color="slate">
        Scout
      </Text>

      {data ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <Crest club={data.fixture.home} size={22} />
            <RNText
              numberOfLines={1}
              style={{
                flexShrink: 1,
                fontFamily: fontFamilies.black,
                fontSize: 16,
                color: theme.colors.ink,
              }}
            >
              {data.fixture.home.name}
            </RNText>
            <Text variant="detail" color="slate">
              v
            </Text>
            <RNText
              numberOfLines={1}
              style={{
                flexShrink: 1,
                fontFamily: fontFamilies.black,
                fontSize: 16,
                color: theme.colors.ink,
              }}
            >
              {data.fixture.away.name}
            </RNText>
            <Crest club={data.fixture.away} size={22} />
          </View>
          {data.fixture.venue ? (
            <Text variant="detail" color="slate" style={{ marginTop: 4 }}>
              {data.fixture.venue}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

/**
 * Form, at the ends they are playing.
 *
 * ## ⚠⚠ THE VENUE SPLIT IS THE CARD, AND THE OVERALL IS THE FALLBACK
 *
 * "Arsenal at home" and "Chelsea away" are the two facts the fixture is made
 * of, and a league table — which sums them — reports the average of two
 * different teams. But in August the split is one game deep, and one game is a
 * fact rather than a pattern, so the overall line sits under it and says how
 * many it is over. Neither number is hidden and neither is oversold.
 */
function FormCard({ form }: { form: MatchScoutResponse['form'] }) {
  if (!form) {
    return (
      <Card title="Form">
        <Text variant="body" color="slate" style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
          Form is unavailable for this fixture.
        </Text>
      </Card>
    );
  }

  const nothingPlayed = form.home.overallPlayed === 0 && form.away.overallPlayed === 0;

  return (
    <Card title="Form">
      {nothingPlayed ? (
        // ⚠ A SENTENCE, NOT A ROW OF DASHES. In the opening week this is the
        // true state and it reads as news; six em-dashes read as broken.
        <Text variant="body" color="slate" style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
          Nobody has played yet this season.
        </Text>
      ) : (
        <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 14, gap: 10 }}>
          <SideForm side={form.home} />
          <SideForm side={form.away} />
        </View>
      )}
    </Card>
  );
}

function SideForm({ side }: { side: ScoutVenueForm }) {
  const theme = useTheme();
  const label = side.venue === 'home' ? 'At home' : 'Away';

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.mist,
        borderRadius: theme.radii.sm,
        padding: 12,
        gap: 8,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <Crest club={side.club} size={18} />
        <RNText
          numberOfLines={1}
          style={{
            flex: 1,
            fontFamily: fontFamilies.bold,
            fontSize: 13,
            color: theme.colors.ink,
          }}
        >
          {side.club.name}
        </RNText>
      </View>

      <Text variant="detail" color="slate">
        {label.toUpperCase()}
      </Text>

      {side.played === 0 ? (
        // ⚠ NOT "0 played" — a club with no games at this end yet has nothing
        // to average, and the overall strip below is what the reader gets.
        <Text variant="detail" color="slate">
          Nothing played {side.venue === 'home' ? 'at home' : 'away'} yet
        </Text>
      ) : (
        <>
          <Strip outcomes={side.strip} />
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <RNText
              style={{
                fontFamily: MONO_BOLD,
                fontSize: 15,
                color: theme.colors.ink,
                fontVariant: ['tabular-nums'],
              }}
            >
              {side.goalsForPerGame}
            </RNText>
            <Text variant="detail" color="slate">
              scored
            </Text>
            <RNText
              style={{
                fontFamily: MONO_BOLD,
                fontSize: 15,
                color: theme.colors.ink,
                fontVariant: ['tabular-nums'],
                marginLeft: 6,
              }}
            >
              {side.goalsAgainstPerGame}
            </RNText>
            <Text variant="detail" color="slate">
              let in
            </Text>
          </View>
          {/* ⚠ THE DENOMINATOR, ALWAYS. "2.4 a game" over one game is a
              scoreline wearing an average. */}
          <Text variant="detail" color="slate">
            a game, over {side.played}
          </Text>
        </>
      )}

      {/* The fallback, and it says what it is. */}
      {side.overallPlayed > 0 ? (
        <View style={{ gap: 5, marginTop: 2 }}>
          <Text variant="detail" color="slate">
            ALL GAMES
          </Text>
          <Strip outcomes={side.overallStrip} />
        </View>
      ) : null}
    </View>
  );
}

function Strip({ outcomes }: { outcomes: ScoutFormOutcome[] }) {
  const theme = useTheme();
  if (outcomes.length === 0) return null;

  const tone: Record<ScoutFormOutcome, string> = {
    W: theme.colors.green,
    D: theme.colors.slate,
    L: theme.colors.red,
  };

  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {outcomes.map((o, i) => (
        <View
          key={`${o}-${i}`}
          style={{
            width: 20,
            height: 20,
            borderRadius: theme.radii.xs,
            backgroundColor: withOpacity(tone[o], 0.18),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <RNText style={{ fontFamily: MONO_BOLD, fontSize: 10, color: tone[o] }}>{o}</RNText>
        </View>
      ))}
    </View>
  );
}

/**
 * What usually happens when these two meet.
 *
 * ⚠ EVERY FIGURE IS FROM THIS FIXTURE'S HOME CLUB'S POINT OF VIEW, wherever the
 * meeting was played — the clubs swap ends between fixtures, so reading the
 * payload's home/away columns straight through yields a complete, plausible and
 * entirely different team's record. The server does that; this draws it.
 */
function H2HCard({
  h2h,
  homeName,
  awayName,
  venue,
}: {
  h2h: MatchScoutResponse['h2h'];
  homeName: string;
  awayName: string;
  venue: string | null;
}) {
  const theme = useTheme();

  // ⚠⚠ THREE DIFFERENT ABSENCES, THREE DIFFERENT SENTENCES. A null means the
  // provider could not be reached; `enough === false` means they have barely
  // met; zero meetings means they never have. Collapsing them would tell a
  // member something false about the football to cover a network problem.
  if (!h2h) {
    return (
      <Card title="Head to head">
        <Text variant="body" color="slate" style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
          Their history could not be loaded just now.
        </Text>
      </Card>
    );
  }

  const s: H2HSummary = h2h.summary;

  if (!h2h.enough) {
    return (
      <Card title="Head to head">
        <Text variant="body" color="slate" style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
          {s.meetings === 0
            ? 'These two have never met in a competitive game.'
            : `They have met ${s.meetings} time${s.meetings === 1 ? '' : 's'} — too few to read a pattern into.`}
        </Text>
      </Card>
    );
  }

  const total = Math.max(1, s.meetings);

  return (
    <Card title="Head to head">
      <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Tally value={s.wins} label={homeName} color={theme.colors.green} align="left" />
          <Tally value={s.draws} label="Drawn" color={theme.colors.slate} align="center" />
          <Tally value={s.losses} label={awayName} color={theme.colors.red} align="right" />
        </View>

        {/* ⚠ A SPLIT BAR IS HONEST HERE: every meeting is exactly one of the
            three and they total `meetings` by construction. */}
        <View style={{ flexDirection: 'row', height: 6, gap: 2 }}>
          <Segment flex={s.wins / total} color={theme.colors.green} />
          <Segment flex={s.draws / total} color={theme.colors.silver} />
          <Segment flex={s.losses / total} color={theme.colors.red} />
        </View>

        {s.atVenue ? (
          <Line
            label={venue ?? 'At this ground'}
            value={`${s.atVenue.wins}W ${s.atVenue.draws}D ${s.atVenue.losses}L`}
            note={`over ${s.atVenue.played}`}
          />
        ) : null}

        {s.commonScore ? (
          <Line
            label="Most common scoreline"
            value={s.commonScore.score.replace('-', '–')}
            note={`${s.commonScore.count} of ${s.meetings}`}
          />
        ) : null}

        <Line label="Goals a game" value={`${s.avgGoals}`} note={`over ${s.meetings}`} />

        {/* ⚠ THE SAMPLE, STATED. A record over eleven meetings and one over
            forty are different kinds of claim, invisible unless it says so. */}
        <Text variant="detail" color="slate">
          {s.meetings} competitive meeting{s.meetings === 1 ? '' : 's'}
          {s.span ? ` · ${s.span.from.slice(0, 4)}–${s.span.to.slice(0, 4)}` : ''}
        </Text>
      </View>
    </Card>
  );
}

function Line({ label, value, note }: { label: string; value: string; note?: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
      <Text variant="body" style={{ flex: 1 }}>
        {label}
      </Text>
      {note ? (
        <Text variant="detail" color="slate">
          {note}
        </Text>
      ) : null}
      <RNText
        style={{
          fontFamily: MONO_BOLD,
          fontSize: 14,
          color: theme.colors.ink,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </RNText>
    </View>
  );
}

function Tally({
  value,
  label,
  color,
  align,
}: {
  value: number;
  label: string;
  color: string;
  align: 'left' | 'center' | 'right';
}) {
  return (
    <View style={{ flex: 1, alignItems: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center' }}>
      <RNText
        style={{
          fontFamily: MONO_BOLD,
          fontSize: 20,
          color,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </RNText>
      <Text variant="detail" color="slate" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function Segment({ flex, color }: { flex: number; color: string }) {
  const theme = useTheme();
  // A zero-width segment must not render — `flex: 0` collapses the view but
  // leaves a 2pt gap beside it from the parent's `gap`.
  if (flex <= 0) return null;
  return <View style={{ flex, backgroundColor: color, borderRadius: theme.radii.pill }} />;
}

/** ⚠ `crest_url` is nullable. No placeholder — the name simply moves left. */
function Crest({ club, size }: { club: ScoutClubRef; size: number }) {
  if (!club.crestUrl) return null;
  return (
    <Image
      alt=""
      source={{ uri: club.crestUrl }}
      style={{ width: size, height: size }}
      resizeMode="contain"
    />
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        marginHorizontal: 20,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        ...theme.shadows.card,
        overflow: 'hidden',
      }}
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
        <Text variant="cardTitle">{title}</Text>
      </View>
      {children}
    </View>
  );
}
