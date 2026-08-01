'use client'

import { useState, useRef, useMemo } from 'react'
import { levelColor, XP_SOURCE_COLOR } from '@/lib/design/levels'
import { rarityColor, rarityTint } from '@/lib/design/badges'
import { FORM_LEGEND, tierColor, tierTint } from '@/lib/design/formDots'
import { Icon } from '@/components/ui/Icon'
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
  /** match_number -> the teams THIS entry had in that knockout tie. */
  predictedKnockoutTeams?: Map<number, { home: string | null; away: string | null }>
}

// =============================================
// CONSTANTS
// =============================================

const TIER_BG_COLORS: Record<string, string> = {
  Bronze: 'bg-warning-100 dark:bg-warning-900/20 text-warning-800',
  Silver: 'bg-neutral-200 dark:bg-neutral-700 text-muted',
  Gold: 'bg-accent-100 dark:bg-accent-900/20 text-accent-700 dark:text-accent-500',
  Platinum: 'bg-accent-100 dark:bg-accent-900/20 text-accent-700 dark:text-accent-500',
}

// Rarity colours live in lib/design/badges.ts, shared with the app's
// useRarityColor. The copy that was here had Very Rare on gold and
// Legendary on amber — both wrong, and effectively swapped.

// Journey path node config per XP tier

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
              <span className="text-sm font-semibold text-success-900">Earned · +{badge.xpBonus} XP</span>
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
          <span className="t-num t-num-medium text-xs text-muted">
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
      <span className="t-num t-num-black text-[36px] leading-10" style={{ color }}>{value}</span>
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

function TierIcon({ tier, color }: { tier: string; color: string }) {
  if (tier === 'exact') return <Icon name="star.fill" size={12} weight="bold" tint={color} />
  if (tier === 'winner_gd') return <Icon name="checkmark" size={11} weight="bold" tint={color} />
  if (tier === 'winner') {
    return <span className="font-black text-sm leading-none" style={{ color }}>~</span>
  }
  return <Icon name="xmark" size={10} weight="bold" tint={color} />
}

/** RunLegend from the app: 7px dots with 11px muted labels, wrapping. */
function RunLegend() {
  return (
    <div className="flex flex-wrap gap-3">
      {FORM_LEGEND.filter(([t]) => t !== 'no_pick').map(([type, label]) => (
        <span key={type} className="flex items-center gap-1">
          <span
            className="w-[7px] h-[7px] rounded-pill"
            style={{ background: tierColor(type === 'miss' ? 'submitted' : type) }}
          />
          <span className="text-[11px] font-medium text-muted">
            {label === 'W+GD' ? 'Winner + GD' : label === 'Winner' ? 'Correct Result' : label}
          </span>
        </span>
      ))}
    </div>
  )
}

/**
 * TournamentNode from the app: a 32px circle filled with its tier at 20%, a 2px
 * border in the tier colour, a soft glow of the same, and the tier's glyph inside.
 * The match number sits beneath in 8px muted type. Misses use `mist` and `silver`
 * so they recede instead of competing.
 */
function TournamentNode({ tier, matchNumber, label, onTap, tapped }: {
  tier: string; matchNumber: number; label: string
  onTap: () => void; tapped: boolean
}) {
  const isMiss = tier === 'submitted'
  const color = isMiss ? tierColor('submitted') : tierColor(tier)
  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <div className="relative">
        <button
          type="button"
          onClick={onTap}
          className="w-8 h-8 rounded-pill border-2 flex items-center justify-center transition-opacity active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40"
          style={{
            backgroundColor: isMiss ? 'var(--sp-mist)' : tierTint(tier, 20),
            borderColor: color,
            boxShadow: isMiss ? 'none' : `0 0 4px ${tierTint(tier, 25)}`,
          }}
        >
          <TierIcon tier={tier} color={color} />
        </button>
        {tapped && (
          <span className="pointer-events-none absolute bottom-[38px] left-1/2 -translate-x-1/2 w-[120px] flex justify-center">
            <span className="bg-ink text-white text-[10px] font-semibold px-2 py-1 rounded-chip whitespace-nowrap truncate max-w-full">
              {label}
            </span>
          </span>
        )}
      </div>
      <span className="t-num text-[8px] text-muted">#{matchNumber}</span>
    </div>
  )
}

