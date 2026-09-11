import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';

import { MONO_BOLD } from '@/components/match/matchDisplay';
import { ScoutSheet, ScoutSheetBody } from '@/components/scouting/ScoutSheet';
import { Text } from '@/components/ui';
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
// ⚠ THE SHELL IS `ScoutSheet` — gorhom, so it can be thrown back down with a
// drag, the way the Banter sheet is. Ryan, 2026-09-10.
//
// ⚠ SHORTER THAN THE DOSSIER, DELIBERATELY. A dossier is something you read;
// this is something you check. 72% leaves the picker visible behind it, which
// is the whole difference between a peek and a page.
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
  /**
   * Null closes the sheet.
   *
   * ⚠ THE SHEET STAYS MOUNTED AND DISMISSES, rather than unmounting — that is
   * what lets the close ANIMATE instead of vanishing. `useMatchScout` does not
   * fetch on a null id, so a closed sheet costs nothing but a render.
   *
   * ⚠ ONE SHEET PER SCREEN, NOT PER ROW. The picker draws ten fixtures and a
   * sheet per card would hold ten of these.
   */
  fixtureId: string | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { data, loading, error, refresh } = useMatchScout(fixtureId);

  return (
    <ScoutSheet open={!!fixtureId} onClose={onClose} height="72%">
      <Header data={data} />
      <ScoutSheetBody>
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
            {/* ⚠ THE PAIRING LEADS. Ryan, 2026-09-11. It is the question the
                fixture actually poses — what happens when THESE two play — and
                form is the context underneath it. It is also the card that can
                be empty, and a sheet whose first card is sometimes a sentence
                is better than one that buries the sentence under a table. */}
            <PairingCard
              h2h={data.h2h}
              homeName={data.fixture.home.name}
              awayName={data.fixture.away.name}
              venue={data.fixture.venue}
            />
            <FormCard form={data.form} />
          </>
        ) : null}
      </ScoutSheetBody>
    </ScoutSheet>
  );
}

/**
 * The fixture itself, so the sheet says which match you are peeking at.
 *
 * ⚠ NO CLOSE BUTTON ANY MORE. The Modal shell needed one because it had no
 * other affordance; gorhom draws a grab handle above this, the backdrop closes
 * on a tap and a drag throws it down. A fourth way out would be clutter
 * competing with the gesture the sheet was rebuilt to have.
 */
