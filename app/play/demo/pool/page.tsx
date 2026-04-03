'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  POOL_INFO,
  PODIUM,
  TABLE_PLAYERS,
  ALL_PLAYERS,
  MOCK_MATCHES,
  FORM_COLORS,
  FORM_LABELS,
  RESULT_BORDER_COLORS,
  RESULT_POINT_COLORS,
} from '../mockData'

type Tab = 'leaderboard' | 'results' | 'rules'

export default function PoolDemoPage() {
  const [activeTab, setActiveTab] = useState<Tab>('leaderboard')

  return (
    <div className="min-h-screen bg-neutral-50">

      {/* ═══════ ACCENT BAR ═══════ */}
      <div className="h-1" style={{ backgroundColor: POOL_INFO.accentColor }} />

      {/* ═══════ HEADER ═══════ */}
      <header className="bg-white border-b border-neutral-100">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center gap-3 mb-1">
            <Link href="/play/demo" className="text-neutral-400 hover:text-neutral-600 transition-colors">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
              </svg>
            </Link>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">{POOL_INFO.logoEmoji}</span>
                <h1 className="text-lg font-bold text-neutral-900 truncate">{POOL_INFO.name}</h1>
                <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Active
                </span>
              </div>
              <p className="text-sm text-neutral-400 mt-0.5">{POOL_INFO.memberCount} players &middot; {POOL_INFO.mode}</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-0 -mb-px">
            {([
              { key: 'leaderboard', label: 'Leaderboard', icon: '📊' },
              { key: 'results', label: 'Results', icon: '⚽' },
              { key: 'rules', label: 'Scoring Rules', icon: '📋' },
            ] as { key: Tab; label: string; icon: string }[]).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 sm:px-5 py-3 text-sm font-semibold border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-emerald-600 text-emerald-700'
                    : 'border-transparent text-neutral-400 hover:text-neutral-600'
                }`}
              >
                <span className="mr-1.5 hidden sm:inline">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* ═══════ CONTENT ═══════ */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'leaderboard' && <LeaderboardTab />}
        {activeTab === 'results' && <ResultsTab />}
        {activeTab === 'rules' && <RulesTab />}
      </main>

      {/* ═══════ FOOTER ═══════ */}
      <footer className="py-6 border-t border-neutral-100 bg-white mt-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <p className="text-xs text-neutral-400">
            ⚽ Powered by <span className="font-semibold text-neutral-500">Sport Pool</span>
          </p>
          <Link href="/tv/demo" className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors">
            📺 TV Leaderboard →
          </Link>
        </div>
      </footer>
    </div>
  )
}


/* ═══════════════════════════════════════
   LEADERBOARD TAB
   ═══════════════════════════════════════ */

function LeaderboardTab() {
  return (
    <div className="space-y-5">

      {/* ── Podium ── */}
      <div className="flex justify-center items-end gap-3 pt-2">
        <PodiumCard player={PODIUM[1]} place={2} />
        <PodiumCard player={PODIUM[0]} place={1} />
        <PodiumCard player={PODIUM[2]} place={3} />
      </div>

      {/* ── Form legend ── */}
      <div className="flex items-center justify-center gap-3 sm:gap-4 text-[11px] text-neutral-400">
        {Object.entries(FORM_LABELS).map(([key, label]) => (
          <span key={key} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${FORM_COLORS[key]}`} />
            {label}
          </span>
        ))}
      </div>

      {/* ── Table ── */}
      <div className="bg-white rounded-xl border border-neutral-100 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50/50">
              <th className="w-12 text-center px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-neutral-400">#</th>
              <th className="text-left px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-neutral-400">Player</th>
              <th className="text-center px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-neutral-400 hidden sm:table-cell">Form</th>
              <th className="text-center px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-neutral-400 hidden sm:table-cell">Exact</th>
              <th className="text-center px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-neutral-400 hidden sm:table-cell">Correct</th>
              <th className="text-right px-3 py-3 text-[11px] font-bold uppercase tracking-wider text-neutral-400">Pts</th>
            </tr>
          </thead>
          <tbody>
            {TABLE_PLAYERS.map((p) => (
              <tr key={p.rank} className="border-b border-neutral-50 last:border-b-0 hover:bg-neutral-50/50 transition-colors">
                <td className="text-center px-3 py-2.5 text-sm font-bold text-neutral-300">{p.rank}</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-neutral-900">{p.name}</span>
                    {p.awards?.map((a) => (
                      <span
                        key={a}
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          a === 'Hot Streak' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {a === 'Hot Streak' ? '🔥' : '🥶'} {a}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="text-center px-3 py-2.5 hidden sm:table-cell">
                  <div className="flex items-center justify-center gap-1">
                    {p.form?.map((f, i) => (
                      <span key={i} className={`w-2.5 h-2.5 rounded-full ${FORM_COLORS[f]}`} title={FORM_LABELS[f]} />
                    ))}
                  </div>
                </td>
                <td className="text-center px-3 py-2.5 text-sm text-neutral-500 tabular-nums hidden sm:table-cell">{p.exact}</td>
                <td className="text-center px-3 py-2.5 text-sm text-neutral-500 tabular-nums hidden sm:table-cell">{p.correct}</td>
                <td className="text-right px-3 py-2.5">
                  <span className="text-sm font-bold text-neutral-900 tabular-nums">{p.points}</span>
                  <Movement move={p.move} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total Players', value: ALL_PLAYERS.length },
          { label: 'Matches Played', value: MOCK_MATCHES.length },
          { label: 'Exact Scores', value: ALL_PLAYERS.reduce((s, p) => s + p.exact, 0) },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-neutral-100 px-4 py-3 text-center">
            <div className="text-xl font-black text-neutral-900 tabular-nums">{stat.value}</div>
            <div className="text-[11px] text-neutral-400 font-medium uppercase tracking-wider mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}


/* ═══════════════════════════════════════
   RESULTS TAB
   ═══════════════════════════════════════ */

function ResultsTab() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-neutral-500">Your predictions vs actual results</p>

      {MOCK_MATCHES.map((m) => (
        <div
          key={m.matchNumber}
          className={`bg-white rounded-xl border border-neutral-100 shadow-sm overflow-hidden border-l-4 ${RESULT_BORDER_COLORS[m.result]}`}
        >
          {/* Stage + match number */}
          <div className="px-4 py-2 bg-neutral-50 border-b border-neutral-100 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">{m.stage}</span>
            <span className="text-[11px] text-neutral-400">Match {m.matchNumber}</span>
          </div>

          {/* Score */}
          <div className="px-4 py-4">
            <div className="flex items-center justify-center gap-3 sm:gap-5">
              {/* Home */}
              <div className="flex items-center gap-2 flex-1 justify-end">
                <span className="text-sm font-semibold text-neutral-900 text-right">{m.homeTeam}</span>
                <span className="text-lg">{m.homeFlag}</span>
              </div>

              {/* Score box */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 min-w-[64px] justify-center">
                <span className="text-lg font-black text-white tabular-nums">{m.homeScore}</span>
                <span className="text-white/30 font-bold">-</span>
                <span className="text-lg font-black text-white tabular-nums">{m.awayScore}</span>
              </div>

              {/* Away */}
              <div className="flex items-center gap-2 flex-1">
                <span className="text-lg">{m.awayFlag}</span>
                <span className="text-sm font-semibold text-neutral-900">{m.awayTeam}</span>
              </div>
            </div>

            {/* Prediction row */}
            <div className="mt-3 flex items-center justify-between px-1">
              <div className="text-sm text-neutral-500">
                Your prediction: <span className="font-semibold text-neutral-700">{m.predictedHome} - {m.predictedAway}</span>
              </div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${RESULT_POINT_COLORS[m.result]}`}>
                {m.result === 'exact' && '✨ Exact Score'}
                {m.result === 'gd' && '✅ Correct GD'}
                {m.result === 'correct' && '👍 Correct Result'}
                {m.result === 'miss' && '❌ Miss'}
                {' · '}{m.pointsEarned} pts
              </span>
            </div>
          </div>
        </div>
      ))}

      {/* Summary card */}
      <div className="bg-white rounded-xl border border-neutral-100 shadow-sm p-5">
        <h3 className="text-sm font-bold text-neutral-900 mb-3">Your Summary</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Exact', count: MOCK_MATCHES.filter(m => m.result === 'exact').length, color: 'bg-amber-100 text-amber-800' },
            { label: 'Correct GD', count: MOCK_MATCHES.filter(m => m.result === 'gd').length, color: 'bg-emerald-100 text-emerald-800' },
            { label: 'Correct Result', count: MOCK_MATCHES.filter(m => m.result === 'correct').length, color: 'bg-blue-100 text-blue-800' },
            { label: 'Miss', count: MOCK_MATCHES.filter(m => m.result === 'miss').length, color: 'bg-red-100 text-red-800' },
          ].map((s) => (
            <div key={s.label} className={`rounded-lg px-3 py-2.5 text-center ${s.color}`}>
              <div className="text-xl font-black tabular-nums">{s.count}</div>
              <div className="text-[11px] font-semibold mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center justify-between">
          <span className="text-sm text-neutral-500">Total Points Earned</span>
          <span className="text-xl font-black text-neutral-900 tabular-nums">
            {MOCK_MATCHES.reduce((s, m) => s + m.pointsEarned, 0)} pts
          </span>
        </div>
      </div>
    </div>
  )
}


/* ═══════════════════════════════════════
   SCORING RULES TAB
   ═══════════════════════════════════════ */

function RulesTab() {
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-neutral-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-100">
          <h3 className="text-base font-bold text-neutral-900">How Points Work</h3>
          <p className="text-sm text-neutral-500 mt-1">Earn points for each match by predicting the correct score</p>
        </div>

        <div className="divide-y divide-neutral-100">
          {[
            {
              points: 5,
              label: 'Exact Score',
              desc: 'You predicted the exact final score',
              example: 'Predicted 2-1, Result 2-1',
              color: 'bg-amber-400',
              textColor: 'text-amber-800',
              bgColor: 'bg-amber-50',
            },
            {
              points: 3,
              label: 'Correct Goal Difference',
              desc: 'Correct result + correct goal difference',
              example: 'Predicted 2-0, Result 3-1',
              color: 'bg-emerald-500',
              textColor: 'text-emerald-800',
              bgColor: 'bg-emerald-50',
            },
            {
              points: 1,
              label: 'Correct Result',
              desc: 'You predicted the right winner (or draw)',
              example: 'Predicted 1-0, Result 3-2',
              color: 'bg-blue-500',
              textColor: 'text-blue-800',
              bgColor: 'bg-blue-50',
            },
            {
              points: 0,
              label: 'Miss',
              desc: 'Wrong result — better luck next match!',
              example: 'Predicted 1-0, Result 0-2',
              color: 'bg-red-400',
              textColor: 'text-red-800',
              bgColor: 'bg-red-50',
            },
          ].map((rule) => (
            <div key={rule.label} className="px-5 py-4 flex items-start gap-4">
              <div className="shrink-0 flex flex-col items-center gap-1">
                <div className={`w-3 h-3 rounded-full ${rule.color}`} />
                <span className="text-xl font-black text-neutral-900 tabular-nums">{rule.points}</span>
                <span className="text-[10px] font-semibold text-neutral-400 uppercase">pts</span>
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-bold text-neutral-900">{rule.label}</h4>
                <p className="text-sm text-neutral-500 mt-0.5">{rule.desc}</p>
                <div className={`mt-2 inline-block px-2.5 py-1 rounded-md text-xs font-medium ${rule.bgColor} ${rule.textColor}`}>
                  {rule.example}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Bonus points */}
      <div className="bg-white rounded-xl border border-neutral-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-neutral-100">
          <h3 className="text-base font-bold text-neutral-900">Bonus Points</h3>
          <p className="text-sm text-neutral-500 mt-1">Extra points for special achievements</p>
        </div>
        <div className="divide-y divide-neutral-100">
          {[
            { label: 'Group Stage Perfect Day', desc: 'All matches correct in a single day', points: '+10' },
            { label: 'Knockout Round Exact', desc: 'Exact score in knockout rounds', points: '+3 extra' },
            { label: 'Golden Boot Correct', desc: 'Correctly predict the top scorer', points: '+25' },
            { label: 'Champion Correct', desc: 'Correctly predict the tournament winner', points: '+50' },
          ].map((bonus) => (
            <div key={bonus.label} className="px-5 py-3.5 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-neutral-900">{bonus.label}</h4>
                <p className="text-xs text-neutral-500 mt-0.5">{bonus.desc}</p>
              </div>
              <span className="shrink-0 text-sm font-black text-emerald-600 tabular-nums">{bonus.points}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Deadline note */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
        <div className="flex items-start gap-3">
          <span className="text-xl shrink-0">⏰</span>
          <div>
            <h4 className="text-sm font-bold text-amber-900">Prediction Deadlines</h4>
            <p className="text-sm text-amber-800/70 mt-1">
              Predictions lock 1 hour before each match kicks off. You can update your predictions
              as many times as you want before the deadline.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}


/* ═══════════════════════════════════════
   SHARED COMPONENTS
   ═══════════════════════════════════════ */

function PodiumCard({ player, place }: { player: typeof PODIUM[0]; place: 1 | 2 | 3 }) {
  const config = {
    1: { medal: '🥇', bg: 'bg-amber-50', border: 'border-amber-200', nameColor: 'text-amber-800', size: 'px-5 py-4' },
    2: { medal: '🥈', bg: 'bg-neutral-50', border: 'border-neutral-200', nameColor: 'text-neutral-700', size: 'px-4 py-3' },
    3: { medal: '🥉', bg: 'bg-orange-50', border: 'border-orange-200', nameColor: 'text-orange-800', size: 'px-4 py-3' },
  }[place]

  return (
    <div className={`text-center rounded-xl border ${config.border} ${config.bg} ${config.size} min-w-[100px] sm:min-w-[150px]`}>
      <div className="text-xl sm:text-2xl mb-0.5">{config.medal}</div>
      <div className={`text-xs sm:text-sm font-bold ${config.nameColor} truncate`}>{player.name}</div>
      <div className="text-lg sm:text-xl font-black text-neutral-900 tabular-nums">{player.points}</div>
      <div className="text-[10px] text-neutral-400 uppercase tracking-wider">points</div>
      {player.awards?.map((a) => (
        <span key={a} className="inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-800">
          🏆 {a}
        </span>
      ))}
      <div className="flex items-center justify-center gap-0.5 mt-1.5">
        {player.form?.map((f, i) => (
          <span key={i} className={`w-2 h-2 rounded-full ${FORM_COLORS[f]}`} />
        ))}
      </div>
    </div>
  )
}

function Movement({ move }: { move: number }) {
  if (move === 0) return null
  return move > 0
    ? <span className="text-green-500 text-[10px] font-bold ml-1.5">▲{move}</span>
    : <span className="text-red-500 text-[10px] font-bold ml-1.5">▼{Math.abs(move)}</span>
}
