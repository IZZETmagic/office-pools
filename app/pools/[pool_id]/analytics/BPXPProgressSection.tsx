'use client'

import { useState, useRef } from 'react'
import { levelPillClass } from '@/lib/design/levels'
import type { BPXPBreakdown, BPPoolComparison, BPKnockoutPickXP, BPGroupXPSummary, BPThirdPlaceXP } from './bracketPickerXpSystem'
import { Icon } from '@/components/ui/Icon'
import type { EarnedBadge, BadgeDefinition, LevelDefinition } from './xpSystem'
import { LEVELS } from './xpSystem'
import { BP_BADGE_DEFINITIONS } from './bracketPickerXpSystem'
import type { BonusXPEvent } from './xpSystem'
import type { TeamData } from '../types'
import { formatNumber } from '@/lib/format'
import { BadgeMedallion } from '@/components/BadgeMedallion'
import { rarityColor, rarityTint } from '@/lib/design/badges'

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

// No `dark:` overrides here: the ramps already invert, so `bg-accent-100` is a
// pale gold in light and a deep brown in dark on its own. The
// `dark:bg-accent-900/20` these carried jumped back to the light end of the
// ramp and inverted it a second time, which is why the Platinum pill rendered
// as a cream slab on the dark sheet.
const TIER_BG_COLORS: Record<string, string> = {
  Bronze: 'bg-warning-100 text-warning-800',
  Silver: 'bg-mist text-muted',
  Gold: 'bg-accent-100 text-accent-700',
  Platinum: 'bg-accent-100 text-accent-700',
}

// =============================================
// HERO CARD
// =============================================

// Level bands live in lib/design/levels.ts, shared with the app's useLevelColor.
// The copy that used to sit here was a band out of step with mobile — it put L6 on
// amber and L4 on primary, where the app has L6 on primary and L4 on sky, so the
// same level rendered a different colour depending on which platform you opened.
const getLevelTierStyle = levelPillClass