function Header({ data }: { data: MatchScoutResponse | null }) {
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
      <Text variant="caption" color="slate">
        Scout report
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
 * The pairing — what usually happens when these two meet.
 *
 * ## ⚠⚠ BELOW FIVE MEETINGS IT STILL SHOWS THE NUMBERS
 *
 * It used to withhold everything under `MIN_MEETINGS` and print a sentence
 * instead. Ryan, 2026-09-11: say the sample is thin and show them anyway. That
 * is the right call and it is not a loosening of the honesty rule — every
 * figure here already carries its own denominator, and `rate()` still refuses
 * to turn three of four into a percentage. "2 of 3" over a stated caveat is
 * information; hiding it was paternalism.
 *
 * ⚠ `enough` IS THEREFORE IGNORED HERE, AND DELIBERATELY NOT DELETED. It still
 * gates whether the head-to-head TAB appears on the match detail screen, where
 * a whole tab of three meetings really is noise. A sheet the member explicitly
 * asked for is a different bargain from a tab they might tap by accident.
 *
 * ⚠ THREE ABSENCES, THREE SENTENCES. `h2h === null` means the provider could
 * not be reached; zero meetings means they have never played; a thin sample
 * means read it lightly. Collapsing any two would tell somebody something false
 * about the football to cover something else.
 *
 * ⚠ EVERY FIGURE IS FROM THIS FIXTURE'S HOME CLUB'S POINT OF VIEW, wherever the
 * meeting was played — the clubs swap ends between fixtures, so reading the
 * payload's home/away columns straight through yields a complete, plausible and
 * entirely different team's record. The server does that; this draws it.
 */
function PairingCard({
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

  if (!h2h) {
    return (
      <Card title="The pairing">
        <Blurb>Their history could not be loaded just now.</Blurb>
      </Card>
    );
  }

  const s: H2HSummary = h2h.summary;

  if (s.meetings === 0) {
    return (
      <Card title="The pairing">
        {/* ⚠ THE WHOLE CARD, not an empty table with a caption. Two clubs who
            have never met is a real answer to the question this card asks. */}
        <Blurb>
          {homeName} and {awayName} have never met in a competitive game.
        </Blurb>
      </Card>
    );
  }

  // The bar shows the record AT THIS GROUND where we have one — the more
  // interesting cut for a fixture — and falls back to every meeting.
  const bar = s.atVenue ?? { played: s.meetings, wins: s.wins, draws: s.draws, losses: s.losses };
  const barLabel = s.atVenue ? `At ${venue ?? 'this ground'}` : 'All meetings';
  const total = Math.max(1, bar.played);

  return (
    <Card title="The pairing">
      <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 14 }}>
        {/* ⚠ THE CAVEAT SITS ABOVE THE NUMBERS, not under them. A reader who
            stops after the first figure should already know the sample is thin. */}
        {s.meetings < THIN_SAMPLE ? (
          <View
            style={{
              backgroundColor: withOpacity(theme.colors.amber, 0.1),
              borderRadius: theme.radii.sm,
              paddingHorizontal: 12,
              paddingVertical: 9,
            }}
          >
            <Text variant="detail" style={{ color: theme.colors.amber, lineHeight: 15 }}>
              Only {s.meetings} meeting{s.meetings === 1 ? '' : 's'} to go on — read it lightly.
            </Text>
          </View>
        ) : null}

        <View style={{ gap: 8 }}>
          <Text variant="body" color="slate">
            {barLabel}
          </Text>

          {/* ⚠ A SPLIT BAR IS HONEST HERE: every meeting is exactly one of the
              three and they total `played` by construction. */}
          <View style={{ flexDirection: 'row', height: 8, gap: 2 }}>
            <Segment flex={bar.wins / total} color={theme.colors.green} />
            <Segment flex={bar.draws / total} color={theme.colors.silver} />
            <Segment flex={bar.losses / total} color={theme.colors.red} />
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
            <Key color={theme.colors.green} label={`${bar.wins} ${homeName}`} />
            <Key color={theme.colors.silver} label={`${bar.draws} draw`} />
            <Key color={theme.colors.red} label={`${bar.losses} ${awayName}`} />
          </View>
        </View>

        <View>
          {s.commonScore ? (
            <Line
              label="Most common scoreline"
              value={s.commonScore.score.replace('-', '–')}
              note={`${s.commonScore.count} of ${s.meetings}`}
              accent
            />
          ) : null}
          <Line label="Average goals" value={`${s.avgGoals}`} note={`n=${s.meetings}`} />
          <Line
            label="Both teams scored"
            // ⚠ A PERCENTAGE ONLY WHERE THE SAMPLE SUPPORTS ONE. Under the
            // floor this is the fraction, which is the same fact without the
            // false precision.
            value={
              s.meetings >= THIN_SAMPLE
                ? `${Math.round((s.bothScored / s.meetings) * 100)}%`
                : `${s.bothScored}`
            }
            note={`${s.bothScored} of ${s.meetings}`}
          />
        </View>

        {s.recent.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Text variant="body" color="slate">
              Last {s.recent.length === 1 ? 'meeting' : `${s.recent.length} meetings`}
            </Text>
            {/* ⚠ SCORES AS PLAYED, HOME SIDE FIRST — not flipped into this
                fixture's order. A member reading "2–1" against a date is
                reading the scoreboard from that day; rewriting it to put
                today's home club first would silently invert half of them. */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {s.recent.map((m) => (
                <Meeting key={m.fixtureId} meeting={m} />
              ))}
            </View>
            <Text variant="detail" color="slate">
              Scores as played — home side first
            </Text>
          </View>
        ) : null}

        {s.venueDrought ? <Drought drought={s.venueDrought} homeName={homeName} awayName={awayName} venue={venue} /> : null}

        {/* ⚠ THE SAMPLE, STATED. A record over eleven meetings and one over
            forty are different kinds of claim, invisible unless it says so. */}
        <Text variant="detail" color="slate">
          {s.meetings} competitive meeting{s.meetings === 1 ? '' : 's'}
          {s.span ? ` · ${s.span.from.slice(0, 4)}–${s.span.to.slice(0, 4)}` : ''}
          {s.excluded > 0 ? ` · ${s.excluded} friendly not counted` : ''}
        </Text>
      </View>
    </Card>
  );
}

