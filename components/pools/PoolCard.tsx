'use client'

// =============================================================
// THE POOL CARD — one component, both lists
// =============================================================
// There used to be three near-copies of this markup: a mobile and a desktop
// card inside app/pools/PoolsClient.tsx, and a third inside
// app/dashboard/DashboardClient.tsx. They rendered the same four KPI tiles, the
// same header and the same foot, and they had drifted in five places — the
// action pill existed on one page only, the two deadline chips used different
// formats (and the dashboard's dropped the hour), the foot pinned itself on one
// card and dangled on the other, the invite nudge was on one page only, and the
// empty form dots were coloured two different ways.
//
// What the sentences on the card SAY lives in lib/pools/card.ts, which has
// tests. This file is only how they are arranged.
//
// ## Sizes
//
// `rail` is the one real difference left between the two lists, and it is
// measured rather than chosen — see SIZES in components/competitions/
// CompetitionRail.tsx. The pools list is 544px wide and affords the 46px rail;
// the dashboard's `lg:grid-cols-3` inside `max-w-6xl` is 357px, which is the
// width at which a 46px rail clips the "Matchweek" label and wraps the pill row.
//
// `PoolStripCard` below is a genuinely different card — 224px, three stats, no
// pill — for the dashboard's mobile horizontal scroller, and stays separate.
// =============================================================

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { CSSProperties } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Avatar, AvatarStack } from '@/components/ui/Avatar'
import { countdownText, countdownIsHours, useCountdown } from '@/components/ui/Countdown'
import { LocalTime } from '@/components/LocalTime'
import { CompetitionRail, type RailSize } from '@/components/competitions/CompetitionRail'
import { getFormDotClass } from '@/lib/design/formDots'
import { getModeName, getModeChip } from '@/lib/design/poolMode'
import {
  type PoolCardPool,
  type KpiTile,
  poolCardAction,
  deadlineChip,
  kpiTiles,
  duelDotClass,
} from '@/lib/pools/card'

export type CardVariant = 'list' | 'grid'

/**
 * What each list can afford.
 *
 * ⚠ BOTH NUMBERS ARE MEASURED. The pools list is 544px and takes the 46px rail
 * and all four tiles at ~120px each. The dashboard's `lg:grid-cols-3` inside
 * `max-w-6xl` is 357px, which after a 30px rail and the card's padding leaves
 * each of four tiles 68px — and `px-3` inside that leaves 44px for the text. A
 * caption like "provisional" needs ~55px and "0W 0T 2L" ~48px, so on the
 * dashboard every sub-caption truncated: "provision…", "0W 0T …", "no table …",
 * "Round…". Three tiles is ~98px each, which fits them.
 *
 * ⚠ THE FOURTH TILE IS THE ONE THAT GOES, whatever it is — `kpiTiles` returns
 * every mode's tiles most-important-first for exactly this reason. Ryan's call,
 * 2026-08-29, against a measurement of the squeeze.
 */
const SHAPE: Record<CardVariant, { rail: RailSize; tiles: number }> = {
  list: { rail: 'default', tiles: 4 },
  grid: { rail: 'compact', tiles: 3 },
}

type Props = {
  pool: PoolCardPool
  unreadCount: number
  /** Staggers the fade-up. */
  index?: number
  /**
   * Which list this card is sitting in. See the header — the two differ ONLY in
   * width, and everything that follows from width is derived here rather than
   * passed separately, so a second narrow-card decision cannot drift away from
   * the first.
   */
  variant?: CardVariant
  /** Admin invite nudge. Omit both and the nudge is not rendered. */
  onCopyLink?: (e: React.MouseEvent, poolId: string, poolCode: string) => void
  onCopyCode?: (e: React.MouseEvent, poolId: string, poolCode: string) => void
  linkCopied?: boolean
  codeCopied?: boolean
}

