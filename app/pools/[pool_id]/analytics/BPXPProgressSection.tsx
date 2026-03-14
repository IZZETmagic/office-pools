'use client'

import { useState, useRef } from 'react'
import type { BPXPBreakdown, BPPoolComparison } from './bracketPickerXpSystem'
import type { EarnedBadge, BadgeDefinition, LevelDefinition } from './xpSystem'
import { LEVELS } from './xpSystem'
import { BP_BADGE_DEFINITIONS } from './bracketPickerXpSystem'
import type { BonusXPEvent } from './xpSystem'
import type { TeamData } from '../types'

// =============================================
// TYPES
// =============================================

type BPXPProgressSectionProps = {
  bpXpBreakdown: BPXPBreakdown
  teams: TeamData[]
  bpPoolComparison: BPPoolComparison | null
}

// =============================================
// STYLE CONSTANTS
// =============================================

const TIER_BORDER_COLORS: Record<string, string> = {
  Bronze: 'border-l-warning-500',
  Silver: 'border-l-neutral-400',
  Gold: 'border-l-accent-500',
  Platinum: 'border-l-accent-500',
}

const TIER_BG_COLORS: Record<string, string> = {
  Bronze: 'bg-warning-100 dark:bg-warning-900/20 text-warning-700 dark:text-warning-400',
  Silver: 'bg-neutral-200 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300',
  Gold: 'bg-accent-100 dark:bg-accent-900/20 text-accent-700 dark:text-accent-500',
  Platinum: 'bg-accent-100 dark:bg-accent-900/20 text-accent-700 dark:text-accent-500',
}

const RARITY_COLORS: Record<string, string> = {
  Common: 'text-neutral-500 dark:text-neutral-400',
  Uncommon: 'text-success-600 dark:text-success-400',
  Rare: 'text-primary-600 dark:text-primary-400',
  'Very Rare': 'text-accent-500 dark:text-accent-500',
  Legendary: 'text-warning-500 dark:text-warning-400',
}

// =============================================
// HERO CARD
// =============================================

function getLevelTierStyle(level: number): string {
  if (level >= 10) return 'bg-gradient-to-br from-accent-500 to-warning-500 text-white shimmer-effect'
  if (level >= 8) return 'bg-accent-100 dark:bg-accent-100 text-accent-700 dark:text-accent-500'
  if (level >= 6) return 'bg-warning-100 dark:bg-warning-100 text-warning-700 dark:text-warning-500'
  if (level >= 4) return 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-400'
  return 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
}

function BPXPHeroCard({ breakdown, onOpenRoadmap }: { breakdown: BPXPBreakdown; onOpenRoadmap: () => void }) {
  const { currentLevel, nextLevel, totalXP, levelProgress } = breakdown
  const isMaxLevel = !nextLevel

  return (
    <div
      className="bg-surface rounded-xl shadow dark:shadow-none border-2 border-accent-500/30 dark:border-accent-500/20 overflow-hidden cursor-pointer transition-all hover:border-accent-500/50 dark:hover:border-accent-500/40 active:scale-[0.995]"
      style={{ animation: 'fadeUp 0.3s ease 0s both' }}
      onClick={onOpenRoadmap}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpenRoadmap() }}
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-center gap-4 sm:gap-5 mb-5">
          <div className={`flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center ${getLevelTierStyle(currentLevel.level)}`}>
            <span className="text-2xl sm:text-3xl font-black">{currentLevel.level}</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="text-xl sm:text-2xl font-bold text-neutral-900 dark:text-white truncate">
                {currentLevel.name}
              </h3>
              {isMaxLevel && (
                <span className="flex-shrink-0 text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-accent-100 dark:bg-accent-100 text-accent-700 dark:text-accent-500">
                  MAX
                </span>
              )}
            </div>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {isMaxLevel
                ? `${totalXP.toLocaleString()} XP earned — legendary status achieved`
                : `${totalXP.toLocaleString()} XP — ${breakdown.xpToNextLevel.toLocaleString()} XP to ${nextLevel.name}`
              }
            </p>
          </div>

          <div className="flex-shrink-0 flex items-center gap-2">
            <div className="text-right hidden sm:block">
              <div className="text-2xl font-black text-accent-500">{totalXP.toLocaleString()}</div>
              <div className="text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">Total XP</div>
            </div>
            <svg className="w-5 h-5 text-neutral-300 dark:text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
              Level {currentLevel.level}
            </span>
            <span className="text-xs font-semibold text-neutral-600 dark:text-neutral-400">
              {isMaxLevel ? 'MAX LEVEL' : `Level ${nextLevel.level}`}
            </span>
          </div>
          <div className="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-3 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary-500 to-accent-500 origin-left"
              style={{
                width: `${Math.round(levelProgress * 100)}%`,
                animation: 'barGrow 0.8s ease 0.3s both',
              }}
            />
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-[10px] text-neutral-400">
              {currentLevel.xpRequired.toLocaleString()} XP
            </span>
            <span className="text-[10px] text-neutral-400">
              {isMaxLevel ? '' : `${nextLevel.xpRequired.toLocaleString()} XP`}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// =============================================