/**
 * Below this, the card says the sample is thin and shows the numbers anyway.
 *
 * ⚠ THE SAME FIVE AS `MIN_RATE_SAMPLE` ON THE SERVER, and not by coincidence —
 * it is the point below which a percentage stops being supportable. It is
 * restated here rather than imported because `lib/scouting` is web-side; if it
 * ever needs to move, it moves onto the payload the way `minMeetings` does.
 */
const THIN_SAMPLE = 5;

/** One past meeting, as it was played. */
function Meeting({ meeting }: { meeting: H2HSummary['recent'][number] }) {
  const theme = useTheme();
  const won = meeting.homeGoals > meeting.awayGoals;
  const drew = meeting.homeGoals === meeting.awayGoals;
  // ⚠ WHOSE WIN IT WAS DEPENDS ON WHO WAS HOME THAT DAY, which is not
  // necessarily this fixture's home club — they swap ends. The colour follows
  // the scoreline as printed, so it can never disagree with the numbers beside
  // it.
  const tone = drew ? theme.colors.slate : won ? theme.colors.green : theme.colors.red;

  return (
    <View
      style={{
        backgroundColor: withOpacity(tone, 0.1),
        borderRadius: theme.radii.sm,
        paddingHorizontal: 11,
        paddingVertical: 8,
        alignItems: 'center',
        minWidth: 62,
      }}
    >
      <RNText
        style={{ fontFamily: MONO_BOLD, fontSize: 13, color: tone, fontVariant: ['tabular-nums'] }}
      >
        {meeting.homeGoals}–{meeting.awayGoals}
      </RNText>
      <Text variant="detail" color="slate">
        {new Date(meeting.date).toLocaleDateString(undefined, {
          month: 'short',
          year: '2-digit',
        })}
      </Text>
    </View>
  );
}

/**
 * The line worth reading aloud.
 *
 * ⚠ "NOT WON SINCE 2011" AND "NEVER WON HERE" ARE DIFFERENT SENTENCES, and the
 * second is the stronger one. The server sends a null year for it rather than
 * the earliest date in the sample, so this can say which is true.
 */
function Drought({
  drought,
  homeName,
  awayName,
  venue,
}: {
  drought: NonNullable<H2HSummary['venueDrought']>;
  homeName: string;
  awayName: string;
  venue: string | null;
}) {
  const theme = useTheme();
  const who = drought.side === 'home' ? homeName : awayName;
  const where = venue ?? 'this ground';

  return (
    <View
      style={{
        backgroundColor: withOpacity(theme.colors.accent, 0.1),
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: withOpacity(theme.colors.accent, 0.35),
        borderRadius: theme.radii.sm,
        paddingHorizontal: 14,
        paddingVertical: 13,
        gap: 6,
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 14,
          lineHeight: 20,
          color: theme.colors.ink,
        }}
      >
        {drought.lastWinYear
          ? `${who} have not won at ${where} since ${drought.lastWinYear}.`
          : `${who} have never won at ${where}.`}
      </RNText>
      <Text variant="caption" style={{ color: theme.colors.amber }}>
        {drought.visits} visit{drought.visits === 1 ? '' : 's'}
      </Text>
    </View>
  );
}

/** A sentence where a table would have been. */
function Blurb({ children }: { children: React.ReactNode }) {
  return (
    <Text variant="body" color="slate" style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
      {children}
    </Text>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 999, backgroundColor: color }} />
      <Text variant="body" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function Line({
  label,
  value,
  note,
  accent,
}: {
  label: string;
  value: string;
  note?: string;
  /** The signature figure of the card — gold, like the scoreline in the strip. */
  accent?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 8,
        paddingVertical: 11,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: withOpacity(theme.colors.mist, 0.8),
      }}
    >
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
          fontSize: 15,
          color: accent ? theme.colors.accent : theme.colors.ink,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </RNText>
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
