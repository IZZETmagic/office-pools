import { View } from 'react-native';

import { Text } from '@/components/ui';
import type { H2HSummary, MatchScoutResponse } from '@/lib/api';
import { isThinSample } from '@/lib/scoutTone';

import {
  Caveat,
  Finding,
  PeopleCard,
  ScoreChip,
  ScoutBlurb,
  ScoutCard,
  ScoutCardBody,
  ScoutFootnote,
  ScoutRow,
  ScoutRows,
  SplitBar,
  VenueSplit,
} from './kit';

// =============================================================
// The scout report — one component, two doors
// =============================================================
// ## ⚠⚠ THE BINOCULARS SHEET AND THE MATCH-DETAIL TAB RENDER THIS SAME FILE
//
// They used to be two different reports off two different endpoints. The sheet
// read `/fixtures/:id/scout`; the tab read `/fixtures/:id/h2h` PLUS
// `/fixtures/:id/players` and drew a completely separate set of cards, so the
// same fixture told you different things depending on which door you came
// through — and the tab had no venue-split form card, no drought line and no
// thin-sample caveat at all. Ryan, 2026-09-12: those two should be the exact
// same. They now are, and the tab gained all three.
//
// ⚠ IT IS THE BODY, NOT THE SHEET. `MatchScoutSheet` wraps this in `ScoutSheet`
// and a `ScoutHeader`; the match screen renders it inside its pager. Anything
// that assumes a sheet — a height, a grab handle, a backdrop — belongs there,
// not here.
//
// ## ⚠ EVERY CARD GOES MISSING FOR ITS OWN REASON, AND SAYS WHICH
//
// Head to head is absent for a PAIRING — two promoted clubs have never met
// however late in the season. Form is absent for a DATE — nobody has played
// anybody in the second week of August. People is absent for MINUTES. Each card
// states its own absence, and one missing never removes another.
//
// ⚠⚠ AND A NULL IS NOT AN ABSENT FIELD. `undefined` means this server has never
// heard of the field — an older API behind a newer OTA bundle — and drawing
// "could not be loaded" would report a fault that does not exist. `null` means
// it tried and failed. Those are different sentences.
// =============================================================

export function ScoutReport({ data }: { data: MatchScoutResponse }) {
  return (
    <View style={{ gap: 16 }}>
      {/* ⚠ THE PAIRING LEADS. Ryan, 2026-09-11. It is the question the fixture
          actually poses — what happens when THESE two play — and form is the
          context underneath it. It is also the card that can be a single
          sentence, and a report whose first card is sometimes a sentence is
          better than one that buries the sentence under a table. */}
      <PairingCard
        h2h={data.h2h}
        headline={data.headline}
        homeName={data.fixture.home.name}
        awayName={data.fixture.away.name}
        venue={data.fixture.venue}
      />
      <FormCard form={data.form} />
      {data.people === undefined ? null : data.people === null ? (
        <ScoutCard title="People">
          <ScoutBlurb>Player form could not be loaded just now.</ScoutBlurb>
        </ScoutCard>
      ) : (
        <PeopleCard
          home={data.people.home}
          away={data.people.away}
          homeName={data.fixture.home.name}
          awayName={data.fixture.away.name}
        />
      )}
      <CrowdCard
        crowd={data.crowd}
        homeName={data.fixture.home.name}
        awayName={data.fixture.away.name}
      />
      <ReportFootnote data={data} />
    </View>
  );
}

/**
 * The pairing — what usually happens when these two meet.
 *
 * ## ⚠⚠ BELOW FIVE MEETINGS IT STILL SHOWS THE NUMBERS
 *
 * It used to withhold everything under the floor and print a sentence instead.
 * Ryan, 2026-09-11: say the sample is thin and show them anyway. That is not a
 * loosening of the honesty rule — every figure here carries its own denominator
 * and a percentage still refuses to exist under the floor. "2 of 3" over a
 * stated caveat is information; hiding it was paternalism.
 *
 * ⚠ THREE ABSENCES, THREE SENTENCES. `undefined` means the field was never sent;
 * `null` means the provider could not be reached; zero meetings means they have
 * never played. Collapsing any two would tell somebody something false about the
 * football to cover something else.
 *
 * ⚠ EVERY FIGURE IS FROM THIS FIXTURE'S HOME CLUB'S POINT OF VIEW, wherever the
 * meeting was played — the clubs swap ends between fixtures, so reading the
 * payload's home/away columns straight through yields a complete, plausible and
 * entirely different team's record. The server does that; this draws it.
 */
