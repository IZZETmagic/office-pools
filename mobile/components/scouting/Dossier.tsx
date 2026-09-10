import { Image, Text as RNText, View } from 'react-native';

import { MONO_BOLD } from '@/components/match/matchDisplay';
import { Text } from '@/components/ui';
import type { DossierResponse, OpponentDossier, ScoutClubLean, ScoutRate } from '@/lib/api';
import { StandingCard } from './StandingCard';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// The opponent dossier — how somebody picks
// =============================================================
// Built entirely from picks that have already been revealed. No provider call
// sits behind any figure here, which is why this is the half of scouting that
// costs nothing and the half nobody else has.
//
// ## ⚠⚠ A RATE MAY REFUSE TO BE A PERCENTAGE, AND THE SCREEN MUST LET IT
//
// `ScoutRate.pct` is null below the server's sample floor and `Pct` renders the
// fraction instead — "3 of 8", never "38%". A `?? 0` anywhere on that field
// turns every thin sample into a confident zero, which is exactly the pool-card
// failure where a default that is itself a real value can never be detected.
// There is no `?? 0` in this file and there must not be one.
//
// ## ⚠ EVERY COMPARISON IS AGAINST A MEASURED BASELINE
//
// "3.1 against the league's 2.8" — and the 2.8 is computed from the same
// fixtures, not typed in. The comparison IS the insight; without the second
// number "predicts 3.1 goals" is a fact about arithmetic.
//
// ## ⚠ IT REPORTS, IT NEVER ADVISES
//
// The same numbers can be laid out as a tip sheet and this product is
// explicitly not for bettors. Nothing here says what to pick.
//
// ## ⚠⚠ EVERY ABSENCE TEST IS `== null`, NEVER `=== null`
//
// A field the API has not shipped yet arrives as `undefined`, which passes a
// strict null check and lands in a template literal as the word "undefined", or
// in arithmetic as NaN. React renders both without complaint. `StandingCard`
// shipped with the strict form and drew "of undefined in the pool".
//
// A phone outlives the deploy it was built against — an OTA bundle can be newer
// than the API it calls, and a member on an old build can call a new one — so
// this is not a hypothetical even when the route and the screen ship together.
// =============================================================

/**
 * ⚠ NO VERDICT SENTENCE AT THE TOP. Ryan removed it 2026-09-10 — it sat between
 * the sheet's header and the first card and read as a caption on the header
 * rather than as a finding of its own.
 *
 * ⚠ `dossier.read` IS STILL COMPOSED AND STILL SENT, and that is deliberate
 * rather than an oversight: it is the payload of the Banter share card, which
 * is the surface it was written for. Nothing on this screen renders it.
 */
export function Dossier({
  data,
  dossier,
  isSelf = false,
}: {
  /** The whole response — `StandingCard` needs the pool and the standing. */
  data: DossierResponse;
  dossier: OpponentDossier;
  isSelf?: boolean;
}) {
  return (
    <View style={{ gap: 16 }}>
      {/* ⚠ FIRST, BEFORE ANY TENDENCY. Where somebody sits and how their last
          few duels went is what you want before how they pick — the rest of
          this report is detail underneath it. Ryan, 2026-09-10. */}
      <StandingCard data={data} />
      <AccuracyCard dossier={dossier} />
      {dossier.form.length > 0 ? <FormCard form={dossier.form} /> : null}
      <ClubBiasCard dossier={dossier} isSelf={isSelf} />
      <FingerprintCard dossier={dossier} isSelf={isSelf} />
      <TendenciesCard dossier={dossier} />
      <Footnote dossier={dossier} />
    </View>
  );
}

function AccuracyCard({ dossier }: { dossier: OpponentDossier }) {
  const theme = useTheme();
  return (
    <Card title="Accuracy">
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 14, gap: 10 }}>
        <Tile
          value={dossier.hitRate.pct == null ? `${dossier.hitRate.count}` : `${dossier.hitRate.pct}%`}
          sub={dossier.hitRate.pct == null ? `of ${dossier.hitRate.of} scored` : 'hit rate'}
          color={theme.colors.tierWinner}
        />
        <Tile value={`${dossier.exactCount}`} sub="exact" color={theme.colors.tierExact} />
        <Tile
          // ⚠ NULL IS A DASH, NOT A ZERO. "0.0 points a fixture" is a statement
          // about somebody who has been scored and did badly; this is somebody
          // who has not been scored at all.
          value={dossier.pointsPerFixture == null ? '—' : `${dossier.pointsPerFixture}`}
          sub="pts / fixture"
          color={theme.colors.ink}
        />
      </View>
    </Card>
  );
}

