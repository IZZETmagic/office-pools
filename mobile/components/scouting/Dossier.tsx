import { Text as RNText, View } from 'react-native';

import { MONO_BOLD } from '@/components/match/matchDisplay';
import { Text } from '@/components/ui';
import type { DossierResponse, OpponentDossier, ScoutClubLean, ScoutRate } from '@/lib/api';
import { useTheme, withOpacity } from '@/theme';

import { StandingCard } from './StandingCard';
import {
  Caveat,
  Comparison,
  Lean,
  ScoutCard,
  ScoutCardBody,
  ScoutFootnote,
  ScoutRow,
  ScoutRows,
  StatTiles,
} from './kit';

// =============================================================
// The opponent dossier — how somebody picks
// =============================================================
// Built entirely from picks that have already been revealed. No provider call
// sits behind any figure here, which is why this is the half of scouting that
// costs nothing and the half nobody else has.
//
// ## ⚠⚠ EVERY CARD STATES WHAT IT IS COUNTED OVER
//
// "How someone picks is a lifetime trait. How they are doing is a pool fact."
// That sentence assigns every card a scope without asking the member to set one:
//
//   THIS POOL — standing, accuracy, recent matchweeks, missed picks. A rank only
//   exists inside a pool; pool depth changes what a point is worth; a matchweek
//   timeline from two pools interleaved is an order that never happened; and a
//   missed pick is a competitive fact about THIS duel.
//
//   ALL TIME — club bias, tendencies against reality, the contrarian index.
//   Draw-blindness and an Arsenal problem are traits, not form, and they are the
//   cards that need most history: a club appears once a matchweek, so "backs
//   them 9 of 9" takes half a season inside one pool.
//
// ⚠ THE TAG IS NOT DECORATION. A dossier that does not say its scope invites the
// narrowest reading, and for half these cards the narrowest reading is wrong.
//
// ## ⚠⚠ A RATE MAY REFUSE TO BE A PERCENTAGE, AND THE SCREEN MUST LET IT
//
// `ScoutRate.pct` is null below the server's sample floor and the fraction is
// shown instead — "3 of 8", never "38%". A `?? 0` anywhere on that field turns
// every thin sample into a confident zero, which is exactly the pool-card
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
// The same numbers can be laid out as a tip sheet and this product is explicitly
// not for bettors. Nothing here says what to pick.
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

/** What a card is counted over. Shown on the card, never inferred by the reader. */
const POOL = 'This pool';
const LIFETIME = 'All time';

/**
 * ⚠ NO VERDICT SENTENCE AT THE TOP. Ryan removed it 2026-09-10 — it sat between
 * the sheet's header and the first card and read as a caption on the header
 * rather than as a finding of its own.
 *
 * ⚠ `dossier.read` IS STILL COMPOSED AND STILL SENT, and that is deliberate
 * rather than an oversight: it is the payload of the Banter share card, which is
 * the surface it was written for. Nothing on this screen renders it.
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
          few duels went is what you want before how they pick — the rest of this
          report is detail underneath it. Ryan, 2026-09-10. */}
      <StandingCard data={data} />

      {noBook(dossier) ? (
        <NoBookYet dossier={dossier} isSelf={isSelf} />
      ) : (
        <>
          <AccuracyCard dossier={dossier} />
          {dossier.form.length > 0 ? <FormCard form={dossier.form} /> : null}
          <ClubBiasCard dossier={dossier} isSelf={isSelf} />
          <FingerprintCard dossier={dossier} isSelf={isSelf} />
          <TendenciesCard dossier={dossier} />
        </>
      )}

      <Footnote dossier={dossier} />
    </View>
  );
}

/**
 * Is there a book on this member yet?
 *
 * ## ⚠⚠ DERIVED FROM WHAT WOULD ACTUALLY RENDER, NOT FROM A PICK COUNT
 *
 * The tempting version is `picks < 10`. It would be a second floor beside the
 * three the server already owns — `MIN_RATE_SAMPLE`, `MIN_BACKINGS`,
 * `MIN_BLIND_SPOT_BACKINGS` — and the two would drift: a number that clears the
 * screen's floor but not the server's gives a full set of empty cards, and one
 * that clears the server's but not the screen's hides figures that exist.
 *
 * So this asks the only question that matters: did every card come back with
 * nothing? If the server withheld all of it, the honest screen is a sentence.
 *
 * ⚠ `hitRate.pct == null` RATHER THAN `hitRate.count === 0`. A member with four
 * scored picks HAS a hit rate; the server just refuses to write it as a
 * percentage. That is a thin book, not an absent one — and the card renders
 * "2 of 4", which is worth showing.
 */
