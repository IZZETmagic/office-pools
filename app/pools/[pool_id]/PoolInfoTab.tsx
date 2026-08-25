'use client'

import { DetailCard, DetailCaption, DetailRow } from '@/components/ui/DetailCard'
import { Badge, poolStatusLabel, getStatusVariantSolid } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { LocalTime } from '@/components/LocalTime'
import { POOL_MODE_INFO, type PredictionMode } from '@/lib/poolModeInfo'
import { leagueModeInfo, type LeagueMode, type LeagueDepth } from '@/lib/leagueModeInfo'
import type { PoolData, MemberData, EntryData, PoolRoundState } from './types'

type PoolInfoTabProps = {
  pool: PoolData
  members: MemberData[]
  userEntries: EntryData[]
  roundStates: PoolRoundState[]
  isPastDeadline: boolean
  /**
   * Opens the leave-pool confirmation. Omitted when leaving is not on the
   * table at all — a super admin looking at someone else's pool — in which
   * case the Danger Zone is not rendered.
   */
  onLeavePool?: () => void
  /**
   * Why leaving is blocked, if it is. Present means the row renders disabled
   * with this as its subtitle rather than vanishing, so a sole admin is told
   * what to do instead of being left guessing. Mirrors the RN row.
   */
  leaveDisabledReason?: string | null
}

const ROUND_LABELS: Record<string, string> = {
  group: 'Group Stage',
  round_32: 'Round of 32',
  round_16: 'Round of 16',
  quarter_final: 'Quarter Finals',
  semi_final: 'Semi Finals',
  third_place: 'Third Place',
  final: 'Final',
}

function formatFee(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(amount)
}

/**
 * ⚠ THESE MUST ONLY EVER RUN ON THE CLIENT — see `<Deadline>` / `<Created>`.
 *
 * `toLocaleDateString(undefined, …)` formats with the RUNTIME's default locale
 * and timezone. Node and the browser do not agree on either: Node rendered
 * "8:25 PM" where the browser rendered "8:25 p.m.", which React reported as a
 * hydration mismatch and recovered from by regenerating the whole subtree.
 *
 * The locale half is the visible symptom; the timezone half is the real bug.
 * On Vercel the server runtime is UTC, so a server-formatted deadline is a UTC
 * deadline — the exact defect `components/LocalTime` was written for, and the
 * one that made every user in every timezone see UTC kickoff times in June.
 *
 * Formatting client-side means one runtime does it, so there is nothing to
 * mismatch, and it is the VIEWER's runtime, so the answer is right.
 */
function formatDeadlineDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatCreatedDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
}

/** A deadline in the viewer's own timezone, or an em-dash when there isn't one. */
function Deadline({ iso }: { iso: string | null | undefined }) {
  if (!iso || Number.isNaN(new Date(iso).getTime())) return <>—</>
  return <LocalTime iso={iso} format={formatDeadlineDate} />
}

function Created({ iso }: { iso: string | null | undefined }) {
  if (!iso || Number.isNaN(new Date(iso).getTime())) return <>—</>
  return <LocalTime iso={iso} format={formatCreatedDate} />
}

/* Local wrapper so the ten call sites below stay unchanged: the shared row
   leaves its value slot unstyled, and every value here wants the same bold
   treatment (or is a Badge, which brings its own). */
function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <DetailRow label={label}>
      <span className="t-card-title text-ink">{children}</span>
    </DetailRow>
  )
}