/**
 * Matchweek totals as bars.
 *
 * ⚠ THE ORDER IS THE SERVER'S AND IT IS BY KICKOFF, NOT BY MATCHWEEK NUMBER.
 * Rounds are played out of numerical order — migration 101 measured gaps of
 * minus 121 days across three real seasons — so re-sorting here on the number
 * would show a member's season in an order it never happened in. Do not sort.
 */
function FormCard({ form }: { form: { matchweek: number; points: number }[] }) {
  const theme = useTheme();
  const recent = form.slice(-6);
  const peak = Math.max(1, ...recent.map((f) => f.points));

  return (
    <Card title="Recent matchweeks">
      <View style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 56 }}>
          {recent.map((f) => (
            <View key={f.matchweek} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              <RNText
                style={{
                  fontFamily: MONO_BOLD,
                  fontSize: 10,
                  color: theme.colors.slate,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {f.points}
              </RNText>
              <View
                style={{
                  width: '100%',
                  // A floor of 3 so a zero week is a visible flat bar rather
                  // than a gap that reads as missing data.
                  height: Math.max(3, (f.points / peak) * 34),
                  borderRadius: 3,
                  backgroundColor:
                    f.points === peak ? theme.colors.primary : withOpacity(theme.colors.primary, 0.35),
                }}
              />
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
          {recent.map((f) => (
            <Text key={f.matchweek} variant="detail" color="slate" style={{ flex: 1, textAlign: 'center' }}>
              {f.matchweek}
            </Text>
          ))}
        </View>
      </View>
    </Card>
  );
}

function ClubBiasCard({ dossier, isSelf }: { dossier: OpponentDossier; isSelf: boolean }) {
  const { mostBacked, blindSpot, mostOpposed } = dossier;
  if (!mostBacked && !blindSpot && !mostOpposed) return null;

  return (
    <Card title="Club bias">
      <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 10 }}>
        {mostBacked ? (
          <Lean
            lean={mostBacked}
            label={isSelf ? 'You back most often' : 'Backs most often'}
            count={{ value: mostBacked.backed, of: mostBacked.seen }}
            detail={venueSplit(mostBacked)}
          />
        ) : null}

        {/* ⚠ PHRASED AS A PROBLEM WITH THE CLUB, NOT WITH THE PERSON. Banter is
            public and this card is the one that gets screenshotted into it. */}
        {blindSpot ? (
          <Lean
            lean={blindSpot}
            label="Blind spot"
            tone="warn"
            // ⚠ RIGHT-OVER-BACKED, NOT BACKED-OVER-SEEN. The finding on this row
            // is the strike rate, so that is the fraction it shows.
            count={{ value: blindSpot.backedRight, of: blindSpot.backedPlayed }}
            detail={`Backed ${blindSpot.backedPlayed} times. Right ${blindSpot.backedRight}.`}
          />
        ) : null}

        {mostOpposed ? (
          <Lean
            lean={mostOpposed}
            label={isSelf ? 'You pick against' : 'Picks against'}
            count={{ value: mostOpposed.opposed, of: mostOpposed.seen }}
            detail="times they were picked to lose"
          />
        ) : null}
      </View>
    </Card>
  );
}

/** "At home 9 of 9 · away 3 of 7" — the split is the finding, not the total. */
function venueSplit(l: ScoutClubLean): string {
  return `At home ${fraction(l.backedHome)} · away ${fraction(l.backedAway)}`;
}

function fraction(r: ScoutRate): string {
  return `${r.count} of ${r.of}`;
}

/**
 * One club they lean on.
 *
 * ⚠ THE CREST IS DRAWN THE WAY EVERY OTHER LIST IN THE APP DRAWS ONE — plain RN
 * `Image` with `resizeMode="contain"`, the pattern `leagueTableRow` and the duel
 * card's "Backs most often" row already use. Crests arrive at wildly different
 * aspect ratios; `cover` crops the badge and `stretch` distorts it.
 *
 * ⚠ AND IT IS DECORATIVE. The club's name sits beside it, so an alt text would
 * announce the same thing twice — the same call the duel card makes.
 *
 * ⚠ NO PLACEHOLDER WHEN THERE IS NO CREST. `league_clubs.crest_url` is
 * nullable, and a reserved empty square beside a name reads as an image that
 * failed to load. The name simply moves left.
 */
function Lean({
  lean,
  label,
  detail,
  count,
  tone,
}: {
  lean: ScoutClubLean;
  label: string;
  detail: string;
  /**
   * ⚠⚠ THE COUNT IS PASSED IN, NOT READ OFF `lean.backed`.
   *
   * It was `backed of seen` for every row, which is right for "backs most" and
   * the exact OPPOSITE claim on "picks against" — that row would have reported
   * how often they BACK a club under a heading saying they oppose it, with a
   * detail line beneath it giving the real number. One row contradicting
   * itself, and nothing would have errored.
   */
  count: { value: number; of: number };
  tone?: 'warn';
}) {
  const theme = useTheme();
  const accent = tone === 'warn' ? theme.colors.red : theme.colors.slate;

  return (
    <View
      style={{
        backgroundColor:
          tone === 'warn' ? withOpacity(theme.colors.red, 0.08) : theme.colors.mist,
        borderRadius: theme.radii.sm,
        padding: 12,
        gap: 8,
      }}
    >
      <Text variant="detail" color="slate" style={{ letterSpacing: 0.8 }}>
        {label.toUpperCase()}
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {lean.club.crestUrl ? (
          <Image
            alt=""
            source={{ uri: lean.club.crestUrl }}
            style={{ width: 24, height: 24 }}
            resizeMode="contain"
          />
        ) : null}

        <RNText
          numberOfLines={1}
          style={{
            flex: 1,
            fontFamily: fontFamilies.bold,
            fontSize: 15,
            color: theme.colors.ink,
          }}
        >
          {lean.club.name}
        </RNText>

        {/* ⚠ THE FRACTION, NOT "3×". The duel card's row shows a bare count
            because it has no room for more; this card's whole argument is that
            nine of nine is a habit and three of nine is not, and a count with
            no denominator cannot tell those apart. */}
        <RNText
          style={{
            fontFamily: MONO_BOLD,
            fontSize: 13,
            color: accent,
            fontVariant: ['tabular-nums'],
          }}
        >
          {count.value} of {count.of}
        </RNText>
      </View>

      <Text variant="detail" color="slate">
        {detail}
      </Text>
    </View>
  );
}

/**
 * Their tendencies against what the league actually did.
 *
 * ⚠ THE SECOND NUMBER IS THE POINT. "Predicts a draw 6% of the time" is a fact
 * about arithmetic; "6%, and 25% of games end level" is a finding. Neither line
 * renders without both halves.
 */
/**
 * How full a goals bar is at its right-hand end.
 *
 * ⚠ A SCALE HAS TO BE CHOSEN AND STATED, because goals per game are not a
 * percentage and have no natural 100%. Five is the top of the realistic range —
 * a Premier League season runs about 2.8 and the highest-scoring member in the
 * test pools predicts 3.4 — so at 5 the interesting band sits across the middle
 * of the track rather than squashed into its first fifth.
 *
 * ⚠ AND IT IS CLAMPED. `league_predictions` permits 0–20 a side, so somebody
 * who predicts 6–5 every week would otherwise draw a fill wider than its track.
 */
const GOALS_SCALE = 5;

function FingerprintCard({ dossier, isSelf }: { dossier: OpponentDossier; isSelf: boolean }) {
  const { fingerprint: f, baseline: b } = dossier;
  const who = isSelf ? 'you predict' : 'they predict';

  return (
    <Card title="Against reality">
      <View style={{ paddingHorizontal: 16, paddingBottom: 14 }}>
        <Comparison
          label="Goals per prediction"
          theirs={f.goalsPerPrediction}
          reality={b.goalsPerGame}
          max={GOALS_SCALE}
          format={(v) => `${v}`}
          who={who}
          realityLabel={(v) => `league averages ${v}`}
        />
        <Comparison
          label="Predicts a draw"
          theirs={f.theirDrawRate.pct}
          reality={b.drawRate.pct}
          max={100}
          format={(v) => `${v}%`}
          who={who}
          realityLabel={(v) => `${v}% of games end level`}
        />
        <Comparison
          label="Predicts a home win"
          theirs={f.theirHomeWinRate.pct}
          reality={b.homeWinRate.pct}
          max={100}
          format={(v) => `${v}%`}
          who={who}
          realityLabel={(v) => `${v}% actually are`}
        />

        {f.signature ? (
          <Row
            label="Signature scoreline"
            value={f.signature.score}
            note={
              f.signature.share.pct == null
                ? fraction(f.signature.share)
                : `${f.signature.share.pct}% of picks`
            }
            accent
          />
        ) : null}

        {/* ⚠ A STATED ABSENCE IS A FINDING. Most members have never predicted
            0–0, and saying so is more interesting than any rate on this card.

            ⚠⚠ BUT ONLY WHERE ONE COULD HAVE BEEN ENTERED. A Results pool member
            taps home/draw/away and never files a scoreline, so "Never" would be
            reporting them for something the pool never offered. */}
        {f.hasScorelines && !f.hasPredictedNil ? (
          <Row label="Has ever predicted 0–0" value="Never" muted />
        ) : null}
      </View>
    </Card>
  );
}

/**
 * One tendency against what the league actually did.
 *
 * ## ⚠ THE TICK IS THE POINT OF THE ROW, NOT THE FILL
 *
 * The bar says how often they do it; the gold mark says how often it happens.
 * The gap between them is the entire finding — "predicts a draw 6%" is a fact
 * about arithmetic, and "6%, and the mark is over at 25%" is something you can
 * act on. Neither half renders without the other.
 *
 * ⚠ BOTH VALUES ARE NUMBERS HERE, NOT PRE-FORMATTED STRINGS. They used to
 * arrive formatted, which is why this card had no bars: a component handed
 * "2.8 a game" cannot place a mark on a track. The formatting moved to the
 * caller's `format`, and the caller also owns the SCALE — percentages run to
 * 100 and goals do not.
 *
 * ⚠ EVERY VALUE IS THE SAME COLOUR, DELIBERATELY. Colouring the number by how
 * far it sits from reality would be the screen telling somebody they are wrong,
 * and under-calling the draw is a habit rather than a mistake. The bar and the
 * mark already show the size of the gap; the colour does not need to score it.
 */
function Comparison({
  label,
  theirs,
  reality,
  max,
  format,
  who,
  realityLabel,
}: {
  label: string;
  theirs: number | null;
  reality: number | null;
  max: number;
  format: (v: number) => string;
  who: string;
  realityLabel: (v: number) => string;
}) {
  const theme = useTheme();

  // ⚠ BOTH HALVES OR NEITHER. One number alone is not the finding this card
  // exists to make, and half a comparison reads as a claim it is not making.
  //
  // ⚠⚠ `== null`, NOT `=== null`. A missing key is `undefined`, which passes a
  // strict null check and then draws a bar at `undefined / max` — NaN, which
  // React renders as a width of nothing and a label reading "NaN". See
  // `StandingCard`, where exactly that shipped.
  if (theirs == null || reality == null) return null;
  if (!Number.isFinite(theirs) || !Number.isFinite(reality)) return null;

  const share = (v: number) => Math.max(0, Math.min(1, v / max));

  return (
    <View
      style={{
        paddingVertical: 12,
        borderTopWidth: 0.5,
        borderTopColor: withOpacity(theme.colors.mist, 0.6),
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <Text variant="body" style={{ flex: 1 }}>
          {label}
        </Text>
        <RNText
          style={{
            fontFamily: MONO_BOLD,
            fontSize: 16,
            color: theme.colors.primary,
            fontVariant: ['tabular-nums'],
          }}
        >
          {format(theirs)}
        </RNText>
      </View>

      {/* ---- the track ------------------------------------------------ */}
      <View
        style={{
          height: 6,
          borderRadius: theme.radii.pill,
          backgroundColor: withOpacity(theme.colors.slate, 0.18),
          // ⚠ NOT `overflow: hidden`. The mark is TALLER than the track on
          // purpose — it has to read as a line drawn across the bar rather than
          // as a segment of it — and clipping would cut it back to 6pt.
        }}
      >
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            // ⚠ A PERCENTAGE STRING, NOT A MEASURED WIDTH. The row has no
            // `onLayout` and needs none; Yoga resolves this against the track,
            // which is already full-width.
            width: `${share(theirs) * 100}%`,
            borderRadius: theme.radii.pill,
            backgroundColor: theme.colors.primary,
          }}
        />

        {/* ⚠ THE MARK SITS ON TOP OF THE FILL, so it stays visible when the two
            values are close — which is exactly when the row matters most. */}
        <View
          style={{
            position: 'absolute',
            left: `${share(reality) * 100}%`,
            top: -4,
            width: 3,
            height: 14,
            marginLeft: -1.5,
            borderRadius: 1.5,
            backgroundColor: theme.colors.accent,
          }}
        />
      </View>

      {/* ---- what the two ends mean ----------------------------------- */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          marginTop: 8,
        }}
      >
        <Text variant="detail" color="slate" numberOfLines={1} style={{ flexShrink: 1 }}>
          {who} {format(theirs)}
        </Text>
        {/* ⚠ THE SAME GOLD AS THE MARK, which is what ties the sentence to the
            line on the track. Without the colour match it reads as a second,
            unrelated caption. */}
        <RNText
          numberOfLines={1}
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 11,
            lineHeight: 15,
            color: theme.colors.accent,
            textAlign: 'right',
            flexShrink: 0,
          }}
        >
          {realityLabel(reality)}
        </RNText>
      </View>
    </View>
  );
}

