'use client'

import { useState, useRef, useMemo } from 'react'
import type { XPBreakdown, EarnedBadge, BadgeDefinition, MatchXP, XPTier } from './xpSystem'
import type { StreakData, CrowdMatch, PoolWideStats, PredictionResult } from './analyticsHelpers'
import type { PredictionData } from '../types'
import { BADGE_DEFINITIONS, LEVELS } from './xpSystem'

// =============================================
// TYPES
// =============================================

type XPProgressSectionProps = {
  xpBreakdown: XPBreakdown
  streaks: StreakData
  crowdData: CrowdMatch[]
  poolStats: PoolWideStats
  entryPredictions: PredictionData[]
  predictionResults: PredictionResult[]
}

// =============================================
// CONSTANTS
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

// Journey path node config per XP tier
const NODE_COLORS: Record<XPTier, { color: string; glowColor: string; label: string }> = {
  exact: { color: '#f59e0b', glowColor: 'rgba(245, 158, 11, 0.4)', label: 'Exact Score' },
  winner_gd: { color: '#22c55e', glowColor: 'rgba(34, 197, 94, 0.27)', label: 'Winner + GD' },
  winner: { color: '#3b82f6', glowColor: 'rgba(59, 130, 246, 0.27)', label: 'Correct Result' },
  submitted: { color: '#475569', glowColor: 'none', label: 'Miss' },
}

const JOURNEY_LEGEND: { label: string; color: string; glow: boolean }[] = [
  { label: 'Exact Score', color: '#f59e0b', glow: true },
  { label: 'Winner + GD', color: '#22c55e', glow: false },
  { label: 'Correct Result', color: '#3b82f6', glow: true },
  { label: 'Miss', color: '#475569', glow: false },
]

function hexWithAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// =============================================
// LEVEL HERO CARD
// =============================================

function getLevelTierStyle(level: number): string {
  if (level >= 10) return 'bg-gradient-to-br from-accent-500 to-warning-500 text-white shimmer-effect'
  if (level >= 8) return 'bg-accent-100 dark:bg-accent-100 text-accent-700 dark:text-accent-500'
  if (level >= 6) return 'bg-warning-100 dark:bg-warning-100 text-warning-700 dark:text-warning-500'
  if (level >= 4) return 'bg-primary-100 dark:bg-primary-900 text-primary-700 dark:text-primary-400'
  return 'bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300'
}

function XPHeroCard({ xpBreakdown, onOpenRoadmap }: { xpBreakdown: XPBreakdown; onOpenRoadmap: () => void }) {
  const { currentLevel, nextLevel, totalXP, levelProgress } = xpBreakdown
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
        {/* Top row: Level circle + info */}
        <div className="flex items-center gap-4 sm:gap-5 mb-5">
          {/* Level circle */}
          <div className={`flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center ${getLevelTierStyle(currentLevel.level)}`}>
            <span className="text-2xl sm:text-3xl font-black">{currentLevel.level}</span>
          </div>

          {/* Level info */}
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
                : `${totalXP.toLocaleString()} XP — ${xpBreakdown.xpToNextLevel.toLocaleString()} XP to ${nextLevel.name}`
              }
            </p>
          </div>

          {/* Total XP badge + chevron hint */}
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

        {/* XP Progress Bar */}
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

function BadgeCard({ badge, earned, onSelect }: { badge: EarnedBadge | null; earned: boolean; onSelect: () => void }) {
  const def = badge || BADGE_DEFINITIONS[0] // fallback, shouldn't happen
  if (!badge && !earned) return null

  return (
    <div className="group relative hover:z-10">
      <div
        className={`relative rounded-xl p-3 text-center transition-all cursor-pointer ${
          earned
            ? `bg-surface border-l-4 ${TIER_BORDER_COLORS[def.tier]} border border-neutral-200 dark:border-neutral-700 shadow-sm dark:shadow-none hover:shadow-md dark:hover:border-neutral-600`
            : 'bg-neutral-100 dark:bg-neutral-800/50 border border-neutral-200 dark:border-neutral-700 opacity-50 hover:opacity-70'
        } ${def.tier === 'Platinum' && earned ? 'shimmer-effect' : ''}`}
        onClick={onSelect}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect() } }}
      >
        {/* Emoji */}
        <div className={`text-2xl sm:text-3xl mb-1.5 ${earned ? '' : 'grayscale opacity-40'}`}>
          {def.emoji}
        </div>

        {/* Name */}
        <div className={`text-xs font-semibold mb-0.5 ${earned ? 'text-neutral-900 dark:text-white' : 'text-neutral-400 dark:text-neutral-500'}`}>
          {def.name}
        </div>

        {/* XP bonus */}
        {earned ? (
          <div className="text-[10px] font-bold text-success-600 dark:text-success-400">
            +{def.xpBonus} XP
          </div>
        ) : (
          <div className={`text-[10px] font-medium ${RARITY_COLORS[def.rarity]}`}>
            {def.rarity}
          </div>
        )}

        {/* Lock overlay for unearned */}
        {!earned && (
          <div className="absolute top-1.5 right-1.5">
            <svg className="w-3.5 h-3.5 text-neutral-400 dark:text-neutral-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
          </div>
        )}
      </div>

      {/* Desktop hover tooltip — hidden on mobile, shown on sm+ hover */}
      <div className="hidden sm:group-hover:block absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 px-3 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-700 text-white text-xs text-center shadow-lg pointer-events-none">
        <div className="font-semibold mb-0.5">{def.name}</div>
        <div className="text-neutral-300">{def.condition}</div>
        {earned ? (
          <div className="text-success-400 font-bold mt-1">✓ Earned · +{def.xpBonus} XP</div>
        ) : (
          <div className="text-neutral-400 mt-1">🔒 Locked</div>
        )}
        {/* Tooltip arrow */}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-neutral-900 dark:border-t-neutral-700" />
      </div>
    </div>
  )
}