function PairingCard({
  h2h,
  headline,
  homeName,
  awayName,
  venue,
}: {
  h2h: MatchScoutResponse['h2h'];
  headline: MatchScoutResponse['headline'];
  homeName: string;
  awayName: string;
  venue: string | null;
}) {
  if (h2h === undefined) return null;
  if (h2h === null) {
    return (
      <ScoutCard title="The pairing">
        <ScoutBlurb>Their history could not be loaded just now.</ScoutBlurb>
      </ScoutCard>
    );
  }

  const s: H2HSummary = h2h.summary;

  if (s.meetings === 0) {
    return (
      <ScoutCard title="The pairing">
        {/* ⚠ THE WHOLE CARD, not an empty table with a caption. Two clubs who
            have never met is a real answer to the question this card asks. */}
        <ScoutBlurb>
          {homeName} and {awayName} have never met in a competitive game.
        </ScoutBlurb>
      </ScoutCard>
    );
  }

  // The bar shows the record AT THIS GROUND where we have one — the more
  // interesting cut for a fixture — and falls back to every meeting.
  const bar = s.atVenue ?? { played: s.meetings, wins: s.wins, draws: s.draws, losses: s.losses };
  const thin = isThinSample(s.meetings);

  return (
    <ScoutCard title="The pairing">
      <ScoutCardBody gap={14}>
        {/* ⚠ THE CAVEAT SITS ABOVE THE NUMBERS, not under them. A reader who
            stops after the first figure should already know the sample is thin. */}
        {thin ? (
          <Caveat>
            Only {s.meetings} meeting{s.meetings === 1 ? '' : 's'} to go on — read it lightly.
          </Caveat>
        ) : null}

        {/* ⚠⚠ THE SAME ENCODING AS THE CROWD BAR BELOW, AND THAT IS THE POINT.
            This bar drew green/silver/red and the crowd bar drew
            blue/silver/gold, so the home club was green in one and blue in the
            other and the two could not be compared at all. Sharing the encoding
            is what lets a reader see that history leans one way and the crowd
            leans the other. */}
        <SplitBar
          caption={s.atVenue ? `At ${venue ?? 'this ground'}` : 'All meetings'}
          counts={{ home: bar.wins, draw: bar.draws, away: bar.losses }}
          names={{ home: homeName, draw: 'draw', away: awayName }}
        />

        <ScoutRows>
          {s.commonScore ? (
            <ScoutRow
              first
              label="Most common scoreline"
              value={s.commonScore.score.replace('-', '–')}
              note={`${s.commonScore.count} of ${s.meetings}`}
              // ⚠⚠ GOLD ONLY WHEN THERE IS NO HEADLINE, because the grammar
              // allows exactly one finding a card and the headline is now the
              // slot for it. Without this the card carries two gold elements —
              // and `common_score` is itself one of the headline candidates, so
              // the two could state the same fact twice, both in gold.
              finding={!headline}
            />
          ) : null}
          <ScoutRow
            first={!s.commonScore}
            label="Average goals"
            value={`${s.avgGoals}`}
            note={`n=${s.meetings}`}
          />
          <ScoutRow
            label="Both teams scored"
            // ⚠ A PERCENTAGE ONLY WHERE THE SAMPLE SUPPORTS ONE. Under the floor
            // this is the bare count, which is the same fact without the false
            // precision.
            value={thin ? `${s.bothScored}` : `${Math.round((s.bothScored / s.meetings) * 100)}%`}
            note={`${s.bothScored} of ${s.meetings}`}
          />
        </ScoutRows>

        {s.recent.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Label>
              Last {s.recent.length === 1 ? 'meeting' : `${s.recent.length} meetings`}
            </Label>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {s.recent.map((m) => (
                <ScoreChip
                  key={m.fixtureId}
                  homeGoals={m.homeGoals}
                  awayGoals={m.awayGoals}
                  when={new Date(m.date).toLocaleDateString(undefined, {
                    month: 'short',
                    year: '2-digit',
                  })}
                />
              ))}
            </View>
            {/* ⚠ WHICH WAY ROUND THE SCORELINE READS. Without this a member has
                to guess whether 2–1 was this club's win or the other's. */}
            <Label>Scores as played — home side first</Label>
          </View>
        ) : null}

        {/* ## ⚠⚠ THE SERVER CHOOSES THE SENTENCE, AND USUALLY THERE ISN'T ONE
            
            This was a hardcoded drought line — "have not won here since 2011" —
            drawn whenever a club had visited three times without winning. At a
            measured 33.1% away-win rate that happens 29.9% of the time BY
            CHANCE, so one pairing in three was being handed a base rate dressed
            as a hoodoo. It was also a fact about 2011 on a card whose job is a
            pick this weekend.

            `pickHeadline` now ranks a set of candidates by how unlikely each is,
            and the strongest TRUE one wins — including one drawn from FORM,
            which is the only thing here about now. Most fixtures qualify for
            none, and a card with no gold line is the design working rather than
            a gap. */}
        {headline ? <Finding note={headline.note}>{headline.text}</Finding> : null}
      </ScoutCardBody>
    </ScoutCard>
  );
}

/**
 * Form, at the ends they are playing.
 *
 * ⚠ THE VENUE SPLIT IS THE CARD AND THE OVERALL IS THE FALLBACK — see
 * `VenueSplit`, which carries the argument.
 */