function Row({
  label,
  value,
  note,
  muted,
  accent,
}: {
  label: string;
  value: string;
  note?: string;
  muted?: boolean;
  /** The signature scoreline — gold, because it is a finding rather than a total. */
  accent?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 8,
        paddingVertical: 10,
        borderTopWidth: 0.5,
        borderTopColor: withOpacity(theme.colors.mist, 0.6),
      }}
    >
      <Text variant="body" style={{ flex: 1 }}>
        {label}
      </Text>
      {/* ⚠ VALUE FIRST, THEN THE SHARE. The scoreline is the answer and the
          share is its footnote; reading "4 of 20 · 1–2" puts the qualifier
          before the thing it qualifies. */}
      <RNText
        style={{
          fontFamily: MONO_BOLD,
          fontSize: 15,
          color: accent ? theme.colors.accent : muted ? theme.colors.slate : theme.colors.ink,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </RNText>
      {note ? (
        <Text variant="detail" color="slate">
          {note}
        </Text>
      ) : null}
    </View>
  );
}

/** The contrarian index and the missed picks — both only where they exist. */
function TendenciesCard({ dossier }: { dossier: OpponentDossier }) {
  const theme = useTheme();
  const { contrarian, reliability } = dossier;
  if (!contrarian && !reliability) return null;

  return (
    <Card title="Tendencies">
      <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 14, gap: 10 }}>
        {/* ⚠ `andRight` IS MEASURED OVER THE TIMES THEY BROKE FROM THE CROWD,
            not over every pick. Its own denominator travels with it. */}
        {contrarian ? (
          <>
            <Tile
              value={contrarian.against.pct == null ? fraction(contrarian.against) : `${contrarian.against.pct}%`}
              sub="against crowd"
              color={theme.colors.amber}
            />
            <Tile
              value={contrarian.andRight.pct == null ? fraction(contrarian.andRight) : `${contrarian.andRight.pct}%`}
              sub="and right"
              color={theme.colors.green}
            />
          </>
        ) : null}
        {reliability ? (
          <Tile
            value={`${reliability.missed}`}
            sub={`missed of ${reliability.available}`}
            color={reliability.missed > 0 ? theme.colors.red : theme.colors.ink}
          />
        ) : null}
      </View>
    </Card>
  );
}