/** Connector from the app: 14x2, the PREVIOUS node's tier at 35%. */
function Connector({ prevTier }: { prevTier: string }) {
  const isMiss = prevTier === 'submitted'
  return (
    <span
      className="shrink-0 h-[2px] w-3.5"
      style={{ background: isMiss ? tierTint('submitted', 30) : tierTint(prevTier, 35) }}
    />
  )
}

/**
 * TournamentRunSection from the app: one card, a section header carrying the match
 * count, a horizontal run of nodes joined by connectors, and the legend beneath.
 *
 * The web version this replaces was a 34px node on a radial gradient with a
 * per-node entrance animation, an infinite pulsing glow on exact scores, a custom
 * scrollbar and a hover-tracking tooltip driven by mouse coordinates. None of that
 * is in the app, and the pulsing glow in particular made the row restless.
 */
function TournamentRunSection({ matchXP, crowdData }: { matchXP: MatchXP[]; crowdData: CrowdMatch[] }) {
  const [tapped, setTapped] = useState<string | null>(null)
  const sorted = [...matchXP].sort((a, b) => b.matchNumber - a.matchNumber)
  const crowdMap = new Map(crowdData.map(c => [c.matchNumber, c]))

  return (
    <div
      className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default overflow-hidden"
      style={{ animation: 'fadeUp 0.3s ease 0.2s both' }}
    >
      <div className="flex items-baseline justify-between px-4 pt-3 pb-2">
        <h3 className="t-section-header text-ink">Your Tournament Run</h3>
        <span className="t-num text-xs text-muted">
          {sorted.length > 0 ? `${sorted.length} ${sorted.length === 1 ? 'match' : 'matches'}` : 'Awaiting kickoff'}
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="px-4 pb-3 flex flex-col gap-3">
          <p className="text-[13px] leading-[18px] text-muted">
            Your match-by-match journey will appear here as fixtures complete. Each pick
            gets a tier — exact, winner + goal-difference, correct result, or miss.
          </p>
          <RunLegend />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto scrollbar-hide">
            <div className="flex items-center px-4 py-1 min-w-max">
              {sorted.map((match, idx) => {
                const crowd = crowdMap.get(match.matchNumber)
                const label = crowd
                  ? `${crowd.homeTeamName} ${crowd.actualHomeScore}-${crowd.actualAwayScore} ${crowd.awayTeamName}`
                  : `Match #${match.matchNumber}`
                return (
                  <div key={match.matchId} className="flex items-center">
                    {idx > 0 && <Connector prevTier={sorted[idx - 1].tier} />}
                    <TournamentNode
                      tier={match.tier}
                      matchNumber={match.matchNumber}
                      label={label}
                      tapped={tapped === match.matchId}
                      onTap={() => setTapped(cur => (cur === match.matchId ? null : match.matchId))}
                    />
                  </div>
                )
              })}
            </div>
          </div>
          <div className="px-4 pb-3 pt-1">
            <RunLegend />
          </div>
        </>
      )}
    </div>
  )
}
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
        <span className="t-num t-num-medium text-[11px] text-muted">{you} vs {crowd} {crowdLabel}</span>
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
            <span className="t-num t-num-black text-[32px] leading-9 text-primary-600">{userAccuracy}%</span>
          </div>
          <span className="w-9 h-9 rounded-pill bg-mist border-[0.5px] border-silver flex items-center justify-center text-[11px] font-black text-muted">
            VS
          </span>
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-bold tracking-[0.5px] text-muted">POOL AVG</span>
            <span className="t-num t-num-black text-[32px] leading-9 text-muted">{crowdAccuracy}%</span>
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
      <span className="t-num t-num-black text-2xl leading-7 text-ink">{value}</span>
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
  predictedKnockoutTeams,
}: {
  matchXP: MatchXP[]
  crowdData: CrowdMatch[]
  entryPredictions: PredictionData[]
  predictionResults: PredictionResult[]
  predictedKnockoutTeams?: Map<number, { home: string | null; away: string | null }>
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
    <div
      className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default overflow-hidden"
      style={{ animation: 'fadeUp 0.35s ease 0.35s both' }}
    >
      {/* Header, filters and rows all live inside one card now, like every other
          section on this tab — they used to sit loose above a separate card. */}
      <div className="flex items-baseline justify-between px-4 pt-3 pb-2">
        <h3 className="t-section-header text-ink">Match Results</h3>
        <span className="t-num text-xs text-muted">{counts.all} matches</span>
      </div>

      <div className="flex flex-wrap gap-2 px-4 pb-3">
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

      {/* One card holding divided rows, rather than a grid of cards. A two-column
          grid of five-row cards meant ten matches filled a screen; as rows they fit
          in a fraction of the height and stay scannable down the score columns. */}
      {displayList.length > 0 && (
        <div className="border-t border-border-subtle">
          <MatchListHeader />
          {displayList.map(card => (
            <MatchCard
              key={card.matchId}
              card={card}
              predictedTie={predictedKnockoutTeams?.get(card.matchNumber)}
            />
          ))}

          {/* Footer row of the table itself — the controls used to float below the
              card, which read as page furniture rather than part of the list. */}
          {remaining > 0 && (
            <div className="flex items-center justify-center gap-3 px-4 py-2.5 border-t border-border-subtle">
              <button
                onClick={() => setVisibleCount(v => v + 10)}
                className="text-[13px] font-bold px-3 py-1.5 rounded-pill transition-colors bg-mist text-muted hover:text-ink"
              >
                Show 10 more
              </button>
              <button
                onClick={() => setVisibleCount(filteredData.length)}
                className="text-[13px] font-bold px-3 py-1.5 rounded-pill transition-colors text-primary-600 hover:bg-primary-600/10"
              >
                Show all {filteredData.length}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Empty state for filter */}
      {displayList.length === 0 && (
        <div className="py-8 text-center text-sm text-muted">
          No matches match this filter.
        </div>
      )}

    </div>
  )
}

// =============================================
// MATCH CARD
// =============================================

/**
 * One line per match, in a single divided card.
 *
 * This was a two-column grid of cards that each stacked five rows — meta, status
 * badge, two team names, two score blocks, then XP and consensus — plus an optional
 * callout. Ten matches filled a screen. A match result is a small amount of
 * information, so it gets a row: tier dot, number, stage, fixture, both scores, XP.
 *
 * Colours come from lib/design/formDots. The copy that was here was the NINTH of
 * that mapping, and it collapsed winner_gd and winner onto the same green, so the
 * two tiers were indistinguishable — the same conflation the profile had.
 */
/** Column widths shared by the header and every row, so the numbers line up. */
const COL = {
  tier: 'w-4 shrink-0',
  num: 'w-8 shrink-0 text-right',
  stage: 'hidden sm:block w-14 shrink-0',
  fixture: 'flex-1 min-w-0',
  score: 'w-12 shrink-0 text-right tabular-nums',
  xp: 'w-12 shrink-0 text-right tabular-nums',
}

/** Labels the two score columns, so it is obvious which is the result and which is yours. */
function MatchListHeader() {
  return (
    <div className="flex items-center gap-2 sm:gap-3 px-3 py-2 border-b border-border-subtle">
      <span className={COL.tier} />
      <span className={`${COL.num} t-caption text-muted`}>#</span>
      <span className={`${COL.stage} t-caption text-muted`}>Stage</span>
      <span className={`${COL.fixture} t-caption text-muted`}>Match</span>
      <span className={`${COL.score} t-caption text-muted`}>Result</span>
      <span className={`${COL.score} t-caption text-muted`}>Yours</span>
      <span className={`${COL.xp} t-caption text-muted`}>XP</span>
    </div>
  )
}

/**
 * One line per match.
 *
 * Every column is a fixed width shared with MatchListHeader, so scores, XP and the
 * tier marker line up down the list — a run of results is meant to be scannable
 * vertically. The tier marker sits in its own slot at the LEFT rather than trailing
 * the row, because it only appears on exact scores and was pushing the right-hand
 * columns out of alignment on those rows.
 *
 * Colours come from lib/design/formDots. The copy that was here was the ninth of
 * that mapping, and it collapsed winner_gd and winner onto the same green.
 */
function MatchCard({ card, predictedTie }: { card: MatchCardData; predictedTie?: { home: string | null; away: string | null } }) {
  const tier = card.resultType === 'miss' ? 'miss' : card.resultType
  const color = tierColor(tier)
  const isExact = card.resultType === 'exact'
  const isHit = card.resultType !== 'miss'

  return (
    <div className="flex items-center gap-2 sm:gap-3 px-3 py-2 border-b border-border-subtle last:border-b-0">
      {/* Fixed slot: a star for exact, otherwise the tier dot. */}
      <span className={`${COL.tier} flex items-center justify-center`}>
        {isExact
          ? <Icon name="star.fill" size={12} weight="bold" tint={color} />
          : <span className="w-2 h-2 rounded-pill" style={{ background: color }} />}
      </span>

      <span className={`${COL.num} t-num text-[11px] text-muted`}>{card.matchNumber}</span>

      <span className={`${COL.stage} text-[10px] font-semibold text-muted truncate`}>
        {STAGE_LABELS[card.stage] ?? card.stage}{card.groupLetter ? ` ${card.groupLetter}` : ''}
      </span>

      <span className={`${COL.fixture} min-w-0`}>
        <span className="block text-[13px] text-ink truncate">
          {card.homeTeamName} v {card.awayTeamName}
          {card.isContrarian && (
            <span className="hidden md:inline ml-2 text-[10px] font-semibold px-1.5 py-px rounded-pill bg-primary-600/12 text-primary-700">
              Contrarian
            </span>
          )}
        </span>
        {/* Knockout ties are unknown at prediction time, so the fixture above is
            the ACTUAL one. Show who this entry had reaching it whenever that
            differs — otherwise the row silently implies they picked this tie. */}
        {predictedTie && (predictedTie.home !== card.homeTeamName || predictedTie.away !== card.awayTeamName) && (
          <span className="block text-[11px] text-muted truncate">
            You had: {predictedTie.home ?? '—'} v {predictedTie.away ?? '—'}
          </span>
        )}
      </span>

      {/* Result then yours, in matching columns — the comparison is the point. */}
      <span className={`${COL.score} t-num text-[13px] text-ink`}>
        {card.actualHomeScore}-{card.actualAwayScore}
      </span>
      <span className={`${COL.score} t-num text-[13px]`} style={{ color }}>
        {card.predictedHomeScore}-{card.predictedAwayScore}
      </span>

      <span
        className={`${COL.xp} t-num text-[11px]`}
        style={{ color: isHit ? 'var(--success-700)' : 'var(--sp-slate)' }}
      >
        +{card.xpEarned}
      </span>
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
                      : isReached ? 'text-success-900'
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
                <span className="text-xs font-medium text-primary-800">Match XP</span>
                <span className="text-xs font-bold text-primary-800">{xpBreakdown.totalBaseXP.toLocaleString()}</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-chip bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800">
                <span className="text-xs font-medium text-success-900">Bonus XP</span>
                <span className="text-xs font-bold text-success-900">{xpBreakdown.totalBonusXP.toLocaleString()}</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-chip bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800">
                <span className="text-xs font-medium text-warning-800">Badge XP</span>
                <span className="text-xs font-bold text-warning-800">{xpBreakdown.totalBadgeXP.toLocaleString()}</span>
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

export function XPProgressSection({ xpBreakdown, streaks, crowdData, poolStats, entryPredictions, predictionResults, predictedKnockoutTeams }: XPProgressSectionProps) {
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
        predictedKnockoutTeams={predictedKnockoutTeams}
      />

      {/* Level Roadmap Modal */}
      {showRoadmap && (
        <LevelRoadmapModal xpBreakdown={xpBreakdown} onClose={() => setShowRoadmap(false)} />
      )}
    </div>
  )
}