// BADGE GRID
// =============================================

function BadgeCard({ badge, earned, onSelect }: { badge: BadgeDefinition; earned: boolean; onSelect: () => void }) {
  return (
    <div className="group relative hover:z-10">
      <div
        className={`relative rounded-xl p-3 text-center transition-all cursor-pointer ${
          earned
            ? `bg-surface border-l-4 ${TIER_BORDER_COLORS[badge.tier]} border border-neutral-200 dark:border-neutral-700 shadow-sm dark:shadow-none hover:shadow-md dark:hover:border-neutral-600`
            : 'bg-neutral-100 dark:bg-neutral-400/90 border border-neutral-200 dark:border-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-300/90'
        } ${badge.tier === 'Platinum' && earned ? 'shimmer-effect' : ''}`}
        onClick={onSelect}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
      >
        <div className={`text-2xl sm:text-3xl mb-1.5 ${earned ? '' : 'grayscale opacity-50 dark:opacity-70'}`}>
          {badge.emoji}
        </div>
        <div className={`text-xs font-semibold mb-0.5 ${earned ? 'text-neutral-900 dark:text-white' : 'text-neutral-400 dark:text-neutral-600'}`}>
          {badge.name}
        </div>
        {earned ? (
          <div className="text-[10px] font-bold text-success-600 dark:text-success-400">
            +{badge.xpBonus} XP
          </div>
        ) : (
          <div className={`text-[10px] font-medium ${RARITY_COLORS[badge.rarity]}`}>
            {badge.rarity}
          </div>
        )}
        {!earned && (
          <div className="absolute top-1.5 right-1.5">
            <svg className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
          </div>
        )}
      </div>

      <div className="hidden sm:group-hover:block absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 px-3 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-700 text-white text-xs text-center shadow-lg pointer-events-none">
        <div className="font-semibold mb-0.5">{badge.name}</div>
        <div className="text-neutral-300">{badge.condition}</div>
        {earned ? (
          <div className="text-success-400 font-bold mt-1">✓ Earned · +{badge.xpBonus} XP</div>
        ) : (
          <div className="text-neutral-400 mt-1">🔒 Locked</div>
        )}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-900 dark:border-t-neutral-700" />
      </div>
    </div>
  )
}