/**
 * The sample, stated.
 *
 * ⚠ SAME CALL AS THE HEAD-TO-HEAD TAB. A dossier over sixty picks and one over
 * nine are different kinds of claim and the difference is invisible unless the
 * card says so. The reveal boundary is stated too, because a member wondering
 * why this week is missing deserves the answer rather than a gap.
 */
function Footnote({ dossier }: { dossier: OpponentDossier }) {
  return (
    <View style={{ marginHorizontal: 20, gap: 2 }}>
      <Text variant="detail" color="slate">
        {dossier.picks} revealed pick{dossier.picks === 1 ? '' : 's'}
        {dossier.scored > 0 ? ` · ${dossier.scored} scored` : ''}
      </Text>
      <Text variant="detail" color="slate">
        Picks appear here once their matchweek locks. The open week is never shown.
      </Text>
    </View>
  );
}

function Tile({ value, sub, color }: { value: string; sub: string; color: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.mist,
        borderRadius: theme.radii.sm,
        paddingVertical: 12,
        paddingHorizontal: 10,
        gap: 4,
      }}
    >
      <RNText
        style={{
          fontFamily: MONO_BOLD,
          fontSize: 18,
          color,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </RNText>
      <Text variant="detail" color="slate">
        {sub}
      </Text>
    </View>
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
