'use client'

/**
 * How to play, for a LEAGUE pool.
 *
 * ⚠ WHY THIS IS A SEPARATE FILE. `HowToPlayTab` is the World Cup explainer, and
 * every league pool was being shown it — the modal opens by itself the first
 * time somebody visits, so a member's first impression of a Premier League pool
 * was "This is your FIFA World Cup 2026 prediction pool", followed by 12 groups
 * of 4, a Round of 32, and 104 matches. None of it true, all of it confident.
 *
 * Branching inside the old file was the obvious move and the wrong one: almost
 * every section differs, so it would have become two explainers sharing a
 * bracket. The precedent is `LeagueScoringRulesTab`, split from
 * `ScoringRulesTab` for the same reason.
 *
 * ## Keep this in step
 *
 * The mode-specific half comes from `leagueModeInfo`, which is also what Pool
 * Info reads — so the two screens cannot drift. Everything else here is about
 * RHYTHM (how matchweeks open and lock), which is the same for every mode
 * except table, and that difference is the one thing this file states itself.
 */

import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { leagueModeInfo, type LeagueMode, type LeagueDepth } from '@/lib/leagueModeInfo'

type Props = {
  poolName: string
  maxEntries: number
  mode: LeagueMode
  depth: LeagueDepth
}

function Step({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="shrink-0 w-6 h-6 rounded-full bg-primary-600/12 text-primary-800 flex items-center justify-center text-xs font-bold">{number}</span>
      <p className="text-sm text-neutral-700"><strong>{title}:</strong> {children}</p>
    </div>
  )
}