function BadgeDetailModal({ badge, earned, onClose }: { badge: BadgeDefinition; earned: boolean; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="absolute inset-0 bg-black/50"
        style={{ animation: 'modal-overlay-fade 0.3s ease both' }}
      />
      <div
        className="relative w-full sm:max-w-xs bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl dark:border dark:border-border-default overflow-hidden"
        style={{ animation: 'modal-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:text-neutral-300 dark:hover:bg-neutral-800 transition-colors z-10"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="p-6 pt-8 text-center">
          <div className={`text-5xl mb-3 ${earned ? '' : 'grayscale opacity-40 dark:opacity-60'}`}>
            {badge.emoji}
          </div>
          <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-1.5">
            {badge.name}
          </h3>
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${TIER_BG_COLORS[badge.tier]}`}>
              {badge.tier}
            </span>
            <span className={`text-[10px] font-semibold ${RARITY_COLORS[badge.rarity]}`}>
              {badge.rarity}
            </span>
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-5">
            {badge.condition}
          </p>
          {earned ? (
            <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800">
              <svg className="w-4 h-4 text-success-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-semibold text-success-700 dark:text-success-300">Earned · +{badge.xpBonus} XP</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700">
              <svg className="w-4 h-4 text-neutral-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-medium text-neutral-500 dark:text-neutral-400">Locked · +{badge.xpBonus} XP</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function BPBadgeGrid({ earnedBadges }: { earnedBadges: EarnedBadge[] }) {
  const [selectedBadge, setSelectedBadge] = useState<{ def: BadgeDefinition; earned: boolean } | null>(null)
  const [activePage, setActivePage] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const earnedIds = new Set(earnedBadges.map(b => b.id))

  const badgePages = [
    BP_BADGE_DEFINITIONS.slice(0, 6),
    BP_BADGE_DEFINITIONS.slice(6, 11),
  ]

  const handleScroll = () => {
    if (!scrollRef.current) return
    const { scrollLeft, offsetWidth } = scrollRef.current
    const page = Math.round(scrollLeft / offsetWidth)
    setActivePage(page)
  }

  const goToPage = (page: number) => {
    if (!scrollRef.current) return
    scrollRef.current.scrollTo({
      left: page * scrollRef.current.offsetWidth,
      behavior: 'smooth',
    })
  }

  const renderBadge = (def: BadgeDefinition) => {
    const earned = earnedIds.has(def.id)
    return (
      <BadgeCard
        key={def.id}
        badge={def}
        earned={earned}
        onSelect={() => setSelectedBadge({ def, earned })}
      />
    )
  }

  return (
    <>
      <div
        className="bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default"
        style={{ animation: 'fadeUp 0.3s ease 0.1s both' }}
      >
        <div className="px-4 sm:px-5 py-3 border-b border-neutral-200 dark:border-neutral-700 rounded-t-xl">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
              <span>🏅</span>
              <span>Bracket Badges</span>
            </h4>
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              {earnedBadges.length} / {BP_BADGE_DEFINITIONS.length} earned
            </span>
          </div>
        </div>
        <div className="p-4 sm:p-5">
          {/* Mobile: swipeable carousel */}
          <div className="sm:hidden">
            <div
              ref={scrollRef}
              className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar"
              onScroll={handleScroll}
            >
              {badgePages.map((page, pageIdx) => (
                <div key={pageIdx} className="min-w-full snap-start">
                  <div className="grid grid-cols-3 gap-2.5">
                    {page.map(renderBadge)}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-center gap-2 mt-3">
              {badgePages.map((_, idx) => (
                <button
                  key={idx}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    activePage === idx ? 'bg-accent-500' : 'bg-neutral-300 dark:bg-neutral-600'
                  }`}
                  onClick={() => goToPage(idx)}
                  aria-label={`Badge page ${idx + 1}`}
                />
              ))}
            </div>
          </div>

          {/* Desktop: full grid */}
          <div className="hidden sm:block">
            <div className="grid sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
              {BP_BADGE_DEFINITIONS.map(renderBadge)}
            </div>
          </div>
        </div>
      </div>

      {selectedBadge && (
        <BadgeDetailModal
          badge={selectedBadge.def}
          earned={selectedBadge.earned}
          onClose={() => setSelectedBadge(null)}
        />
      )}
    </>
  )
}

// =============================================
// YOU VS THE POOL
// =============================================