function BadgeDetailModal({ badge, earned, onClose }: { badge: BadgeDefinition; earned: boolean; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        style={{ animation: 'modal-overlay-fade 0.3s ease both' }}
      />

      {/* Modal content */}
      <div
        className="relative w-full sm:max-w-xs bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl dark:border dark:border-border-default overflow-hidden"
        style={{ animation: 'modal-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 dark:hover:text-neutral-300 dark:hover:bg-neutral-800 transition-colors z-10"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="p-6 pt-8 text-center">
          {/* Large emoji */}
          <div className={`text-5xl mb-3 ${earned ? '' : 'grayscale opacity-40'}`}>
            {badge.emoji}
          </div>

          {/* Badge name */}
          <h3 className="text-lg font-bold text-neutral-900 dark:text-white mb-1.5">
            {badge.name}
          </h3>

          {/* Tier + Rarity pills */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${TIER_BG_COLORS[badge.tier]}`}>
              {badge.tier}
            </span>
            <span className={`text-[10px] font-semibold ${RARITY_COLORS[badge.rarity]}`}>
              {badge.rarity}
            </span>
          </div>

          {/* Condition description */}
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-5">
            {badge.condition}
          </p>

          {/* Status pill */}
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

function XPBadgeGrid({ earnedBadges }: { earnedBadges: EarnedBadge[] }) {
  const [selectedBadge, setSelectedBadge] = useState<{ def: BadgeDefinition; earned: boolean } | null>(null)
  const [activePage, setActivePage] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const earnedIds = new Set(earnedBadges.map(b => b.id))

  const badgePages = [
    BADGE_DEFINITIONS.slice(0, 6),
    BADGE_DEFINITIONS.slice(6, 12),
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
    const badge = earned
      ? earnedBadges.find(b => b.id === def.id)!
      : def as EarnedBadge
    return (
      <BadgeCard
        key={def.id}
        badge={badge}
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
              <span>Badges</span>
            </h4>
            <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              {earnedBadges.length} / {BADGE_DEFINITIONS.length} earned
            </span>
          </div>
        </div>
        <div className="p-4 sm:p-5">
          {/* Mobile: swipeable 2-page carousel (3×2 grid per page) */}
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

            {/* Page indicator dots */}
            <div className="flex justify-center gap-2 mt-3">
              {badgePages.map((_, idx) => (
                <button
                  key={idx}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    activePage === idx
                      ? 'bg-accent-500'
                      : 'bg-neutral-300 dark:bg-neutral-600'
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
              {BADGE_DEFINITIONS.map(renderBadge)}
            </div>
          </div>
        </div>
      </div>

      {/* Badge detail modal */}
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
// HOT & COLD STREAKS
// =============================================

function HotColdStreaksSection({ streaks }: { streaks: StreakData }) {
  const { currentStreak, longestHotStreak, longestColdStreak } = streaks
  const currentHot = currentStreak.type === 'hot' ? currentStreak.length : 0
  const currentCold = currentStreak.type === 'cold' ? currentStreak.length : 0
  const isCurrentlyCold = currentStreak.type === 'cold'

  if (longestHotStreak === 0 && longestColdStreak === 0) return null

  return (
    <div style={{ animation: 'fadeUp 0.3s ease 0.15s both' }}>
      <div className="flex gap-2.5">
        {/* ===== HOT STREAK CARD ===== */}
        <div className="flex-1 relative overflow-hidden bg-surface rounded-xl shadow dark:shadow-none border border-warning-500/20 py-[18px] px-[14px] text-center">
          {/* Background flame (decorative, 6% opacity) */}
          <div className="absolute bottom-[-25px] left-1/2 -translate-x-1/2 w-[120px] h-[120px] opacity-[0.06] pointer-events-none">
            <svg viewBox="0 0 24 24" fill="#f59e0b" className="w-full h-full">
              <path d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" />
            </svg>
          </div>

          <div className="relative z-10">
            {/* Animated flame icon */}
            <div className="mx-auto w-8 h-8 mb-2" style={{ animation: 'flameWave 1.8s ease-in-out infinite' }}>
              <svg viewBox="0 0 24 24" fill="#f59e0b" className="w-full h-full">
                <path d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03z" />
                <path d="M12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" opacity="0.7" />
              </svg>
            </div>

            {/* Label */}
            <div className="text-[10px] font-semibold uppercase tracking-[0.8px] text-neutral-500 dark:text-neutral-400 mb-1">
              Current Streak
            </div>

            {/* Number */}
            <div className="text-[38px] font-extrabold leading-none mb-3" style={{ color: '#f59e0b' }}>
              {currentHot}
            </div>

            {/* Progress pips (5 = "On Fire" milestone) */}
            <div className="flex items-center justify-center gap-[3px] mb-2">
              {Array.from({ length: 5 }, (_, i) => {
                const filled = i < Math.min(currentHot, 5)
                return (
                  <div
                    key={i}
                    className={`w-[22px] h-[5px] rounded-[3px] ${!filled ? 'bg-neutral-100 dark:bg-[#0f1525]' : ''}`}
                    style={filled ? {
                      background: 'linear-gradient(to right, #d97706, #f59e0b)',
                      boxShadow: '0 0 8px rgba(245, 158, 11, 0.25)',
                    } : undefined}
                  />
                )
              })}
            </div>

            {/* Personal best */}
            <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
              Personal best: <span className="font-bold" style={{ color: '#f59e0b' }}>{longestHotStreak}</span>
              {' '}— can you beat it? 🔥
            </div>
          </div>
        </div>

        {/* ===== COLD STREAK CARD ===== */}
        <div className="flex-1 relative overflow-hidden bg-surface rounded-xl shadow dark:shadow-none border border-neutral-200 dark:border-border-default py-[18px] px-[14px] text-center">
          {/* Background snowflake (decorative, 4% opacity) */}
          <div className="absolute bottom-[-25px] left-1/2 -translate-x-1/2 w-[120px] h-[120px] opacity-[0.04] pointer-events-none">
            <svg viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeLinecap="round" className="w-full h-full">
              <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07" strokeWidth="1.5" />
              <path d="M12 2l-2 2m2-2l2 2m-2 18l-2-2m2 2l2-2M2 12l2-2m-2 2l2 2m18-2l-2-2m2 2l-2 2" strokeWidth="1.2" />
              <circle cx="12" cy="12" r="1.5" fill="#38bdf8" stroke="none" />
            </svg>
          </div>

          <div className="relative z-10">
            {/* Static snowflake icon (no animation — intentional contrast) */}
            <div className="mx-auto w-8 h-8 mb-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeLinecap="round" className="w-full h-full">
                <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07" strokeWidth="1.5" />
                <path d="M12 2l-2 2m2-2l2 2m-2 18l-2-2m2 2l2-2M2 12l2-2m-2 2l2 2m18-2l-2-2m2 2l-2 2" strokeWidth="1.2" />
                <circle cx="12" cy="12" r="1.5" fill="#38bdf8" stroke="none" />
              </svg>
            </div>

            {/* Label */}
            <div className="text-[10px] font-semibold uppercase tracking-[0.8px] text-neutral-500 dark:text-neutral-400 mb-1">
              Worst Cold Streak
            </div>

            {/* Number */}
            <div className="text-[38px] font-extrabold leading-none mb-3" style={{ color: '#38bdf8' }}>
              {longestColdStreak}
            </div>

            {/* Progress pips (progressive opacity — cold intensifying) */}
            <div className="flex items-center justify-center gap-[3px] mb-2">
              {Array.from({ length: 5 }, (_, i) => {
                const filled = i < Math.min(longestColdStreak, 5)
                return (
                  <div
                    key={i}
                    className={`w-[22px] h-[5px] rounded-[3px] ${!filled ? 'bg-neutral-100 dark:bg-[#0f1525]' : ''}`}
                    style={filled ? {
                      backgroundColor: `rgba(56, 189, 248, ${0.10 + 0.18 * (i + 1)})`,
                    } : undefined}
                  />
                )
              })}
            </div>

            {/* Status line */}
            <div className="text-[10px] text-neutral-500 dark:text-neutral-400">
              Currently:{' '}
              {isCurrentlyCold ? (
                <>
                  <span className="font-bold" style={{ color: '#38bdf8' }}>{currentCold}</span>
                  {' '}— cold spell active
                </>
              ) : (
                <>
                  <span className="font-bold" style={{ color: '#22c55e' }}>0</span>
                  {' '}— streak broken ✓
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// =============================================
// TOURNAMENT RUN (JOURNEY PATH)
// =============================================

function TournamentRunSection({ matchXP }: { matchXP: MatchXP[] }) {
  const sorted = [...matchXP].sort((a, b) => a.matchNumber - b.matchNumber)

  if (sorted.length === 0) return null

  return (
    <div
      className="bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default"
      style={{ animation: 'fadeUp 0.3s ease 0.2s both' }}
    >
      {/* Header */}
      <div className="px-4 sm:px-5 py-3 border-b border-neutral-200 dark:border-neutral-700 rounded-t-xl">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-neutral-900 dark:text-white flex items-center gap-2">
            <span>🏃</span>
            <span>Your Tournament Run</span>
          </h4>
          <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
            {sorted.length} matches
          </span>
        </div>
      </div>

      {/* Journey Path */}
      <div className="px-4 sm:px-5 pt-4 sm:pt-5 pb-2">
        <div className="overflow-x-auto journey-scrollbar pb-2">
          <div className="flex items-center" style={{ minWidth: 'fit-content' }}>
            {sorted.flatMap((match, idx) => {
              const config = NODE_COLORS[match.tier]
              const isMiss = match.tier === 'submitted'
              const delay = 0.6 + idx * 0.06
              const elements: React.ReactNode[] = []

              // Connector (not before first node)
              if (idx > 0) {
                const prevTier = sorted[idx - 1].tier
                const prevConfig = NODE_COLORS[prevTier]
                const isMutedConnector = prevTier === 'submitted'

                elements.push(
                  <div
                    key={`c-${idx}`}
                    className="flex-shrink-0 h-[2px] w-5"
                    style={{
                      background: isMutedConnector
                        ? 'rgba(71, 85, 105, 0.2)'
                        : `linear-gradient(to right, ${hexWithAlpha(prevConfig.color, 0.4)}, rgba(71, 85, 105, 0.15))`,
                      animation: `nodeEnter 0.4s ease ${delay}s both`,
                    }}
                  />
                )
              }

              // Node
              elements.push(
                <div
                  key={match.matchId}
                  className={`flex-shrink-0 w-[34px] h-[34px] rounded-full border-2 flex items-center justify-center ${
                    isMiss ? 'bg-neutral-50 dark:bg-[#0f1525]' : ''
                  }`}
                  style={{
                    borderColor: isMiss ? 'rgba(71, 85, 105, 0.55)' : config.color,
                    background: isMiss
                      ? undefined
                      : `radial-gradient(circle, ${hexWithAlpha(config.color, 0.35)}, ${hexWithAlpha(config.color, 0.15)})`,
                    boxShadow: !isMiss && match.tier !== 'exact'
                      ? `0 0 8px ${config.glowColor}`
                      : 'none',
                    color: isMiss ? '#64748b' : config.color,
                    animation: match.tier === 'exact'
                      ? `nodeEnter 0.4s ease ${delay}s both, exactGlow 2s ease-in-out ${delay + 0.4}s infinite`
                      : `nodeEnter 0.4s ease ${delay}s both`,
                  }}
                >
                  {match.tier === 'exact' && (
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  )}
                  {match.tier === 'winner_gd' && (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  {match.tier === 'winner' && (
                    <span className="text-sm font-black leading-none select-none">~</span>
                  )}
                  {match.tier === 'submitted' && (
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </div>
              )

              return elements
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="px-4 sm:px-5 pb-4 sm:pb-5">
        <div className="border-t border-neutral-200 dark:border-neutral-700 pt-3">
          <div className="flex items-center gap-4 sm:gap-5 flex-wrap">
            {JOURNEY_LEGEND.map((item) => (
              <div key={item.label} className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: item.color,
                    boxShadow: item.glow ? `0 0 6px ${hexWithAlpha(item.color, 0.27)}` : 'none',
                  }}
                />
                <span className="text-[10px] text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// =============================================
// YOU VS THE CROWD
// =============================================

function YouVsCrowdSection({ crowdData }: { crowdData: CrowdMatch[] }) {
  const matchesWithPred = crowdData.filter(m => m.userPredictedResult !== null)
  if (matchesWithPred.length === 0) return null

  // --- User stats ---
  const userCorrect = matchesWithPred.filter(m => m.userWasCorrect).length
  const userAccuracy = matchesWithPred.length > 0
    ? Math.round((userCorrect / matchesWithPred.length) * 100) : 0

  // Crowd accuracy = how often crowd majority was correct
  const crowdCorrect = crowdData.filter(m => {
    const actual = m.actualHomeScore > m.actualAwayScore ? 'home'
      : m.actualHomeScore < m.actualAwayScore ? 'away' : 'draw'
    return m.crowdMajorityResult === actual
  }).length
  const crowdAccuracy = crowdData.length > 0
    ? Math.round((crowdCorrect / crowdData.length) * 100) : 0

  // User battle metrics
  const consensusCount = matchesWithPred.filter(m => !m.userIsContrarian).length
  const contrarianCount = matchesWithPred.filter(m => m.userIsContrarian).length
  const contrarianWins = matchesWithPred.filter(m => m.userIsContrarian && m.userWasCorrect).length

  // Estimated crowd averages (from distribution data)
  const crowdAvgConsensus = Math.round(
    crowdData.reduce((sum, m) => sum + Math.max(m.homeWinPct, m.drawPct, m.awayWinPct), 0)
  )
  const crowdAvgContrarian = Math.max(0, matchesWithPred.length - crowdAvgConsensus)
  const crowdAccRate = crowdData.length > 0 ? crowdCorrect / crowdData.length : 0
  const crowdAvgContrarianWins = Math.round(crowdAvgContrarian * crowdAccRate)

  // Performance comparison
  const accuracyDiff = userAccuracy - crowdAccuracy
  const isOutperforming = accuracyDiff > 0

  // Contrarian insight
  const userContrarianWinPct = contrarianCount > 0 ? Math.round((contrarianWins / contrarianCount) * 100) : 0
  const crowdContrarianWinPct = crowdAvgContrarian > 0 ? Math.round((crowdAvgContrarianWins / crowdAvgContrarian) * 100) : 0
  const contrarianAdv = userContrarianWinPct - crowdContrarianWinPct

  const bars = [
    { label: 'Consensus Picks', you: consensusCount, crowd: crowdAvgConsensus },
    { label: 'Contrarian Picks', you: contrarianCount, crowd: crowdAvgContrarian },
    { label: 'Contrarian Wins', you: contrarianWins, crowd: crowdAvgContrarianWins },
  ]

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

      {/* Content */}
      <div className="relative z-10 p-[18px]">
        {/* Heading */}
        <h4 className="text-[15px] font-bold text-neutral-900 dark:text-[#f1f5f9] mb-3">
          You vs The Crowd
        </h4>

        {/* VS Faceoff */}
        <div className="flex items-center justify-around mb-8">
          {/* Player */}
          <div className="text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.8px] mb-1" style={{ color: '#3b82f6' }}>
              You
            </div>
            <div className="text-[32px] font-extrabold leading-none" style={{ color: '#3b82f6' }}>
              {userAccuracy}%
            </div>
          </div>

          {/* VS Badge */}
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 border border-neutral-200 dark:border-[#1c2333]"
            style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(139,92,246,0.2))' }}
          >
            <span className="text-[11px] font-extrabold" style={{ color: '#64748b' }}>VS</span>
          </div>

          {/* Crowd */}
          <div className="text-center">
            <div className="text-[10px] font-bold uppercase tracking-[0.8px] mb-1" style={{ color: '#8b5cf6' }}>
              Pool Avg
            </div>
            <div className="text-[32px] font-extrabold leading-none" style={{ color: '#94a3b8' }}>
              {crowdAccuracy}%
            </div>
          </div>
        </div>

        {/* Battle Bars */}
        <div className="space-y-5">
          {bars.map((bar, idx) => {
            const total = bar.you + bar.crowd
            const youPct = total > 0 ? (bar.you / total) * 100 : 50
            const crowdPct = total > 0 ? (bar.crowd / total) * 100 : 50

            return (
              <div key={bar.label}>
                {/* Label row */}
                <div className="flex items-center justify-between mb-[5px]">
                  <span className="text-[11px] text-neutral-500 dark:text-[#94a3b8]">{bar.label}</span>
                  <span className="text-[10px] font-mono text-neutral-400 dark:text-[#64748b]">
                    {bar.you} vs {bar.crowd}
                  </span>
                </div>
                {/* Bar track */}
                <div className="relative h-2 rounded bg-neutral-100 dark:bg-[#0f1525]">
                  {/* Player fill (grows from left) */}
                  <div
                    className="absolute top-0 left-0 h-full rounded-l"
                    style={{
                      width: `calc(${youPct}% - 1px)`,
                      background: 'linear-gradient(to right, #3b82f6, #60a5fa)',
                      boxShadow: '0 0 8px rgba(59,130,246,0.25)',
                      animation: `barGrow 1.2s cubic-bezier(0.4, 0, 0.2, 1) ${0.3 + idx * 0.1}s both`,
                      transformOrigin: 'left',
                    }}
                  />
                  {/* Crowd fill (grows from right) */}
                  <div
                    className="absolute top-0 right-0 h-full rounded-r"
                    style={{
                      width: `calc(${crowdPct}% - 1px)`,
                      background: 'linear-gradient(to right, rgba(139,92,246,0.67), #8b5cf6)',
                      animation: `barGrow 1.2s cubic-bezier(0.4, 0, 0.2, 1) ${0.3 + idx * 0.1}s both`,
                      transformOrigin: 'right',
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>

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
                  Outperforming the crowd by {accuracyDiff}%
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
                    ? 'Neck and neck with the crowd'
                    : 'The crowd has a slight edge — time to go contrarian?'}
                </div>
                <div className="text-[10px] mt-px" style={{ color: '#64748b' }}>
                  {accuracyDiff === 0
                    ? "You\u2019re matching the crowd wisdom perfectly"
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
// POOL-WIDE STATS
// =============================================

export function PoolWideStatsSection({ poolStats }: { poolStats: PoolWideStats }) {
  const { mostPredictable, leastPredictable, avgPoolAccuracy, totalCompletedMatches, totalEntries } = poolStats

  if (totalCompletedMatches === 0) return null

  // Cap to 3 items per list
  const topPredictable = mostPredictable.slice(0, 3)
  const topUpsets = leastPredictable.slice(0, 3)

  return (
    <div className="bg-surface rounded-xl shadow dark:shadow-none dark:border dark:border-border-default">
      <div className="p-[18px]">
        {/* Heading */}
        <h4 className="text-[15px] font-bold text-neutral-900 dark:text-[#f1f5f9] mb-3">
          Pool-Wide Stats
        </h4>

        {/* Summary Stats Row */}
        <div className="flex items-center justify-around mb-[18px]">
          <div className="text-center">
            <div className="text-2xl font-extrabold text-neutral-900 dark:text-[#f1f5f9]">
              {Math.round(avgPoolAccuracy * 100)}%
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
              {totalCompletedMatches}
            </div>
            <div className="text-[10px] mt-[2px]" style={{ color: '#64748b' }}>
              Matches Scored
            </div>
          </div>
        </div>

        {/* Most Predictable */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-sm">🏆</span>
            <span className="text-[11px] font-semibold" style={{ color: '#22c55e' }}>Most Predictable</span>
          </div>
          <div>
            {topPredictable.map((m, idx) => (
              <div
                key={m.matchId}
                className={`flex items-center justify-between py-2 ${
                  idx < topPredictable.length - 1 ? 'border-b border-neutral-100 dark:border-[#1c2333]' : ''
                }`}
              >
                <span className="text-xs text-neutral-500 dark:text-[#94a3b8] truncate mr-2">
                  {idx + 1}. {m.homeTeamName} vs {m.awayTeamName}
                </span>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* Mini progress bar */}
                  <div className="w-10 h-1 rounded-sm bg-neutral-100 dark:bg-[#0f1525]">
                    <div
                      className="h-full rounded-sm"
                      style={{
                        width: `${Math.round(m.hitRate * 100)}%`,
                        backgroundColor: '#22c55e',
                      }}
                    />
                  </div>
                  <span className="text-[11px] font-semibold font-mono" style={{ color: '#22c55e' }}>
                    {Math.round(m.hitRate * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Biggest Upsets */}
        <div className="mt-3.5">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-sm">😱</span>
            <span className="text-[11px] font-semibold" style={{ color: '#ef4444' }}>Biggest Upsets</span>
          </div>
          <div>
            {topUpsets.map((m, idx) => (
              <div
                key={m.matchId}
                className={`flex items-center justify-between py-2 ${
                  idx < topUpsets.length - 1 ? 'border-b border-neutral-100 dark:border-[#1c2333]' : ''
                }`}
              >
                <span className="text-xs text-neutral-500 dark:text-[#94a3b8] truncate mr-2">
                  {idx + 1}. {m.homeTeamName} vs {m.awayTeamName}
                </span>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* Mini progress bar */}
                  <div className="w-10 h-1 rounded-sm bg-neutral-100 dark:bg-[#0f1525]">
                    <div
                      className="h-full rounded-sm"
                      style={{
                        width: `${Math.round(m.hitRate * 100)}%`,
                        backgroundColor: '#ef4444',
                      }}
                    />
                  </div>
                  <span className="text-[11px] font-semibold font-mono" style={{ color: '#ef4444' }}>
                    {Math.round(m.hitRate * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// =============================================
// MATCH RESULTS
// =============================================

const STAGE_LABELS: Record<string, string> = {
  group: 'Group',
  round_32: 'R32',
  round_16: 'R16',
  quarter_final: 'QF',
  semi_final: 'SF',
  third_place: '3rd',
  final: 'Final',
}

type MatchCardData = {
  matchId: string
  matchNumber: number
  stage: string
  groupLetter: string | null
  homeTeamName: string
  awayTeamName: string
  actualHomeScore: number
  actualAwayScore: number
  predictedHomeScore: number
  predictedAwayScore: number
  resultType: 'exact' | 'winner_gd' | 'winner' | 'miss'
  tier: XPTier
  xpEarned: number
  consensusPct: number | null   // % of pool that got the result right
  totalPredictions: number
  isContrarian: boolean
}

type FilterMode = 'all' | 'hits' | 'misses' | 'exact'

function MatchResultsSection({
  matchXP,
  crowdData,
  entryPredictions,
  predictionResults,
  totalEntries,
}: {
  matchXP: MatchXP[]
  crowdData: CrowdMatch[]
  entryPredictions: PredictionData[]
  predictionResults: PredictionResult[]
  totalEntries: number
}) {
  const [filter, setFilter] = useState<FilterMode>('all')
  const [visibleCount, setVisibleCount] = useState(10)

  // Build unified card data by joining matchXP + crowdData + entryPredictions + predictionResults
  const cardData = useMemo(() => {
    const crowdMap = new Map(crowdData.map(c => [c.matchId, c]))
    const predMap = new Map(entryPredictions.map(p => [p.match_id, p]))
    const resultMap = new Map(predictionResults.map(r => [r.matchId, r]))

    const cards: MatchCardData[] = matchXP
      .map(mx => {
        const crowd = crowdMap.get(mx.matchId)
        const pred = predMap.get(mx.matchId)
        const result = resultMap.get(mx.matchId)
        if (!crowd || !pred || !result) return null

        // Consensus = % of pool that got the correct result
        const actualResult = crowd.actualHomeScore > crowd.actualAwayScore ? 'home'
          : crowd.actualHomeScore < crowd.actualAwayScore ? 'away' : 'draw'
        const consensusPct = actualResult === 'home' ? crowd.homeWinPct
          : actualResult === 'away' ? crowd.awayWinPct
          : crowd.drawPct

        return {
          matchId: mx.matchId,
          matchNumber: mx.matchNumber,
          stage: mx.stage,
          groupLetter: crowd.groupLetter,
          homeTeamName: crowd.homeTeamName,
          awayTeamName: crowd.awayTeamName,
          actualHomeScore: crowd.actualHomeScore,
          actualAwayScore: crowd.actualAwayScore,
          predictedHomeScore: pred.predicted_home_score,
          predictedAwayScore: pred.predicted_away_score,
          resultType: result.type,
          tier: mx.tier,
          xpEarned: mx.multipliedXP,
          consensusPct: consensusPct,
          totalPredictions: crowd.totalPredictions,
          isContrarian: crowd.userIsContrarian,
        }
      })
      .filter(Boolean) as MatchCardData[]

    // Sort by match number descending (most recent first)
    return cards.sort((a, b) => b.matchNumber - a.matchNumber)
  }, [matchXP, crowdData, entryPredictions, predictionResults])

  // Filter counts
  const counts = useMemo(() => ({
    all: cardData.length,
    hits: cardData.filter(c => c.resultType !== 'miss').length,
    misses: cardData.filter(c => c.resultType === 'miss').length,
    exact: cardData.filter(c => c.resultType === 'exact').length,
  }), [cardData])

  // Filtered list
  const filteredData = useMemo(() => {
    switch (filter) {
      case 'hits': return cardData.filter(c => c.resultType !== 'miss')
      case 'misses': return cardData.filter(c => c.resultType === 'miss')
      case 'exact': return cardData.filter(c => c.resultType === 'exact')
      default: return cardData
    }
  }, [cardData, filter])

  // Reset visible count when filter changes
  const handleFilterChange = (f: FilterMode) => {
    setFilter(f)
    setVisibleCount(10)
  }

  const displayList = filteredData.slice(0, visibleCount)
  const remaining = filteredData.length - visibleCount

  if (cardData.length === 0) return null

  return (
    <div style={{ animation: 'fadeUp 0.35s ease 0.1s both' }}>
      {/* Section Heading */}
      <h4 className="text-[15px] font-bold text-neutral-900 dark:text-[#f1f5f9] mb-3">
        Match Results
      </h4>

      {/* Filter Pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        {([
          { key: 'all' as FilterMode, label: 'All Matches', count: counts.all, color: '#3b82f6' },
          { key: 'hits' as FilterMode, label: 'Hits', count: counts.hits, color: '#22c55e' },
          { key: 'misses' as FilterMode, label: 'Misses', count: counts.misses, color: '#ef4444' },
          { key: 'exact' as FilterMode, label: 'Exact', count: counts.exact, color: '#f59e0b' },
        ]).map(pill => {
          const isActive = filter === pill.key
          return (
            <button
              key={pill.key}
              onClick={() => handleFilterChange(pill.key)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all"
              style={{
                background: isActive ? pill.color : undefined,
                color: isActive ? '#ffffff' : '#94a3b8',
                border: isActive ? 'none' : '1px solid rgba(148,163,184,0.2)',
              }}
            >
              {pill.label}
              <span
                className="rounded-md px-1.5 py-px text-[10px] font-bold"
                style={{
                  background: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(148,163,184,0.1)',
                  color: isActive ? '#ffffff' : '#94a3b8',
                }}
              >
                {pill.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Card Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {displayList.map(card => (
          <MatchCard key={card.matchId} card={card} totalEntries={totalEntries} />
        ))}
      </div>

      {/* Empty state for filter */}
      {displayList.length === 0 && (
        <div className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
          No matches match this filter.
        </div>
      )}

      {/* Show more / Show all */}
      {remaining > 0 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            onClick={() => setVisibleCount(v => v + 10)}
            className="text-sm font-medium px-4 py-2 rounded-lg transition-colors bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
          >
            Show 10 more
          </button>
          <button
            onClick={() => setVisibleCount(filteredData.length)}
            className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300"
          >
            Show all {filteredData.length}
          </button>
        </div>
      )}
    </div>
  )
}

// =============================================
// MATCH CARD
// =============================================

function MatchCard({ card, totalEntries }: { card: MatchCardData; totalEntries: number }) {
  const isExact = card.resultType === 'exact'
  const isHit = card.resultType !== 'miss'
  const isContrarian = card.isContrarian

  // Tier-based border color
  const borderColor = isExact
    ? 'rgba(245, 158, 11, 0.5)'
    : isHit
      ? 'rgba(34, 197, 94, 0.3)'
      : 'rgba(148, 163, 184, 0.15)'

  // Status badge config
  const statusConfig = isExact
    ? { label: '★ EXACT', bg: 'rgba(245,158,11,0.15)', color: '#f59e0b' }
    : card.resultType === 'winner_gd'
      ? { label: '✓ RESULT + GD', bg: 'rgba(34,197,94,0.12)', color: '#22c55e' }
      : card.resultType === 'winner'
        ? { label: '✓ CORRECT', bg: 'rgba(34,197,94,0.12)', color: '#22c55e' }
        : { label: '✗ MISS', bg: 'rgba(239,68,68,0.1)', color: '#ef4444' }

  // Bragging rights — exact score on a match where <25% got the result right
  const isRareExact = isExact && card.consensusPct !== null && card.consensusPct < 0.25

  return (
    <div
      className="relative bg-surface rounded-xl overflow-hidden transition-all duration-150 hover:-translate-y-px group"
      style={{
        border: `1px solid ${borderColor}`,
        boxShadow: isExact
          ? '0 1px 4px rgba(245,158,11,0.08)'
          : '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      {/* Shimmer line for exact scores */}
      {isExact && (
        <div
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{
            background: 'linear-gradient(90deg, transparent, #f59e0b, transparent)',
            animation: 'shimmerLine 3s ease-in-out infinite',
          }}
        />
      )}

      <div className="p-3.5 sm:p-4">
        {/* Top row: Match meta + Status badge */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500">
              #{card.matchNumber}
            </span>
            <span
              className="text-[10px] font-semibold px-1.5 py-px rounded"
              style={{
                background: 'rgba(148,163,184,0.1)',
                color: '#94a3b8',
              }}
            >
              {STAGE_LABELS[card.stage] ?? card.stage}
              {card.groupLetter ? ` ${card.groupLetter}` : ''}
            </span>
            {isContrarian && (
              <span
                className="text-[10px] font-semibold px-1.5 py-px rounded"
                style={{
                  background: 'rgba(139,92,246,0.12)',
                  color: '#a78bfa',
                }}
              >
                Contrarian
              </span>
            )}
          </div>

          {/* Status badge */}
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-md"
            style={{
              background: statusConfig.bg,
              color: statusConfig.color,
            }}
          >
            {statusConfig.label}
          </span>
        </div>

        {/* Main score row */}
        <div className="flex items-center justify-between mb-1.5">
          {/* Team names */}
          <div className="flex-1 min-w-0 mr-3">
            <div className="text-sm font-semibold text-neutral-900 dark:text-[#f1f5f9] truncate">
              {card.homeTeamName}
            </div>
            <div className="text-sm font-semibold text-neutral-900 dark:text-[#f1f5f9] truncate">
              {card.awayTeamName}
            </div>
          </div>

          {/* Actual score */}
          <div className="text-right mr-3">
            <div className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 mb-0.5">
              Actual
            </div>
            <div className="font-mono text-[17px] font-extrabold text-neutral-900 dark:text-white leading-tight">
              {card.actualHomeScore} - {card.actualAwayScore}
            </div>
          </div>

          {/* Predicted score */}
          <div className="text-right">
            <div className="text-[10px] font-medium text-neutral-400 dark:text-neutral-500 mb-0.5">
              Yours
            </div>
            <div
              className="font-mono text-[17px] font-extrabold leading-tight"
              style={{
                color: isExact ? '#f59e0b' : isHit ? '#22c55e' : '#ef4444',
              }}
            >
              {card.predictedHomeScore} - {card.predictedAwayScore}
            </div>
          </div>
        </div>

        {/* Bottom row: XP earned + Consensus */}
        <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-neutral-100 dark:border-neutral-800/50">
          <div className="flex items-center gap-2">
            {/* XP pill */}
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-md"
              style={{
                background: isHit ? 'rgba(34,197,94,0.1)' : 'rgba(148,163,184,0.08)',
                color: isHit ? '#22c55e' : '#64748b',
              }}
            >
              +{card.xpEarned} XP
            </span>
          </div>

          {/* Consensus % */}
          {card.consensusPct !== null && (
            <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
              {Math.round(card.consensusPct * 100)}% of pool got this right
            </span>
          )}
        </div>

        {/* Bragging rights callout for rare exact scores */}
        {isRareExact && (
          <div
            className="mt-2.5 flex items-center gap-1.5 rounded-lg py-1.5 px-2.5"
            style={{
              background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(245,158,11,0.04))',
              border: '1px solid rgba(245,158,11,0.15)',
            }}
          >
            <span className="text-xs leading-none">🔮</span>
            <span className="text-[10px] font-semibold" style={{ color: '#f59e0b' }}>
              Only {Math.round((card.consensusPct ?? 0) * 100)}% predicted this result — pure oracle energy
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

// =============================================
// LEVEL ROADMAP MODAL
// =============================================

function LevelRoadmapModal({ xpBreakdown, onClose }: { xpBreakdown: XPBreakdown; onClose: () => void }) {
  const currentLevel = xpBreakdown.currentLevel.level

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        style={{ animation: 'modal-overlay-fade 0.3s ease both' }}
      />

      {/* Modal content */}
      <div
        className="relative w-full sm:max-w-md bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl dark:border dark:border-border-default overflow-hidden max-h-[85vh] flex flex-col"
        style={{ animation: 'modal-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
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

        {/* Scrollable level list */}
        <div className="overflow-y-auto flex-1 p-5">
          <div className="space-y-2">
            {LEVELS.map((level) => {
              const isReached = xpBreakdown.totalXP >= level.xpRequired
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
                  {/* Check / number circle */}
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

                  {/* Level info */}
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-semibold ${
                      isCurrent ? 'text-accent-700 dark:text-accent-500'
                        : isReached ? 'text-neutral-900 dark:text-white'
                          : 'text-neutral-500 dark:text-neutral-400'
                    }`}>
                      {level.name}
                    </div>
                    {level.badge && (
                      <div className="text-[10px] text-neutral-400 dark:text-neutral-500">
                        Unlocks: {level.badge}
                      </div>
                    )}
                  </div>

                  {/* XP required */}
                  <span className={`text-xs font-medium tabular-nums flex-shrink-0 ${
                    isCurrent ? 'text-accent-700 dark:text-accent-500'
                      : isReached ? 'text-success-600 dark:text-success-400'
                        : 'text-neutral-400 dark:text-neutral-500'
                  }`}>
                    {level.xpRequired.toLocaleString()} XP
                  </span>
                </div>
              )
            })}
          </div>

          {/* Current XP summary at bottom */}
          <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-neutral-700 text-center">
            <div className="text-2xl font-black text-accent-500">{xpBreakdown.totalXP.toLocaleString()} XP</div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
              {xpBreakdown.nextLevel
                ? `${xpBreakdown.xpToNextLevel.toLocaleString()} XP to ${xpBreakdown.nextLevel.name}`
                : 'Maximum level reached'
              }
            </div>

            {/* XP Breakdown Pills */}
            <div className="flex flex-wrap justify-center gap-2 mt-3">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
                <span className="text-xs font-medium text-primary-600 dark:text-primary-400">Match XP</span>
                <span className="text-xs font-bold text-primary-700 dark:text-primary-300">{xpBreakdown.totalBaseXP.toLocaleString()}</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800">
                <span className="text-xs font-medium text-success-600 dark:text-success-400">Bonus XP</span>
                <span className="text-xs font-bold text-success-700 dark:text-success-300">{xpBreakdown.totalBonusXP.toLocaleString()}</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800">
                <span className="text-xs font-medium text-warning-600 dark:text-warning-400">Badge XP</span>
                <span className="text-xs font-bold text-warning-700 dark:text-warning-300">{xpBreakdown.totalBadgeXP.toLocaleString()}</span>
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

