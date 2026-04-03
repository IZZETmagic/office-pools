'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { POOL_INFO, PODIUM, TABLE_PLAYERS, FORM_COLORS } from './mockData'

const TOP_8 = [...PODIUM, ...TABLE_PLAYERS.slice(0, 5)]

export default function PlayDemoPage() {
  const router = useRouter()
  const { showToast } = useToast()

  // Countdown to World Cup kickoff: June 11, 2026 at 12:00 ET (16:00 UTC)
  const KICKOFF = new Date('2026-06-11T16:00:00Z').getTime()
  const [timeLeft, setTimeLeft] = useState(() => {
    const diff = Math.max(0, KICKOFF - Date.now())
    return {
      days: Math.floor(diff / (1000 * 60 * 60 * 24)),
      hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
      minutes: Math.floor((diff / (1000 * 60)) % 60),
      seconds: Math.floor((diff / 1000) % 60),
    }
  })

  useEffect(() => {
    const timer = setInterval(() => {
      const diff = Math.max(0, KICKOFF - Date.now())
      setTimeLeft({
        days: Math.floor(diff / (1000 * 60 * 60 * 24)),
        hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
        minutes: Math.floor((diff / (1000 * 60)) % 60),
        seconds: Math.floor((diff / 1000) % 60),
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [KICKOFF])

  const handleJoin = () => {
    router.push('/play/demo/join')
  }

  return (
    <div className="min-h-screen bg-white">

      {/* ═══════ NAV ═══════ */}
      <nav className="sticky top-0 z-50 border-b border-neutral-100 bg-white/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{POOL_INFO.logoEmoji}</span>
            <span className="font-bold text-lg text-neutral-900">{POOL_INFO.barName}</span>
          </div>
          <div className="hidden sm:flex items-center gap-6 text-sm font-medium text-neutral-500">
            <a href="#how-it-works" className="hover:text-neutral-900 transition-colors">How It Works</a>
            <a href="#leaderboard" className="hover:text-neutral-900 transition-colors">Leaderboard</a>
            <a href="#prizes" className="hover:text-neutral-900 transition-colors">Prizes</a>
          </div>
          <button
            onClick={handleJoin}
            className="px-4 py-2 rounded-lg text-white text-sm font-bold transition-opacity hover:opacity-90"
            style={{ backgroundColor: POOL_INFO.accentColor }}
          >
            Join Pool
          </button>
        </div>
      </nav>

      {/* ═══════ HERO ═══════ */}
      <section className="relative overflow-hidden text-white" style={{ background: POOL_INFO.primaryGradient }}>
        {/* Decorative */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="absolute -top-20 -left-20 w-72 h-72 bg-white/[0.03] rounded-full" />
          <div className="absolute top-1/3 -right-16 w-56 h-56 bg-white/[0.03] rounded-full" />
          <div className="absolute -bottom-12 left-1/4 w-40 h-40 bg-white/[0.03] rounded-full" />
        </div>

        <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 text-sm font-semibold mb-6" style={{ color: POOL_INFO.accentColorLight }}>
            ⚽ FIFA World Cup 2026
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight mb-4">
            {POOL_INFO.barName}&apos;s<br />
            <span style={{ color: POOL_INFO.accentColor }}>World Cup Pool</span>
          </h1>
          <p className="text-lg sm:text-xl text-white/60 max-w-2xl mx-auto mb-3">
            {POOL_INFO.tagline}
          </p>
          <p className="text-base text-white/40 max-w-xl mx-auto mb-8">
            Predict match scores, compete against fellow patrons, and watch the leaderboard
            live on our TVs. Free to join &mdash; bragging rights are priceless.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={handleJoin}
              className="inline-flex items-center justify-center px-8 py-3.5 rounded-xl text-white font-bold text-lg transition-colors"
              style={{ backgroundColor: POOL_INFO.accentColor }}
            >
              Join the Pool
            </button>
          </div>
          <p className="text-white/30 text-sm mt-4">{POOL_INFO.memberCount} players already joined</p>
        </div>
      </section>

      {/* ═══════ COUNTDOWN ═══════ */}
      <section className="py-8 sm:py-10">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-neutral-400 mb-3">World Cup kicks off in</p>
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
                    className="w-14 sm:w-16 h-14 sm:h-16 rounded-xl flex items-center justify-center font-extrabold text-xl sm:text-2xl tabular-nums"
                    style={{ backgroundColor: 'rgba(0,0,0,0.05)', borderBottom: `2px solid ${POOL_INFO.accentColor}`, color: POOL_INFO.primaryColor }}
                  >
                    {String(unit.value).padStart(2, '0')}
                  </div>
                  <span className="text-[10px] font-medium text-neutral-400 mt-1.5">{unit.label}</span>
                </div>
                {i < 3 && <span className="text-neutral-300 text-lg font-bold mb-4">:</span>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════ HOW IT WORKS ═══════ */}
      <section id="how-it-works" className="py-16 sm:py-20 bg-neutral-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-neutral-900 mb-3">How It Works</h2>
          <p className="text-center text-neutral-500 mb-12 max-w-xl mx-auto">Three simple steps to start competing</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              { step: 1, icon: '📱', title: 'Scan & Join', desc: 'Scan the QR code on our tables or ask the bartender for the join link. Create an account in 30 seconds.' },
              { step: 2, icon: '🎯', title: 'Predict Matches', desc: 'Predict the score for all 104 World Cup matches. Change your predictions anytime before the deadline.' },
              { step: 3, icon: '🏆', title: 'Win Prizes', desc: 'Earn points for correct predictions. Climb the leaderboard displayed live on our TVs and win prizes!' },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl text-3xl mb-4" style={{ backgroundColor: `${POOL_INFO.accentColor}20` }}>
                  {item.icon}
                </div>
                <div
                  className="inline-flex items-center justify-center w-7 h-7 rounded-full text-white text-sm font-bold -mt-12 -ml-4 relative z-10 mb-2"
                  style={{ backgroundColor: POOL_INFO.primaryColor }}
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

      {/* ═══════ LEADERBOARD PREVIEW ═══════ */}
      <section id="leaderboard" className="py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-neutral-900 mb-3">Live Leaderboard</h2>
          <p className="text-center text-neutral-500 mb-10 max-w-xl mx-auto">
            Displayed live on our TVs during every match. Here&apos;s a preview.
          </p>

          <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-neutral-100 overflow-hidden">
            {/* Mini table */}
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
                {TOP_8.map((p) => (
                  <tr key={p.rank} className="border-b border-neutral-50 last:border-b-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-bold text-neutral-400 w-6 text-center tabular-nums">{p.rank <= 3 ? ['', '\u{1F947}', '\u{1F948}', '\u{1F949}'][p.rank] : p.rank}</span>
                        {p.move > 0 && <span className="text-green-500 text-[10px] font-bold leading-none">&#9650;{p.move}</span>}
                        {p.move < 0 && <span className="text-red-500 text-[10px] font-bold leading-none">&#9660;{Math.abs(p.move)}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-semibold text-neutral-900">{p.name}</span>
                    </td>
                    <td className="text-center px-4 py-3 hidden sm:table-cell">
                      <div className="flex items-center justify-center gap-1">
                        {p.form?.map((f, i) => (
                          <span key={i} className={`w-2.5 h-2.5 rounded-full ${FORM_COLORS[f]}`} />
                        ))}
                      </div>
                    </td>
                    <td className="text-right px-4 py-3">
                      <span className="text-sm font-bold text-neutral-900 tabular-nums">{p.points}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Link to TV view */}
            <div className="px-6 py-4 bg-neutral-50 border-t border-neutral-100 flex items-center justify-between">
              <span className="text-sm text-neutral-500">
                Showing top 8 of {POOL_INFO.memberCount} players
              </span>
              <Link href="/tv/demo" className="text-sm font-semibold transition-colors" style={{ color: POOL_INFO.accentColor }}>
                See full TV leaderboard &rarr;
              </Link>
            </div>
          </div>

          {/* Form legend */}
          <div className="flex items-center justify-center gap-4 mt-4 text-xs text-neutral-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> Exact</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Correct GD</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Correct Result</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> Miss</span>
          </div>
        </div>
      </section>

      {/* ═══════ PRIZES ═══════ */}
      <section id="prizes" className="py-16 sm:py-20 bg-neutral-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-center text-neutral-900 mb-3">Prizes</h2>
          <p className="text-center text-neutral-500 mb-10 max-w-xl mx-auto">
            Compete for real prizes sponsored by {POOL_INFO.barName}
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
            {POOL_INFO.prizes.map((item) => (
              <div key={item.place} className={`bg-white rounded-2xl border ${item.border} p-6 text-center shadow-sm`}>
                <div className="text-4xl mb-3">{item.icon}</div>
                <div className={`inline-block px-3 py-1 rounded-full bg-gradient-to-r ${item.color} text-white text-xs font-bold mb-3`}>
                  {item.place}
                </div>
                <p className="text-lg font-bold text-neutral-900">{item.prize}</p>
              </div>
            ))}
          </div>

          <p className="text-center text-sm text-neutral-400 mt-6">
            Prizes are examples &mdash; your bar decides the rewards
          </p>
        </div>
      </section>

      {/* ═══════ JOIN / QR SECTION ═══════ */}
      <section id="join" className="py-16 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-lg mx-auto bg-white rounded-2xl shadow-md border border-neutral-100 overflow-hidden">
            {/* Header */}
            <div className="px-6 py-8 text-center text-white relative overflow-hidden" style={{ background: POOL_INFO.primaryGradient }}>
              <div className="absolute -top-10 -left-10 w-32 h-32 rounded-full bg-white/[0.04]" />
              <div className="absolute -bottom-8 -right-8 w-24 h-24 rounded-full bg-white/[0.04]" />
              <div className="relative z-10">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 text-3xl mb-3">{POOL_INFO.logoEmoji}</div>
                <h3 className="text-xl font-bold">Ready to Join?</h3>
                <p className="text-sm mt-1" style={{ color: `${POOL_INFO.accentColorLight}99` }}>Tap the button below to get started</p>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-6 space-y-5">
              {/* Stats */}
              <div className="flex items-center justify-center gap-4 text-sm text-neutral-500">
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128H5.228A2 2 0 013 17.208V15a4.002 4.002 0 014.464-3.978A3 3 0 0112 13.5a3 3 0 014.536-2.478A4.002 4.002 0 0121 15v2.208a2 2 0 01-2.228 1.92M15 19.128H9" /></svg>
                  {POOL_INFO.memberCount} members
                </span>
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" /></svg>
                  {POOL_INFO.mode}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ backgroundColor: `${POOL_INFO.accentColor}20`, color: POOL_INFO.accentColor }}>Open</span>
              </div>

              {/* Join button */}
              <button
                onClick={handleJoin}
                className="w-full py-3 rounded-xl text-white font-bold text-base transition-colors"
                style={{ backgroundColor: POOL_INFO.accentColor }}
              >
                Join Pool
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════ WHAT PATRONS SEE ═══════ */}
      <section className="py-16 sm:py-20 bg-neutral-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-neutral-900 mb-3">The Full Experience</h2>
          <p className="text-neutral-500 mb-8 max-w-xl mx-auto">
            See what your patrons get when they join the pool
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#prizes"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold transition-colors"
              style={{ backgroundColor: POOL_INFO.primaryColor }}
            >
              🏆 View Prizes
            </a>
            <Link
              href="/tv/demo"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-neutral-200 text-neutral-700 font-semibold hover:bg-neutral-100 transition-colors"
            >
              📺 View TV Leaderboard
            </Link>
          </div>
        </div>
      </section>

      {/* ═══════ FOOTER ═══════ */}
      <footer className="py-8 border-t border-neutral-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm text-neutral-400">
            ⚽ Powered by <span className="font-semibold text-neutral-500">Sport Pool</span> &middot; sportpool.io
          </p>
        </div>
      </footer>
    </div>
  )
}
