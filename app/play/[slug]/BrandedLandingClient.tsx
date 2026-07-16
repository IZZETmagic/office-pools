'use client'

import { useState, useEffect, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { LeaderboardPlayer } from './getLeaderboard'
import type { TournamentSummary, StageProgress } from './getTournamentSummary'

type PoolConfig = {
  name: string
  brandName: string
  poolCode: string
  poolId: string
  slug: string
  logoUrl: string
  tagline: string
  primaryColor: string
  primaryGradient: string
  accentColor: string
  accentColorLight: string
  memberCount: number
  mode: string
  brandEmoji: string | null
  status: string
  entryFee: string | null
  prizes: { place: string; prize: string; icon: string; color: string; border: string }[]
}

const FORM_COLORS: Record<string, string> = {
  exact: 'bg-amber-400',
  winner_gd: 'bg-emerald-500',
  winner: 'bg-blue-500',
  miss: 'bg-red-400',
}

// Countdown to World Cup kickoff: June 11, 2026 at 12:00 ET (16:00 UTC).
// Used only for the pre-tournament phase.
const KICKOFF = new Date('2026-06-11T16:00:00Z').getTime()

type TimeLeft = { days: number; hours: number; minutes: number; seconds: number }

function computeTimeLeft(targetMs: number): TimeLeft {
  const diff = Math.max(0, targetMs - Date.now())
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  }
}

/** Ticking countdown to an arbitrary target timestamp. */
function useCountdown(targetMs: number): TimeLeft {
  const [timeLeft, setTimeLeft] = useState(() => computeTimeLeft(targetMs))
  useEffect(() => {
    const timer = setInterval(() => setTimeLeft(computeTimeLeft(targetMs)), 1000)
    return () => clearInterval(timer)
  }, [targetMs])
  return timeLeft
}

// Self-contained so the once-a-second tick re-renders only the tiles, not the
// whole landing page. `suppressHydrationWarning` on the digits: the server
// renders one second value and the client re-anchors on mount — expected for a
// live clock, and not a real mismatch.
function Countdown({ targetMs, accentColor, primaryColor }: { targetMs: number; accentColor: string; primaryColor: string }) {
  const timeLeft = useCountdown(targetMs)
  return (
    <div className="inline-flex items-center gap-2 sm:gap-3">
      {[
        { value: timeLeft.days, label: 'Days' },
        { value: timeLeft.hours, label: 'Hrs' },
        { value: timeLeft.minutes, label: 'Min' },
        { value: timeLeft.seconds, label: 'Sec' },
      ].map((unit, i) => (
        <div key={unit.label} className="flex items-center gap-2 sm:gap-3">
          <div className="flex flex-col items-center">
            <div
              suppressHydrationWarning
              className="w-14 sm:w-16 h-14 sm:h-16 rounded-xl flex items-center justify-center font-extrabold text-xl sm:text-2xl tabular-nums"
              style={{ backgroundColor: 'rgba(0,0,0,0.05)', borderBottom: `2px solid ${accentColor}`, color: primaryColor }}
            >
              {String(unit.value).padStart(2, '0')}
            </div>
            <span className="text-[10px] font-medium text-neutral-400 mt-1.5">{unit.label}</span>
          </div>
          {i < 3 && <span className="text-neutral-300 text-lg font-bold mb-4">:</span>}
        </div>
      ))}
    </div>
  )
}

// One side of the "up next" scoreline. The flag sits on the INNER edge (next to
// the score): home renders name→flag, away renders flag→name, giving
// `Team A 🏳  0 - 0  🏳 Team B`.
function TeamSide({ name, flag, side }: { name: string | null; flag: string | null; side: 'home' | 'away' }) {
  const flagEl = flag ? (
    <img src={flag} alt={name || ''} className="w-7 h-5 rounded-sm object-cover shadow-sm shrink-0" />
  ) : (
    <span className="text-lg shrink-0">&#9917;</span>
  )
  const nameEl = <span className="text-base sm:text-lg font-bold text-neutral-900 truncate">{name || 'TBD'}</span>
  return (
    <div className={`flex items-center gap-2 flex-1 min-w-0 ${side === 'home' ? 'justify-end' : 'justify-start'}`}>
      {side === 'home' ? (<>{nameEl}{flagEl}</>) : (<>{flagEl}{nameEl}</>)}
    </div>
  )
}