function noBook(d: OpponentDossier): boolean {
  return (
    d.mostBacked == null &&
    d.mostOpposed == null &&
    d.blindSpot == null &&
    d.fingerprint.signature == null &&
    d.contrarian == null &&
    d.hitRate.pct == null &&
    d.form.length === 0
  );
}

/**
 * What the report says when there is nothing to report.
 *
 * ⚠ NOT AN EMPTY STATE, A FINDING. Facing somebody nobody has a read on is
 * itself worth knowing in a duel, and it is the true state for every member of
 * every pool in its first fortnight. Six cards of dashes would read as a broken
 * screen; this reads as news, which is the same call the pairing card makes
 * about two clubs who have never met.
 *
 * ⚠ AND IT SAYS WHAT IT IS WAITING FOR. "4 picks so far" tells a member the
 * report will fill in, which a bare "no data" does not.
 */
function NoBookYet({ dossier, isSelf }: { dossier: OpponentDossier; isSelf: boolean }) {
  const total = dossier.lifetime?.picks ?? dossier.picks;

  return (
    <ScoutCard title={isSelf ? 'No book on you yet' : 'No book on them yet'}>
      <ScoutCardBody>
        <Text variant="body" color="slate">
          {total === 0
            ? isSelf
              ? 'None of your picks have been revealed yet. This fills in as each matchweek locks.'
              : 'None of their picks have been revealed yet. This fills in as each matchweek locks.'
            : `${total} revealed pick${total === 1 ? '' : 's'} so far — not enough to call a habit. ` +
              'The report fills in as the season goes.'}
        </Text>
      </ScoutCardBody>
    </ScoutCard>
  );
}

function AccuracyCard({ dossier }: { dossier: OpponentDossier }) {
  return (
    <ScoutCard title="Accuracy" scope={POOL}>
      <ScoutCardBody>
        {/* ⚠⚠ THE TIER COLOURS ARE GONE AND NEITHER TILE WAS A TIER. Hit rate
            wore `tierWinner` (cyan) and the exact count wore `tierExact` (gold)
            — the colours the league scoring engine uses for its four score
            buckets. A hit RATE is an aggregate across all four, not the winner
            bucket, so the colour asserted a relationship that does not exist.

            The hit rate is the point of this card, so it takes gold as the
            finding; the other two are neutral. A row where every tile is
            coloured has no hierarchy at all. */}
        <StatTiles
          tiles={[
            {
              value:
                dossier.hitRate.pct == null
                  ? `${dossier.hitRate.count}`
                  : `${dossier.hitRate.pct}%`,
              label: dossier.hitRate.pct == null ? `of ${dossier.hitRate.of} scored` : 'hit rate',
              tone: 'finding',
            },
            { value: `${dossier.exactCount}`, label: 'exact' },
            {
              // ⚠ NULL IS A DASH, NOT A ZERO. "0.0 points a fixture" is a
              // statement about somebody who has been scored and did badly; this
              // is somebody who has not been scored at all.
              value: dossier.pointsPerFixture == null ? '—' : `${dossier.pointsPerFixture}`,
              label: 'pts / fixture',
            },
          ]}
        />
      </ScoutCardBody>
    </ScoutCard>
  );
}

/**
 * Matchweek totals as bars.
 *
 * ⚠ THE ORDER IS THE SERVER'S AND IT IS BY KICKOFF, NOT BY MATCHWEEK NUMBER.
 * Rounds are played out of numerical order — migration 101 measured gaps of
 * minus 121 days across three real seasons — so re-sorting here on the number
 * would show a member's season in an order it never happened in. Do not sort.
 *
 * ⚠ POOL-SCOPED, AND IT HAS TO BE. Interleaving two pools' matchweeks produces a
 * timeline that never happened to anybody.
 */
function FormCard({ form }: { form: { matchweek: number; points: number }[] }) {
  const theme = useTheme();
  const recent = form.slice(-6);
  const peak = Math.max(1, ...recent.map((f) => f.points));

  return (
    <ScoutCard title="Recent matchweeks" scope={POOL}>
      <ScoutCardBody>
        <View>
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
                      f.points === peak
                        ? theme.colors.primary
                        : withOpacity(theme.colors.primary, 0.35),
                  }}
                />
              </View>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
            {recent.map((f) => (
              <Text
                key={f.matchweek}
                variant="detail"
                color="slate"
                style={{ flex: 1, textAlign: 'center' }}
              >
                {f.matchweek}
              </Text>
            ))}
          </View>
        </View>
      </ScoutCardBody>
    </ScoutCard>
  );
}