export function PoolInfoTab({
  pool, members, userEntries, roundStates, isPastDeadline, onLeavePool, leaveDisabledReason,
}: PoolInfoTabProps) {
  const allEntries = members.flatMap((m) => m.entries ?? [])
  const totalEntries = allEntries.length
  const totalMembers = members.length
  const entryFee = pool.entry_fee ?? 0
  const currency = pool.entry_fee_currency || 'USD'
  const isProgressive = pool.prediction_mode === 'progressive'
  const isLeaguePool = pool.league_season_id !== null

  /**
   * ⚠ A league MUST NOT reach POOL_MODE_INFO.
   *
   * Its `prediction_mode` is `'league_pickem'`, which is not a key of that
   * record, so the `??` below caught it and every league pool described itself
   * to its members as a Full Tournament — "the full group stage and then each
   * knockout round … a single deadline before the tournament starts". The
   * fallback is right for an unrecognised mode; the wrong part was having
   * nothing for a mode we ship. See lib/leagueModeInfo.ts.
   */
  const modeInfo = isLeaguePool
    ? leagueModeInfo(
        (pool.league_mode ?? 'pickem') as LeagueMode,
        (pool.league_depth ?? null) as LeagueDepth,
      )
    : POOL_MODE_INFO[pool.prediction_mode as PredictionMode] ?? POOL_MODE_INFO.full_tournament

  /**
   * The matchweek currently taking picks, for the Deadlines card.
   *
   * A league's `prediction_deadline` is the season's LAST kickoff — set by the
   * create route only to satisfy a NOT NULL it deliberately does not drop, and
   * inert all season by design. Printing it as "the deadline" told a member
   * playing in August that they had until May 2027, when in fact their picks
   * lock on Friday. The real deadline is the open matchweek's.
   */
  const isTableMode = isLeaguePool && pool.league_mode === 'table'
  const isTableLocked = pool.league_table_lock_at
    ? new Date(pool.league_table_lock_at) <= new Date()
    : false
  const openMatchweek = isLeaguePool
    ? roundStates.find((rs) => rs.state === 'open') ?? null
    : null
  const matchweekNumber = openMatchweek
    ? Number(String(openMatchweek.round_key).replace('mw_', ''))
    : null

  return (
    <div className="space-y-6">

      {/* Pool Details first: what kind of pool this is frames everything
          below it, so it should not be the last thing read. */}
      <DetailCard title="Pool Details">
        <div>
          <InfoRow label="Status">
            <Badge variant={getStatusVariantSolid(pool.status)}>
              {poolStatusLabel(pool.status)}
            </Badge>
          </InfoRow>
          <InfoRow label="Created">
            <Created iso={pool.created_at} />
          </InfoRow>

          <InfoRow label="Pool type">
            <Badge variant="blue">{modeInfo.label}</Badge>
          </InfoRow>

          {/* Last, and the only multi-line thing here: label on the left like
              the rows above it, prose underneath where a value would not fit.
              Keeping it at the foot means the scannable one-line rows stay
              together rather than being split by a paragraph. */}
          <div className="py-2.5">
            <span className="t-body text-muted">Pool description</span>
            <p className="t-body text-ink mt-1.5">{modeInfo.description}</p>
          </div>
        </div>
      </DetailCard>

      {/* Description */}
      {pool.description && (
        <DetailCard title="About">
          <p className="t-body text-ink whitespace-pre-wrap mt-3">{pool.description}</p>
        </DetailCard>
      )}

      {/* Deadlines */}
      <DetailCard title="Deadlines">

        {isProgressive && roundStates.length > 0 ? (
          <div className="divide-y divide-border-subtle">
            {roundStates.map((rs) => (
              <div key={rs.id} className="flex justify-between items-center gap-3 py-2.5">
                <span className="t-body text-muted">{ROUND_LABELS[rs.round_key] ?? rs.round_key}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {rs.deadline ? (
                    <span className="t-body text-ink"><Deadline iso={rs.deadline} /></span>
                  ) : (
                    <span className="t-body text-muted">No deadline</span>
                  )}
                  <Badge variant={
                    rs.state === 'open' ? 'green'
                    : rs.state === 'in_progress' ? 'yellow'
                    : rs.state === 'completed' ? 'blue'
                    : 'gray'
                  }>
                    {rs.state === 'in_progress' ? 'In Progress' : rs.state.charAt(0).toUpperCase() + rs.state.slice(1)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        ) : isTableMode ? (
          /* ⚠ Table mode is the one league mode with a genuine pool-wide
             deadline: `league_table_lock_at`, the first kickoff of whichever
             matchweek was open when the pool was created (create route, §3.4).
             It has no matchweek picking at all, so the rhythm copy below would
             describe a cadence this pool does not have — and the two dates
             coincide today only because of how the lock is derived. They part
             company the moment that matchweek locks. */
          <div>
            <div className="flex justify-between items-center gap-3 py-2.5">
              <span className="t-body text-muted">Table prediction</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="t-body text-ink"><Deadline iso={pool.league_table_lock_at} /></span>
                <Badge variant={isTableLocked ? 'gray' : 'green'}>
                  {isTableLocked ? 'Closed' : 'Open'}
                </Badge>
              </div>
            </div>
            <p className="t-body text-muted mt-3">
              One deadline for the whole season. After it passes the order is fixed and scored
              against the real table until May.
            </p>
          </div>
        ) : isLeaguePool ? (
          /* A league has 38 deadlines, one per matchweek, and exactly one of
             them is live. Listing all 38 would be a wall; listing the season
             deadline would be a lie (see `openMatchweek` above). So: the one
             that is actually running, and a sentence saying why it moves. */
          <div>
            {openMatchweek ? (
              <div className="flex justify-between items-center gap-3 py-2.5">
                <span className="t-body text-muted">
                  {matchweekNumber ? `Matchweek ${matchweekNumber}` : 'This matchweek'}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="t-body text-ink"><Deadline iso={openMatchweek.deadline} /></span>
                  <Badge variant="green">Open</Badge>
                </div>
              </div>
            ) : (
              <p className="t-body text-muted mt-3">
                No matchweek is open for picks right now.
              </p>
            )}
            <p className="t-body text-muted mt-3">
              Picks lock at the first kickoff of each matchweek, and the next matchweek opens on
              its own the moment the last one locks. There is no season-wide deadline.
            </p>
          </div>
        ) : pool.prediction_deadline ? (
          <div className="flex justify-between items-center gap-3 py-2.5">
            <span className="t-body text-ink"><Deadline iso={pool.prediction_deadline} /></span>
            <Badge variant={isPastDeadline ? 'gray' : 'green'}>
              {isPastDeadline ? 'Closed' : 'Open'}
            </Badge>
          </div>
        ) : (
          <p className="t-body text-muted mt-3">No deadline set</p>
        )}
      </DetailCard>

      {/* Entries & Participants */}
      <DetailCard title="Entries & Participants">
        <div>
          <InfoRow label="Entries per player">{pool.max_entries_per_user}</InfoRow>
          <InfoRow label="Max participants">{pool.max_participants ? pool.max_participants : 'Unlimited'}</InfoRow>
          <InfoRow label="Total members">{totalMembers}</InfoRow>
          <InfoRow label="Total entries">{totalEntries}</InfoRow>
        </div>
      </DetailCard>

      {/* Fees & Prize Pool */}
      {entryFee > 0 && (
        <DetailCard title="Fees & Prize Pool">
          <div>
            <InfoRow label="Entry fee">{formatFee(entryFee, currency)}</InfoRow>
            <InfoRow label="Total prize pool">{formatFee(entryFee * totalEntries, currency)}</InfoRow>
          </div>

          {/* Current user's fee status */}
          {userEntries.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border-subtle">
              <DetailCaption>Your Fee Status</DetailCaption>
              <div>
                {userEntries.map((entry) => (
                  <div key={entry.entry_id} className="flex justify-between items-center gap-3 py-2.5">
                    <span className="t-body text-muted">{entry.entry_name}</span>
                    <Badge variant={entry.fee_paid ? 'green' : 'yellow'}>
                      {entry.fee_paid ? 'Paid' : 'Unpaid'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DetailCard>
      )}

      {/* Danger Zone last, as in the RN Pool Info screen. On web this lived
          in the tab strip, where it sat among navigation and read as one more
          tab rather than as a destructive action. */}
      {onLeavePool && (
        <DetailCard title="Danger Zone" className="border border-danger-200">
          <button
            type="button"
            onClick={onLeavePool}
            disabled={!!leaveDisabledReason}
            className="w-full flex items-center gap-3 py-2.5 mt-1 text-left transition-opacity enabled:hover:opacity-70 disabled:opacity-55 disabled:cursor-not-allowed"
          >
            <Icon
              name="rectangle.portrait.and.arrow.right"
              size={16}
              weight="semibold"
              className={`shrink-0 ${leaveDisabledReason ? 'text-muted' : 'text-danger-700'}`}
            />
            <span className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span className={`t-card-title ${leaveDisabledReason ? 'text-muted' : 'text-danger-700'}`}>
                Leave Pool
              </span>
              <span className="t-body text-muted">
                {leaveDisabledReason ?? 'Remove yourself from this pool entirely'}
              </span>
            </span>
            {!leaveDisabledReason && (
              <Icon name="chevron.right" size={14} weight="semibold" className="shrink-0 text-muted" />
            )}
          </button>
        </DetailCard>
      )}
    </div>
  )
}
