'use client'

import { useState, useRef, useMemo, useCallback } from 'react'
import { levelColor, XP_SOURCE_COLOR } from '@/lib/design/levels'
import { rarityColor, rarityTint } from '@/lib/design/badges'
import { tierColor, tierTint } from '@/lib/design/formDots'
import { Icon } from '@/components/ui/Icon'
import { createPortal } from 'react-dom'
import type { XPBreakdown, EarnedBadge, BadgeDefinition, MatchXP, XPTier } from './xpSystem'
import type { StreakData, CrowdMatch, PoolWideStats, PredictionResult } from './analyticsHelpers'
import type { PredictionData } from '../types'
import { BADGE_DEFINITIONS, LEVELS } from './xpSystem'
import { BadgeMedallion } from '@/components/BadgeMedallion'

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

const TIER_BG_COLORS: Record<string, string> = {
  Bronze: 'bg-warning-100 dark:bg-warning-900/20 text-warning-700 dark:text-warning-400',
  Silver: 'bg-neutral-200 dark:bg-neutral-700 text-muted',
  Gold: 'bg-accent-100 dark:bg-accent-900/20 text-accent-700 dark:text-accent-500',
  Platinum: 'bg-accent-100 dark:bg-accent-900/20 text-accent-700 dark:text-accent-500',
}

// Rarity colours live in lib/design/badges.ts, shared with the app's
// useRarityColor. The copy that was here had Very Rare on gold and
// Legendary on amber — both wrong, and effectively swapped.

// Journey path node config per XP tier
const NODE_COLORS: Record<XPTier, { color: string; glowColor: string; label: string }> = {
  // Colours come from lib/design/formDots so the run path agrees with the form dots
  // and the leaderboard. The copy that was here had exact on amber and winner on the
  // brand blue — so the same result was gold on one screen and amber on this one.
  exact: { color: tierColor('exact'), glowColor: tierTint('exact', 40), label: 'Exact Score' },
  winner_gd: { color: tierColor('winner_gd'), glowColor: tierTint('winner_gd', 27), label: 'Winner + GD' },
  winner: { color: tierColor('winner'), glowColor: tierTint('winner', 27), label: 'Correct Result' },
  submitted: { color: tierColor('submitted'), glowColor: 'none', label: 'Miss' },
}

const JOURNEY_LEGEND: { label: string; color: string; glow: boolean }[] = [
  { label: 'Exact Score', color: tierColor('exact'), glow: true },
  { label: 'Winner + GD', color: tierColor('winner_gd'), glow: false },
  { label: 'Correct Result', color: tierColor('winner'), glow: true },
  { label: 'Miss', color: tierColor('submitted'), glow: false },
]


// =============================================
// LEVEL HERO CARD
// =============================================

/**
 * ProgressRing from the app's FormTab: a 72px ring at 6px stroke, filled to the
 * level's progress in that level's colour, with the level number in the middle.
 * The track is `mist`, so it reads in both modes without a dark: override.
 */
function LevelRing({ level, progress }: { level: number; progress: number }) {
  const size = 72
  const stroke = 6
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(1, progress))

  return (
    <span className="relative shrink-0" style={{ width: size, height: size }}>
      {/* -rotate-90 puts 0% at twelve o'clock rather than three. */}
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="var(--sp-mist)" strokeWidth={stroke}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={levelColor(level)} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center t-num text-2xl text-ink">
        {level}
      </span>
    </span>
  )
}

/** XPStatColumn from the app: the value in its source colour over a muted label. */
function XPStatColumn({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-0.5">
      <span className="t-num text-sm" style={{ color }}>
        {value.toLocaleString()}
      </span>
      <span className="text-[11px] font-semibold text-muted">{label}</span>
    </div>
  )
}

// Level colours live in lib/design/levels.ts, shared with the app's useLevelColor.
// The copy that used to sit here was a band out of step with mobile — it put L6 on
// amber and L4 on primary, where the app has L6 on primary and L4 on sky, so the
// same level rendered a different colour depending on which platform you opened.
// The level pill it fed is gone: the hero shows a progress ring now, which carries
// the level colour in the ring itself.