function BattleBar({ label, you, crowd, animDelay }: { label: string; you: number; crowd: number; animDelay: number }) {
  const total = you + crowd
  const youPct = total > 0 ? (you / total) * 100 : 50
  const crowdPct = total > 0 ? (crowd / total) * 100 : 50

  return (
    <div>
      <div className="flex items-center justify-between mb-[5px]">
        <span className="text-[11px] text-neutral-500 dark:text-[#94a3b8]">{label}</span>
        <span className="text-[10px] font-mono text-neutral-400 dark:text-[#64748b]">
          {you} vs {crowd}
        </span>
      </div>
      <div className="relative h-2 rounded bg-neutral-100 dark:bg-[#0f1525]">
        <div
          className="absolute top-0 left-0 h-full rounded-l"
          style={{
            width: `calc(${youPct}% - 1px)`,
            background: 'linear-gradient(to right, #3b82f6, #60a5fa)',
            boxShadow: '0 0 8px rgba(59,130,246,0.25)',
            animation: `barGrow 1.2s cubic-bezier(0.4, 0, 0.2, 1) ${animDelay}s both`,
            transformOrigin: 'left',
          }}
        />
        <div
          className="absolute top-0 right-0 h-full rounded-r"
          style={{
            width: `calc(${crowdPct}% - 1px)`,
            background: 'linear-gradient(to right, rgba(139,92,246,0.67), #8b5cf6)',
            animation: `barGrow 1.2s cubic-bezier(0.4, 0, 0.2, 1) ${animDelay}s both`,
            transformOrigin: 'right',
          }}
        />
      </div>
    </div>
  )
}

