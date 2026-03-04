'use client'

import { Card } from '@/components/ui/Card'

type HowToPlayTabProps = {
  poolName: string
  maxEntries: number
  isPastDeadline: boolean
  predictionMode?: 'full_tournament' | 'progressive' | 'bracket_picker'
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold">{number}</span>
      <p className="text-sm text-neutral-700"><strong>{title}:</strong> {children}</p>
    </div>
  )
}

export function HowToPlayTab({ poolName, maxEntries, isPastDeadline, predictionMode = 'full_tournament' }: HowToPlayTabProps) {
  const isProgressive = predictionMode === 'progressive'
  const isBracketPicker = predictionMode === 'bracket_picker'
  return (
    <div>
      {/* Welcome */}
      <Card className="mb-6">
        <h4 className="text-lg font-semibold text-neutral-900 mb-1">Welcome to {poolName}!</h4>
        <p className="text-sm text-neutral-700 leading-relaxed">
          {isBracketPicker
            ? 'This is your FIFA World Cup 2026 bracket pool. Rank group standings, pick knockout bracket winners, earn points for accuracy, and compete on the leaderboard against other pool members. Here\'s everything you need to know to get started.'
            : 'This is your FIFA World Cup 2026 prediction pool. Predict match scores, earn points for accuracy, and compete on the leaderboard against other pool members. Here\'s everything you need to know to get started.'}
        </p>
      </Card>

      {/* Tournament Structure */}
      <Card className="mb-6">
        <h4 className="text-lg font-semibold text-neutral-900 mb-1">Tournament Structure</h4>
        <p className="text-xs text-neutral-500 mb-4">FIFA World Cup 2026 &mdash; United States, Mexico & Canada</p>
        <div className="space-y-3 text-sm text-neutral-700">
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-success-100 text-success-700 flex items-center justify-center text-xs font-bold">1</span>
            <p><strong>Group Stage:</strong> 48 teams divided into 12 groups of 4. Each team plays 3 matches. The top 2 from each group plus the 8 best 3rd-place teams advance (32 teams total).</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-success-100 text-success-700 flex items-center justify-center text-xs font-bold">2</span>
            <p><strong>Round of 32:</strong> The first knockout round. 32 teams compete in single-elimination matches.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-success-100 text-success-700 flex items-center justify-center text-xs font-bold">3</span>
            <p><strong>Round of 16 &rarr; Final:</strong> Winners advance through the Round of 16, Quarter Finals, Semi Finals, Third Place Match, and the Final.</p>
          </div>
        </div>
        <div className="mt-4 flex items-start gap-3 bg-primary-50 border border-primary-200 rounded-lg px-4 py-3">
          <svg className="w-5 h-5 text-primary-800 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <p className="text-xs text-primary-800 leading-5">
            <strong>104 matches total</strong> &mdash; 48 group stage + 16 Round of 32 + 8 Round of 16 + 4 Quarter Finals + 2 Semi Finals + Third Place + Final.
          </p>
        </div>
      </Card>

      {/* Making Predictions */}
      <Card className="mb-6">
        <h4 className="text-lg font-semibold text-neutral-900 mb-1">Making Predictions</h4>
        <p className="text-xs text-neutral-500 mb-4">
          {isPastDeadline && !isProgressive
            ? 'The prediction deadline has passed. You can still view your predictions.'
            : isProgressive
              ? 'This pool uses progressive predictions. You predict round by round as the tournament unfolds.'
              : isBracketPicker
                ? 'This pool uses bracket-style predictions. Rank groups, pick winners, and build your bracket before the deadline.'
                : 'Head to the Predictions tab to start filling in your predictions.'}
        </p>
        {isProgressive ? (
          <div className="space-y-3">
            <Step number={1} title="Go to Predictions">
              Click the <strong>Predictions</strong> tab. You&apos;ll see a round selector showing all tournament rounds.
            </Step>
            <Step number={2} title="Predict the current round">
              Select the currently open round and enter your score predictions. For knockout rounds, you&apos;ll see the <strong>actual qualified teams</strong> &mdash; no guessing needed.
            </Step>
            <Step number={3} title="Submit before the deadline">
              Each round has its own deadline. Submit your predictions before the deadline. Predictions auto-save as drafts, and drafts are auto-submitted when the deadline passes.
            </Step>
            <Step number={4} title="Repeat for each round">
              After a round completes and the next round&apos;s teams are confirmed, the new round will open. You&apos;ll be notified by email when each round opens.
            </Step>
          </div>
        ) : isBracketPicker ? (
          <div className="space-y-3">
            <Step number={1} title="Go to Predictions">
              Click the <strong>Predictions</strong> tab to see your bracket entries.
            </Step>
            <Step number={2} title="Select an entry">
              {maxEntries > 1
                ? <>This pool allows up to <strong>{maxEntries} entries</strong> per player. Select an entry to edit, or create a new one.</>
                : <>Select your entry to start building your bracket.</>}
            </Step>
            <Step number={3} title="Rank teams in each group">
              For each of the 12 groups, drag and drop the 4 teams into your predicted finishing order (1st through 4th). The top 2 from each group plus the 8 best 3rd-place teams advance.
            </Step>
            <Step number={4} title="Rank third-place teams">
              Rank all 12 third-place teams to predict which <strong>8 will qualify</strong> for the Round of 32 and which 4 will be eliminated.
            </Step>
            <Step number={5} title="Pick knockout bracket winners">
              Based on your group and third-place rankings, the knockout bracket is built. Select the <strong>winner of each match</strong> from the Round of 32 through the Final. Changing an earlier pick will automatically update later rounds.
            </Step>
            <Step number={6} title="Submit your bracket">
              When you&apos;re ready, submit your entry. Once submitted, your bracket is locked and cannot be edited. In special circumstances, the pool administrator can unlock your entry to allow changes.
            </Step>
          </div>
        ) : (
          <div className="space-y-3">
            <Step number={1} title="Go to Predictions">
              Click the <strong>Predictions</strong> tab to see all your prediction entries.
            </Step>
            <Step number={2} title="Select an entry">
              {maxEntries > 1
                ? <>This pool allows up to <strong>{maxEntries} entries</strong> per player. Select an entry to edit, or create a new one.</>
                : <>Select your entry to start making predictions.</>}
            </Step>
            <Step number={3} title="Predict match scores">
              For each match, enter your predicted score for both teams. Your predictions auto-save as you type.
            </Step>
            <Step number={4} title="Submit your predictions">
              When you&apos;re ready, submit your entry. Once submitted, your predictions are locked and cannot be edited. In special circumstances, the pool administrator can unlock your entry to allow changes.
            </Step>
          </div>
        )}
      </Card>

      {/* Deadlines & Locking */}
      <Card className="mb-6">
        <h4 className="text-lg font-semibold text-neutral-900 mb-1">Deadlines & Locking</h4>
        <p className="text-xs text-neutral-500 mb-4">Important timing information for your predictions.</p>
        {isProgressive ? (
          <div className="space-y-3 text-sm text-neutral-700">
            <div className="flex items-start gap-2">
              <span className="shrink-0 text-warning-600 mt-0.5">&#9888;</span>
              <p>Each round has its own <strong>deadline</strong> set by the pool administrator. Deadlines are typically before the first match of each round.</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="shrink-0 text-success-600 mt-0.5">&#10003;</span>
              <p>You can edit predictions for the current open round until the deadline. Once submitted or past deadline, that round&apos;s predictions are locked.</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="shrink-0 text-primary-600 mt-0.5">&#128274;</span>
              <p>If you miss a round&apos;s deadline without submitting, you&apos;ll score <strong>0 points</strong> for that round. You can still predict future rounds.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-sm text-neutral-700">
            <div className="flex items-start gap-2">
              <span className="shrink-0 text-warning-600 mt-0.5">&#9888;</span>
              <p>The pool administrator sets a <strong>prediction deadline</strong>. Once the deadline passes, all predictions are locked and no further changes can be made.</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="shrink-0 text-success-600 mt-0.5">&#10003;</span>
              <p>You can edit and re-submit your predictions as many times as you like <strong>before the deadline</strong>.</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="shrink-0 text-primary-600 mt-0.5">&#128274;</span>
              <p>After the deadline, predictions become visible to all pool members and scoring begins as matches are played.</p>
            </div>
          </div>
        )}
      </Card>

      {/* How Scoring Works */}
      <Card className="mb-6">
        <h4 className="text-lg font-semibold text-neutral-900 mb-1">How Scoring Works</h4>
        {isBracketPicker ? (
          <>
            <div className="space-y-4 text-sm text-neutral-700 mt-4">
              <div>
                <p className="font-semibold text-neutral-900 mb-1">Group Rankings</p>
                <p>Points are awarded for each team you place in the correct finishing position within their group. Predicting the 1st-place team correctly earns the most points, with decreasing points for 2nd, 3rd, and 4th.</p>
              </div>
              <div>
                <p className="font-semibold text-neutral-900 mb-1">Third-Place Picks</p>
                <p>Earn points for correctly identifying which 3rd-place teams qualify for the Round of 32 and which are eliminated. A bonus is available if you get all 8 qualifiers correct.</p>
              </div>
              <div>
                <p className="font-semibold text-neutral-900 mb-1">Knockout Picks</p>
                <p>Points are awarded for correctly predicting the <strong>winner</strong> of each knockout match. Later rounds are worth more &mdash; the Final earns the most points.</p>
              </div>
              <div>
                <p className="font-semibold text-neutral-900 mb-1">Bonus Points</p>
                <p>Extra points are available for correctly predicting the tournament champion and penalty shootout outcomes.</p>
              </div>
            </div>
            <div className="mt-4 flex items-start gap-3 bg-primary-50 border border-primary-200 rounded-lg px-4 py-3">
              <svg className="w-5 h-5 text-primary-800 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              <p className="text-xs text-primary-800 leading-5">
                <strong>Tip:</strong> Check the <strong>Scoring Rules</strong> tab for the exact point values configured for this pool.
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="space-y-4 text-sm text-neutral-700 mt-4">
              <div>
                <p className="font-semibold text-neutral-900 mb-1">Match Predictions</p>
                <p>Points are awarded based on how close your predicted score is to the actual result. There are three tiers:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1 text-neutral-600">
                  <li><strong>Exact Score</strong> &mdash; You predicted the exact final score (highest points)</li>
                  <li><strong>Correct Difference</strong> &mdash; Right winner and correct goal difference</li>
                  <li><strong>Correct Result</strong> &mdash; Right winner (or draw) but wrong score</li>
                </ul>
                <p className="mt-2 text-neutral-500 text-xs">Only the highest matching tier applies per match.</p>
              </div>
              <div>
                <p className="font-semibold text-neutral-900 mb-1">Knockout Multipliers</p>
                <p>Knockout stage matches have <strong>multipliers</strong> that increase with each round. The Final is worth the most points.</p>
              </div>
              <div>
                <p className="font-semibold text-neutral-900 mb-1">Bonus Points</p>
                <p>
                  Extra points are available for correctly predicting group standings
                  {isProgressive
                    ? ' and tournament outcomes (champion, runner-up, third place).'
                    : ', knockout bracket pairings, and tournament outcomes (champion, runner-up, third place).'}
                </p>
              </div>
            </div>
            <div className="mt-4 flex items-start gap-3 bg-primary-50 border border-primary-200 rounded-lg px-4 py-3">
              <svg className="w-5 h-5 text-primary-800 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              <p className="text-xs text-primary-800 leading-5">
                <strong>Tip:</strong> Check the <strong>Scoring Rules</strong> tab for the exact point values and multipliers configured for this pool.
              </p>
            </div>
          </>
        )}
      </Card>

      {/* Where to Find Things */}
      <Card>
        <h4 className="text-lg font-semibold text-neutral-900 mb-1">Where to Find Things</h4>
        <p className="text-xs text-neutral-500 mb-4">A quick guide to the tabs available in this pool.</p>
        <div className="divide-y divide-neutral-100">
          <div className="py-3 first:pt-0">
            <p className="text-sm font-semibold text-neutral-900">Leaderboard</p>
            <p className="text-xs text-neutral-600 mt-0.5">See how all entries rank. Track scores, positions, and who&apos;s in the lead.</p>
          </div>
          <div className="py-3">
            <p className="text-sm font-semibold text-neutral-900">Predictions</p>
            <p className="text-xs text-neutral-600 mt-0.5">
              {isBracketPicker
                ? 'View and edit your bracket entries. This is where you rank groups and pick knockout winners.'
                : 'View and edit your prediction entries. This is where you fill in your match scores.'}
            </p>
          </div>
          <div className="py-3">
            <p className="text-sm font-semibold text-neutral-900">Results</p>
            <p className="text-xs text-neutral-600 mt-0.5">See actual match results and the points you earned for each match.</p>
          </div>
          <div className="py-3">
            <p className="text-sm font-semibold text-neutral-900">Standings</p>
            <p className="text-xs text-neutral-600 mt-0.5">Live group standings showing team records, points, and goal differences.</p>
          </div>
          <div className="py-3 last:pb-0">
            <p className="text-sm font-semibold text-neutral-900">Scoring Rules</p>
            <p className="text-xs text-neutral-600 mt-0.5">Full breakdown of point values, multipliers, and bonus point categories for this pool.</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