// "The Road to Glory" — a stage stepper (Groups → Final). Completed stages fill
// with the brand accent + a check; the current stage is outlined and pulses;
// upcoming stages are muted. Replaces the pre-tournament "How It Works" once play
// is under way.
function RoadTracker({
  stages,
  completed,
  total,
  accentColor,
  primaryColor,
}: {
  stages: StageProgress[]
  completed: number
  total: number
  accentColor: string
  primaryColor: string
}) {
  return (
    <section className="py-14 sm:py-20 bg-neutral-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-center text-neutral-900 mb-2">The Road to Glory</h2>
        <p className="text-center text-neutral-500 mb-12 text-sm">{completed} of {total} matches played</p>
        <div className="flex items-center pb-7">
          {stages.map((st, i) => {
            const done = st.status === 'done'
            const current = st.status === 'current'
            return (
              <Fragment key={st.key}>
                {i > 0 && (
                  <div
                    className="flex-1 h-[3px] rounded-full"
                    style={{ backgroundColor: st.status === 'upcoming' ? '#e5e5e5' : accentColor }}
                  />
                )}
                <div className="relative shrink-0">
                  <div
                    className="relative flex items-center justify-center rounded-full"
                    style={{
                      width: 34,
                      height: 34,
                      backgroundColor: done ? accentColor : '#ffffff',
                      border: `2px solid ${done || current ? accentColor : '#d4d4d4'}`,
                    }}
                  >
                    {current && (
                      <span
                        className="absolute inline-flex h-full w-full rounded-full animate-ping"
                        style={{ backgroundColor: accentColor, opacity: 0.35 }}
                      />
                    )}
                    {done ? (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    ) : (
                      <span className="relative rounded-full" style={{ width: 8, height: 8, backgroundColor: current ? accentColor : '#d4d4d4' }} />
                    )}
                  </div>
                  <span
                    className="absolute left-1/2 -translate-x-1/2 top-[42px] text-[11px] sm:text-xs font-semibold whitespace-nowrap"
                    style={{ color: done || current ? primaryColor : '#a3a3a3' }}
                  >
                    {st.label}
                  </span>
                </div>
              </Fragment>
            )
          })}
        </div>
      </div>
    </section>
  )
}

