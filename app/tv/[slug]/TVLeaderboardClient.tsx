'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { LeaderboardPlayer } from '@/app/play/[slug]/getLeaderboard'

const ROWS_PER_PAGE = 8
const FIRST_PAGE_MS = 12000
const OTHER_PAGE_MS = 7000

type PoolConfig = {
  name: string
  brandName: string
  logoUrl: string
  primaryColor: string
  accentColor: string
  memberCount: number
  mode: string
  slug: string
}

export function TVLeaderboardClient({
  players,
  memberCount,
  poolConfig,
  isMock,
}: {
  players: LeaderboardPlayer[]
  memberCount: number
  poolConfig: PoolConfig
  isMock: boolean
}) {
  const podium = players.slice(0, 3)
  const tablePlayers = players.slice(3)

  const totalPages = Math.max(1, Math.ceil(tablePlayers.length / ROWS_PER_PAGE))
  const [currentPage, setCurrentPage] = useState(0)
  const [transitioning, setTransitioning] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    ;(async () => {
      const QRCode = (await import('qrcode')).default
      const url = await QRCode.toDataURL(`${window.location.origin}/play/${poolConfig.slug}`, {
        width: 80,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
      })
      setQrDataUrl(url)
    })()
  }, [poolConfig.slug])

  const advance = useCallback(() => {
    if (totalPages <= 1) return
    setTransitioning(true)
    setTimeout(() => {
      setCurrentPage(prev => (prev + 1) % totalPages)
      setTransitioning(false)
    }, 400)
  }, [totalPages])

  useEffect(() => {
    if (totalPages <= 1) return
    const duration = currentPage === 0 ? FIRST_PAGE_MS : OTHER_PAGE_MS
    timerRef.current = setTimeout(advance, duration)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [currentPage, advance, totalPages])

  useEffect(() => {
    const interval = setInterval(() => {
      window.location.reload()
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  const pageStart = currentPage * ROWS_PER_PAGE
  const pageEnd = Math.min(pageStart + ROWS_PER_PAGE, tablePlayers.length)
  const visiblePlayers = tablePlayers.slice(pageStart, pageEnd)

  const isEmpty = players.length === 0

  return (
    <>
      <style>{`
        @keyframes tv-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        @keyframes tv-fadeSlide { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .tv-live-dot { animation: tv-pulse 1.5s ease-in-out infinite; }
        .tv-row-enter { animation: tv-fadeSlide 0.4s ease-out both; }
      `}</style>

      <div
        className="min-h-screen overflow-hidden text-white font-[family-name:var(--font-geist-sans)]"
        style={{ backgroundColor: '#0a0f0a' }}
      >
        <div className="max-w-[1200px] mx-auto px-6 sm:px-10 py-6 h-screen flex flex-col">

          {/* Header */}
          <div className="flex items-center justify-between mb-5 pb-4 border-b border-white/[0.08]">
            <div className="flex items-center gap-5">
              {poolConfig.logoUrl ? (
                <img
                  src={poolConfig.logoUrl}
                  alt={poolConfig.brandName}
                  className="w-14 h-14 rounded-xl object-cover"
                  style={{ backgroundColor: poolConfig.primaryColor }}
                />
              ) : (
                <div className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-black" style={{ backgroundColor: poolConfig.primaryColor }}>
                  {poolConfig.brandName.charAt(0)}
                </div>
              )}
              <div>
                <h1 className="text-2xl font-black tracking-tight">{poolConfig.name}</h1>
                <p className="text-sm text-white/40 font-medium mt-0.5">{memberCount} player{memberCount !== 1 ? 's' : ''} &middot; {poolConfig.mode}</p>
              </div>
            </div>
            <div className="text-right hidden sm:block">
              <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider"
                style={isMock
                  ? { backgroundColor: 'rgba(234,179,8,0.15)', color: '#eab308' }
                  : { backgroundColor: 'rgba(239,68,68,0.15)', color: '#ef4444' }
                }>
                {!isMock && <span className="w-2 h-2 rounded-full bg-red-500 tv-live-dot" />}
                {isMock ? 'Preview' : 'Live'}
              </div>
            </div>
          </div>

          {isEmpty ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="text-5xl mb-4">&#9917;</div>
                <h2 className="text-xl font-bold text-white/60">No entries yet</h2>
                <p className="text-sm text-white/30 mt-2">Scan the QR code to join the pool</p>
              </div>
            </div>
          ) : (
            <>
              {/* Podium */}
              {podium.length >= 3 && (
                <div className="flex justify-center items-end gap-3 sm:gap-4 mb-5">
                  <PodiumCard player={podium[1]} place={2} />
                  <PodiumCard player={podium[0]} place={1} />
                  <PodiumCard player={podium[2]} place={3} />
                </div>
              )}

              {/* Page dots */}
              {totalPages > 1 && (
                <div className="flex justify-center gap-1.5 mb-3">
                  {Array.from({ length: totalPages }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-2 rounded-full transition-all duration-300 ${
                        i === currentPage ? 'w-6 bg-white/60' : 'w-2 bg-white/15'
                      }`}
                    />
                  ))}
                </div>
              )}

              {/* Table */}
              {visiblePlayers.length > 0 && (
                <div className="flex-1 overflow-hidden rounded-xl border border-white/[0.06] relative" style={{ backgroundColor: 'rgba(255,255,255,0.02)' }}>
                  <div
                    className="absolute inset-0 z-10 flex items-center justify-center transition-opacity duration-300 pointer-events-none"
                    style={{ backgroundColor: 'rgba(10,15,10,0.6)', opacity: transitioning ? 1 : 0 }}
                  />
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-white/[0.06]" style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
                        <th className="w-14 text-center px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-white/30">#</th>
                        <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-white/30">Player</th>
                        <th className="text-center px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-white/30 hidden sm:table-cell">Exact</th>
                        <th className="text-center px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-white/30 hidden sm:table-cell">Correct</th>
                        <th className="text-center px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-white/30 hidden sm:table-cell">Bonus</th>
                        <th className="text-right px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-white/30">Points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiblePlayers.map((p, i) => (
                        <tr
                          key={`${currentPage}-${p.rank}`}
                          className={`tv-row-enter border-b border-white/[0.04] ${Math.abs(p.move) >= 3 ? 'bg-green-500/[0.05]' : ''}`}
                          style={{ animationDelay: `${i * 50}ms` }}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-extrabold text-white/30 w-7 text-center tabular-nums">{p.rank}</span>
                              {p.move > 0 && <span className="text-green-500 text-[11px] font-bold leading-none">&#9650;{p.move}</span>}
                              {p.move < 0 && <span className="text-red-500 text-[11px] font-bold leading-none">&#9660;{Math.abs(p.move)}</span>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-[15px] font-bold text-white">{p.name}</td>
                          <td className="text-center px-4 py-3 text-sm text-white/50 tabular-nums hidden sm:table-cell">{p.exact}</td>
                          <td className="text-center px-4 py-3 text-sm text-white/50 tabular-nums hidden sm:table-cell">{p.correct}</td>
                          <td className="text-center px-4 py-3 text-sm text-white/50 tabular-nums hidden sm:table-cell">{p.bonus}</td>
                          <td className="text-right px-4 py-3 text-lg font-extrabold tabular-nums">{p.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {tablePlayers.length > 0 && (
                <p className="text-center text-[11px] text-white/20 uppercase tracking-wider font-semibold mt-2">
                  Showing {pageStart + 4}&ndash;{pageEnd + 3} of {memberCount}
                </p>
              )}
            </>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/[0.06]">
            <div className="flex items-center gap-2 text-sm text-white/30">
              &#9917; Powered by <span className="font-bold text-white/50">Sport Pool</span>
            </div>
            <div className="flex items-center gap-3 px-4 py-2 rounded-xl border border-white/[0.08]" style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="QR code" width={40} height={40} className="rounded" />
              ) : (
                <div className="w-10 h-10 bg-white rounded flex items-center justify-center text-[8px] font-bold text-black">QR</div>
              )}
              <div>
                <p className="text-sm text-white/50 font-semibold">Scan to join the pool</p>
                <p className="text-[11px] text-white/25">sportpool.io/play/{poolConfig.slug}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function PodiumCard({ player, place }: { player: LeaderboardPlayer; place: 1 | 2 | 3 }) {
  const config = {
    1: {
      medal: '\u{1F947}',
      bg: 'rgba(234,179,8,0.15), rgba(234,179,8,0.05)',
      border: 'rgba(234,179,8,0.2)',
      nameColor: '#eab308',
      pointsColor: '#facc15',
      padding: 'px-6 sm:px-8 py-5 sm:py-6',
      minWidth: 'min-w-[140px] sm:min-w-[220px]',
      pointsSize: 'text-3xl sm:text-4xl',
    },
    2: {
      medal: '\u{1F948}',
      bg: 'rgba(156,163,175,0.12), rgba(156,163,175,0.04)',
      border: 'rgba(156,163,175,0.15)',
      nameColor: '#9ca3af',
      pointsColor: '#d1d5db',
      padding: 'px-5 sm:px-6 py-4 sm:py-5',
      minWidth: 'min-w-[120px] sm:min-w-[180px]',
      pointsSize: 'text-2xl sm:text-3xl',
    },
    3: {
      medal: '\u{1F949}',
      bg: 'rgba(180,120,60,0.12), rgba(180,120,60,0.04)',
      border: 'rgba(180,120,60,0.15)',
      nameColor: '#b4783c',
      pointsColor: '#d4956a',
      padding: 'px-5 sm:px-6 py-4 sm:py-5',
      minWidth: 'min-w-[120px] sm:min-w-[180px]',
      pointsSize: 'text-2xl sm:text-3xl',
    },
  }[place]

  return (
    <div
      className={`text-center rounded-2xl ${config.padding} ${config.minWidth}`}
      style={{
        background: `linear-gradient(135deg, ${config.bg})`,
        border: `1px solid ${config.border}`,
      }}
    >
      <div className="text-2xl sm:text-3xl mb-1">{config.medal}</div>
      <div className="text-base sm:text-lg font-extrabold mb-0.5" style={{ color: config.nameColor }}>
        {player.name}
      </div>
      <div className={`${config.pointsSize} font-black tracking-tight`} style={{ color: config.pointsColor }}>
        {player.points}
      </div>
      <div className="text-[10px] text-white/30 uppercase tracking-wider mt-0.5">points</div>
    </div>
  )
}