function BPYouVsPoolSection({ comparison }: { comparison: BPPoolComparison }) {
  const {
    userOverallAccuracy, poolAvgOverallAccuracy,
    userGroupCorrect, userGroupTotal, poolAvgGroupCorrect,
    userKnockoutCorrect, userKnockoutTotal, poolAvgKnockoutCorrect,
    userThirdCorrect, userThirdTotal, poolAvgThirdCorrect,
    consensusCount, contrarianCount, contrarianWins,
    poolAvgConsensus, poolAvgContrarian, poolAvgContrarianWins,
  } = comparison

  const accuracyDiff = userOverallAccuracy - poolAvgOverallAccuracy
  const isOutperforming = accuracyDiff > 0

  const contrarianWinPct = contrarianCount > 0 ? Math.round((contrarianWins / contrarianCount) * 100) : 0
  const crowdContrarianWinPct = poolAvgContrarian > 0 ? Math.round((poolAvgContrarianWins / poolAvgContrarian) * 100) : 0
  const contrarianAdv = contrarianWinPct - crowdContrarianWinPct

  // Category accuracy bars
  const categoryBars: { label: string; you: number; crowd: number }[] = []
  if (userGroupTotal > 0) categoryBars.push({ label: 'Group Positions', you: userGroupCorrect, crowd: Math.round(poolAvgGroupCorrect) })
  if (userKnockoutTotal > 0) categoryBars.push({ label: 'Knockout Picks', you: userKnockoutCorrect, crowd: Math.round(poolAvgKnockoutCorrect) })
  if (userThirdTotal > 0) categoryBars.push({ label: 'Third Place Table', you: userThirdCorrect, crowd: Math.round(poolAvgThirdCorrect) })

  // Consensus/Contrarian bars (only with knockout data)
  const showContrarianBars = consensusCount + contrarianCount > 0

  return (
    <div
      className="relative overflow-hidden bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default"
      style={{ animation: 'fadeUp 0.3s ease 0.25s both' }}
    >
      {/* Ambient corner glows */}
      <div
        className="absolute top-[-20px] right-[-20px] w-20 h-20 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.25), transparent 70%)' }}
      />
      <div
        className="absolute top-[-20px] left-[-20px] w-20 h-20 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.2), transparent 70%)' }}
      />

      <div className="relative z-10 p-[18px]">
        {/* Heading */}
        <h4 className="text-[15px] font-bold text-neutral-900 dark:text-[#f1f5f9] mb-3">
          You vs The Pool
        </h4>

        {/* VS Faceoff */}
        <div className="flex items-center justify-around mb-8">
          <div className="text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.8px] mb-1" style={{ color: '#3b82f6' }}>
              You
            </div>
            <div className="text-[32px] font-extrabold leading-none" style={{ color: '#3b82f6' }}>
              {userOverallAccuracy}%
            </div>
          </div>

          <div
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 border border-neutral-200 dark:border-[#1c2333]"
            style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(139,92,246,0.2))' }}
          >
            <span className="text-[11px] font-extrabold" style={{ color: '#64748b' }}>VS</span>
          </div>

          <div className="text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.8px] mb-1" style={{ color: '#8b5cf6' }}>
              Pool Avg
            </div>
            <div className="text-[32px] font-extrabold leading-none" style={{ color: '#94a3b8' }}>
              {poolAvgOverallAccuracy}%
            </div>
          </div>
        </div>

        {/* Category Accuracy Bars */}
        {categoryBars.length > 0 && (
          <div className={`space-y-5 ${showContrarianBars ? 'mb-6' : ''}`}>
            {categoryBars.map((bar, idx) => (
              <BattleBar key={bar.label} label={bar.label} you={bar.you} crowd={bar.crowd} animDelay={0.3 + idx * 0.1} />
            ))}
          </div>
        )}

        {/* Consensus/Contrarian Bars */}
        {showContrarianBars && (
          <>
            <div className="text-[10px] font-bold uppercase tracking-[0.8px] text-neutral-400 dark:text-[#64748b] mb-3">
              Bracket Boldness
            </div>
            <div className="space-y-5">
              <BattleBar label="Consensus Picks" you={consensusCount} crowd={poolAvgConsensus} animDelay={0.6} />
              <BattleBar label="Contrarian Picks" you={contrarianCount} crowd={poolAvgContrarian} animDelay={0.7} />
              <BattleBar label="Contrarian Wins" you={contrarianWins} crowd={poolAvgContrarianWins} animDelay={0.8} />
            </div>
          </>
        )}

        {/* Performance Callout */}
        <div className="mt-7">
          {isOutperforming ? (
            <div
              className="flex items-start gap-2 rounded-lg"
              style={{
                background: 'linear-gradient(135deg, rgba(34,197,94,0.1), transparent)',
                border: '1px solid rgba(34,197,94,0.13)',
                padding: '10px 14px',
              }}
            >
              <span className="text-[18px] leading-none flex-shrink-0">📈</span>
              <div>
                <div className="text-xs font-bold" style={{ color: '#22c55e' }}>
                  Outperforming the pool by {accuracyDiff}%
                </div>
                {contrarianCount > 0 && contrarianAdv > 0 && (
                  <div className="text-[10px] mt-px" style={{ color: '#64748b' }}>
                    Your contrarian win rate is {contrarianAdv}% higher than average
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div
              className="flex items-start gap-2 rounded-lg"
              style={{
                background: 'linear-gradient(135deg, rgba(59,130,246,0.1), transparent)',
                border: '1px solid rgba(59,130,246,0.13)',
                padding: '10px 14px',
              }}
            >
              <span className="text-[18px] leading-none flex-shrink-0">🎯</span>
              <div>
                <div className="text-xs font-bold" style={{ color: '#3b82f6' }}>
                  {accuracyDiff === 0
                    ? 'Neck and neck with the pool'
                    : 'The pool has a slight edge — time to trust your gut?'}
                </div>
                <div className="text-[10px] mt-px" style={{ color: '#64748b' }}>
                  {accuracyDiff === 0
                    ? "You\u2019re matching the pool average perfectly"
                    : `Only ${Math.abs(accuracyDiff)}% behind — one bold call could flip it`}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// =============================================
// POOL-WIDE BRACKET STATS
// =============================================

function BPPoolWideStatsSection({ comparison, teams }: { comparison: BPPoolComparison; teams: TeamData[] }) {
  const { totalEntries, totalScoredPicks, mostPopularChampion, poolAvgOverallAccuracy } = comparison
  const teamLookup = new Map(teams.map(t => [t.team_id, t]))

  return (
    <div className="bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default">
      <div className="p-[18px]">
        <h4 className="text-[15px] font-bold text-neutral-900 dark:text-[#f1f5f9] mb-3">
          Pool-Wide Stats
        </h4>

        {/* Summary Stats Row */}
        <div className="flex items-center justify-around mb-[18px]">
          <div className="text-center">
            <div className="text-2xl font-extrabold text-neutral-900 dark:text-[#f1f5f9]">
              {poolAvgOverallAccuracy}%
            </div>
            <div className="text-[10px] mt-[2px]" style={{ color: '#64748b' }}>
              Avg Pool Accuracy
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-extrabold text-neutral-900 dark:text-[#f1f5f9]">
              {totalEntries}
            </div>
            <div className="text-[10px] mt-[2px]" style={{ color: '#64748b' }}>
              Competitors
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-extrabold text-neutral-900 dark:text-[#f1f5f9]">
              {totalScoredPicks}
            </div>
            <div className="text-[10px] mt-[2px]" style={{ color: '#64748b' }}>
              Picks Scored
            </div>
          </div>
        </div>

        {/* Most Popular Champion */}
        {mostPopularChampion && (() => {
          const team = teamLookup.get(mostPopularChampion.team_id)
          return (
            <div className="border border-neutral-200 dark:border-neutral-700 rounded-lg p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.8px] text-neutral-400 dark:text-[#64748b] mb-2">
                Pool&apos;s Favorite Champion
              </div>
              <div className="flex items-center gap-3">
                {team?.flag_url && (
                  <img src={team.flag_url} alt="" className="w-8 h-6 object-cover rounded-sm flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-neutral-900 dark:text-white truncate">
                    {team?.country_name ?? 'Unknown'}
                  </div>
                  <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
                    {Math.round(mostPopularChampion.pct * 100)}% of brackets
                  </div>
                </div>
                <span className="text-xl flex-shrink-0">👑</span>
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

// =============================================
// BONUS EVENTS SECTION
// =============================================

function BonusEventsSection({ bonusEvents }: { bonusEvents: BonusXPEvent[] }) {
  if (bonusEvents.length === 0) return null

  const totalBonusXP = bonusEvents.reduce((sum, e) => sum + e.xp, 0)

  return (
    <div
      className="bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default"
      style={{ animation: 'fadeUp 0.3s ease 0.35s both' }}
    >
      <div className="px-4 sm:px-5 py-3 border-b border-neutral-200 dark:border-neutral-700 rounded-t-xl">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
            <span>🎯</span>
            <span>Bonus Events</span>
          </h4>
          <span className="text-xs font-bold text-accent-500">{totalBonusXP.toLocaleString()} XP</span>
        </div>
      </div>
      <div className="p-4 sm:p-5 space-y-2">
        {bonusEvents.map((event, idx) => (
          <div
            key={`${event.type}-${idx}`}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gradient-to-r from-accent-50 dark:from-accent-900/10 to-transparent border border-accent-200/50 dark:border-accent-800/20"
          >
            <span className="text-xl flex-shrink-0">{event.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-neutral-900 dark:text-white">{event.label}</div>
              {event.detail && (
                <div className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate">{event.detail}</div>
              )}
            </div>
            <span className="text-xs font-bold text-accent-500 flex-shrink-0">+{event.xp} XP</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// =============================================
// LEVEL ROADMAP MODAL
// =============================================

function BPLevelRoadmapModal({ breakdown, onClose }: { breakdown: BPXPBreakdown; onClose: () => void }) {
  const currentLevel = breakdown.currentLevel.level

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="absolute inset-0 bg-black/50"
        style={{ animation: 'modal-overlay-fade 0.3s ease both' }}
      />
      <div
        className="relative w-full sm:max-w-md bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl dark:border dark:border-border-default overflow-hidden max-h-[85vh] flex flex-col"
        style={{ animation: 'modal-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 dark:border-neutral-700 flex-shrink-0">
          <h3 className="text-lg font-bold text-neutral-900 dark:text-white flex items-center gap-2">
            <span>🗺️</span>
            <span>Level Roadmap</span>
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5">
          <div className="space-y-2">
            {LEVELS.map((level) => {
              const isReached = breakdown.totalXP >= level.xpRequired
              const isCurrent = level.level === currentLevel

              return (
                <div
                  key={level.level}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                    isCurrent
                      ? 'bg-accent-50 dark:bg-accent-50 border border-accent-500/30'
                      : isReached
                        ? 'bg-success-50/50 dark:bg-success-900/10'
                        : 'bg-neutral-50 dark:bg-neutral-800/30'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    isReached
                      ? 'bg-success-500 text-white'
                      : 'bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400'
                  }`}>
                    {isReached ? (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      level.level
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold ${
                      isCurrent ? 'text-accent-700 dark:text-accent-500'
                        : isReached ? 'text-neutral-900 dark:text-white'
                          : 'text-neutral-500 dark:text-neutral-600'
                    }`}>
                      {level.name}
                    </div>
                    {level.badge && (
                      <div className="text-[10px] text-neutral-400 dark:text-neutral-600">
                        Unlocks: {level.badge}
                      </div>
                    )}
                  </div>
                  <span className={`text-xs font-medium tabular-nums flex-shrink-0 ${
                    isCurrent ? 'text-accent-700 dark:text-accent-500'
                      : isReached ? 'text-success-600 dark:text-success-400'
                        : 'text-neutral-400 dark:text-neutral-600'
                  }`}>
                    {level.xpRequired.toLocaleString()} XP
                  </span>
                </div>
              )
            })}
          </div>

          <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700 text-center">
            <div className="text-2xl font-black text-accent-500">{breakdown.totalXP.toLocaleString()} XP</div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              {breakdown.nextLevel
                ? `${breakdown.xpToNextLevel.toLocaleString()} XP to ${breakdown.nextLevel.name}`
                : 'Maximum level reached'
              }
            </div>

            <div className="flex flex-wrap justify-center gap-2 mt-3">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
                <span className="text-xs font-medium text-primary-600 dark:text-primary-400">Group XP</span>
                <span className="text-xs font-bold text-primary-700 dark:text-primary-300">{(breakdown.totalGroupBaseXP + breakdown.totalGroupBonusXP).toLocaleString()}</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800">
                <span className="text-xs font-medium text-success-600 dark:text-success-400">Knockout XP</span>
                <span className="text-xs font-bold text-success-700 dark:text-success-300">{(breakdown.totalKnockoutBaseXP + breakdown.totalKnockoutBonusXP).toLocaleString()}</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800">
                <span className="text-xs font-medium text-warning-600 dark:text-warning-400">Badge XP</span>
                <span className="text-xs font-bold text-warning-700 dark:text-warning-300">{breakdown.totalBadgeXP.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// =============================================
// MAIN COMPONENT
// =============================================

export function BPXPProgressSection({ bpXpBreakdown, teams, bpPoolComparison }: BPXPProgressSectionProps) {
  const [showRoadmap, setShowRoadmap] = useState(false)

  return (
    <div className="space-y-4">
      {/* Hero Card */}
      <BPXPHeroCard breakdown={bpXpBreakdown} onOpenRoadmap={() => setShowRoadmap(true)} />

      {/* Badge Grid */}
      <BPBadgeGrid earnedBadges={bpXpBreakdown.earnedBadges} />

      {/* You vs The Pool + Pool Stats (side by side on desktop) */}
      {bpPoolComparison && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <BPYouVsPoolSection comparison={bpPoolComparison} />
          <BPPoolWideStatsSection comparison={bpPoolComparison} teams={teams} />
        </div>
      )}

      {/* Bonus Events */}
      <BonusEventsSection bonusEvents={bpXpBreakdown.bonusEvents} />

      {/* Level Roadmap Modal */}
      {showRoadmap && (
        <BPLevelRoadmapModal breakdown={bpXpBreakdown} onClose={() => setShowRoadmap(false)} />
      )}
    </div>
  )
}