export default function BrandedLandingClient({
  poolConfig,
  players,
  isMock,
  tournament,
}: {
  poolConfig: PoolConfig
  players: LeaderboardPlayer[]
  isMock: boolean
  tournament: TournamentSummary
}) {
  const router = useRouter()

  const { phase, total, completed, nextMatch, champion, stages } = tournament
  const isPre = phase === 'pre'
  const isLive = phase === 'live'
  const isComplete = phase === 'complete'

  // Pre-tournament counts down to kickoff; live counts down to the next match.
  const nextKickoffMs = nextMatch ? new Date(nextMatch.kickoff).getTime() : KICKOFF
  const countdownTarget = isPre ? KICKOFF : nextKickoffMs

  const handleJoin = () => {
    router.push(`/play/${poolConfig.slug}/join`)
  }

  const scrollToLeaderboard = () => {
    document.getElementById('leaderboard')?.scrollIntoView({ behavior: 'smooth' })
  }

  // Once the tournament is under way you can no longer usefully "join & predict"
  // (brackets locked, rounds closing), so the primary action becomes the board.
  const primaryCtaLabel = isPre ? 'Join the Pool' : 'View Live Standings'
  const primaryCtaAction = isPre ? handleJoin : scrollToLeaderboard
  const navCtaLabel = isPre ? 'Join Pool' : 'Live Standings'

  const brandIcon = poolConfig.logoUrl ? (
    <img src={poolConfig.logoUrl} alt={poolConfig.brandName} className="w-8 h-8 rounded-md object-cover" />
  ) : poolConfig.brandEmoji ? (
    <span className="text-2xl">{poolConfig.brandEmoji}</span>
  ) : null

  const heroSubcopy = isPre
    ? 'Predict match scores round by round, compete against friends, and climb the leaderboard. Free to join — bragging rights are priceless.'
    : isComplete
      ? `The 2026 World Cup is complete — all ${total} matches played. See where the ${poolConfig.brandName} pool finished.`
      : `The tournament is under way — ${completed} of ${total} matches played. Follow the live leaderboard as the standings shift with every result.`

  const membersLine = isPre
    ? `${poolConfig.memberCount} player${poolConfig.memberCount !== 1 ? 's' : ''} already joined`
    : `${poolConfig.memberCount} player${poolConfig.memberCount !== 1 ? 's' : ''} competing`

  const stageBadgeLabel = isPre ? 'FIFA World Cup 2026' : isComplete ? 'FIFA World Cup 2026 · Complete' : 'FIFA World Cup 2026 · Live'

  // ---- Sections (extracted so the order can lead with standings when live) ----

  const leaderboardSection = (
    <section id="leaderboard" className="py-16 sm:py-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-center text-neutral-900 mb-3">
          {isMock ? 'Leaderboard Preview' : isComplete ? 'Final Standings' : 'Live Leaderboard'}
        </h2>
        <p className="text-center text-neutral-500 mb-10 max-w-xl mx-auto">
          {isMock
            ? 'Here’s what the leaderboard looks like during the tournament. Join now to see your name here!'
            : players.length > 0
              ? isComplete
                ? 'The final results are in. Here’s how everyone finished.'
                : 'See who’s leading the pack. Updates live during matches.'
              : 'The leaderboard will populate once players join and matches begin.'}
        </p>

        {players.length > 0 ? (
          <>
          <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-neutral-100 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-100 bg-neutral-50/50">
                  <th className="w-14 text-center px-4 py-3 text-xs font-bold uppercase tracking-wider text-neutral-400">#</th>
                  <th className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-neutral-400">Player</th>
                  <th className="text-center px-4 py-3 text-xs font-bold uppercase tracking-wider text-neutral-400 hidden sm:table-cell">Form</th>
                  <th className="text-right px-4 py-3 text-xs font-bold uppercase tracking-wider text-neutral-400">Points</th>
                </tr>
              </thead>
              <tbody>
                {players.slice(0, 10).map((p) => (
                  <tr key={p.rank} className="border-b border-neutral-50 last:border-b-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-bold text-neutral-400 w-6 text-center tabular-nums">
                          {p.rank <= 3 ? ['\u{1F947}', '\u{1F948}', '\u{1F949}'][p.rank - 1] : p.rank}
                        </span>
                        {p.move > 0 && <span className="text-green-500 text-[10px] font-bold leading-none">&#9650;{p.move}</span>}
                        {p.move < 0 && <span className="text-red-500 text-[10px] font-bold leading-none">&#9660;{Math.abs(p.move)}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-semibold text-neutral-900">{p.name}</span>
                    </td>
                    <td className="text-center px-4 py-3 hidden sm:table-cell">
                      <div className="flex items-center justify-center gap-1">
                        {p.form.map((f, i) => (
                          <span key={i} className={`w-2.5 h-2.5 rounded-full ${FORM_COLORS[f] || 'bg-neutral-300'}`} />
                        ))}
                      </div>
                    </td>
                    <td className="text-right px-4 py-3">
                      <span className="text-sm font-bold text-neutral-900 tabular-nums">{p.points.toLocaleString('en-US')}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-100 flex items-center justify-between">
              <span className="text-sm text-neutral-500">
                Showing top {Math.min(10, players.length)} of {players.length} player{players.length !== 1 ? 's' : ''}
              </span>
              <Link href={`/tv/${poolConfig.slug}`} className="text-sm font-semibold transition-colors" style={{ color: poolConfig.accentColor }}>
                Full TV leaderboard &rarr;
              </Link>
            </div>
          </div>

          <div className="flex items-center justify-center gap-4 mt-4 text-xs text-neutral-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> Exact</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Correct GD</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Correct Result</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> Miss</span>
          </div>
        </>
        ) : (
          <div className="max-w-md mx-auto text-center py-12 px-6 bg-neutral-50 rounded-2xl border border-neutral-100">
            <div className="text-4xl mb-3">&#9917;</div>
            <p className="text-neutral-500 text-sm">Be the first to join and top the leaderboard!</p>
            <button
              onClick={handleJoin}
              className="mt-4 px-6 py-2.5 rounded-xl text-white font-bold text-sm transition-opacity hover:opacity-90"
              style={{ backgroundColor: poolConfig.accentColor }}
            >
              Join Now
            </button>
          </div>
        )}
      </div>
    </section>
  )

  const howItWorksSection = (
    <section id="how-it-works" className="py-16 sm:py-20 bg-neutral-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold text-center text-neutral-900 mb-3">How It Works</h2>
        <p className="text-center text-neutral-500 mb-12 max-w-xl mx-auto">Three simple steps to start competing</p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {[
            { step: 1, icon: '\u{1F4F1}', title: 'Sign Up & Join', desc: 'Create a free account and join the pool using the link or pool code. Takes less than a minute.' },
            { step: 2, icon: '\u{1F3AF}', title: 'Predict Matches', desc: 'Predict scores round by round as the tournament progresses. New rounds unlock after each stage.' },
            { step: 3, icon: '\u{1F3C6}', title: 'Climb the Board', desc: 'Earn points for correct predictions. Compete for the top spot on the leaderboard and win prizes!' },
          ].map((item) => (
            <div key={item.step} className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl text-3xl mb-4" style={{ backgroundColor: `${poolConfig.accentColor}20` }}>
                {item.icon}
              </div>
              <div
                className="inline-flex items-center justify-center w-7 h-7 rounded-full text-white text-sm font-bold -mt-12 -ml-4 relative z-10 mb-2"
                style={{ backgroundColor: poolConfig.primaryColor }}
              >
                {item.step}
              </div>
              <h3 className="text-lg font-bold text-neutral-900 mb-2">{item.title}</h3>
              <p className="text-sm text-neutral-500 leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )

  return (
    <div className="min-h-screen bg-white">

      {/* NAV */}
      <nav className="sticky top-0 z-50 border-b border-neutral-100 bg-white/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-2.5">
            {brandIcon}
            <span className="font-bold text-lg text-neutral-900">{poolConfig.brandName}</span>
          </div>
          <div className="hidden sm:flex items-center gap-6 text-sm font-medium text-neutral-500">
            {isPre && <a href="#how-it-works" className="hover:text-neutral-900 transition-colors">How It Works</a>}
            <a href="#leaderboard" className="hover:text-neutral-900 transition-colors">Leaderboard</a>
            <a href="#prizes" className="hover:text-neutral-900 transition-colors">Prizes</a>
          </div>
          <button
            onClick={primaryCtaAction}
            className="px-4 py-2 rounded-lg text-white text-sm font-bold transition-opacity hover:opacity-90"
            style={{ backgroundColor: poolConfig.accentColor }}
          >
            {navCtaLabel}
          </button>
        </div>
      </nav>

      {/* HERO */}
      <section className="relative overflow-hidden text-white" style={{ background: poolConfig.primaryGradient }}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="absolute -top-20 -left-20 w-72 h-72 bg-white/[0.03] rounded-full" />
          <div className="absolute top-1/3 -right-16 w-56 h-56 bg-white/[0.03] rounded-full" />
          <div className="absolute -bottom-12 left-1/4 w-40 h-40 bg-white/[0.03] rounded-full" />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 text-sm font-semibold mb-6" style={{ color: poolConfig.accentColorLight }}>
            {!isPre && <span className="relative flex h-2 w-2">
              {isLive && <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: poolConfig.accentColor }} />}
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: poolConfig.accentColor }} />
            </span>}
            <span>&#9917;</span> {stageBadgeLabel}
          </div>

          {poolConfig.logoUrl && (
            <div className="flex justify-center mb-6">
              <img src={poolConfig.logoUrl} alt={poolConfig.brandName} className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover shadow-lg" />
            </div>
          )}

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight mb-4">
            {poolConfig.brandName}&apos;s<br />
            <span style={{ color: poolConfig.accentColor }}>World Cup Pool</span>
          </h1>
          <p className="text-lg sm:text-xl text-white/60 max-w-2xl mx-auto mb-3">
            {poolConfig.tagline}
          </p>
          <p className="text-base text-white/40 max-w-xl mx-auto mb-8">
            {heroSubcopy}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={primaryCtaAction}
              className="inline-flex items-center justify-center px-8 py-3.5 rounded-xl text-white font-bold text-lg transition-colors"
              style={{ backgroundColor: poolConfig.accentColor }}
            >
              {primaryCtaLabel}
            </button>
            {!isPre && (
              <Link
                href={`/tv/${poolConfig.slug}`}
                className="inline-flex items-center justify-center px-6 py-3.5 rounded-xl font-semibold text-base text-white/70 hover:text-white border border-white/20 transition-colors"
              >
                Open TV board &rarr;
              </Link>
            )}
          </div>
          <div className="flex items-center justify-center gap-3 mt-4">
            <p className="text-white/30 text-sm">{membersLine}</p>
            {poolConfig.entryFee && (
              <>
                <span className="text-white/20">·</span>
                <p className="text-white/30 text-sm">{poolConfig.entryFee} entry</p>
              </>
            )}
          </div>
        </div>
      </section>

      {/* STATUS: pre = kickoff countdown · live = next-match strip · complete = champion */}
      {isPre && (
        <section className="py-8 sm:py-10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mb-3">World Cup kicks off in</p>
            <Countdown targetMs={countdownTarget} accentColor={poolConfig.accentColor} primaryColor={poolConfig.primaryColor} />
          </div>
        </section>
      )}

      {isLive && nextMatch && (
        <section className="py-8 sm:py-10">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="rounded-2xl border border-neutral-100 shadow-sm bg-white overflow-hidden">
              <div className="px-5 py-2.5 flex items-center justify-between" style={{ backgroundColor: `${poolConfig.accentColor}14` }}>
                <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest" style={{ color: poolConfig.primaryColor }}>
                  {nextMatch.isLiveNow ? (
                    <><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" /></span> Live now</>
                  ) : (
                    <>Next up &middot; {nextMatch.stageLabel}</>
                  )}
                </span>
                <span className="text-xs font-medium text-neutral-400">{completed} of {total} matches played</span>
              </div>
              <div className="px-5 py-5 flex items-center justify-center gap-3">
                <TeamSide name={nextMatch.homeTeam} flag={nextMatch.homeFlag} side="home" />
                <span className="text-lg sm:text-xl font-black text-neutral-900 tabular-nums shrink-0 px-1">
                  {nextMatch.homeScore} - {nextMatch.awayScore}
                </span>
                <TeamSide name={nextMatch.awayTeam} flag={nextMatch.awayFlag} side="away" />
              </div>
              <div className="px-5 pb-5 flex flex-col items-center">
                {nextMatch.isLiveNow ? (
                  <span className="text-sm font-bold text-red-500">Match in progress &mdash; follow the live board</span>
                ) : (
                  <>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mb-3">
                      {nextMatch.stageLabel} kicks off in
                    </p>
                    <Countdown targetMs={countdownTarget} accentColor={poolConfig.accentColor} primaryColor={poolConfig.primaryColor} />
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {isComplete && (
        <section className="py-10">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <div className="inline-flex flex-col items-center gap-2 px-8 py-6 rounded-2xl border border-neutral-100 shadow-sm bg-white">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400">Tournament complete &middot; Champions</span>
              <div className="flex items-center gap-3 mt-1">
                {champion?.flag ? (
                  <img src={champion.flag} alt={champion.name} className="w-9 h-6 rounded-sm object-cover shadow-sm" />
                ) : (
                  <span className="text-3xl">&#127942;</span>
                )}
                <span className="text-2xl font-black" style={{ color: poolConfig.primaryColor }}>{champion?.name ?? 'Champions'}</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Pre-tournament walks through how to play; once it's under way that's
          moot (bracket locked, predictions closing) and the next-match strip +
          leaderboard already carry the story, so drop it and lead with standings. */}
      {isPre ? (
        <>
          {howItWorksSection}
          {leaderboardSection}
        </>
      ) : (
        <>
          {leaderboardSection}
          {stages.length > 0 && (
            <RoadTracker
              stages={stages}
              completed={completed}
              total={total}
              accentColor={poolConfig.accentColor}
              primaryColor={poolConfig.primaryColor}
            />
          )}
        </>
      )}

      {/* PRIZES */}
      <section id="prizes" className="py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-neutral-900 mb-3">Prizes</h2>
          <p className="text-center text-neutral-500 mb-10 max-w-xl mx-auto">
            Compete for prizes sponsored by {poolConfig.brandName}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
            {poolConfig.prizes.map((item) => (
              <div key={item.place} className={`bg-white rounded-2xl border ${item.border} p-6 text-center shadow-sm`}>
                <div className="text-4xl mb-3">{item.icon}</div>
                <div className={`inline-block px-3 py-1 rounded-full bg-gradient-to-r ${item.color} text-white text-xs font-bold mb-3`}>
                  {item.place}
                </div>
                <p className="text-lg font-bold text-neutral-900">{item.prize}</p>
              </div>
            ))}
          </div>

          {poolConfig.prizes.every((p) => p.prize === 'TBD') && (
            <p className="text-center text-sm text-neutral-400 mt-6">
              Prizes will be announced before the tournament starts
            </p>
          )}
        </div>
      </section>

      {/* JOIN / CTA */}
      <section id="join" className="py-16 sm:py-20 bg-neutral-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-md border border-neutral-100 overflow-hidden">
            <div className="px-6 py-8 text-center text-white relative overflow-hidden" style={{ background: poolConfig.primaryGradient }}>
              <div className="absolute -top-10 -left-10 w-32 h-32 rounded-full bg-white/[0.04]" />
              <div className="absolute -bottom-8 -right-8 w-24 h-24 rounded-full bg-white/[0.04]" />
              <div className="relative z-10">
                {poolConfig.logoUrl && (
                  <img src={poolConfig.logoUrl} alt={poolConfig.brandName} className="w-14 h-14 rounded-2xl object-cover mx-auto mb-3" />
                )}
                <h3 className="text-xl font-bold">{isPre ? 'Ready to Join?' : isComplete ? 'See the Final Standings' : 'Follow the Race'}</h3>
                <p className="text-sm mt-1" style={{ color: `${poolConfig.accentColorLight}99` }}>
                  {isPre ? 'Tap the button below to get started' : 'Watch the live board as it’s decided'}
                </p>
              </div>
            </div>

            <div className="px-6 py-6 space-y-5">
              <div className="flex items-center justify-center gap-4 text-sm text-neutral-500">
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128H5.228A2 2 0 013 17.208V15a4.002 4.002 0 014.464-3.978A3 3 0 0112 13.5a3 3 0 014.536-2.478A4.002 4.002 0 0121 15v2.208a2 2 0 01-2.228 1.92M15 19.128H9" /></svg>
                  {poolConfig.memberCount} member{poolConfig.memberCount !== 1 ? 's' : ''}
                </span>
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>
                  {poolConfig.mode}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ backgroundColor: `${poolConfig.accentColor}20`, color: poolConfig.accentColor }}>
                  {isLive ? 'Live' : isComplete ? 'Final' : poolConfig.status === 'open' ? 'Open' : poolConfig.status}
                </span>
              </div>

              <button
                onClick={primaryCtaAction}
                className="w-full py-3 rounded-xl text-white font-bold text-base transition-colors"
                style={{ backgroundColor: poolConfig.accentColor }}
              >
                {isPre ? 'Join Pool' : 'View Live Standings'}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-8 border-t border-neutral-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm text-neutral-400">
            <span>&#9917;</span> Powered by <span className="font-semibold text-neutral-500">Sport Pool</span>
          </p>
        </div>
      </footer>
    </div>
  )
}