function BPXPHeroCard({ breakdown, onOpenRoadmap }: { breakdown: BPXPBreakdown; onOpenRoadmap: () => void }) {
  const { currentLevel, nextLevel, totalXP, levelProgress } = breakdown
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
      <div className="p-5 sm:p-6">
        <div className="flex items-center gap-4 sm:gap-5 mb-5">
          <div className={`flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center ${getLevelTierStyle(currentLevel.level)}`}>
            <span className="t-num t-num-black text-2xl sm:text-3xl">{currentLevel.level}</span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="t-section-header sm:text-2xl text-ink truncate">
                {currentLevel.name}
              </h3>
              {isMaxLevel && (
                <span className="flex-shrink-0 text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-chip bg-accent-100 text-accent-700">
                  MAX
                </span>
              )}
            </div>
            <p className="text-sm text-muted">
              {isMaxLevel
                ? `${totalXP.toLocaleString()} XP earned — legendary status achieved`
                : `${totalXP.toLocaleString()} XP — ${breakdown.xpToNextLevel.toLocaleString()} XP to ${nextLevel.name}`
              }
            </p>
          </div>

          <div className="flex-shrink-0 flex items-center gap-2">
            <div className="text-right hidden sm:block">
              <div className="t-num t-num-black text-2xl text-accent-500">{formatNumber(totalXP)}</div>
              <div className="t-caption text-muted">Total XP</div>
            </div>
            <Icon name="chevron.right" size={20} className="text-muted" />
          </div>
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="t-caption text-muted">
              Level {currentLevel.level}
            </span>
            <span className="t-caption text-muted">
              {isMaxLevel ? 'MAX LEVEL' : `Level ${nextLevel.level}`}
            </span>
          </div>
          <div className="w-full bg-mist rounded-pill h-3 overflow-hidden">
            <div
              className="h-full rounded-pill bg-gradient-to-r from-primary-500 to-accent-500 origin-left"
              style={{
                width: `${Math.round(levelProgress * 100)}%`,
                animation: 'barGrow 0.8s ease 0.3s both',
              }}
            />
          </div>
          <div className="flex items-center justify-between mt-1">
            <span className="t-num t-num-medium text-[10px] text-muted">
              {formatNumber(currentLevel.xpRequired)} XP
            </span>
            <span className="t-num t-num-medium text-[10px] text-muted">
              {isMaxLevel ? '' : `${formatNumber(nextLevel.xpRequired)} XP`}
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
  // Same BadgeCell shape the full-tournament tab already uses (and mobile's
  // FormTab before it): a 64px medallion well, the name, the XP. This tab was
  // the last one still drawing a bordered card per badge with a bare emoji
  // inside it, which is why its grid read like a spreadsheet and its locked
  // state turned into a mid-grey slab in dark mode.
  const tint = rarityColor(badge.rarity)

  return (
    <div className="group relative hover:z-10">
      <button
        type="button"
        onClick={onSelect}
        className="w-full flex flex-col items-center gap-1 transition-opacity hover:opacity-70 active:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40 rounded-chip"
      >
        <span
          className={`relative w-16 h-16 rounded-pill flex items-center justify-center ${badge.tier === 'Platinum' && earned ? 'shimmer-effect' : ''}`}
          style={{ backgroundColor: earned ? rarityTint(badge.rarity) : 'var(--sp-mist)' }}
        >
          {earned ? (
            <BadgeMedallion id={badge.id} emoji={badge.emoji} size={64} />
          ) : (
            <Icon name="lock.fill" size={20} weight="semibold" className="text-muted" />
          )}
        </span>

        <span
          className="text-[11px] font-medium text-center leading-tight truncate w-full"
          style={{ color: earned ? 'var(--sp-ink)' : 'var(--sp-silver)' }}
        >
          {badge.name}
        </span>

        <span className="t-num text-[9px]" style={{ color: earned ? tint : 'var(--sp-silver)' }}>
          +{formatNumber(badge.xpBonus)} XP
        </span>
      </button>

      <div className="hidden sm:group-hover:block absolute z-30 bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 px-3 py-2 rounded-chip bg-ink text-surface text-xs text-center shadow-card-elevated pointer-events-none">
        <div className="font-semibold mb-0.5">{badge.name}</div>
        <div className="text-surface/70">{badge.condition}</div>
        {earned ? (
          <div className="text-success-400 font-bold mt-1"><Icon name="checkmark" size={11} className="inline-block align-[-1px] mr-1" />Earned · +{badge.xpBonus} XP</div>
        ) : (
          <div className="text-surface/70 mt-1"><Icon name="lock.fill" size={11} className="inline-block align-[-1px] mr-1" />Locked</div>
        )}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-ink" />
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
        className="relative w-full sm:max-w-xs bg-surface rounded-t-2xl sm:rounded-card shadow-card-elevated dark:border dark:border-border-default overflow-hidden"
        style={{ animation: 'modal-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-muted hover:bg-mist dark:hover:bg-mist transition-colors z-10"
        >
          <Icon name="xmark" size={20} />
        </button>

        <div className="p-6 pt-8 text-center">
          <div className={`mb-3 ${earned ? '' : 'grayscale opacity-40 dark:opacity-60'}`}>
            <BadgeMedallion id={badge.id} emoji={badge.emoji} size={72} className="mx-auto" />
          </div>
          <h3 className="t-section-header text-ink mb-1.5">
            {badge.name}
          </h3>
          <div className="flex items-center justify-center gap-2 mb-4">
            <span className={`t-caption px-2 py-0.5 rounded-pill ${TIER_BG_COLORS[badge.tier]}`}>
              {badge.tier}
            </span>
            <span className="t-caption" style={{ color: rarityColor(badge.rarity) }}>
              {badge.rarity}
            </span>
          </div>
          <p className="text-sm text-muted mb-5">
            {badge.condition}
          </p>
          {earned ? (
            <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-control bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800">
              <Icon name="checkmark" size={16} className="text-success-500" />
              <span className="text-sm font-semibold text-success-900">Earned · +{badge.xpBonus} XP</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-4 py-2 rounded-control bg-mist border border-border-subtle">
              <Icon name="lock.fill" size={16} className="text-muted" />
              <span className="text-sm font-medium text-muted">Locked · +{badge.xpBonus} XP</span>
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
        className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default"
        style={{ animation: 'fadeUp 0.3s ease 0.1s both' }}
      >
        <div className="px-4 sm:px-5 py-3 border-b border-border-subtle rounded-t-xl">
          <div className="flex items-center justify-between">
            <h4 className="t-section-header text-ink flex items-center gap-2">
              <Icon name="medal.fill" size={16} />
              <span>Bracket Badges</span>
            </h4>
            <span className="t-num t-num-medium text-xs text-muted">
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
                    activePage === idx ? 'bg-accent-500' : 'bg-silver'
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
      <div className="flex items-baseline justify-between mb-1.5 gap-2">
        <span className="t-body text-muted truncate">{label}</span>
        {/* Each number is tinted like the half of the bar it describes, so
            "17 vs 13" cannot be read the wrong way round. */}
        <span className="t-num t-num-medium text-[10px] shrink-0">
          <span className="text-primary-600">{formatNumber(you)}</span>
          <span className="text-muted"> vs </span>
          <span className="text-muted">{formatNumber(crowd)}</span>
        </span>
      </div>
      <div className="relative h-2 rounded-pill bg-mist overflow-hidden">
        <div
          className="absolute top-0 left-0 h-full rounded-l-pill"
          style={{
            width: `calc(${youPct}% - 1px)`,
            background: 'linear-gradient(to right, var(--primary-600), var(--primary-500))',
            animation: `barGrow 1.2s cubic-bezier(0.4, 0, 0.2, 1) ${animDelay}s both`,
            transformOrigin: 'left',
          }}
        />
        {/* The crowd half used to be primary at 67% over primary — against the
            mist track the two halves composited to almost the same blue, so the
            faceoff read as one solid bar and you could not tell which side was
            yours. It is the neutral now: you are the colour, the pool is the
            field. */}
        <div
          className="absolute top-0 right-0 h-full rounded-r-pill bg-muted"
          style={{
            width: `calc(${crowdPct}% - 1px)`,
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
    <BPSectionCard title="You vs The Pool" animDelay={0.25}>
      <div className="px-4 pb-4">
        {/* VS Faceoff. "You" is the brand colour and the pool is the neutral —
            the same pairing the bars below use, so the two halves of every bar
            are readable without a legend. */}
        <div className="flex items-center justify-around mb-8">
          <div className="text-center">
            <div className="t-caption text-primary-600 mb-1">You</div>
            <div className="t-num t-num-extrabold text-[32px] leading-none text-primary-600">
              {userOverallAccuracy}%
            </div>
          </div>

          <div
            className="w-9 h-9 rounded-pill flex items-center justify-center flex-shrink-0 border border-border-subtle"
            style={{ background: 'linear-gradient(135deg, color-mix(in srgb, var(--primary-600) 12%, transparent), color-mix(in srgb, var(--primary-600) 20%, transparent))' }}
          >
            <span className="t-caption text-muted">VS</span>
          </div>

          <div className="text-center">
            <div className="t-caption text-muted mb-1">Pool Avg</div>
            <div className="t-num t-num-extrabold text-[32px] leading-none text-muted">
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
            <div className="t-caption text-muted mb-3">Bracket Boldness</div>
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
            <div className="flex items-start gap-2 rounded-chip px-3.5 py-2.5 bg-success-600/8 border border-success-600/15">
              <span className="shrink-0 text-primary-600"><Icon name="chart.line.uptrend.xyaxis" size={18} /></span>
              <div>
                <div className="t-body font-bold text-success-700">
                  Outperforming the pool by {accuracyDiff}%
                </div>
                {contrarianCount > 0 && contrarianAdv > 0 && (
                  <div className="t-detail text-muted mt-px">
                    Your contrarian win rate is {contrarianAdv}% higher than average
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-chip px-3.5 py-2.5 bg-primary-600/8 border border-primary-600/15">
              <span className="shrink-0 text-primary-600"><Icon name="target" size={18} /></span>
              <div>
                <div className="t-body font-bold text-primary-600">
                  {accuracyDiff === 0
                    ? 'Neck and neck with the pool'
                    : 'The pool has a slight edge — time to trust your gut?'}
                </div>
                <div className="t-detail text-muted mt-px">
                  {accuracyDiff === 0
                    ? "You\u2019re matching the pool average perfectly"
                    : `Only ${Math.abs(accuracyDiff)}% behind — one bold call could flip it`}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </BPSectionCard>
  )
}

// =============================================
// POOL-WIDE BRACKET STATS
// =============================================

function BPPoolWideStatsSection({ comparison, teams }: { comparison: BPPoolComparison; teams: TeamData[] }) {
  const { totalEntries, totalScoredPicks, mostPopularChampion, poolAvgOverallAccuracy } = comparison
  const teamLookup = new Map(teams.map(t => [t.team_id, t]))

  const stats: { value: string; label: string }[] = [
    { value: `${poolAvgOverallAccuracy}%`, label: 'Avg Pool Accuracy' },
    { value: formatNumber(totalEntries), label: 'Competitors' },
    // Picks Scored runs to five figures in a big pool, so it needs the
    // separator every other total on the tab already gets.
    { value: formatNumber(totalScoredPicks), label: 'Picks Scored' },
  ]

  return (
    <BPSectionCard title="Pool-Wide Stats" animDelay={0.28}>
      <div className="px-4 pb-4">
        <div className="flex items-start justify-around mb-4 gap-2">
          {stats.map(s => (
            <div key={s.label} className="text-center min-w-0">
              <div className="t-num t-num-extrabold text-2xl text-ink">{s.value}</div>
              <div className="t-detail text-muted mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {mostPopularChampion && (() => {
          const team = teamLookup.get(mostPopularChampion.team_id)
          return (
            <div className="border border-border-subtle rounded-chip p-3">
              <div className="t-caption text-muted mb-2">
                Pool&apos;s Favourite Champion
              </div>
              <div className="flex items-center gap-3">
                {team?.flag_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={team.flag_url} alt="" className="w-8 h-6 object-cover rounded-[2px] flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="t-card-title text-ink truncate">
                    {team?.country_name ?? 'Unknown'}
                  </div>
                  <div className="t-num t-num-medium text-[10px] text-muted">
                    {Math.round(mostPopularChampion.pct * 100)}% of brackets
                  </div>
                </div>
                <span className="shrink-0 text-accent-500"><Icon name="crown.fill" size={20} /></span>
              </div>
            </div>
          )
        })()}
      </div>
    </BPSectionCard>
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
      className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default"
      style={{ animation: 'fadeUp 0.3s ease 0.35s both' }}
    >
      <div className="px-4 sm:px-5 py-3 border-b border-border-subtle rounded-t-xl">
        <div className="flex items-center justify-between">
          <h4 className="t-section-header text-ink flex items-center gap-2">
            <Icon name="target" size={16} />
            <span>Bonus Events</span>
          </h4>
          <span className="t-num t-num-extrabold text-xs text-accent-500">{formatNumber(totalBonusXP)} XP</span>
        </div>
      </div>
      <div className="p-4 sm:p-5 space-y-2">
        {bonusEvents.map((event, idx) => (
          <div
            key={`${event.type}-${idx}`}
            className="flex items-center gap-3 px-3 py-2.5 rounded-chip bg-gradient-to-r from-accent-50 dark:from-accent-900/10 to-transparent border border-accent-200/50 dark:border-accent-800/20"
          >
            <span className="text-xl flex-shrink-0">{event.emoji}</span>
            <div className="flex-1 min-w-0">
              <div className="t-body font-bold text-ink">{event.label}</div>
              {event.detail && (
                <div className="t-detail text-muted truncate">{event.detail}</div>
              )}
            </div>
            <span className="t-num t-num-extrabold text-xs text-accent-500 flex-shrink-0">+{formatNumber(event.xp)} XP</span>
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
        className="relative w-full sm:max-w-md bg-surface rounded-t-2xl sm:rounded-card shadow-card-elevated dark:border dark:border-border-default overflow-hidden max-h-[85vh] flex flex-col"
        style={{ animation: 'modal-slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1) both' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle flex-shrink-0">
          <h3 className="t-section-header text-ink flex items-center gap-2">
            <span>🗺️</span>
            <span>Level Roadmap</span>
          </h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-muted hover:text-muted hover:bg-mist dark:hover:bg-mist transition-colors"
          >
            <Icon name="xmark" size={20} />
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
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-control transition-colors ${
                    isCurrent
                      ? 'bg-accent-50 dark:bg-accent-50 border border-accent-500/30'
                      : isReached
                        ? 'bg-success-50/50 dark:bg-success-900/10'
                        : 'bg-snow/30'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                    isReached
                      ? 'bg-success-500 text-white'
                      : 'bg-mist text-muted'
                  }`}>
                    {isReached ? (
                      <Icon name="checkmark" size={16} />
                    ) : (
                      level.level
                    )}
                  </div>
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
                  <span className={`t-num t-num-medium text-xs flex-shrink-0 ${
                    isCurrent ? 'text-accent-700 dark:text-accent-500'
                      : isReached ? 'text-success-900'
                        : 'text-muted dark:text-muted'
                  }`}>
                    {formatNumber(level.xpRequired)} XP
                  </span>
                </div>
              )
            })}
          </div>

          <div className="mt-4 pt-4 border-t border-border-subtle text-center">
            <div className="t-num t-num-black text-2xl text-accent-500">{formatNumber(breakdown.totalXP)} XP</div>
            <div className="text-xs text-muted mt-0.5">
              {breakdown.nextLevel
                ? `${formatNumber(breakdown.xpToNextLevel)} XP to ${breakdown.nextLevel.name}`
                : 'Maximum level reached'
              }
            </div>

            <div className="flex flex-wrap justify-center gap-2 mt-3">
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-chip bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
                <span className="text-xs font-medium text-primary-800">Group XP</span>
                <span className="t-num t-num-extrabold text-xs text-primary-800">{formatNumber(breakdown.totalGroupBaseXP + breakdown.totalGroupBonusXP)}</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-chip bg-success-50 dark:bg-success-900/20 border border-success-200 dark:border-success-800">
                <span className="text-xs font-medium text-success-900">Knockout XP</span>
                <span className="t-num t-num-extrabold text-xs text-success-900">{formatNumber(breakdown.totalKnockoutBaseXP + breakdown.totalKnockoutBonusXP)}</span>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-chip bg-warning-50 dark:bg-warning-900/20 border border-warning-200 dark:border-warning-800">
                <span className="text-xs font-medium text-warning-800">Badge XP</span>
                <span className="t-num t-num-extrabold text-xs text-warning-800">{formatNumber(breakdown.totalBadgeXP)}</span>
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


/**
 * One card shell for every section on this tab, so the header size, padding,
 * radius and shadow cannot drift between them. The sections here had reached
 * three different header treatments — `text-sm font-semibold`, `text-lg
 * font-bold`, and the section-header variant — which is what made the tab read
 * as assembled rather than designed.
 */
function BPSectionCard({
  title,
  subtitle,
  children,
  animDelay = 0,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
  animDelay?: number
}) {
  return (
    <div
      className="bg-surface rounded-card shadow-card dark:shadow-none dark:border dark:border-border-default overflow-hidden"
      style={{ animation: `fadeUp 0.3s ease ${animDelay}s both` }}
    >
      <div className="flex items-baseline justify-between px-4 pt-3 pb-2">
        <h3 className="t-section-header text-ink">{title}</h3>
        {subtitle ? <span className="t-num text-xs text-muted">{subtitle}</span> : null}
      </div>
      {children}
    </div>
  )
}

/** Shared column widths, so every pick list on this tab lines up identically. */
const BP_COL = {
  mark: 'w-4 shrink-0 flex items-center justify-center',
  round: 'w-16 shrink-0 text-[10px] font-semibold text-muted truncate',
  yours: 'flex-1 min-w-0 text-[13px] truncate',
  actual: 'flex-1 min-w-0 text-[13px] truncate',
  xp: 'w-10 shrink-0 text-right t-num text-[11px]',
}

function BPPickHeader({ left, right }: { left: string; right: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 border-b border-border-subtle">
      <span className={BP_COL.mark} />
      <span className={`${BP_COL.round} t-caption`}>Round</span>
      <span className={`${BP_COL.yours} t-caption text-muted`}>{left}</span>
      <span className={`${BP_COL.actual} t-caption text-muted`}>{right}</span>
      <span className={`${BP_COL.xp} t-caption text-muted`}>XP</span>
    </div>
  )
}

/** Correct / wrong / not-yet-decided, as one consistent marker. */
function BPMark({ state }: { state: 'correct' | 'wrong' | 'pending' }) {
  if (state === 'pending') return <span className="w-2 h-2 rounded-pill bg-silver" />
  return (
    <Icon
      name={state === 'correct' ? 'checkmark' : 'xmark'}
      size={11}
      weight="bold"
      tint={state === 'correct' ? 'var(--sp-tier-winner-gd)' : 'var(--danger-600)'}
    />
  )
}

function pickColor(state: 'correct' | 'wrong' | 'pending') {
  return state === 'pending'
    ? 'var(--sp-slate)'
    : state === 'correct' ? 'var(--sp-tier-winner-gd)' : 'var(--danger-600)'
}

/**
 * Group-stage picks: the position this entry gave each team, against where the
 * team actually finished. Same shape as the knockout list so the two read as one
 * idea — your pick on the left under its own heading, what happened on the right.
 */
function BPGroupPicksSection({ groups, teams }: { groups: BPGroupXPSummary[]; teams: TeamData[] }) {
  const positions = groups.flatMap(g => g.positions)
  if (positions.length === 0) return null

  const nameOf = (id: string) => teams.find(t => t.team_id === id)?.country_name ?? 'Unknown'
  const decided = positions.filter(p => p.actual_position !== null)
  const correct = decided.filter(p => p.correct).length

  return (
    <BPSectionCard
      title="Your Group Picks"
      subtitle={decided.length > 0 ? `${correct}/${decided.length} correct` : 'Awaiting results'}
      animDelay={0.15}
    >
      <BPPickHeader left="You had them" right="They finished" />
      {positions.map(pos => {
        const state = pos.actual_position === null ? 'pending' : pos.correct ? 'correct' : 'wrong'
        return (
          <div
            key={`${pos.group_letter}-${pos.team_id}`}
            className="flex items-center gap-3 px-4 py-2 border-b border-border-subtle last:border-b-0"
          >
            <span className={BP_COL.mark}><BPMark state={state} /></span>
            <span className={BP_COL.round}>Group {pos.group_letter}</span>
            <span className={BP_COL.yours} style={{ color: pickColor(state) }}>
              {nameOf(pos.team_id)} · {pos.predicted_position}
              {pos.predicted_position === 1 ? 'st' : pos.predicted_position === 2 ? 'nd' : pos.predicted_position === 3 ? 'rd' : 'th'}
            </span>
            <span className={`${BP_COL.actual} text-ink`}>
              {pos.actual_position === null
                ? <span className="text-muted">Not decided</span>
                : `${pos.actual_position}${pos.actual_position === 1 ? 'st' : pos.actual_position === 2 ? 'nd' : pos.actual_position === 3 ? 'rd' : 'th'}`}
            </span>
            <span className={BP_COL.xp} style={{ color: pos.correct ? 'var(--success-700)' : 'var(--sp-slate)' }}>
              +{pos.xp}
            </span>
          </div>
        )
      })}
    </BPSectionCard>
  )
}

/** Third-place qualifiers this entry backed, against who actually went through. */
function BPThirdPlaceSection({ picks, teams }: { picks: BPThirdPlaceXP[]; teams: TeamData[] }) {
  const backed = picks.filter(p => p.predicted_qualifies)
  if (backed.length === 0) return null

  const nameOf = (id: string) => teams.find(t => t.team_id === id)?.country_name ?? 'Unknown'
  const correct = backed.filter(p => p.correct).length

  return (
    <BPSectionCard
      title="Your Third-Place Picks"
      subtitle={`${correct}/${backed.length} correct`}
      animDelay={0.18}
    >
      <BPPickHeader left="You backed" right="Qualified" />
      {backed.map(pick => {
        const state = pick.correct ? 'correct' : 'wrong'
        return (
          <div
            key={pick.team_id}
            className="flex items-center gap-3 px-4 py-2 border-b border-border-subtle last:border-b-0"
          >
            <span className={BP_COL.mark}><BPMark state={state} /></span>
            <span className={BP_COL.round}>Group {pick.group_letter}</span>
            <span className={BP_COL.yours} style={{ color: pickColor(state) }}>
              {nameOf(pick.team_id)}
            </span>
            <span className={`${BP_COL.actual} text-ink`}>
              {pick.actually_qualifies ? 'Went through' : <span className="text-muted">Did not qualify</span>}
            </span>
            <span className={BP_COL.xp} style={{ color: pick.correct ? 'var(--success-700)' : 'var(--sp-slate)' }}>
              +{pick.xp}
            </span>
          </div>
        )
      })}
    </BPSectionCard>
  )
}

/**
 * Your knockout picks, round by round.
 *
 * The bracket Form tab reported knockout accuracy only as a count — "Knockout
 * Picks: 8 vs 6" — so there was no way to see WHICH teams you backed or where you
 * went wrong. knockoutXP has carried predicted_winner, actual_winner and correct
 * per match all along; it was simply never rendered.
 *
 * Each row names your pick and, when it was wrong, the team that actually went
 * through, so the two are never ambiguous: yours is labelled and coloured by
 * outcome, the actual result sits beside it under its own heading.
 */
function BPKnockoutPicksSection({ picks, teams }: { picks: BPKnockoutPickXP[]; teams: TeamData[] }) {
  if (picks.length === 0) return null

  const nameOf = (id: string | null) =>
    id ? (teams.find(t => t.team_id === id)?.country_name ?? 'Unknown') : null

  const decided = picks.filter(p => p.actual_winner !== null)
  const correct = decided.filter(p => p.correct).length

  return (
    <BPSectionCard
      title="Your Knockout Picks"
      subtitle={decided.length > 0 ? `${correct}/${decided.length} correct` : 'Awaiting results'}
      animDelay={0.21}
    >
      <BPPickHeader left="Your pick" right="Went through" />
      {picks.map(pick => {
        const state = pick.actual_winner === null ? 'pending' : pick.correct ? 'correct' : 'wrong'
        return (
          <div
            key={pick.match_id}
            className="flex items-center gap-3 px-4 py-2 border-b border-border-subtle last:border-b-0"
          >
            <span className={BP_COL.mark}><BPMark state={state} /></span>
            <span className={BP_COL.round}>{BP_STAGE_LABELS[pick.stage] ?? pick.stage}</span>
            <span className={BP_COL.yours} style={{ color: pickColor(state) }}>
              {nameOf(pick.predicted_winner) ?? '—'}
            </span>
            <span className={`${BP_COL.actual} text-ink`}>
              {state === 'pending'
                ? <span className="text-muted">Not decided</span>
                : nameOf(pick.actual_winner)}
            </span>
            <span className={BP_COL.xp} style={{ color: pick.correct ? 'var(--success-700)' : 'var(--sp-slate)' }}>
              +{pick.xp}
            </span>
          </div>
        )
      })}
    </BPSectionCard>
  )
}

const BP_STAGE_LABELS: Record<string, string> = {
  round_32: 'R32',
  round_16: 'R16',
  quarter_final: 'QF',
  semi_final: 'SF',
  third_place: '3rd',
  final: 'Final',
  finals: 'Final',
}

export function BPXPProgressSection({ bpXpBreakdown, teams, bpPoolComparison }: BPXPProgressSectionProps) {
  const [showRoadmap, setShowRoadmap] = useState(false)

  return (
    <div className="space-y-4">
      {/* Hero Card */}
      <BPXPHeroCard breakdown={bpXpBreakdown} onOpenRoadmap={() => setShowRoadmap(true)} />

      {/* Badge Grid */}
      <BPBadgeGrid earnedBadges={bpXpBreakdown.earnedBadges} />

      <BPGroupPicksSection groups={bpXpBreakdown.groupXP} teams={teams} />
      <BPThirdPlaceSection picks={bpXpBreakdown.thirdPlaceXP} teams={teams} />
      <BPKnockoutPicksSection picks={bpXpBreakdown.knockoutXP} teams={teams} />

      {/* You vs The Pool + Pool Stats (side by side on desktop) */}
      {bpPoolComparison && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
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