function FormCard({ form }: { form: MatchScoutResponse['form'] }) {
  if (form === undefined) return null;
  if (form === null) {
    return (
      <ScoutCard title="Form">
        <ScoutBlurb>Form is unavailable for this fixture.</ScoutBlurb>
      </ScoutCard>
    );
  }

  const nothingPlayed = form.home.overallPlayed === 0 && form.away.overallPlayed === 0;

  return (
    <ScoutCard title="Form">
      {nothingPlayed ? (
        // ⚠ A SENTENCE, NOT A ROW OF DASHES. In the opening week this is the
        // true state and it reads as news; six em-dashes read as broken.
        <ScoutBlurb>Nobody has played yet this season.</ScoutBlurb>
      ) : (
        <ScoutCardBody>
          <VenueSplit home={form.home} away={form.away} />
        </ScoutCardBody>
      )}
    </ScoutCard>
  );
}

/**
 * How the whole platform called this fixture.
 *
 * ## ⚠⚠ THE SCOPE IS ON THE CARD, NOT JUST IN THE CODE
 *
 * A member seeing a split beside a fixture will assume it is their pool unless
 * told otherwise, and their pool is exactly what it must never be. Picks reveal
 * per matchweek and the Showdown draw is sealed, so a pool-scoped version of
 * this card would defeat both.
 *
 * ⚠ IT IS SAFE BECAUSE OF THE POOL COUNT, NOT THE PICK COUNT. The server refuses
 * any fixture picked by fewer than three distinct pools — twelve picks can be
 * twelve members of one pool, and reporting that back to one of them is the
 * leak. The card cannot narrow the figure even if it wanted to; the function
 * takes no pool argument.
 *
 * ⚠ NULL IS ORDINARY. Below the anonymity gate there is no crowd answer at all,
 * so this draws nothing rather than claiming a failure.
 */
function CrowdCard({
  crowd,
  homeName,
  awayName,
}: {
  crowd: MatchScoutResponse['crowd'];
  homeName: string;
  awayName: string;
}) {
  // ⚠ ABSENT AND NULL BOTH DRAW NOTHING HERE, unlike the other cards. A fixture
  // below the anonymity gate has no crowd — that is the guard working, not a
  // fault, and "could not be loaded" would misreport it as one.
  if (!crowd) return null;

  return (
    <ScoutCard title="The crowd" scope="Platform-wide">
      <ScoutCardBody>
        <SplitBar
          caption="How SportPool picked it"
          note={`${crowd.picks} picks`}
          counts={{ home: crowd.home, draw: crowd.draw, away: crowd.away }}
          names={{ home: homeName, draw: 'Draw', away: awayName }}
          keyFormat="pct"
        />

        {/* ⚠ ITS OWN DENOMINATOR. A Results pool files no scoreline, so this is
            a share of the picks that HAVE one — smaller than the bar above it,
            and saying so is the difference between a fact and a coincidence. */}
        {crowd.topScore && crowd.scorePicks > 0 ? (
          <ScoutRows>
            <ScoutRow
              first
              label="Most-picked scoreline"
              value={crowd.topScore.replace('-', '–')}
              note={`${Math.round((crowd.topScorePicks / crowd.scorePicks) * 100)}% of ${crowd.scorePicks}`}
              finding
            />
          </ScoutRows>
        ) : null}
      </ScoutCardBody>
    </ScoutCard>
  );
}

/**
 * The sample and the scope, together at the foot of the report.
 *
 * ## ⚠⚠ THE CROWD'S SCOPE LINE USED TO BE RED, AND IT IS NOT A WARNING
 *
 * "picks from across every pool on SportPool — never your own" sat in a
 * red-tinted box inside the crowd card. Red is what this same report uses for a
 * defeat, so the feature's best reassurance read as an error state on the one
 * card that most needs to feel trustworthy. It is a statement of SCOPE, which is
 * what a footnote is for.
 *
 * ⚠ MOVING IT MUST NOT DROP IT. The line is load-bearing — see `CrowdCard`.
 */
function ReportFootnote({ data }: { data: MatchScoutResponse }) {
  const s = data.h2h?.summary;

  const meetings = s
    ? `${s.meetings} competitive meeting${s.meetings === 1 ? '' : 's'}` +
      (s.span ? ` · ${s.span.from.slice(0, 4)}–${s.span.to.slice(0, 4)}` : '') +
      (s.excluded > 0 ? ` · ${s.excluded} friendly not counted` : '')
    : null;

  const crowd = data.crowd
    ? `${data.crowd.picks} picks from across every pool on SportPool — never your own.`
    : null;

  return <ScoutFootnote lines={[meetings, crowd]} />;
}

/** A quiet caption above a group. */
function Label({ children }: { children: React.ReactNode }) {
  return (
    <Text variant="detail" color="slate">
      {children}
    </Text>
  );
}
