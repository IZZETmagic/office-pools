'use client'

import { DetailCard, DetailCaption, DetailRow } from '@/components/ui/DetailCard'
import { Badge, poolStatusLabel, getStatusVariantSolid } from '@/components/ui/Badge'
import type { PoolData, MemberData, EntryData, PoolRoundState } from './types'

type PoolInfoTabProps = {
  pool: PoolData
  members: MemberData[]
  userEntries: EntryData[]
  roundStates: PoolRoundState[]
  isPastDeadline: boolean
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

const MODE_LABELS: Record<string, string> = {
  full_tournament: 'Full Tournament',
  progressive: 'Progressive',
  bracket_picker: 'Bracket Picker',
}

function formatFee(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(amount)
}

function formatDeadline(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatCreated(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
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

export function PoolInfoTab({ pool, members, userEntries, roundStates, isPastDeadline }: PoolInfoTabProps) {
  const allEntries = members.flatMap((m) => m.entries ?? [])
  const totalEntries = allEntries.length
  const totalMembers = members.length
  const entryFee = pool.entry_fee ?? 0
  const currency = pool.entry_fee_currency || 'USD'
  const isProgressive = pool.prediction_mode === 'progressive'

  return (
    <div className="space-y-6">

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
                    <span className="t-body text-ink">{formatDeadline(rs.deadline)}</span>
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
        ) : pool.prediction_deadline ? (
          <div className="flex justify-between items-center gap-3 py-2.5">
            <span className="t-body text-ink">{formatDeadline(pool.prediction_deadline)}</span>
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
          <InfoRow label="Prediction mode">
            <Badge variant="blue">{MODE_LABELS[pool.prediction_mode] ?? pool.prediction_mode}</Badge>
          </InfoRow>
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

      {/* Pool Status */}
      <DetailCard title="Pool Details">
        <div>
          <InfoRow label="Status">
            <Badge variant={getStatusVariantSolid(pool.status)}>
              {poolStatusLabel(pool.status)}
            </Badge>
          </InfoRow>
          <InfoRow label="Created">
            {formatCreated(pool.created_at)}
          </InfoRow>
        </div>
      </DetailCard>
    </div>
  )
}