export function XPProgressSection({ xpBreakdown, streaks, crowdData, poolStats, entryPredictions, predictionResults }: XPProgressSectionProps) {
  const [showRoadmap, setShowRoadmap] = useState(false)

  return (
    <div className="space-y-4">
      {/* Hero Card — Level + Progress Bar (clickable → opens roadmap) */}
      <XPHeroCard xpBreakdown={xpBreakdown} onOpenRoadmap={() => setShowRoadmap(true)} />

      {/* Badge Grid */}
      <XPBadgeGrid earnedBadges={xpBreakdown.earnedBadges} />

      {/* Hot & Cold Streaks */}
      <HotColdStreaksSection streaks={streaks} />

      {/* Tournament Run — Journey Path */}
      <TournamentRunSection matchXP={xpBreakdown.matchXP} />

      {/* You vs The Crowd + Pool-Wide Stats (side by side on desktop) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <YouVsCrowdSection crowdData={crowdData} />
        <PoolWideStatsSection poolStats={poolStats} />
      </div>

      {/* Match Results */}
      <MatchResultsSection
        matchXP={xpBreakdown.matchXP}
        crowdData={crowdData}
        entryPredictions={entryPredictions}
        predictionResults={predictionResults}
        totalEntries={poolStats.totalEntries}
      />

      {/* Level Roadmap Modal */}
      {showRoadmap && (
        <LevelRoadmapModal xpBreakdown={xpBreakdown} onClose={() => setShowRoadmap(false)} />
      )}
    </div>
  )
}
