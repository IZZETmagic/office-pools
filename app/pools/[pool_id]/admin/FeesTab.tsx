'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import type { PoolData, MemberData, EntryData } from '../types'

type FeesTabProps = {
  pool: PoolData
  members: MemberData[]
  setMembers: (members: MemberData[]) => void
  currentUserId: string
}

type Filter = 'all' | 'unpaid' | 'paid'

function formatFee(amount: number, currency: string): string {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
  }).format(amount)
}

export function FeesTab({ pool, members, setMembers, currentUserId }: FeesTabProps) {
  const supabase = createClient()
  const { showToast } = useToast()
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(false)

  const entryFee = pool.entry_fee ?? 0
  const currency = pool.entry_fee_currency || 'USD'

  // Only members with at least 1 entry
  const membersWithEntries = members.filter((m) => (m.entries ?? []).length > 0)

  // All entries across all members
  const allEntries = membersWithEntries.flatMap((m) => m.entries ?? [])
  const totalEntries = allEntries.length
  const paidEntries = allEntries.filter((e) => e.fee_paid).length
  const unpaidEntries = totalEntries - paidEntries
  const collectionRate = totalEntries > 0 ? Math.round((paidEntries / totalEntries) * 100) : 0
  const amountCollected = paidEntries * entryFee
  const amountExpected = totalEntries * entryFee

  // Filter members based on active filter
  const filteredMembers = membersWithEntries
    .map((m) => {
      const entries = m.entries ?? []
      if (filter === 'unpaid') {
        const unpaid = entries.filter((e) => !e.fee_paid)
        return unpaid.length > 0 ? { ...m, entries: unpaid } : null
      }
      if (filter === 'paid') {
        const paid = entries.filter((e) => e.fee_paid)
        return paid.length > 0 ? { ...m, entries: paid } : null
      }
      return m
    })
    .filter(Boolean) as MemberData[]

  // Sort: unpaid entries first, then alphabetically
  const sortedMembers = [...filteredMembers].sort((a, b) => {
    const aUnpaid = (a.entries ?? []).filter((e) => !e.fee_paid).length
    const bUnpaid = (b.entries ?? []).filter((e) => !e.fee_paid).length
    if (aUnpaid > 0 && bUnpaid === 0) return -1
    if (aUnpaid === 0 && bUnpaid > 0) return 1
    return a.users.username.localeCompare(b.users.username)
  })

  async function refreshMembers() {
    const { data, error } = await supabase
      .from('pool_members')
      .select('*, users!inner(user_id, username, full_name, email), pool_entries(*)')
      .eq('pool_id', pool.pool_id)
    if (error) {
      showToast('Failed to refresh member list', 'error')
      return
    }
    if (data) {
      const processed = (data as Array<MemberData & { pool_entries?: EntryData[] }>).map((m) => {
        const entries = (m.pool_entries ?? []).slice().sort(
          (a, b) => a.entry_number - b.entry_number
        )
        return { ...m, pool_entries: undefined, entries } as MemberData
      })
      setMembers(processed)
    }
  }

  async function handleToggleFee(entry: EntryData) {
    setLoading(true)
    const newPaid = !entry.fee_paid
    try {
      const { error } = await supabase
        .from('pool_entries')
        .update({
          fee_paid: newPaid,
          fee_paid_at: newPaid ? new Date().toISOString() : null,
        })
        .eq('entry_id', entry.entry_id)

      if (error) {
        showToast('Failed to update fee status', 'error')
        return
      }
      showToast(newPaid ? 'Marked as paid' : 'Marked as unpaid', 'success')
      await refreshMembers()
    } finally {
      setLoading(false)
    }
  }

  async function handleMarkAllPaid(member: MemberData) {
    setLoading(true)
    const unpaid = (member.entries || []).filter((e) => !e.fee_paid)
    let succeeded = 0
    let failed = 0
    try {
      for (const entry of unpaid) {
        const { error } = await supabase
          .from('pool_entries')
          .update({ fee_paid: true, fee_paid_at: new Date().toISOString() })
          .eq('entry_id', entry.entry_id)
        if (error) {
          failed += 1
          // Stop on first failure so the user can see what went wrong
          break
        }
        succeeded += 1
      }
      if (failed > 0) {
        showToast(
          `Marked ${succeeded} paid, ${unpaid.length - succeeded} failed. Please retry.`,
          'error'
        )
      } else {
        showToast(`All entries marked as paid for ${member.users.username}`, 'success')
      }
      await refreshMembers()
    } finally {
      setLoading(false)
    }
  }

  const filterOptions: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'unpaid', label: 'Unpaid' },
    { key: 'paid', label: 'Paid' },
  ]

  return (
    <div className="space-y-6">
      {/* Summary Header Card */}
      <Card>
        <div className="space-y-4">
          <p className="text-lg font-semibold text-neutral-900">
            {formatFee(entryFee, currency)} per entry
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-neutral-500 uppercase tracking-wide">Total Entries</p>
              <p className="text-xl font-bold text-neutral-900">{totalEntries}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 uppercase tracking-wide">Paid</p>
              <p className="text-xl font-bold text-success-700">{paidEntries}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 uppercase tracking-wide">Unpaid</p>
              <p className="text-xl font-bold text-warning-700">{unpaidEntries}</p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 uppercase tracking-wide">Collection Rate</p>
              <p className="text-xl font-bold text-neutral-900">{collectionRate}%</p>
            </div>
          </div>

          <p className="text-sm text-neutral-500">
            {formatFee(amountCollected, currency)} / {formatFee(amountExpected, currency)} collected
          </p>

          <div className="h-2 rounded-full bg-neutral-200">
            <div
              className="h-2 rounded-full bg-success-500 transition-all"
              style={{ width: `${collectionRate}%` }}
            />
          </div>
        </div>
      </Card>

      {/* Filter Pills */}
      <div className="flex gap-2">
        {filterOptions.map((opt) => (
          <button
            key={opt.key}
            onClick={() => setFilter(opt.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
              filter === opt.key
                ? 'bg-primary-500 text-white'
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Entry List or Empty States */}
      {membersWithEntries.length === 0 ? (
        <Card>
          <p className="text-center text-neutral-500 py-8">
            No entries yet. Members will appear here once they join and create entries.
          </p>
        </Card>
      ) : sortedMembers.length === 0 ? (
        <Card>
          <div className="text-center py-8">
            {filter === 'unpaid' ? (
              <div className="space-y-2">
                <span className="text-3xl">&#10003;</span>
                <p className="text-success-700 font-medium">All entries are paid!</p>
              </div>
            ) : (
              <p className="text-neutral-500">No entries have been marked as paid yet.</p>
            )}
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {sortedMembers.map((member) => {
            const entries = member.entries ?? []
            const memberPaid = entries.filter((e) => e.fee_paid).length
            const memberUnpaid = entries.filter((e) => !e.fee_paid).length

            return (
              <Card key={member.member_id}>
                {/* Member Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-neutral-900">{member.users.username}</span>
                    {member.users.full_name && (
                      <span className="text-neutral-500 text-sm">{member.users.full_name}</span>
                    )}
                    <Badge variant={memberPaid === entries.length ? 'green' : 'yellow'}>
                      {memberPaid} of {entries.length} paid
                    </Badge>
                  </div>
                  {memberUnpaid > 1 && (
                    <Button
                      variant="green"
                      size="xs"
                      disabled={loading}
                      onClick={() => handleMarkAllPaid(member)}
                    >
                      Mark All Paid
                    </Button>
                  )}
                </div>

                {/* Entry Rows */}
                <div className="divide-y divide-neutral-100">
                  {entries.map((entry) => (
                    <div
                      key={entry.entry_id}
                      className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                    >
                      <div className="space-y-0.5">
                        <p className="text-sm font-medium text-neutral-900">
                          {entry.entry_name}{' '}
                          <span className="text-neutral-400 font-normal">#{entry.entry_number}</span>
                        </p>
                        <p className="text-xs text-neutral-500">
                          Created {new Date(entry.created_at).toLocaleDateString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {entry.fee_paid ? (
                          <>
                            <Badge variant="green">
                              Paid
                              {entry.fee_paid_at && (
                                <span className="ml-1 opacity-75">
                                  {new Date(entry.fee_paid_at).toLocaleDateString()}
                                </span>
                              )}
                            </Badge>
                            <Button
                              variant="gray"
                              size="xs"
                              disabled={loading}
                              onClick={() => handleToggleFee(entry)}
                            >
                              Mark Unpaid
                            </Button>
                          </>
                        ) : (
                          <>
                            <Badge variant="yellow">Unpaid</Badge>
                            <Button
                              variant="green"
                              size="xs"
                              disabled={loading}
                              onClick={() => handleToggleFee(entry)}
                            >
                              Mark Paid
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
