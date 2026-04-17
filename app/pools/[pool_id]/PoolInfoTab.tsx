'use client'

import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
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

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-sm text-neutral-600 dark:text-neutral-400">{label}</span>
      <span className="text-sm font-bold text-neutral-900 dark:text-neutral-100">{children}</span>
    </div>
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
        <Card>
          <h4 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-3">About</h4>
          <p className="text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">{pool.description}</p>
        </Card>
      )}

      {/* Deadlines */}
      <Card>
        <h4 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-1">Deadlines</h4>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">When predictions lock</p>

        {isProgressive && roundStates.length > 0 ? (
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {roundStates.map((rs) => (
              <div key={rs.id} className="flex justify-between items-center py-2">
                <span className="text-sm text-neutral-600 dark:text-neutral-400">{ROUND_LABELS[rs.round_key] ?? rs.round_key}</span>
                <div className="flex items-center gap-2">
                  {rs.deadline ? (
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">{formatDeadline(rs.deadline)}</span>
                  ) : (
                    <span className="text-xs text-neutral-400 dark:text-neutral-500">No deadline</span>
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
          <div className="flex justify-between items-center">
            <span className="text-sm text-neutral-700 dark:text-neutral-300">{formatDeadline(pool.prediction_deadline)}</span>
            <Badge variant={isPastDeadline ? 'gray' : 'green'}>
              {isPastDeadline ? 'Closed' : 'Open'}
            </Badge>
          </div>
        ) : (
          <p className="text-sm text-neutral-400 dark:text-neutral-500">No deadline set</p>
        )}
      </Card>

      {/* Entries & Participants */}
      <Card>
        <h4 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-1">Entries & Participants</h4>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">Pool size and entry limits</p>
        <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
          <InfoRow label="Prediction mode">
            <Badge variant="blue">{MODE_LABELS[pool.prediction_mode] ?? pool.prediction_mode}</Badge>
          </InfoRow>
          <InfoRow label="Entries per player">{pool.max_entries_per_user}</InfoRow>
          <InfoRow label="Max participants">{pool.max_participants ? pool.max_participants : 'Unlimited'}</InfoRow>
          <InfoRow label="Total members">{totalMembers}</InfoRow>
          <InfoRow label="Total entries">{totalEntries}</InfoRow>
        </div>
      </Card>

      {/* Fees & Prize Pool */}
      {entryFee > 0 && (
        <Card>
          <h4 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-1">Fees & Prize Pool</h4>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4">Entry costs and total pot</p>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            <InfoRow label="Entry fee">{formatFee(entryFee, currency)}</InfoRow>
            <InfoRow label="Total prize pool">{formatFee(entryFee * totalEntries, currency)}</InfoRow>
          </div>

          {/* Current user's fee status */}
          {userEntries.length > 0 && (
            <div className="mt-5 pt-4 border-t border-neutral-100 dark:border-neutral-800">
              <h5 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-3">Your Fee Status</h5>
              <div className="space-y-2">
                {userEntries.map((entry) => (
                  <div key={entry.entry_id} className="flex justify-between items-center py-1">
                    <span className="text-sm text-neutral-600 dark:text-neutral-400">{entry.entry_name}</span>
                    <Badge variant={entry.fee_paid ? 'green' : 'yellow'}>
                      {entry.fee_paid ? 'Paid' : 'Unpaid'}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Pool Status */}
      <Card>
        <h4 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Pool Details</h4>
        <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
          <InfoRow label="Status">
            <Badge variant={
              pool.status === 'open' || pool.status === 'active' ? 'green'
              : pool.status === 'upcoming' ? 'blue'
              : pool.status === 'closed' ? 'yellow'
              : 'gray'
            }>
              {pool.status === 'open' || pool.status === 'active' ? 'Open' : pool.status.charAt(0).toUpperCase() + pool.status.slice(1)}
            </Badge>
          </InfoRow>
          <InfoRow label="Created">
            {formatCreated(pool.created_at)}
          </InfoRow>
        </div>
      </Card>
    </div>
  )
}