export function LeagueHowToPlayTab({ poolName, maxEntries, mode, depth }: Props) {
  const info = leagueModeInfo(mode, depth)
  const isTable = mode === 'table'
  const isLms = mode === 'last_man_standing'
  const isShowdown = mode === 'showdown'
  const scores = depth === 'scores'

  return (
    <div>
      {/* Welcome */}
      <Card className="mb-6">
        <h4 className="text-lg font-semibold text-neutral-900 mb-1">Welcome to {poolName}!</h4>
        <p className="text-sm text-neutral-700 leading-relaxed">
          This is a <strong>{info.label}</strong> pool. {info.summary} Here&apos;s
          everything you need to know to get started.
        </p>
      </Card>

      {/* How this pool works */}
      <Card className="mb-6">
        <h4 className="text-lg font-semibold text-neutral-900 mb-1">How this pool works</h4>
        <p className="text-sm text-neutral-700 leading-relaxed mt-2">{info.description}</p>
        <div className="mt-4 space-y-2">
          {info.points.map((point) => (
            <div key={point} className="flex items-start gap-3">
              <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-primary-600" aria-hidden="true" />
              <p className="text-sm text-neutral-700">{point}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Making predictions */}
      <Card className="mb-6">
        <h4 className="text-lg font-semibold text-neutral-900 mb-1">
          {isTable ? 'Making your prediction' : 'Making your picks'}
        </h4>
        <div className="space-y-3 mt-3">
          {isTable ? (
            <>
              <Step number={1} title="Open My Table">Everything happens on one screen.</Step>
              <Step number={2} title="Drag the clubs">
                Put every club into the order you think it will finish. The list starts in the
                real table&apos;s current order, so you are adjusting rather than starting blank.
              </Step>
              <Step number={3} title="It saves as you go">
                Every change is saved on its own once you have committed the first version — there
                is nothing to submit twice.
              </Step>
              {/* "Fixed for the season" was true only while migrations 109/110
                  froze a passed deadline. 114 gave the admin the lever back so
                  somebody who missed it can still file, and a member told the
                  order was final would have no idea why it reopened. */}
              <Step number={4} title="Change your mind until the deadline">
                You can keep rearranging right up to the close, and every table opens to the pool
                the moment it passes. Your admin can reopen it afterwards to let someone who missed
                it file one — we&apos;ll email you if that happens.
              </Step>
            </>
          ) : isLms ? (
            <>
              <Step number={1} title="Open Survivor">The matchweek that is open is the one you can pick.</Step>
              <Step number={2} title="Back one club to win">
                A draw counts as a loss here — you need the win.
              </Step>
              <Step number={3} title="Watch what you have spent">
                You cannot use the same club twice in a round, so the obvious picks run out.
              </Step>
              <Step number={4} title="Get knocked out, come back">
                When the round ends everybody starts the next one level.
              </Step>
            </>
          ) : (
            <>
              <Step number={1} title="Open Predictions">
                One matchweek is open at a time; you cannot work ahead.
              </Step>
              <Step number={2} title={scores ? 'Call every scoreline' : 'Call every fixture'}>
                {scores
                  ? 'Put a score on all the fixtures in the matchweek.'
                  : 'Tap the home win, the draw or the away win for each fixture.'}
              </Step>
              <Step number={3} title="Change your mind until kickoff">
                Picks stay editable until the matchweek locks.
              </Step>
              {isShowdown && (
                <Step number={4} title="Check who you have drawn">
                  The Duels tab shows your opponent for the week and the season fixture list.
                </Step>
              )}
            </>
          )}
        </div>
        {maxEntries > 1 && (
          <Alert variant="info" className="mt-4 text-xs">
            You can have up to <strong>{maxEntries} entries</strong> in this pool, each with its own picks.
          </Alert>
        )}
      </Card>

      {/* Deadlines */}
      <Card className="mb-6">
        <h4 className="text-lg font-semibold text-neutral-900 mb-1">Deadlines</h4>
        <div className="space-y-3 text-sm text-neutral-700 mt-3">
          {isTable ? (
            <>
              <p>
                This pool has <strong>one deadline for the whole season</strong>. It is shown on
                the My Table screen, and your admin sets it when the pool is created.
              </p>
              <p>
                When it passes, everyone&apos;s table locks at once and you can see what the rest
                of the pool predicted. Nothing can be changed after that, including by your admin.
              </p>
            </>
          ) : (
            <>
              <p>
                There is <strong>no single season deadline</strong>. Each matchweek locks at its
                own first kickoff, and the next one opens by itself the moment it does.
              </p>
              <p>
                That is handled automatically — nobody has to open or close anything, and the
                countdown on the predictions screen is always for the matchweek you are looking at.
              </p>
              <p>
                Once a matchweek locks you can see everyone else&apos;s picks for it. Picks for
                matchweeks that have not locked stay private.
              </p>
            </>
          )}
        </div>
      </Card>

      {/* Scoring — deliberately a pointer, not a copy */}
      <Card className="mb-6">
        <h4 className="text-lg font-semibold text-neutral-900 mb-1">Scoring</h4>
        <p className="text-sm text-neutral-700 leading-relaxed mt-2">
          {isLms
            ? 'There are no points in this mode. Members are ranked by rounds won, and the leaderboard shows how far you got in the round that is running.'
            : 'The exact points for this pool are on the '}
          {!isLms && <strong>Scoring Rules</strong>}
          {!isLms && ' tab, including the tiebreakers used to separate members who finish level.'}
        </p>
        <p className="text-sm text-neutral-700 leading-relaxed mt-2">
          {isLms
            ? 'Whether you survive is settled at full time — a club that is winning at half time has not got you through yet. The Survivor tab shows who is still in as the results land.'
            : 'The leaderboard updates while matches are being played, so it moves as the goals go in rather than waiting for the day to finish.'}
        </p>
      </Card>

      {/* Where to find things */}
      <Card>
        <h4 className="text-lg font-semibold text-neutral-900 mb-1">Where to find things</h4>
        <div className="space-y-2 text-sm text-neutral-700 mt-3">
          <p><strong>Leaderboard</strong> — where everyone stands, and how the week moved them.</p>
          {isTable ? (
            <>
              <p><strong>My Table</strong> — your prediction, and how it is scoring.</p>
              <p><strong>Table</strong> — the real league table, from the official feed.</p>
            </>
          ) : (
            <>
              <p><strong>Predictions</strong> — the open matchweek.</p>
              <p><strong>Results</strong> — what was played, and what everyone picked.</p>
              {isShowdown && <p><strong>Duels</strong> — your head-to-head, and the season fixture list.</p>}
              {isLms && <p><strong>Survivor</strong> — who is still in, and what they have used.</p>}
              <p><strong>Table</strong> — the real league table, from the official feed.</p>
            </>
          )}
          <p><strong>Banter</strong> — the pool chat.</p>
          <p><strong>Pool Info</strong> — the rules of this pool in one place.</p>
        </div>
      </Card>
    </div>
  )
}