export function PoolCard({
  pool,
  unreadCount,
  index = 0,
  variant = 'list',
  onCopyLink,
  onCopyCode,
  linkCopied = false,
  codeCopied = false,
}: Props) {
  const router = useRouter()
  const action = poolCardAction(pool)
  const deadline = deadlineChip(pool.prediction_deadline)
  const hasBranding = !!(pool.brand_name && (pool.brand_emoji || pool.brand_logo_url) && pool.brand_color)
  const showInvite = pool.role === 'admin' && pool.memberCount < 10 && !!onCopyLink && !!onCopyCode

  return (
    <Link
      href={`/pools/${pool.pool_id}`}
      className={`flex flex-col h-full rounded-card ${hasBranding ? '' : 'border border-border-subtle'} bg-surface hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 overflow-hidden animate-fade-up`}
      style={{ animationDelay: `${index * 0.06}s` }}
    >
      {hasBranding && <BrandBanner pool={pool} />}

      {/* ⚠ flex-1, or the rail stops short. The grid stretches every card to the
          tallest in its row, but this row only grows to its own content — so a
          shorter card drew its rail two thirds of the way down and left white
          below it. */}
      <div
        className="flex flex-1"
        style={hasBranding ? { backgroundColor: `${pool.brand_color}1F` } : undefined}
      >
        {/* Branded pools show their banner instead of the rail, as RN's
            PoolCard does. */}
        {!hasBranding && <CompetitionRail externalLeagueId={pool.externalLeagueId} size={SHAPE[variant].rail} />}

        <div className="flex-1 min-w-0 p-4 flex flex-col">
          {/* ---- header: name, then badges and the action pill ----
              ⚠ THE NAME GETS THE WHOLE ROW, and the pill sits on the row below.
              Sharing row one with the pill cost the name ~150px of a ~340px
              card on the dashboard's `lg:grid-cols-3`, which truncated most of
              them to nothing useful — "Premier League Test Tabl…", "Pick'em:
              Exact Sco…". The badges beside it are small and wrap, so the pill
              is cheap company for them and expensive company for the name. */}
          <div className="flex items-center gap-2">
            <h4 className="text-lg font-bold text-ink truncate">{pool.pool_name}</h4>
            {unreadCount > 0 && (
              <span className="min-w-[20px] h-[20px] px-1.5 rounded-pill bg-danger-500 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>

          {/* ---- 3. the chips: mode and admin ----
              ⚠ NO STATUS CHIP. "Open" was on every card that was not finished,
              which is nearly all of them, so it carried almost no information —
              and the two things it could have told you are already said better
              elsewhere on the card: the clock says whether picking is closed,
              and a completed pool's pill says "Results". Archived pools never
              reach either list. Ryan's call, 2026-08-29. */}
          <div className="flex items-start gap-2 mt-1.5">
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-bold mode-pill"
                style={getModeChip(pool.prediction_mode, pool.league_mode) as CSSProperties}
              >
                {getModeName(pool.prediction_mode, pool.league_mode)}
              </span>
              {pool.role === 'admin' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-bold border border-border-default text-muted">
                  Admin
                </span>
              )}
              {/* ⚠ NO MEMBER-COUNT CHIP. The avatar stack in the foot counts the
                  pool already — three faces and "+N" — and a "👥 10" beside it
                  was the same number twice. See the note in lib/pools/card.ts
                  where the status line it replaced used to live. */}
            </div>

            {action.isButton ? (
              <button
                onClick={(e) => {
                  e.preventDefault()
                  router.push(`/pools/${pool.pool_id}?tab=predictions`)
                }}
                className={`shrink-0 ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-chip text-xs font-semibold ${action.className}`}
              >
                {action.label}
                {action.icon === 'arrow' && <span className="ml-0.5">&rarr;</span>}
              </button>
            ) : (
              <span
                className={`shrink-0 ml-auto inline-flex items-center gap-1 px-3 py-1.5 rounded-chip text-xs font-semibold ${action.className}`}
              >
                {action.label}
                {action.icon === 'arrow' && <span className="ml-0.5">&rarr;</span>}
              </span>
            )}
          </div>

          {/* ---- 5. the KPI strip — the only mode-dependent slot ---- */}
          <KpiStrip pool={pool} limit={SHAPE[variant].tiles} />

          {/* ---- foot: status + clock ----
              ⚠ mt-auto. The grid stretches a card to match its tallest sibling,
              and without this the extra height falls BELOW this row rather than
              above it, leaving the border-t floating mid-card. */}
          <div className="flex items-center justify-between gap-2 mt-auto pt-3 border-t border-border-subtle">
            {/* 6. Who you are playing. RN's home card has always ended on the
                member avatars and the web card ended on a sentence restating a
                tile; this is the app's row. `memberCount` drives the "+N", so a
                192-member pool still only ships three rows to draw it. */}
            <AvatarStack people={pool.members} total={pool.memberCount} />
            {deadline.show && (
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-semibold ${deadline.className}`}
              >
                <Icon name="clock" size={14} weight="semibold" />
                {/* Wall-clock text in the VIEWER's timezone — see note 3 in
                    lib/pools/card.ts. */}
                <LocalTime
                  iso={pool.prediction_deadline!}
                  format={deadline.format}
                  fallback={deadline.fallback}
                />
              </span>
            )}
          </div>

          {showInvite && (
            <div className="mt-3 bg-primary-50 dark:bg-primary-500/10 rounded-chip px-3 py-2 flex items-center justify-between">
              <span className="text-[11px] text-muted">
                {pool.memberCount} player{pool.memberCount !== 1 ? 's' : ''} &mdash; invite more
              </span>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                <button
                  onClick={(e) => onCopyLink!(e, pool.pool_id, pool.pool_code)}
                  className="text-[11px] text-primary-800 font-semibold hover:underline"
                >
                  {linkCopied ? 'Copied!' : 'Copy Link'}
                </button>
                <span className="text-muted">|</span>
                <button
                  onClick={(e) => onCopyCode!(e, pool.pool_id, pool.pool_code)}
                  className="text-[11px] text-primary-800 font-semibold hover:underline"
                >
                  {codeCopied ? 'Copied!' : 'Copy Code'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

// =============================================================
// THE STRIP CARD — the dashboard's mobile horizontal scroller
// =============================================================
// 224px wide and deliberately not the card above: three stats rather than four,
// no action pill, and a `compact` rail. See the SIZES note in CompetitionRail —
// `compact` knowingly trades wordmark legibility for the width, and is Ryan's
// call against a mockup of exactly this card.
// =============================================================

export function PoolStripCard({ pool, unreadCount }: { pool: PoolCardPool; unreadCount: number }) {
  const action = poolCardAction(pool)
  const tiles = kpiTiles(pool)
  // ⚠ EVERYTHING THAT IS NOT DOTS, not just `stat`. A crest, a face and a clock
  // are all values in a tile — filtering on the one shape that existed when this
  // was written would have silently dropped Last Man Standing's club and
  // Showdown's opponent off this card, leaving two tiles and a gap.
  const stats = tiles.filter((t) => t.kind !== 'dots').slice(0, 3)
  const dotsTile = tiles.find((t) => t.kind === 'dots')
  // Whatever the big card puts last — a dot strip on most modes, a number on
  // Last Man Standing. 224px fits three tiles above it and this one below.
  const fourth = tiles[3]
  const hasBranding = !!(pool.brand_name && (pool.brand_emoji || pool.brand_logo_url) && pool.brand_color)
  // The pill's copy, minus the pill: this card has no room for a button, but
  // "6 of 10 picked" is exactly the line it wants under the title.
  const settled = !action.isButton && action.icon === 'check'

  return (
    <Link
      href={`/pools/${pool.pool_id}`}
      className={`w-56 h-full min-h-[9rem] rounded-card ${hasBranding ? '' : 'border border-border-subtle'} bg-surface flex hover:shadow-md active:scale-[0.98] transition-all duration-200 overflow-hidden`}
    >
      {!hasBranding && <CompetitionRail externalLeagueId={pool.externalLeagueId} size="compact" />}
      <div className="flex-1 flex flex-col min-w-0">
        {hasBranding && <BrandBanner pool={pool} compact />}
        <div
          className="p-3 flex flex-col flex-1"
          style={hasBranding ? { backgroundColor: `${pool.brand_color}1F` } : undefined}
        >
          <div className="flex items-center gap-1.5">
            <h4 className="text-sm font-bold text-ink line-clamp-2">{pool.pool_name}</h4>
            {unreadCount > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 rounded-pill bg-danger-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <p
            className={`text-[10px] font-semibold mt-1 truncate ${settled ? 'text-success-900' : 'text-warning-800'}`}
          >
            {action.label}
          </p>

          {/* ⚠ THE SAME TILES AS THE BIG CARD, just the first three of them and
              set smaller. 224px fits three, and the fourth is always the dots —
              which get their own row below. Taking them from `kpiTiles` rather
              than hardcoding Rank/Matchweek/Points is what makes this card
              inherit every future mode without being edited again. */}
          <div className="mt-auto pt-3 grid grid-cols-3 gap-1">
            {stats.map((tile, i) => (
              <StripTile key={i} tile={tile} align={i === 2 ? 'end' : i === 1 ? 'center' : 'start'} />
            ))}
          </div>

          {/* The foot row carries the strip's fourth tile. Most modes make that
              a dot strip; Last Man Standing's fourth is a number ("Still in 4
              of 10"), so it renders as a label/value pair instead of an empty
              Form row that would say nothing. */}
          <div className="flex items-center justify-between gap-2 mt-2.5 pt-2 border-t border-border-subtle">
            <span className="text-[10px] font-medium text-muted truncate">{fourth?.label ?? 'Form'}</span>
            {dotsTile ? (
              <Dots dots={dotsTile.dots} palette={dotsTile.palette} size={7} />
            ) : (
              <span className="t-num text-[11px] text-ink shrink-0">
                {fourth && fourth.kind === 'stat' ? `${fourth.value}${fourth.sub ? ` ${fourth.sub}` : ''}` : '—'}
              </span>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

/**
 * One tile of the strip card, in whichever shape it arrived as.
 *
 * ⚠ 54px, MEASURED. The card is 224px, the compact rail takes 30, `p-3` takes
 * 24 and the three columns share 4px of gap — which leaves 54px a tile, or five
 * characters of Geist Mono at `text-lg`. That is the whole reason a club and an
 * opponent are drawn rather than named here: "Arsenal" is 75.6px and every club
 * in the league clipped mid-word. The two wide cards keep the words.
 */
function StripTile({ tile, align }: { tile: Exclude<KpiTile, { kind: 'dots' }>; align: 'start' | 'center' | 'end' }) {
  const text = align === 'end' ? 'text-right' : align === 'center' ? 'text-center' : ''
  const justify = align === 'end' ? 'justify-end' : align === 'center' ? 'justify-center' : ''
  const mark = tile.kind === 'face' || (tile.kind === 'crest' && tile.crestUrl)
  return (
    <div className={`min-w-0 ${text}`}>
      <p className="text-[10px] font-medium text-muted mb-0.5 truncate">{tile.label}</p>
      {tile.kind === 'clock' ? (
        // ⚠ ONE STEP DOWN FROM ITS SIBLINGS. `47:12` is exactly 54.0px at
        // `text-lg` — the entire column, with nothing left for the rounding — and
        // 48px at `text-base`, which fits. A clock is not a score, so reading a
        // size smaller than the number beside it is honest as well as necessary.
        <ClockValue tile={tile} size="text-base" subSize="text-[9px]" />
      ) : (
        <>
          {mark ? (
            <span
              className={`flex items-center h-[22px] ${justify}`}
              title={tile.kind === 'crest' || tile.kind === 'face' ? tile.value : undefined}
            >
              <TileMark tile={tile} size={22} standalone />
            </span>
          ) : (
            /* `mark` is an aliased discriminant, so this branch is 'stat' | 'crest'
               — both of which carry a tone. A crest reaches it only when the feed
               had no badge for the club, which is the case the name still covers. */
            <p className={`t-num text-lg leading-tight truncate ${tile.tone === 'muted' ? 'text-muted' : tile.tone === 'accent' ? 'text-primary-600' : 'text-ink'}`}>
              {tile.value}
            </p>
          )}
          {tile.sub && <p className="text-[9px] text-muted leading-tight truncate">{tile.sub}</p>}
        </>
      )}
    </div>
  )
}

// =============================================================
// PIECES
// =============================================================

function BrandBanner({ pool, compact = false }: { pool: PoolCardPool; compact?: boolean }) {
  return (
    <div
      className={`flex items-center text-white ${compact ? 'gap-1.5 px-3 py-1.5' : 'gap-2 px-4 py-2'}`}
      style={{ backgroundColor: pool.brand_color! }}
    >
      {pool.brand_logo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={pool.brand_logo_url}
          alt={pool.brand_name || ''}
          className={`${compact ? 'w-4 h-4' : 'w-5 h-5'} rounded-sm object-cover`}
        />
      ) : (
        <span className={compact ? 'text-xs' : 'text-base'}>{pool.brand_emoji}</span>
      )}
      <span className={`${compact ? 'text-[10px]' : 'text-xs'} font-bold`}>{pool.brand_name}</span>
      <span
        className={`${compact ? 'text-[8px]' : 'text-[10px]'} font-semibold ml-auto`}
        style={{ color: 'rgba(255,255,255,0.85)' }}
      >
        Powered by SportPool
      </span>
    </div>
  )
}

/**
 * The KPI strip.
 *
 * Renders whatever `kpiTiles` decides — the component knows about tile SHAPES
 * (a stat, a row of dots) and nothing about pool modes. Adding Last Man
 * Standing or Table is a branch in lib/pools/card.ts, not JSX here.
 */
function KpiStrip({ pool, limit }: { pool: PoolCardPool; limit: number }) {
  const tiles = kpiTiles(pool).slice(0, limit)
  return (
    <div className="flex items-stretch rounded-control bg-snow/75 mt-3 overflow-hidden">
      {tiles.map((tile, i) => (
        <div key={i} className="contents">
          {i > 0 && <div className="w-px my-5 bg-silver shrink-0" />}
          <Tile tile={tile} last={i === tiles.length - 1} />
        </div>
      ))}
    </div>
  )
}

const TONE: Record<'accent' | 'ink' | 'muted', string> = {
  accent: 'text-primary-800',
  ink: 'text-ink',
  muted: 'text-muted',
}

function Tile({ tile, last }: { tile: KpiTile; last: boolean }) {
  // The dots tile is always the strip's right edge, so its label and its row
  // both sit right — the card's outer padding then reads as symmetric.
  if (tile.kind === 'dots') {
    return (
      <div className="flex-1 py-3 px-3 min-w-0">
        <p className="text-[10px] font-medium text-muted mb-1 tracking-wide text-right">{tile.label}</p>
        <Dots dots={tile.dots} palette={tile.palette} size={10} className="justify-end mt-1.5" />
      </div>
    )
  }
  return (
    <div className={`${tile.wide ? 'flex-[1.4]' : 'flex-1'} py-3 px-3 min-w-0 ${last ? 'text-right' : ''}`}>
      <p className="text-[10px] font-medium text-muted mb-1 tracking-wide">{tile.label}</p>
      {tile.kind === 'clock' ? (
        <ClockValue tile={tile} size="text-xl" subSize="text-[10px] mt-0.5" />
      ) : tile.kind === 'crest' || tile.kind === 'face' ? (
        /* ⚠ BADGE AND NAME, because this card can afford both — 124px of tile on
           the pools list and 97px on the dashboard grid, against the strip
           card's 54px. A badge alone asks the reader to know twenty crests; the
           name alone is what clipped. The name drops to `text-base` to make room
           for the mark, which is the only size at which "Nott'm Forest" and a
           20px crest both fit the narrower of the two. */
        <>
          <div className={`flex items-center gap-1.5 min-w-0 ${last ? 'justify-end' : ''}`}>
            <TileMark tile={tile} size={20} />
            <p className={`font-bold leading-none truncate ${tile.kind === 'face' || tile.crestUrl ? 'text-base' : 'text-xl'} ${tile.kind === 'crest' ? TONE[tile.tone] : 'text-ink'}`}>
              {tile.value}
            </p>
          </div>
          {tile.sub && <p className="text-[10px] text-muted mt-0.5 truncate">{tile.sub}</p>}
        </>
      ) : (
        <>
          <p className={`text-xl font-bold leading-none truncate ${TONE[tile.tone]}`}>{tile.value}</p>
          {tile.sub && <p className="text-[10px] text-muted mt-0.5 truncate">{tile.sub}</p>}
        </>
      )}
    </div>
  )
}

/**
 * The mark a `crest` or `face` tile leads with — a club badge or a person.
 *
 * A club with no `crest_url` (the feed's column is nullable) draws nothing and
 * the name carries the tile on its own, which is what it did before.
 */
function TileMark({ tile, size, standalone = false }: { tile: KpiTile; size: number; standalone?: boolean }) {
  if (tile.kind === 'face') {
    return <Avatar person={tile.person} size={size} />
  }
  if (tile.kind === 'crest' && tile.crestUrl) {
    // ⚠ The alt text depends on the surface. Beside the name it is decoration
    // and must be empty, or a screen reader says the club twice; alone on the
    // strip card it IS the content, and empty alt would read as nothing at all.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={tile.crestUrl} alt={standalone ? tile.value : ''} className="object-contain shrink-0" style={{ width: size, height: size }} />
  }
  return null
}

/**
 * A clock that ticks in place of a number.
 *
 * ⚠ THE CAPTION IS PART OF THE CLOCK, not decoration. `countdownText`'s compact
 * format switches from hh:mm to mm:ss at the hour, and `45:00` cannot be read
 * without knowing which band it is in — so the two captions come off the tile
 * (they are written in lib/pools/card.ts, like every other sentence on the
 * card) and the one that matches the current band is rendered.
 *
 * ⚠ `t-num`, unlike its sibling stats. The card's numbers are Nunito, whose
 * digits are proportional — a clock in it jitters sideways once a second.
 */
function ClockValue({ tile, size, subSize }: { tile: Extract<KpiTile, { kind: 'clock' }>; size: string; subSize: string }) {
  const msLeft = useCountdown(tile.to)
  const text = countdownText(msLeft, 'compact')
  return (
    <>
      {/* Empty until mounted — see the note on `useCountdown`. A non-breaking
          space holds the row's height so the card does not jump on hydration. */}
      <p className={`t-num ${size} leading-none truncate text-ink`}>{text || '\u00A0'}</p>
      {text && (
        <p className={`text-muted leading-tight truncate ${subSize}`}>
          {countdownIsHours(msLeft) ? tile.subHours : tile.subMinutes}
        </p>
      )}
    </>
  )
}

/**
 * Five dots — accuracy tiers, or duel outcomes.
 *
 * ⚠ The empty state goes through the palette like every other state. Two of the
 * three old cards hardcoded `bg-silver` here and one called the helper — the
 * same drift lib/design/formDots.ts was written to end, one level up.
 */
function Dots({
  dots, palette, size, className = '',
}: { dots: string[]; palette: 'form' | 'duel'; size: number; className?: string }) {
  const paint = palette === 'duel' ? duelDotClass : getFormDotClass
  const filled = dots.length > 0 ? dots : ['no_pick', 'no_pick', 'no_pick', 'no_pick', 'no_pick']
  return (
    <div className={`flex items-center gap-[5px] ${className}`}>
      {filled.map((type, i) => (
        <div
          key={i}
          className={`rounded-pill shrink-0 ${paint(type)}`}
          style={{ width: size, height: size }}
        />
      ))}
    </div>
  )
}