function XPHeroCard({ xpBreakdown, onOpenRoadmap }: { xpBreakdown: XPBreakdown; onOpenRoadmap: () => void }) {
  const { currentLevel, nextLevel, totalXP, levelProgress } = xpBreakdown
  const isMaxLevel = !nextLevel

  return (
    <div
      className="bg-surface rounded-card shadow-card dark:shadow-none border-2 border-accent-500/30 dark:border-accent-500/20 overflow-hidden cursor-pointer transition-all hover:border-accent-500/50 dark:hover:border-accent-500/40 active:scale-[0.995]"
      style={{ animation: 'fadeUp 0.3s ease 0s both' }}
      onClick={onOpenRoadmap}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpenRoadmap() }}
    >
      {/* XPHeroCard in the app: a progress ring carrying the level number, the
          level name and XP beside it, one progress bar in the level's own colour,
          and the three XP sources along the bottom. The web version used to put
          the progress into a primary→gold gradient, which meant the bar said
          nothing about what level you were on. */}
      <div className="p-4 sm:p-5 flex flex-col gap-3">
        <div className="flex items-center gap-4 sm:gap-5">
          <LevelRing level={currentLevel.level} progress={levelProgress} />

          <div className="flex-1 min-w-0 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h3 className="t-section-header text-ink truncate">{currentLevel.name}</h3>
              {isMaxLevel && (
                <span className="shrink-0 t-caption px-2 py-0.5 rounded-pill bg-accent-400/15 text-accent-600">
                  Max
                </span>
              )}
            </div>

            <span className="t-num text-[13px] text-muted">{totalXP.toLocaleString()} XP</span>

            {!isMaxLevel && (
              <span className="flex items-center gap-1">
                <span className="t-num text-[11px] text-muted">
                  {xpBreakdown.xpToNextLevel.toLocaleString()} XP to
                </span>
                <span
                  className="text-[10px] font-bold"
                  style={{ color: levelColor(nextLevel.level) }}
                >
                  {nextLevel.name}
                </span>
              </span>
            )}
          </div>

          <Icon name="chevron.right" size={16} className="shrink-0 text-muted" />
        </div>

        {!isMaxLevel && (
          <div className="h-2 rounded-pill bg-mist overflow-hidden">
            <div
              className="h-full rounded-pill origin-left"
              style={{
                width: `${Math.max(3, Math.round(levelProgress * 100))}%`,
                backgroundColor: levelColor(currentLevel.level),
                animation: 'barGrow 0.8s ease 0.3s both',
              }}
            />
          </div>
        )}

        {/* Where the XP came from — match, bonus, badges. */}
        <div className="flex">
          <XPStatColumn label="Match" value={xpBreakdown.totalBaseXP} color={XP_SOURCE_COLOR.match} />
          <XPStatColumn label="Bonus" value={xpBreakdown.totalBonusXP} color={XP_SOURCE_COLOR.bonus} />
          <XPStatColumn label="Badges" value={xpBreakdown.totalBadgeXP} color={XP_SOURCE_COLOR.badge} />
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

  // BadgeCell in mobile/components/pool-detail/FormTab.tsx: no card, no border, no
  // tier stripe — a 64px medallion well, the name, and the XP. The card-per-badge
  // treatment this replaced is what made the grid look like a spreadsheet, and its
  // locked state (`dark:bg-neutral-400/90`) rendered as a mid-grey slab in dark mode.
  const tint = rarityColor(def.rarity)

  return (
    <div className="group relative hover:z-10">
      <button
        type="button"
        onClick={onSelect}
        className="w-20 flex flex-col items-center gap-1 transition-opacity hover:opacity-70 active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40 rounded-chip"
      >
        <span
          className="relative w-16 h-16 rounded-pill flex items-center justify-center"
          // Earned badges with artwork sit on nothing; the rest get the rarity
          // composited at 15%, and locked ones get `mist`.
          style={{ backgroundColor: earned ? rarityTint(def.rarity) : 'var(--sp-mist)' }}
        >
          {earned ? (
            <BadgeMedallion id={def.id} emoji={def.emoji} size={64} />
          ) : (
            <Icon name="lock.fill" size={20} weight="semibold" className="text-muted" />
          )}
        </span>

        <span
          className="text-[11px] font-medium text-center leading-tight truncate w-full"
          style={{ color: earned ? 'var(--sp-ink)' : 'var(--sp-silver)' }}
        >
          {def.name}
        </span>

        <span
          className="t-num text-[9px]"
          style={{ color: earned ? tint : 'var(--sp-silver)' }}
        >
          +{def.xpBonus.toLocaleString()} XP
        </span>
      </button>

      {/* Desktop hover tooltip — hidden on mobile, shown on sm+ hover */}
      <div className="hidden sm:group-hover:block absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 px-3 py-2 rounded-chip bg-neutral-900 dark:bg-neutral-700 text-white text-xs text-center shadow-card-elevated pointer-events-none">
        <div className="font-semibold mb-0.5">{def.name}</div>
        <div className="text-neutral-300">{def.condition}</div>
        {earned ? (
          <div className="text-success-400 font-bold mt-1">✓ Earned · +{def.xpBonus} XP</div>
        ) : (
          <div className="text-muted mt-1">🔒 Locked</div>
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
        className="relative w-full sm:max-w-xs bg-surface rounded-t-2xl sm:rounded-card shadow-card-elevated dark:border dark:border-border-default overflow-hidden"
        style={{ animation: 'modal-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-muted hover:bg-mist dark:hover:text-neutral-300 dark:hover:bg-neutral-800 transition-colors z-10"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="p-6 pt-8 text-center">
          {/* Large emoji / medallion */}
          <div className={`mb-3 ${earned ? '' : 'grayscale opacity-40 dark:opacity-60'}`}>
            <BadgeMedallion id={badge.id} emoji={badge.emoji} size={72} className="mx-auto" />
          </div>

          {/* Badge name */}
          <h3 className="text-lg font-bold text-ink mb-1.5">
            {badge.name}
          </h3>

          {/* Tier + Rarity pills */}
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${TIER_BG_COLORS[badge.tier]}`}>
              {badge.tier}
            </span>
            <span className="text-[10px] font-semibold" style={{ color: rarityColor(badge.rarity) }}>
              {badge.rarity}
            </span>
          </div>

          {/* Condition description */}
          <p className="text-sm text-muted mb-5">
            {badge.condition}
          </p>

          {/* Status pill */}
          {earned ? (
            <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-control bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800">
              <svg className="w-4 h-4 text-success-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-semibold text-success-700 dark:text-success-300">Earned · +{badge.xpBonus} XP</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-control bg-mist border border-border-subtle">
              <svg className="w-4 h-4 text-muted" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-medium text-muted">Locked · +{badge.xpBonus} XP</span>
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
        className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default overflow-hidden"
        style={{ animation: 'fadeUp 0.3s ease 0.1s both' }}
      >
        {/* SectionHeader in the app: title in the sectionHeader variant with a
            12px muted count, baseline-aligned, and no rule beneath it — the card
            edge already separates it from what follows. */}
        <div className="flex items-baseline justify-between px-4 sm:px-5 pt-3 pb-2">
          <h4 className="t-section-header text-ink">Badges</h4>
          <span className="t-num text-xs font-medium text-muted">
            {earnedBadges.length} / {BADGE_DEFINITIONS.length} earned
          </span>
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

function StreakBar({ kind, value, color }: { kind: 'hot' | 'cold'; value: number; color: string }) {
  const filled = Math.min(value, 5)
  return (
    <div className="flex gap-[3px] my-0.5">
      {Array.from({ length: 5 }, (_, i) => {
        const isFilled = i < filled
        // The app ramps the cold bar's opacity across segments (0.32 → 1.0), so a
        // long cold run reads as deepening rather than only longer.
        const background = !isFilled
          ? 'var(--sp-mist)'
          : kind === 'cold'
            ? `color-mix(in srgb, ${color} ${Math.round((0.15 + 0.17 * (i + 1)) * 100)}%, transparent)`
            : color
        return <span key={i} className="w-5 h-[5px] rounded-pill" style={{ background }} />
      })}
    </div>
  )
}

function StreakCard({ icon, caption, value, color, kind, bordered, footer }: {
  icon: string; caption: string; value: number; color: string
  kind: 'hot' | 'cold'; bordered?: boolean; footer: React.ReactNode
}) {
  return (
    <div
      className="flex-1 flex flex-col items-center gap-1.5 bg-surface rounded-card py-3 px-2 shadow-card dark:shadow-none"
      style={bordered ? { border: `1px solid color-mix(in srgb, ${color} 20%, transparent)` } : undefined}
    >
      <Icon name={icon} size={22} weight="semibold" tint={color} />
      <span className="text-[10px] font-semibold uppercase tracking-[0.4px] text-muted text-center">{caption}</span>
      <span className="t-num font-black text-[36px] leading-10" style={{ color }}>{value}</span>
      <StreakBar kind={kind} value={value} color={color} />
      {footer}
    </div>
  )
}

/**
 * HotColdStreakCards from the app: two cards, not three, and no decorative
 * background artwork. "Best hot streak" is the hot card's footer, so the pair
 * reads as current-state vs personal-worst. Colours are --sp-hot-streak and
 * --sp-cold-streak, which is what the app means by these cards — amber and a
 * danger red were standing in for them here.
 */
function HotColdStreaksSection({ streaks }: { streaks: StreakData }) {
  const { currentStreak, longestHotStreak, longestColdStreak } = streaks
  const currentHot = currentStreak.type === 'hot' ? currentStreak.length : 0

  if (longestHotStreak === 0 && longestColdStreak === 0) return null

  return (
    <div style={{ animation: 'fadeUp 0.3s ease 0.15s both' }}>
      <div className="flex gap-2">
        <StreakCard
          kind="hot" icon="flame.fill" caption="Current Hot Streak"
          value={currentHot} color="var(--sp-hot-streak)" bordered
          footer={
            <span className="text-[11px] font-medium text-muted text-center">
              Personal best: <span className="font-bold text-ink">{longestHotStreak}</span>
            </span>
          }
        />
        <StreakCard
          kind="cold" icon="snowflake" caption="Worst Cold Streak"
          value={longestColdStreak} color="var(--sp-cold-streak)"
          footer={<span className="text-[11px] font-medium text-muted text-center">Keep this one low!</span>}
        />
      </div>
    </div>
  )
}

// =============================================
// TOURNAMENT RUN (JOURNEY PATH)
// =============================================

function TournamentRunSection({ matchXP, crowdData }: { matchXP: MatchXP[]; crowdData: CrowdMatch[] }) {
  const sorted = [...matchXP].sort((a, b) => b.matchNumber - a.matchNumber)
  const crowdMap = useMemo(() => new Map(crowdData.map(c => [c.matchId, c])), [crowdData])
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number; matchId: string } | null>(null)

  const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLDivElement>, text: string, matchId: string) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setTooltip({ text, x: rect.left + rect.width / 2, y: rect.top, matchId })
  }, [])

  const handleMouseLeave = useCallback(() => setTooltip(null), [])

  const handleTap = useCallback((e: React.MouseEvent<HTMLDivElement>, text: string, matchId: string) => {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    setTooltip(prev =>
      prev?.matchId === matchId ? null : { text, x: rect.left + rect.width / 2, y: rect.top, matchId }
    )
  }, [])

  if (sorted.length === 0) return null

  return (
    <div
      className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default"
      style={{ animation: 'fadeUp 0.3s ease 0.2s both' }}
      onClick={() => setTooltip(null)}
    >
      {/* Header */}
      <div className="px-4 sm:px-5 py-3 border-b border-border-subtle rounded-t-xl">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-ink flex items-center gap-2">
            <span>🏃</span>
            <span>Your Tournament Run</span>
          </h4>
          <span className="text-xs font-medium text-muted">
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
                const isMutedConnector = prevTier === 'submitted'

                elements.push(
                  <div
                    key={`c-${idx}`}
                    className="flex-shrink-0 h-[2px] w-5"
                    style={{
                      // Connector in the app: the PREVIOUS node's tier at 35%,
                      // or silver at 30% when that node was a miss.
                      background: isMutedConnector
                        ? tierTint('submitted', 30)
                        : `linear-gradient(to right, ${tierTint(prevTier, 40)}, ${tierTint(prevTier, 15)})`,
                      animation: `nodeEnter 0.4s ease ${delay}s both`,
                    }}
                  />
                )
              }

              // Node with hover tooltip
              const crowd = crowdMap.get(match.matchId)
              const tooltipText = crowd
                ? `#${match.matchNumber} · ${crowd.homeTeamName} ${crowd.actualHomeScore} - ${crowd.actualAwayScore} ${crowd.awayTeamName}`
                : `#${match.matchNumber} · ${config.label}`

              elements.push(
                <div
                  key={match.matchId}
                  className={`flex-shrink-0 w-[34px] h-[34px] rounded-full border-2 flex items-center justify-center cursor-default ${
                    isMiss ? 'bg-snow dark:bg-[var(--sp-midnight)]' : ''
                  }`}
                  style={{
                    borderColor: isMiss ? 'var(--sp-silver)' : config.color,
                    background: isMiss
                      ? undefined
                      : `radial-gradient(circle, ${tierTint(match.tier, 35)}, ${tierTint(match.tier, 15)})`,
                    boxShadow: !isMiss && match.tier !== 'exact'
                      ? `0 0 8px ${config.glowColor}`
                      : 'none',
                    color: isMiss ? 'var(--sp-slate)' : config.color,
                    animation: match.tier === 'exact'
                      ? `nodeEnter 0.4s ease ${delay}s both, exactGlow 2s ease-in-out ${delay + 0.4}s infinite`
                      : `nodeEnter 0.4s ease ${delay}s both`,
                  }}
                  onMouseEnter={(e) => handleMouseEnter(e, tooltipText, match.matchId)}
                  onMouseLeave={handleMouseLeave}
                  onClick={(e) => handleTap(e, tooltipText, match.matchId)}
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
        <div className="border-t border-border-subtle pt-3">
          <div className="flex items-center gap-4 sm:gap-5 flex-wrap">
            {JOURNEY_LEGEND.map((item) => (
              <div key={item.label} className="flex items-center gap-1.5">
                <div
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: item.color,
                    boxShadow: item.glow ? `0 0 6px color-mix(in srgb, ${item.color} 27%, transparent)` : 'none',
                  }}
                />
                <span className="text-[10px] text-muted whitespace-nowrap">
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Portal tooltip — renders above all overflow containers */}
      {tooltip && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-50 pointer-events-none"
          style={{ left: tooltip.x, top: tooltip.y - 8, transform: 'translate(-50%, -100%)' }}
        >
          <div
            className="whitespace-nowrap rounded-chip px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-card-elevated"
            style={{ background: 'var(--neutral-800)' }}
          >
            {tooltip.text}
            <div
              className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0"
              style={{
                borderLeft: '5px solid transparent',
                borderRight: '5px solid transparent',
                borderTop: '5px solid var(--neutral-800)',
              }}
            />
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}

// =============================================
// YOU VS THE CROWD
// =============================================

function BattleBar({ label, you, crowd, crowdLabel = 'crowd' }: {
  label: string; you: number; crowd: number; crowdLabel?: string
}) {
  const total = you + crowd
  const youPct = total > 0 ? (you / total) * 100 : 50
  const crowdPct = total > 0 ? (crowd / total) * 100 : 50
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] text-muted">{label}</span>
        <span className="t-num text-[11px] font-semibold text-muted">{you} vs {crowd} {crowdLabel}</span>
      </div>
      <div className="flex gap-0.5 h-2">
        <span className="rounded-pill bg-primary-600" style={{ flex: youPct, minWidth: 2 }} />
        <span className="rounded-pill bg-silver" style={{ flex: crowdPct, minWidth: 2 }} />
      </div>
    </div>
  )
}

function PerformanceCallout({ isOutperforming, accuracyDiff, contrarianRate, showContrarian }: {
  isOutperforming: boolean; accuracyDiff: number; contrarianRate: number; showContrarian: boolean
}) {
  const accent = isOutperforming ? 'var(--success-600)' : 'var(--primary-600)'
  return (
    <div
      className="flex items-start gap-2 p-3 rounded-chip"
      style={{
        backgroundColor: `color-mix(in srgb, ${accent} 8%, transparent)`,
        border: `1px solid color-mix(in srgb, ${accent} 13%, transparent)`,
      }}
    >
      <Icon name={isOutperforming ? 'chart.line.uptrend.xyaxis' : 'target'} size={18} weight="semibold" tint={accent} />
      <div className="flex-1 flex flex-col gap-0.5">
        <span className="text-sm font-bold" style={{ color: accent }}>
          {isOutperforming
            ? `Outperforming the crowd by ${accuracyDiff}%`
            : `The crowd leads by ${Math.abs(accuracyDiff)}%`}
        </span>
        {showContrarian && (
          <span className="text-xs text-muted">You won {contrarianRate}% of your contrarian picks</span>
        )}
      </div>
    </div>
  )
}

/**
 * CrowdSection from the app: a VS faceoff, three battle bars and a callout, in one
 * card. Both faceoff numbers are real — yours from userWasCorrect, the crowd's from
 * how often crowdMajorityResult matched the final score. There is no per-player
 * crowd average in this payload, so the bars compare pairs that genuinely have two
 * sides rather than inventing an "average opponent".
 */
function YouVsCrowdSection({ crowdData }: { crowdData: CrowdMatch[] }) {
  if (crowdData.length === 0) return null

  const withPrediction = crowdData.filter(m => m.userPredictedResult !== null)
  const contrarianCount = withPrediction.filter(m => m.userIsContrarian).length
  const consensusCount = withPrediction.length - contrarianCount
  const contrarianCorrect = withPrediction.filter(m => m.userIsContrarian && m.userWasCorrect).length
  const userCorrect = withPrediction.filter(m => m.userWasCorrect).length
  const crowdCorrect = crowdData.filter(m => {
    const actual = m.actualHomeScore > m.actualAwayScore ? 'home'
      : m.actualHomeScore < m.actualAwayScore ? 'away' : 'draw'
    return m.crowdMajorityResult === actual
  }).length

  const userAccuracy = withPrediction.length > 0 ? Math.round((userCorrect / withPrediction.length) * 100) : 0
  const crowdAccuracy = crowdData.length > 0 ? Math.round((crowdCorrect / crowdData.length) * 100) : 0
  const accuracyDiff = userAccuracy - crowdAccuracy

  return (
    <div
      className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default overflow-hidden"
      style={{ animation: 'fadeUp 0.3s ease 0.25s both' }}
    >
      <div className="px-4 pt-4 flex flex-col gap-3">
        <h3 className="t-section-header text-ink">You vs The Crowd</h3>
        <div className="flex items-center justify-around pb-2">
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-bold tracking-[0.5px] text-primary-600">YOU</span>
            <span className="t-num font-black text-[32px] leading-9 text-primary-600">{userAccuracy}%</span>
          </div>
          <span className="w-9 h-9 rounded-pill bg-mist border-[0.5px] border-silver flex items-center justify-center text-[11px] font-black text-muted">
            VS
          </span>
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-bold tracking-[0.5px] text-muted">POOL AVG</span>
            <span className="t-num font-black text-[32px] leading-9 text-muted">{crowdAccuracy}%</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 px-4 pb-4">
        <BattleBar label="Correct Picks" you={userCorrect} crowd={crowdCorrect} />
        <BattleBar label="Consensus Picks" you={consensusCount} crowd={contrarianCount} crowdLabel="contrarian" />
        <BattleBar label="Contrarian Wins" you={contrarianCorrect} crowd={contrarianCount - contrarianCorrect} crowdLabel="lost" />
      </div>

      {accuracyDiff !== 0 && (
        <div className="px-4 pb-4">
          <PerformanceCallout
            isOutperforming={accuracyDiff > 0}
            accuracyDiff={accuracyDiff}
            contrarianRate={contrarianCount > 0 ? Math.round((contrarianCorrect / contrarianCount) * 100) : 0}
            showContrarian={contrarianCount > 0}
          />
        </div>
      )}
    </div>
  )
}
// =============================================
// POOL-WIDE STATS
// =============================================

function PoolStatColumn({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 flex flex-col items-center gap-0.5">
      <span className="t-num font-black text-2xl leading-7 text-ink">{value}</span>
      <span className="text-[11px] font-medium text-muted text-center">{label}</span>
    </div>
  )
}

function PredictableBlock({ icon, title, color, matches }: {
  icon: string; title: string; color: string
  matches: { matchId: string; homeTeamName: string; awayTeamName: string; hitRate: number }[]
}) {
  if (matches.length === 0) return null
  return (
    <div className="px-4 pb-4 flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <Icon name={icon} size={14} weight="semibold" tint={color} />
        <span className="text-[11px] font-bold uppercase tracking-[0.4px]" style={{ color }}>{title}</span>
      </div>
      {matches.slice(0, 3).map(m => (
        <div key={m.matchId} className="flex items-center justify-between gap-2">
          <span className="text-[13px] text-ink truncate">{m.homeTeamName} v {m.awayTeamName}</span>
          <span className="t-num text-[13px] shrink-0" style={{ color }}>{Math.round(m.hitRate * 100)}%</span>
        </div>
      ))}
    </div>
  )
}

/**
 * PoolStatsSection from the app: one card, the header inside it, three columns,
 * then the two predictability blocks. This was three separate stat cards plus a
 * Recharts bar chart and two more cards — five surfaces for what the app treats as
 * one. Three cards read as three unrelated facts; one reads as a summary of this
 * pool.
 */
export function PoolWideStatsSection({ poolStats }: { poolStats: PoolWideStats }) {
  const { mostPredictable, leastPredictable, avgPoolAccuracy, totalCompletedMatches, totalEntries } = poolStats

  if (totalCompletedMatches === 0) return null

  return (
    <div
      className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default overflow-hidden"
      style={{ animation: 'fadeUp 0.3s ease 0.3s both' }}
    >
      <div className="px-4 pt-4 pb-3">
        <h3 className="t-section-header text-ink">Pool-Wide Stats</h3>
      </div>
      <div className="flex px-4 pb-4">
        <PoolStatColumn label="Avg Pool Accuracy" value={`${Math.round(avgPoolAccuracy * 100)}%`} />
        <PoolStatColumn label="Competitors" value={`${totalEntries}`} />
        <PoolStatColumn label="Matches Scored" value={`${totalCompletedMatches}`} />
      </div>

      <PredictableBlock
        icon="trophy.fill" title="Most Predictable"
        color="var(--success-600)" matches={mostPredictable}
      />
      <PredictableBlock
        icon="exclamationmark.triangle.fill" title="Biggest Upsets"
        color="var(--danger-600)" matches={leastPredictable}
      />
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
      <h4 className="text-[15px] font-bold text-ink dark:text-[var(--neutral-100)] mb-3">
        Match Results
      </h4>

      {/* Filter Pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        {([
          { key: 'all' as FilterMode, label: 'All Matches', count: counts.all, color: 'var(--primary-600)' },
          { key: 'hits' as FilterMode, label: 'Hits', count: counts.hits, color: 'var(--success-600)' },
          { key: 'misses' as FilterMode, label: 'Misses', count: counts.misses, color: 'var(--danger-600)' },
          { key: 'exact' as FilterMode, label: 'Exact', count: counts.exact, color: 'var(--warning-500)' },
        ]).map(pill => {
          const isActive = filter === pill.key
          return (
            <button
              key={pill.key}
              onClick={() => handleFilterChange(pill.key)}
              className="flex items-center gap-1.5 rounded-chip px-3 py-1.5 text-xs font-semibold transition-all"
              style={{
                background: isActive ? pill.color : undefined,
                color: isActive ? '#ffffff' : 'var(--neutral-400)',
                border: isActive ? 'none' : '1px solid color-mix(in srgb, var(--sp-slate) 20%, transparent)',
              }}
            >
              {pill.label}
              <span
                className="rounded-md px-1.5 py-px text-[10px] font-bold"
                style={{
                  background: isActive ? 'rgba(255,255,255,0.2)' : 'color-mix(in srgb, var(--sp-slate) 10%, transparent)',
                  color: isActive ? '#ffffff' : 'var(--neutral-400)',
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
        <div className="py-8 text-center text-sm text-muted">
          No matches match this filter.
        </div>
      )}

      {/* Show more / Show all */}
      {remaining > 0 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            onClick={() => setVisibleCount(v => v + 10)}
            className="text-sm font-medium px-4 py-2 rounded-pill transition-colors bg-mist text-muted hover:bg-neutral-200 dark:hover:bg-neutral-700"
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
    ? 'color-mix(in srgb, var(--warning-500) 50%, transparent)'
    : isHit
      ? 'color-mix(in srgb, var(--success-600) 30%, transparent)'
      : 'color-mix(in srgb, var(--sp-slate) 15%, transparent)'

  // Status badge config
  const statusConfig = isExact
    ? { label: '★ EXACT', bg: 'color-mix(in srgb, var(--warning-500) 15%, transparent)', color: 'var(--warning-500)' }
    : card.resultType === 'winner_gd'
      ? { label: '✓ RESULT + GD', bg: 'color-mix(in srgb, var(--success-600) 12%, transparent)', color: 'var(--success-600)' }
      : card.resultType === 'winner'
        ? { label: '✓ CORRECT', bg: 'color-mix(in srgb, var(--success-600) 12%, transparent)', color: 'var(--success-600)' }
        : { label: '✗ MISS', bg: 'color-mix(in srgb, var(--danger-600) 10%, transparent)', color: 'var(--danger-600)' }

  // Bragging rights — exact score on a match where <25% got the result right
  const isRareExact = isExact && card.consensusPct !== null && card.consensusPct < 0.25

  return (
    <div
      className="relative bg-surface rounded-control overflow-hidden transition-all duration-150 hover:-translate-y-px group"
      style={{
        border: `1px solid ${borderColor}`,
        boxShadow: isExact
          ? '0 1px 4px color-mix(in srgb, var(--warning-500) 8%, transparent)'
          : '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      {/* Shimmer line for exact scores */}
      {isExact && (
        <div
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{
            background: 'linear-gradient(90deg, transparent, var(--warning-500), transparent)',
            animation: 'shimmerLine 3s ease-in-out infinite',
          }}
        />
      )}

      <div className="p-3.5 sm:p-4">
        {/* Top row: Match meta + Status badge */}
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-muted">
              #{card.matchNumber}
            </span>
            <span
              className="text-[10px] font-semibold px-1.5 py-px rounded"
              style={{
                background: 'color-mix(in srgb, var(--sp-slate) 10%, transparent)',
                color: 'var(--neutral-400)',
              }}
            >
              {STAGE_LABELS[card.stage] ?? card.stage}
              {card.groupLetter ? ` ${card.groupLetter}` : ''}
            </span>
            {isContrarian && (
              <span
                className="text-[10px] font-semibold px-1.5 py-px rounded"
                style={{
                  background: 'color-mix(in srgb, var(--primary-600) 12%, transparent)',
                  color: 'var(--primary-500)',
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
            <div className="text-sm font-semibold text-ink dark:text-[var(--neutral-100)] truncate">
              {card.homeTeamName}
            </div>
            <div className="text-sm font-semibold text-ink dark:text-[var(--neutral-100)] truncate">
              {card.awayTeamName}
            </div>
          </div>

          {/* Actual score */}
          <div className="text-right mr-3">
            <div className="text-[10px] font-medium text-muted mb-0.5">
              Actual
            </div>
            <div className="font-mono text-[17px] font-extrabold text-ink leading-tight">
              {card.actualHomeScore} - {card.actualAwayScore}
            </div>
          </div>

          {/* Predicted score */}
          <div className="text-right">
            <div className="text-[10px] font-medium text-muted mb-0.5">
              Yours
            </div>
            <div
              className="font-mono text-[17px] font-extrabold leading-tight"
              style={{
                color: isExact ? 'var(--warning-500)' : isHit ? 'var(--success-600)' : 'var(--danger-600)',
              }}
            >
              {card.predictedHomeScore} - {card.predictedAwayScore}
            </div>
          </div>
        </div>

        {/* Bottom row: XP earned + Consensus */}
        <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-border-subtle/50">
          <div className="flex items-center gap-2">
            {/* XP pill */}
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-md"
              style={{
                background: isHit ? 'color-mix(in srgb, var(--success-600) 10%, transparent)' : 'color-mix(in srgb, var(--sp-slate) 8%, transparent)',
                color: isHit ? 'var(--success-600)' : 'var(--neutral-500)',
              }}
            >
              +{card.xpEarned} XP
            </span>
          </div>

          {/* Consensus % */}
          {card.consensusPct !== null && (
            <span className="text-[10px] text-muted">
              {Math.round(card.consensusPct * 100)}% of pool got this right
            </span>
          )}
        </div>

        {/* Bragging rights callout for rare exact scores */}
        {isRareExact && (
          <div
            className="mt-2.5 flex items-center gap-1.5 rounded-chip py-1.5 px-2.5"
            style={{
              background: 'linear-gradient(135deg, color-mix(in srgb, var(--warning-500) 10%, transparent), color-mix(in srgb, var(--warning-500) 4%, transparent))',
              border: '1px solid color-mix(in srgb, var(--warning-500) 15%, transparent)',
            }}
          >
            <span className="text-xs leading-none">🔮</span>
            <span className="text-[10px] font-semibold" style={{ color: 'var(--warning-500)' }}>
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
        className="relative w-full sm:max-w-md bg-surface rounded-t-2xl sm:rounded-card shadow-card-elevated dark:border dark:border-border-default overflow-hidden max-h-[85vh] flex flex-col"
        style={{ animation: 'modal-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle flex-shrink-0">
          <h3 className="text-lg font-bold text-ink flex items-center gap-2">
            <span>🗺️</span>
            <span>Level Roadmap</span>
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-muted hover:bg-mist dark:hover:text-neutral-300 dark:hover:bg-neutral-800 transition-colors"
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
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-control transition-colors ${
                    isCurrent
                      ? 'bg-accent-50 dark:bg-accent-50 border border-accent-500/30'
                      : isReached
                        ? 'bg-success-50/50 dark:bg-success-900/10'
                        : 'bg-snow/30'
                  }`}
                >
                  {/* Check / number circle */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    isReached
                      ? 'bg-success-500 text-white'
                      : 'bg-neutral-200 dark:bg-neutral-700 text-muted'
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
                        : isReached ? 'text-ink'
                          : 'text-muted dark:text-muted'
                    }`}>
                      {level.name}
                    </div>
                    {level.badge && (
                      <div className="text-[10px] text-muted dark:text-muted">
                        Unlocks: {level.badge}
                      </div>
                    )}
                  </div>

                  {/* XP required */}
                  <span className={`text-xs font-medium tabular-nums flex-shrink-0 ${
                    isCurrent ? 'text-accent-700 dark:text-accent-500'
                      : isReached ? 'text-success-600 dark:text-success-400'
                        : 'text-muted dark:text-muted'
                  }`}>
                    {level.xpRequired.toLocaleString()} XP
                  </span>
                </div>
              )
            })}
          </div>

          {/* Current XP summary at bottom */}
          <div className="mt-4 pt-4 border-t border-border-subtle text-center">
            <div className="text-2xl font-black text-accent-500">{xpBreakdown.totalXP.toLocaleString()} XP</div>
            <div className="text-xs text-muted mt-0.5">
              {xpBreakdown.nextLevel
                ? `${xpBreakdown.xpToNextLevel.toLocaleString()} XP to ${xpBreakdown.nextLevel.name}`
                : 'Maximum level reached'
              }
            </div>

            {/* XP Breakdown Pills */}
            <div className="flex flex-wrap justify-center gap-2 mt-3">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-chip bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
                <span className="text-xs font-medium text-primary-600 dark:text-primary-400">Match XP</span>
                <span className="text-xs font-bold text-primary-700 dark:text-primary-300">{xpBreakdown.totalBaseXP.toLocaleString()}</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-chip bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800">
                <span className="text-xs font-medium text-success-600 dark:text-success-400">Bonus XP</span>
                <span className="text-xs font-bold text-success-700 dark:text-success-300">{xpBreakdown.totalBonusXP.toLocaleString()}</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-chip bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800">
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
      <TournamentRunSection matchXP={xpBreakdown.matchXP} crowdData={crowdData} />

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