/**
 * Which clubs they lean on.
 *
 * ## ⚠⚠ THE CARD LIFETIME EXISTS FOR
 *
 * A club appears exactly once a matchweek, so inside one pool "backs Arsenal 9
 * of 9" takes until matchweek nine to be sayable — which is why a new pool's
 * dossier feels empty for a month even though the member already has thirty
 * picks. Widening this one card to their whole history is what fixes the cold
 * start, and the caveat below says how thin the sample still is.
 */
function ClubBiasCard({ dossier, isSelf }: { dossier: OpponentDossier; isSelf: boolean }) {
  const { mostBacked, blindSpot, mostOpposed } = dossier;
  if (!mostBacked && !blindSpot && !mostOpposed) return null;

  const lifetime = dossier.lifetime;

  return (
    <ScoutCard title="Club bias" scope={lifetime ? LIFETIME : POOL}>
      <ScoutCardBody gap={10}>
        {/* ⚠ THE CAVEAT SITS ABOVE THE NUMBERS. A reader who stops after the
            first figure should already know the sample is thin. */}
        {lifetime?.thin ? (
          <Caveat>
            {lifetime.picks} pick{lifetime.picks === 1 ? '' : 's'} across all their pools — read
            it lightly.
          </Caveat>
        ) : null}

        {mostBacked ? (
          <Lean
            label={isSelf ? 'You back most often' : 'Backs most often'}
            club={mostBacked.club}
            count={{ value: mostBacked.backed, of: mostBacked.seen }}
            detail={venueSplit(mostBacked)}
          />
        ) : null}

        {/* ⚠ PHRASED AS A PROBLEM WITH THE CLUB, NOT WITH THE PERSON. Banter is
            public and this card is the one that gets screenshotted into it. */}
        {blindSpot ? (
          <Lean
            label="Blind spot"
            club={blindSpot.club}
            tone="loss"
            // ⚠ RIGHT-OVER-BACKED, NOT BACKED-OVER-SEEN. The finding on this row
            // is the strike rate, so that is the fraction it shows.
            count={{ value: blindSpot.backedRight, of: blindSpot.backedPlayed }}
            detail={`Backed ${blindSpot.backedPlayed} times. Right ${blindSpot.backedRight}.`}
          />
        ) : null}

        {mostOpposed ? (
          <Lean
            label={isSelf ? 'You pick against' : 'Picks against'}
            club={mostOpposed.club}
            count={{ value: mostOpposed.opposed, of: mostOpposed.seen }}
            detail="times they were picked to lose"
          />
        ) : null}
      </ScoutCardBody>
    </ScoutCard>
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
 * How full a goals bar is at its right-hand end.
 *
 * ⚠ A SCALE HAS TO BE CHOSEN AND STATED, because goals per game are not a
 * percentage and have no natural 100%. Five is the top of the realistic range —
 * a Premier League season runs about 2.8 and the highest-scoring member in the
 * test pools predicts 3.4 — so at 5 the interesting band sits across the middle
 * of the track rather than squashed into its first fifth.
 *
 * ⚠ AND IT IS CLAMPED. `league_predictions` permits 0–20 a side, so somebody who
 * predicts 6–5 every week would otherwise draw a fill wider than its track.
 */
const GOALS_SCALE = 5;

/**
 * Their tendencies against what the league actually did.
 *
 * ⚠ THE SECOND NUMBER IS THE POINT. "Predicts a draw 6% of the time" is a fact
 * about arithmetic; "6%, and 25% of games end level" is a finding. Neither line
 * renders without both halves.
 */
function FingerprintCard({ dossier, isSelf }: { dossier: OpponentDossier; isSelf: boolean }) {
  const { fingerprint: f, baseline: b } = dossier;
  const who = isSelf ? 'you predict' : 'they predict';
  const lifetime = dossier.lifetime;

  // ⚠⚠ "THE LEAGUE" IS A LIE ONCE THE SCOPE IS LIFETIME. A member can be in a
  // Premier League pool and an 18-club league pool at the same time, and the
  // baseline is then measured across both. The arithmetic is right — it is
  // computed over exactly the fixtures in their pick set — but the SENTENCE has
  // to widen with it, or the card claims the Premier League averages something
  // it does not.
  const realm =
    lifetime && lifetime.competitions > 1 ? 'your leagues' : 'the league';

  return (
    <ScoutCard title="Against reality" scope={lifetime ? LIFETIME : POOL}>
      <ScoutCardBody gap={0}>
        <View>
          <Comparison
            first
            label="Goals per prediction"
            theirs={f.goalsPerPrediction}
            reality={b.goalsPerGame}
            max={GOALS_SCALE}
            format={(v) => `${v}`}
            who={who}
            realityLabel={(v) => `${realm} average${realm === 'the league' ? 's' : ''} ${v}`}
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

          <ScoutRows>
            {f.signature ? (
              <ScoutRow
                label="Signature scoreline"
                value={f.signature.score}
                note={
                  f.signature.share.pct == null
                    ? fraction(f.signature.share)
                    : `${f.signature.share.pct}% of picks`
                }
                finding
              />
            ) : null}

            {/* ⚠ A STATED ABSENCE IS A FINDING. Most members have never predicted
                0–0, and saying so is more interesting than any rate on this card.

                ⚠⚠ BUT ONLY WHERE ONE COULD HAVE BEEN ENTERED. A Results pool
                member taps home/draw/away and never files a scoreline, so
                "Never" would be reporting them for something the pool never
                offered. */}
            {f.hasScorelines && !f.hasPredictedNil ? (
              <ScoutRow label="Has ever predicted 0–0" value="Never" muted />
            ) : null}
          </ScoutRows>
        </View>
      </ScoutCardBody>
    </ScoutCard>
  );
}

/** The contrarian index and the missed picks — both only where they exist. */
function TendenciesCard({ dossier }: { dossier: OpponentDossier }) {
  const { contrarian, reliability } = dossier;
  if (!contrarian && !reliability) return null;

  const tiles = [];

  // ⚠ `andRight` IS MEASURED OVER THE TIMES THEY BROKE FROM THE CROWD, not over
  // every pick. Its own denominator travels with it.
  if (contrarian) {
    tiles.push({
      value:
        contrarian.against.pct == null
          ? fraction(contrarian.against)
          : `${contrarian.against.pct}%`,
      label: 'against crowd',
    });
    // ⚠ THE FINDING OF THIS CARD. Going against the crowd is a habit; going
    // against it AND BEING RIGHT is the stat that earns respect.
    tiles.push({
      value:
        contrarian.andRight.pct == null
          ? fraction(contrarian.andRight)
          : `${contrarian.andRight.pct}%`,
      label: 'and right',
      tone: 'finding' as const,
    });
  }

  if (reliability) {
    tiles.push({
      value: `${reliability.missed}`,
      label: `missed of ${reliability.available}`,
      // ⚠ RED ONLY WHERE THERE IS SOMETHING TO BE RED ABOUT. A missed pick has
      // already changed a result, which is the one thing red is allowed to mean
      // about a member.
      tone: reliability.missed > 0 ? ('loss' as const) : undefined,
    });
  }

  // ⚠ THE CONTRARIAN HALF IS PLATFORM-WIDE ON BOTH SIDES, so it cannot be
  // pool-scoped even in principle — `readCrowdMajority` takes no pool argument.
  // Missed picks are this pool's. The card carries the narrower of the two
  // rather than claiming a scope for the pair.
  return (
    <ScoutCard title="Tendencies" scope={reliability ? POOL : undefined}>
      <ScoutCardBody>
        <StatTiles tiles={tiles} />
      </ScoutCardBody>
    </ScoutCard>
  );
}

/**
 * The sample, stated.
 *
 * ⚠ SAME CALL AS THE HEAD-TO-HEAD CARD. A dossier over sixty picks and one over
 * nine are different kinds of claim and the difference is invisible unless it
 * says so. The reveal boundary is stated too, because a member wondering why
 * this week is missing deserves the answer rather than a gap.
 */
function Footnote({ dossier }: { dossier: OpponentDossier }) {
  const lifetime = dossier.lifetime;

  return (
    <ScoutFootnote
      lines={[
        `${dossier.picks} revealed pick${dossier.picks === 1 ? '' : 's'} in this pool` +
          (dossier.scored > 0 ? ` · ${dossier.scored} scored` : ''),
        lifetime
          ? `${lifetime.picks} across ${lifetime.pools} pool${lifetime.pools === 1 ? '' : 's'}` +
            // ⚠ THE DROPPED FIXTURES ARE DISCLOSED, NOT SWALLOWED. Where the same
            // member picked one fixture two different ways in two pools, neither
            // pick is counted — averaging them would invent an ambivalence they
            // never had. Saying how many were dropped is what keeps the
            // denominator honest.
            (lifetime.droppedConflicts > 0
              ? ` · ${lifetime.droppedConflicts} fixture${lifetime.droppedConflicts === 1 ? '' : 's'} picked two ways and not counted`
              : '')
          : null,
        'Picks appear here once their matchweek locks. The open week is never shown.',
      ]}
    />
  );
}
