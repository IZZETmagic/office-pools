'use client'

import { useState, useEffect, useMemo } from 'react'
import { Icon } from '@/components/ui/Icon'
import { createClient } from '@/lib/supabase/client'
import type { PoolData, MemberData, EntryData, PredictionData, MatchData, TeamData, BPGroupRanking, BPThirdPlaceRanking, BPKnockoutPick } from '../types'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { ActionMenu, type ActionMenuItem } from '@/components/ui/ActionMenu'
import { ListRow } from '@/components/ui/ListRow'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { useToast } from '@/components/ui/Toast'
import { Input } from '@/components/ui/Input'
import { formatNumber } from '@/lib/format'
import {
  getKnockoutWinner,
  type GroupStanding,
  type PredictionMap,
  type Match,
  type Team,
  GROUP_LETTERS,
} from '@/lib/tournament'
import { resolvePredictedBracket } from '@/lib/bracketResolver'
import { resolveFullBracketFromPicks } from '@/lib/bracketPickerResolver'

type MemberBadgeStatus = 'submitted' | 'partial' | 'pending' | 'awaiting'

function StatusBadge({ status }: { status: MemberBadgeStatus }) {
  if (status === 'submitted') return <Badge variant="green">Submitted</Badge>
  if (status === 'partial') return <Badge variant="yellow">Partial</Badge>
  if (status === 'pending') return <Badge variant="yellow">Pending</Badge>
  return <Badge variant="gray">Awaiting round</Badge>
}

type MembersTabProps = {
  pool: PoolData
  members: MemberData[]
  setMembers: (members: MemberData[]) => void
  predictions: PredictionData[]
  matches: MatchData[]
  teams: TeamData[]
  currentUserId: string
  computedEntryTotals: Map<string, number>
}

type ModalState =
  | { type: 'none' }
  | { type: 'view_predictions'; member: MemberData; entry?: EntryData }
  | { type: 'adjust_points'; member: MemberData; entry?: EntryData }
  | { type: 'promote'; member: MemberData }
  | { type: 'demote'; member: MemberData }
  | { type: 'remove'; member: MemberData }
  | { type: 'unlock_predictions'; member: MemberData; entry?: EntryData }
  | { type: 'delete_entry'; member: MemberData }

export function MembersTab({
  pool,
  members,
  setMembers,
  predictions,
  matches,
  teams,
  currentUserId,
  computedEntryTotals,
}: MembersTabProps) {
  const supabase = createClient()
  const { showToast } = useToast()

  const [modal, setModal] = useState<ModalState>({ type: 'none' })
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'rank' | 'points' | 'username' | 'joined'>('rank')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Adjust points state
  const [pointAdjustment, setPointAdjustment] = useState(0)
  const [adjustReason, setAdjustReason] = useState('')

  // Remove confirmation
  const [removeConfirmed, setRemoveConfirmed] = useState(false)

  // Pool code copy state

  const adminCount = members.filter((m) => m.role === 'admin').length
  const isProgressive = pool.prediction_mode === 'progressive'

  // Progressive pools submit per-round, so the member-row badge reflects
  // the currently-open round, not the legacy `has_submitted_predictions`
  // flag. `null` open-round key = no round currently open (between rounds /
  // pre-tournament). `roundsLoaded` gates rendering so we don't flash an
  // "Awaiting round" badge before the fetch resolves.
  const [currentOpenRoundKey, setCurrentOpenRoundKey] = useState<string | null>(null)
  const [currentRoundSubmissions, setCurrentRoundSubmissions] = useState<Record<string, boolean>>({})
  const [roundsLoaded, setRoundsLoaded] = useState(!isProgressive)

  // Re-runnable so mutations (e.g. Unlock Predictions) can refresh the
  // round-aware badge instead of leaving it stale until remount.
  async function refreshRoundSubmissions() {
    if (!isProgressive) return
    try {
      const res = await fetch(`/api/pools/${pool.pool_id}/rounds`)
      if (!res.ok) return
      const data = await res.json()
      setCurrentOpenRoundKey(data.current_open_round_key ?? null)
      setCurrentRoundSubmissions(data.current_round_entry_submissions ?? {})
    } catch {
      // Non-fatal: badges fall back to a neutral state.
    } finally {
      setRoundsLoaded(true)
    }
  }

  useEffect(() => {
    if (!isProgressive) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/pools/${pool.pool_id}/rounds`)
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setCurrentOpenRoundKey(data.current_open_round_key ?? null)
        setCurrentRoundSubmissions(data.current_round_entry_submissions ?? {})
      } catch {
        // Non-fatal: badges fall back to a neutral state.
      } finally {
        if (!cancelled) setRoundsLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isProgressive, pool.pool_id])

  // True iff the entry has submitted predictions for the currently-open
  // round. Used only when isProgressive && currentOpenRoundKey is set.
  const isEntrySubmittedForCurrentRound = (entryId: string): boolean =>
    currentRoundSubmissions[entryId] === true

  // For progressive mode, an entry is "unlockable" if it has any predictions (round submissions exist per-round)
  // For other modes, check has_submitted_predictions
  const hasUnlockableEntries = (member: MemberData) =>
    (member.entries || []).some(e =>
      e.has_submitted_predictions ||
      (isProgressive && predictions.some(p => p.entry_id === e.entry_id))
    )

  // Resolved badge tier for a member row:
  // - 'submitted' : all of the member's entries are submitted (for the current round in progressive mode)
  // - 'partial'   : some but not all
  // - 'pending'   : none submitted (or, in progressive mode, no open round and no legacy submissions)
  // - 'awaiting'  : progressive pool with no currently-open round → neutral "no action needed" state
  const memberStatus = (member: MemberData): 'submitted' | 'partial' | 'pending' | 'awaiting' => {
    const entries = member.entries || []
    if (entries.length === 0) return 'pending'

    if (isProgressive) {
      if (!currentOpenRoundKey) return 'awaiting'
      const submittedCount = entries.filter(e => isEntrySubmittedForCurrentRound(e.entry_id)).length
      if (submittedCount === entries.length) return 'submitted'
      if (submittedCount > 0) return 'partial'
      return 'pending'
    }

    const submittedCount = entries.filter(e => e.has_submitted_predictions).length
    if (submittedCount === entries.length) return 'submitted'
    if (submittedCount > 0) return 'partial'
    return 'pending'
  }

  // Get the true total points for an entry (client-side computed match + bonus, falling back to pool_entries)
  function getEntryTotalPoints(entry: EntryData): number {
    return computedEntryTotals.get(entry.entry_id) ?? entry.scored_total_points ?? 0
  }

  function memberActions(member: MemberData): ActionMenuItem[] {
    const entries = member.entries || []
    return [
      { key: 'view_predictions', label: 'View Predictions',
        onSelect: () => { setError(null); setModal({ type: 'view_predictions', member }) } },
      { key: 'adjust_points', label: 'Adjust Points',
        onSelect: () => { setError(null); setPointAdjustment(0); setAdjustReason(''); setModal({ type: 'adjust_points', member }) } },
      { key: 'unlock_predictions', label: 'Unlock Predictions', disabled: !hasUnlockableEntries(member),
        onSelect: () => { setError(null); setModal({ type: 'unlock_predictions', member }) } },
      { key: 'promote', label: 'Promote to Admin', disabled: member.role !== 'player',
        onSelect: () => { setError(null); setModal({ type: 'promote', member }) } },
      { key: 'demote', label: 'Demote to Player', disabled: !(member.role === 'admin' && adminCount > 1),
        onSelect: () => { setError(null); setModal({ type: 'demote', member }) } },
      { key: 'delete_entry', label: 'Delete Entry…', destructive: true, disabled: entries.length === 0,
        onSelect: () => { setError(null); setModal({ type: 'delete_entry', member }) } },
      { key: 'remove', label: 'Remove from Pool', destructive: true, disabled: member.role !== 'player',
        onSelect: () => { setError(null); setRemoveConfirmed(false); setModal({ type: 'remove', member }) } },
    ]
  }

  // Helper: get best entry stats for a member (using true total including bonus)
  function getBestEntry(m: MemberData): EntryData | null {
    const entries = m.entries || []
    if (entries.length === 0) return null
    return entries.reduce((best, e) =>
      getEntryTotalPoints(e) > getEntryTotalPoints(best) ? e : best, entries[0])
  }

  // Sort and filter
  const filteredMembers = members
    .filter((m) => {
      if (!search) return true
      const q = search.toLowerCase()
      return (
        m.users.username.toLowerCase().includes(q) ||
        m.users.full_name.toLowerCase().includes(q)
      )
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'rank': {
          const aRank = getBestEntry(a)?.current_rank ?? 999
          const bRank = getBestEntry(b)?.current_rank ?? 999
          return aRank - bRank
        }
        case 'points': {
          const aBest = getBestEntry(a)
          const bBest = getBestEntry(b)
          const aPts = aBest ? getEntryTotalPoints(aBest) : 0
          const bPts = bBest ? getEntryTotalPoints(bBest) : 0
          return bPts - aPts
        }
        case 'username':
          return a.users.username.localeCompare(b.users.username)
        case 'joined':
          return (
            new Date(b.joined_at).getTime() - new Date(a.joined_at).getTime()
          )
        default:
          return 0
      }
    })

  async function refreshMembers() {
    const { data } = await supabase
      .from('pool_members')
      .select('*, users!inner(user_id, username, full_name, email), pool_entries(*)')
      .eq('pool_id', pool.pool_id)

    if (data) {
      const processed = data.map((m: any) => {
        const entries = ((m.pool_entries || []) as EntryData[]).sort(
          (a: EntryData, b: EntryData) => a.entry_number - b.entry_number
        )
        return { ...m, pool_entries: undefined, entries } as MemberData
      })
      setMembers(processed)
    }
  }

  async function handlePromote(member: MemberData) {
    setLoading(true)
    const { error } = await supabase
      .from('pool_members')
      .update({ role: 'admin' })
      .eq('member_id', member.member_id)

    if (error) {
      setError(error.message)
    } else {
      showToast(`${member.users.username} promoted to admin.`, 'success')
      await refreshMembers()
    }
    setLoading(false)
    setModal({ type: 'none' })
  }

  async function handleDemote(member: MemberData) {
    if (adminCount <= 1) {
      setError('Cannot demote the only admin.')
      setModal({ type: 'none' })
      return
    }

    setLoading(true)
    const { error } = await supabase
      .from('pool_members')
      .update({ role: 'player' })
      .eq('member_id', member.member_id)

    if (error) {
      setError(error.message)
    } else {
      showToast(`${member.users.username} demoted to player.`, 'success')
      await refreshMembers()
    }
    setLoading(false)
    setModal({ type: 'none' })
  }

  async function handleRemove(member: MemberData) {
    setLoading(true)

    // Deleting the member cascades to predictions, scores, etc.
    const { error: memError } = await supabase
      .from('pool_members')
      .delete()
      .eq('member_id', member.member_id)

    if (memError) {
      setError('Failed to remove member: ' + memError.message)
      setLoading(false)
      return
    }

    // Recalculate v2 scores and ranks
    await fetch(`/api/pools/${pool.pool_id}/recalculate`, { method: 'POST' })

    // Notify removed member (fire-and-forget)
    fetch('/api/notifications/member-removed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pool_id: pool.pool_id,
        removed_user_id: member.users.user_id,
      }),
    }).catch(() => {})

    showToast(`${member.users.username} removed from pool.`, 'success')
    await refreshMembers()
    setLoading(false)
    setModal({ type: 'none' })
    setRemoveConfirmed(false)
  }

  async function handleDeleteEntry(member: MemberData, entry: EntryData) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/pools/${pool.pool_id}/entries/${entry.entry_id}/delete`,
        { method: 'POST' },
      )
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `Delete failed (${res.status})`)
      }
      // Recalc ranks/points after the entry disappears.
      await fetch(`/api/pools/${pool.pool_id}/recalculate`, { method: 'POST' })
      showToast(`Deleted entry "${entry.entry_name}".`, 'success')
      await refreshMembers()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete entry')
    } finally {
      setLoading(false)
    }
  }

  async function handleAdjustPoints(member: MemberData, targetEntry?: EntryData) {
    if (!adjustReason.trim()) {
      setError('Please provide a reason for the adjustment.')
      return
    }

    const entry = targetEntry || getBestEntry(member)
    if (!entry) {
      setError('No entry found for this member.')
      return
    }

    setLoading(true)
    const newTotal = getEntryTotalPoints(entry) + pointAdjustment

    // 1. Insert into point_adjustments history
    const { error: insertError } = await supabase
      .from('point_adjustments')
      .insert({
        entry_id: entry.entry_id,
        pool_id: pool.pool_id,
        amount: pointAdjustment,
        reason: adjustReason.trim(),
        created_by: currentUserId,
      })

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    // 2. Fetch sum of all adjustments for this entry
    const { data: adjustments, error: fetchError } = await supabase
      .from('point_adjustments')
      .select('amount')
      .eq('entry_id', entry.entry_id)

    if (fetchError) {
      setError(fetchError.message)
      setLoading(false)
      return
    }

    const totalAdjustment = (adjustments || []).reduce((sum, a) => sum + a.amount, 0)

    // 3. Update pool_entries with the running total
    const { error: updateError } = await supabase
      .from('pool_entries')
      .update({ point_adjustment: totalAdjustment, adjustment_reason: adjustReason.trim() })
      .eq('entry_id', entry.entry_id)

    if (updateError) {
      setError(updateError.message)
    } else {
      // 4. Lite recalc: update scored_total_points and re-rank the pool
      await supabase.rpc('lite_recalc_entry', { p_entry_id: entry.entry_id, p_pool_id: pool.pool_id })

      showToast(
        `Points adjusted for ${member.users.username} (${entry.entry_name}): ${pointAdjustment > 0 ? '+' : ''}${pointAdjustment} (New total: ${newTotal})`,
        'success'
      )

      // Send notification to the affected user (fire-and-forget)
      fetch('/api/notifications/points-adjusted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pool_id: pool.pool_id,
          target_user_id: member.user_id,
          entry_name: entry.entry_name,
          adjustment: pointAdjustment,
          reason: adjustReason.trim(),
          new_total: newTotal,
        }),
      }).catch(console.error)

      await refreshMembers()
    }
    setLoading(false)
    setModal({ type: 'none' })
    setPointAdjustment(0)
    setAdjustReason('')
  }

  async function handleUnlockPredictions(member: MemberData, specificEntry?: EntryData) {
    // If a specific entry is provided, unlock only that one
    const entriesToUnlock = specificEntry
      ? [specificEntry]
      : (member.entries || []).filter(e =>
          e.has_submitted_predictions ||
          (isProgressive && predictions.some(p => p.entry_id === e.entry_id))
        )

    if (entriesToUnlock.length === 0) {
      setError('No submitted entries found.')
      setModal({ type: 'none' })
      return
    }

    setLoading(true)
    try {
      for (const entry of entriesToUnlock) {
        const res = await fetch(`/api/pools/${pool.pool_id}/predictions/unlock`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entryId: entry.entry_id }),
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to unlock predictions')
        }
      }

      const entryLabel = specificEntry ? specificEntry.entry_name : 'all entries'
      showToast(`Predictions unlocked for ${member.users.username} (${entryLabel}). They can now edit and resubmit.`, 'success')
      await Promise.all([refreshMembers(), refreshRoundSubmissions()])
    } catch (err: any) {
      setError(err.message || 'Failed to unlock predictions')
    }
    setLoading(false)
    setModal({ type: 'none' })
  }

  return (
    <div>

      {error && (
        <Alert variant="error" className="mb-4">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-danger-800 font-bold"
          >
            x
          </button>
        </Alert>
      )}

      {/* Search and Sort. Sort is pushed right by justifying the row, not by
          an `ml-auto` on the Select — Select forwards className to the inner
          <select>, while the flex item is the wrapper span around it, so a
          margin utility passed to the component would land on the wrong node
          and do nothing. */}
      <div className="flex flex-col sm:flex-row sm:justify-between gap-3 mb-4">
        <Input
          type="text"
          placeholder="Search by username..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:max-w-xs"
        />
        <Select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          aria-label="Sort members"
        >
          {/* Direction is in the label because it isn't guessable: points and
              joined run descending, rank and username ascending. */}
          <option value="rank">Rank — best first</option>
          <option value="points">Points — high to low</option>
          <option value="username">Username — A to Z</option>
          <option value="joined">Joined — newest first</option>
        </Select>
      </div>

      {/* Members - Mobile card view */}
      {/* Members - Mobile card view.
          The RN list-row chassis: surface, 24px radius, card shadow, 12px
          apart. The current-user row uses the iOS values recorded in
          mobile/PLATFORM_DIVERGENCES.md — primary@8% behind a 1.5px
          primary@25% edge — rather than Android's, which that file notes as
          the divergence. Both variants carry the border so the highlight does
          not resize the row by 3px as it moves.

          Rank and points are `t-num`: bold mono is the app's signature for a
          numeral, and it also makes ranks column-align down the list. */}
      <div className="sm:hidden space-y-3">
        {filteredMembers.map((member) => {
          const isCurrentUser = member.user_id === currentUserId
          const best = getBestEntry(member)
          return (
            <ListRow key={member.member_id} selected={isCurrentUser}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {/* ink, not muted — the desktop table's rank is ink, and
                        the two views disagreed. */}
                    <span className="t-num text-base text-ink shrink-0">#{best?.current_rank || '-'}</span>
                    <span className="t-card-title text-ink truncate">
                      {member.users.username}
                      {isCurrentUser && <span className="t-detail font-bold text-primary-800 ml-1">(you)</span>}
                    </span>
                  </div>
                  {/* t-body, not t-detail. The scale jumps 10 → 14 with nothing
                      between, and t-detail would have shrunk this line from the
                      12px it was — the wrong direction on a card that already
                      has room. Hierarchy comes from the 16px bold title above
                      it instead. */}
                  <p className="t-body text-muted mt-0.5">{member.users.full_name}</p>
                </div>
                <span className="t-num t-num-extrabold text-xl text-primary-600 shrink-0">
                  {formatNumber(best ? getEntryTotalPoints(best) : 0)}
                </span>
              </div>
              {/* Entries badges for multi-entry members */}
              {(member.entries || []).length > 1 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {(member.entries || []).map(entry => {
                    const submitted = isProgressive
                      ? currentOpenRoundKey !== null && isEntrySubmittedForCurrentRound(entry.entry_id)
                      : entry.has_submitted_predictions
                    return (
                      <span
                        key={entry.entry_id}
                        className={`t-detail font-bold px-2 py-0.5 rounded-pill whitespace-nowrap ${
                          submitted
                            ? 'bg-success-600/12 text-success-900'
                            : 'bg-mist text-ink'
                        }`}
                      >
                        {entry.entry_name}
                      </span>
                    )
                  })}
                </div>
              )}
              {/* ink@8%, not border-subtle. Subtle is mist, which is the same
                  lightness as the primary tint behind the current-user row, so
                  the divider vanished on exactly one row. A translucent ink
                  darkens whatever is behind it and reads on both. */}
              <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-ink/8">
                <div className="flex items-center gap-1.5">
                  <Badge variant={member.role === 'admin' ? 'blue' : 'gray'}>
                    {member.role === 'admin' ? 'Admin' : 'Player'}
                  </Badge>
                  {roundsLoaded && <StatusBadge status={memberStatus(member)} />}
                </div>
                <ActionMenu items={memberActions(member)} />
              </div>
            </ListRow>
          )
        })}
      </div>

      {/* Members - Desktop table view */}
      <Card padding="none" className="hidden sm:block overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-default">
                <th className="text-left py-3 px-4 font-semibold text-ink">
                  Rank
                </th>
                <th className="text-left py-3 px-4 font-semibold text-ink">
                  Member
                </th>
                <th className="text-right py-3 px-4 font-semibold text-ink">
                  Points
                </th>
                <th className="text-center py-3 px-4 font-semibold text-ink">
                  Predictions
                </th>
                <th className="text-center py-3 px-4 font-semibold text-ink">
                  Role
                </th>
                <th className="text-left py-3 px-4 font-semibold text-ink">
                  Joined
                </th>
                <th className="text-right py-3 px-4 font-semibold text-ink">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredMembers.map((member) => {
                const isCurrentUser = member.user_id === currentUserId

                return (
                  <tr
                    key={member.member_id}
                    className={`border-b border-border-default last:border-b-0 ${isCurrentUser ? 'bg-primary-600/12' : 'hover:bg-snow'}`}
                  >
                    <td className="px-4 py-3">
                      <span className="t-num text-sm text-ink">
                        #{getBestEntry(member)?.current_rank || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-ink">
                          {member.users.username}
                          {isCurrentUser && <span className="text-xs text-primary-500 ml-1">(you)</span>}
                        </p>
                        <p className="text-xs text-muted">
                          {member.users.full_name}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="t-num t-num-extrabold text-lg text-primary-600">
                        {formatNumber(getBestEntry(member) ? getEntryTotalPoints(getBestEntry(member)!) : 0)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {roundsLoaded && <StatusBadge status={memberStatus(member)} />}
                        {(member.entries || []).length > 1 && (
                          <span className="text-xs text-muted">{(member.entries || []).length} entries</span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        variant={member.role === 'admin' ? 'blue' : 'gray'}
                      >
                        {member.role === 'admin' ? 'Admin' : 'Player'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted">
                      {new Date(member.joined_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="relative inline-block">
                        <ActionMenu items={memberActions(member)} />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* View Predictions Modal */}
      {modal.type === 'view_predictions' && (
        pool.prediction_mode === 'bracket_picker' ? (
          <ViewBracketPickerPredictionsModal
            member={modal.member}
            initialEntry={modal.entry}
            matches={matches}
            teams={teams}
            onClose={() => setModal({ type: 'none' })}
            getEntryTotalPoints={getEntryTotalPoints}
          />
        ) : (
          <ViewPredictionsModal
            member={modal.member}
            initialEntry={modal.entry}
            predictions={predictions}
            matches={matches}
            teams={teams}
            onClose={() => setModal({ type: 'none' })}
            getEntryTotalPoints={getEntryTotalPoints}
            isProgressive={pool.prediction_mode === 'progressive'}
          />
        )
      )}

      {/* Adjust Points Modal */}
      {modal.type === 'adjust_points' && (
        <AdjustPointsModal
          member={modal.member}
          initialEntry={modal.entry}
          pointAdjustment={pointAdjustment}
          setPointAdjustment={setPointAdjustment}
          adjustReason={adjustReason}
          setAdjustReason={setAdjustReason}
          error={error}
          loading={loading}
          onConfirm={(entry) => handleAdjustPoints(modal.member, entry)}
          onClose={() => {
            setModal({ type: 'none' })
            setError(null)
          }}
          getEntryTotalPoints={getEntryTotalPoints}
        />
      )}

      {/* Promote Modal */}
      {modal.type === 'promote' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
          <div className="bg-surface rounded-t-sheet sm:rounded-card shadow-card-elevated sm:max-w-md w-full sm:mx-4 p-4 sm:p-6 dark:shadow-none dark:border dark:border-border-default">
            <h3 className="text-lg font-bold text-ink mb-3">
              Promote to Admin
            </h3>
            <p className="text-sm text-muted mb-2">
              Are you sure you want to make{' '}
              <span className="font-bold">{modal.member.users.username}</span>{' '}
              an admin?
            </p>
            <p className="text-sm text-muted mb-4">
              Admins can edit pool settings, manage scoring rules, and manage
              members.
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                variant="gray"
                onClick={() => setModal({ type: 'none' })}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => handlePromote(modal.member)}
                loading={loading}
                loadingText="Promoting..."
              >
                Promote to Admin
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Demote Modal */}
      {modal.type === 'demote' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
          <div className="bg-surface rounded-t-sheet sm:rounded-card shadow-card-elevated sm:max-w-md w-full sm:mx-4 p-4 sm:p-6 dark:shadow-none dark:border dark:border-border-default">
            <h3 className="text-lg font-bold text-ink mb-3">
              Demote to Player
            </h3>
            <p className="text-sm text-muted mb-4">
              Are you sure you want to demote{' '}
              <span className="font-bold">{modal.member.users.username}</span>{' '}
              to a regular player?
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                variant="gray"
                onClick={() => setModal({ type: 'none' })}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => handleDemote(modal.member)}
                loading={loading}
                loadingText="Demoting..."
              >
                Demote to Player
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Unlock Predictions Modal */}
      {modal.type === 'unlock_predictions' && (
        <UnlockPredictionsModal
          member={modal.member}
          initialEntry={modal.entry}
          loading={loading}
          onUnlock={(entry?: EntryData) => handleUnlockPredictions(modal.member, entry)}
          onClose={() => setModal({ type: 'none' })}
          isProgressive={isProgressive}
          predictions={predictions}
        />
      )}

      {/* Delete Entry Modal */}
      {modal.type === 'delete_entry' && (
        <DeleteEntryModal
          member={modal.member}
          loading={loading}
          error={error}
          onDelete={(entry) => handleDeleteEntry(modal.member, entry)}
          onClose={() => {
            setModal({ type: 'none' })
            setError(null)
          }}
          getEntryTotalPoints={getEntryTotalPoints}
        />
      )}

      {/* Remove Modal */}
      {modal.type === 'remove' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
          <div className="bg-surface rounded-t-sheet sm:rounded-card shadow-card-elevated sm:max-w-md w-full sm:mx-4 p-4 sm:p-6 dark:shadow-none dark:border dark:border-border-default">
            <h3 className="text-lg font-bold text-danger-600 mb-3">
              Remove Member
            </h3>
            <p className="text-sm text-muted mb-2">
              Are you sure you want to remove{' '}
              <span className="font-bold">{modal.member.users.username}</span>{' '}
              from this pool?
            </p>
            <Alert variant="error">
              <p>
                This will delete all their predictions. This action cannot be
                undone.
              </p>
            </Alert>
            <label className="flex items-center gap-2 text-sm text-ink mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={removeConfirmed}
                onChange={(e) => setRemoveConfirmed(e.target.checked)}
                className="rounded"
              />
              I understand this action cannot be undone
            </label>
            <div className="flex gap-3 justify-end">
              <Button
                variant="gray"
                onClick={() => {
                  setModal({ type: 'none' })
                  setRemoveConfirmed(false)
                }}
                disabled={loading}
              >
                Cancel
              </Button>
              <button
                onClick={() => handleRemove(modal.member)}
                disabled={!removeConfirmed || loading}
                className="px-4 py-2 text-sm rounded-control font-semibold bg-danger-600 text-white hover:bg-danger-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Removing...' : 'Remove Member'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================
// VIEW PREDICTIONS MODAL
// =============================================

function ViewPredictionsModal({
  member,
  initialEntry,
  predictions,
  matches,
  teams,
  onClose,
  getEntryTotalPoints,
  isProgressive,
}: {
  member: MemberData
  initialEntry?: EntryData
  predictions: PredictionData[]
  matches: MatchData[]
  teams: TeamData[]
  onClose: () => void
  getEntryTotalPoints: (entry: EntryData) => number
  isProgressive: boolean
}) {
  const entries = (member.entries || []).sort((a, b) => a.entry_number - b.entry_number)
  const hasMultipleEntries = entries.length > 1
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(
    initialEntry?.entry_id || (entries.length > 0 ? entries[0].entry_id : null)
  )

  // Filter predictions to selected entry only
  const memberPreds = predictions.filter(
    (p) => p.entry_id === selectedEntryId
  )

  const selectedEntry = entries.find(e => e.entry_id === selectedEntryId) || entries[0]

  // Convert matches to tournament Match type for resolution functions
  const tournamentMatches: Match[] = matches.map((m) => ({
    match_id: m.match_id,
    match_number: m.match_number,
    stage: m.stage,
    group_letter: m.group_letter,
    match_date: m.match_date,
    venue: m.venue,
    status: m.status,
    home_team_id: m.home_team_id,
    away_team_id: m.away_team_id,
    home_team_placeholder: m.home_team_placeholder,
    away_team_placeholder: m.away_team_placeholder,
    home_team: m.home_team ? { country_name: m.home_team.country_name, flag_url: null } : null,
    away_team: m.away_team ? { country_name: m.away_team.country_name, flag_url: null } : null,
  }))

  // Convert teams to tournament Team type
  const tournamentTeams: Team[] = teams.map((t) => ({
    team_id: t.team_id,
    country_name: t.country_name,
    country_code: t.country_code,
    group_letter: t.group_letter,
    fifa_ranking_points: t.fifa_ranking_points,
    flag_url: t.flag_url,
  }))

  // Build this member's PredictionMap
  const predictionMap: PredictionMap = useMemo(() => {
    const map: PredictionMap = new Map()
    for (const pred of memberPreds) {
      map.set(pred.match_id, {
        home: pred.predicted_home_score,
        away: pred.predicted_away_score,
        homePso: pred.predicted_home_pso,
        awayPso: pred.predicted_away_pso,
        winnerTeamId: pred.predicted_winner_team_id,
      })
    }
    return map
  }, [memberPreds])

  // Resolve full bracket from this member's predictions
  const bracket = useMemo(() => {
    return resolvePredictedBracket({
      matches: tournamentMatches,
      predictionMap,
      teams: tournamentTeams,
    })
  }, [tournamentMatches, predictionMap, tournamentTeams])

  const allGroupStandings = bracket.allGroupStandings
  const knockoutTeamMap = bracket.knockoutTeamMap
  const champion = bracket.champion

  // Stage order for display
  const stageOrder = ['group', 'round_32', 'round_16', 'quarter_final', 'semi_final', 'third_place', 'final']
  const stageNames: Record<string, string> = {
    group: 'Group Stage',
    round_32: 'Round of 32',
    round_16: 'Round of 16',
    quarter_final: 'Quarter Finals',
    semi_final: 'Semi Finals',
    third_place: 'Third Place',
    final: 'Final',
  }

  // Group predictions by stage
  const predsByStage: Record<string, PredictionData[]> = {}
  memberPreds.forEach((pred) => {
    const match = matches.find((m) => m.match_id === pred.match_id)
    const stage = match?.stage || 'unknown'
    if (!predsByStage[stage]) predsByStage[stage] = []
    predsByStage[stage].push(pred)
  })

  // Export predictions as CSV
  function exportToCsv() {
    const headers = ['Match #', 'Stage', 'Home Team', 'Home Score', 'Away Score', 'Away Team', 'PSO Home', 'PSO Away']
    const rows: string[][] = []

    for (const stage of stageOrder) {
      const preds = predsByStage[stage]
      if (!preds || preds.length === 0) continue

      const sorted = [...preds].sort((a, b) => {
        const ma = matches.find((m) => m.match_id === a.match_id)
        const mb = matches.find((m) => m.match_id === b.match_id)
        return (ma?.match_number ?? 0) - (mb?.match_number ?? 0)
      })

      for (const pred of sorted) {
        const match = matches.find((m) => m.match_id === pred.match_id)
        if (!match) continue

        const homeName = getTeamName(match, 'home')
        const awayName = getTeamName(match, 'away')

        rows.push([
          String(match.match_number),
          stageNames[stage] || stage,
          homeName,
          String(pred.predicted_home_score),
          String(pred.predicted_away_score),
          awayName,
          pred.predicted_home_pso != null ? String(pred.predicted_home_pso) : '',
          pred.predicted_away_pso != null ? String(pred.predicted_away_pso) : '',
        ])
      }
    }

    // Add champion row
    if (champion) {
      rows.push([])
      rows.push(['Predicted Champion', champion.country_name])
    }

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')),
    ].join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const username = member.users.username
    link.href = url
    link.download = `${username}_predictions.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  // Resolve team name for a match
  function getTeamName(match: MatchData, side: 'home' | 'away'): string {
    // Progressive pools predict the ACTUAL fixtures round-by-round, so always
    // show the real assigned teams (mirrors the member wizard's
    // resolveMatchesFromActual). Resolving knockout teams from the member's
    // predicted bracket — as the classic path below does — would show different
    // matchups than the member actually predicted.
    if (isProgressive) {
      const teamObj = side === 'home' ? match.home_team : match.away_team
      if (teamObj?.country_name) return teamObj.country_name
      const teamId = side === 'home' ? match.home_team_id : match.away_team_id
      if (teamId) {
        const t = teams.find((t) => t.team_id === teamId)
        if (t) return t.country_name
      }
      return 'TBD'
    }
    // Group stage: use actual team names
    if (match.stage === 'group') {
      return side === 'home'
        ? match.home_team?.country_name || 'TBD'
        : match.away_team?.country_name || 'TBD'
    }
    // Knockout (classic mode): resolve from member's predicted bracket
    const resolved = knockoutTeamMap.get(match.match_number)
    if (resolved) {
      const team = side === 'home' ? resolved.home : resolved.away
      if (team) return team.country_name
    }
    return 'TBD'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="bg-surface rounded-t-sheet sm:rounded-card shadow-card-elevated sm:max-w-lg w-full sm:mx-4 max-h-[85vh] flex flex-col dark:shadow-none dark:border dark:border-border-default">
        {/* Header */}
        <div className="p-4 sm:p-6 pb-3 border-b border-border-subtle shrink-0">
          <h3 className="text-xl font-bold text-ink">
            {member.users.full_name || member.users.username}&apos;s Predictions
          </h3>
          {selectedEntry && (
            <p className="text-sm text-muted mt-1">
              {selectedEntry.entry_name} &middot; {formatNumber(getEntryTotalPoints(selectedEntry))} pts
              {selectedEntry.has_submitted_predictions ? '' : ' (not submitted)'}
            </p>
          )}
          {/* Entry selector tabs */}
          {hasMultipleEntries && (
            <div className="flex gap-1.5 mt-3 overflow-x-auto">
              {entries.map((entry) => (
                <button
                  key={entry.entry_id}
                  onClick={() => setSelectedEntryId(entry.entry_id)}
                  className={`px-3 py-1.5 rounded-pill text-xs font-medium whitespace-nowrap transition ${
                    selectedEntryId === entry.entry_id
                      ? 'bg-primary-600 text-white'
                      : 'bg-mist text-muted hover:bg-silver'
                  }`}
                >
                  {entry.entry_name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 p-4 sm:px-6">
          {memberPreds.length === 0 ? (
            <p className="text-muted text-sm py-4">
              No predictions submitted.
            </p>
          ) : (
            <>
              {stageOrder.map((stage) => {
                const preds = predsByStage[stage]
                if (!preds || preds.length === 0) return null

                // Sort by match number
                const sorted = [...preds].sort((a, b) => {
                  const ma = matches.find((m) => m.match_id === a.match_id)
                  const mb = matches.find((m) => m.match_id === b.match_id)
                  return (ma?.match_number ?? 0) - (mb?.match_number ?? 0)
                })

                return (
                  <div key={stage} className="mb-5">
                    <h4 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                      {stageNames[stage] || stage}
                    </h4>
                    <div className="space-y-1">
                      {sorted.map((pred) => {
                        const match = matches.find(
                          (m) => m.match_id === pred.match_id
                        )
                        if (!match) return null

                        const homeName = getTeamName(match, 'home')
                        const awayName = getTeamName(match, 'away')
                        const isDraw = pred.predicted_home_score === pred.predicted_away_score
                        const isKnockout = match.stage !== 'group'

                        return (
                          <div
                            key={pred.prediction_id}
                            className="bg-snow rounded-chip px-3 py-2"
                          >
                            <div className="flex items-center gap-2">
                              {/* Match number */}
                              <span className="t-num t-num-regular text-xs text-muted shrink-0 w-7 text-right">
                                #{match.match_number}
                              </span>

                              {/* Home team */}
                              <span className="flex-1 text-right text-sm font-medium text-ink truncate">
                                {homeName}
                              </span>

                              {/* Score */}
                              <span className="t-num text-sm text-ink shrink-0 px-1">
                                {pred.predicted_home_score} - {pred.predicted_away_score}
                              </span>

                              {/* Away team */}
                              <span className="flex-1 text-left text-sm font-medium text-ink truncate">
                                {awayName}
                              </span>
                            </div>

                            {/* PSO for knockout draws */}
                            {isKnockout && isDraw && pred.predicted_home_pso != null && pred.predicted_away_pso != null && (
                              <p className="text-xs text-primary-600 font-medium text-center mt-0.5">
                                PSO: {pred.predicted_home_pso} - {pred.predicted_away_pso}
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}

              {/* Champion highlight — only meaningful for full-bracket modes.
                  Progressive members predict round-by-round, so a bracket-
                  resolved "champion" from partial predictions is misleading. */}
              {!isProgressive && champion && (
                <div className="mt-2 text-center p-4 rounded-card bg-gradient-to-br from-primary-600/12 via-accent-400/12 to-accent-400/12 border border-accent-400/25">
                  <div className="text-3xl mb-1">&#127942;</div>
                  <p className="text-xs font-semibold text-accent-500 uppercase tracking-wide mb-0.5">
                    Predicted Champion
                  </p>
                  <h4 className="text-xl font-bold text-ink">
                    {champion.country_name}
                  </h4>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:px-6 pt-3 border-t border-border-subtle shrink-0">
          <div className="flex justify-between">
            {memberPreds.length > 0 ? (
              <button
                onClick={exportToCsv}
                className="text-sm text-primary-600 hover:text-primary-800 font-medium flex items-center gap-1.5"
              >
                <Icon name="square.and.arrow.down" size={16} />
                Export CSV
              </button>
            ) : (
              <div />
            )}
            <Button variant="gray" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// =============================================
// VIEW BRACKET PICKER PREDICTIONS MODAL
// =============================================

function ViewBracketPickerPredictionsModal({
  member,
  initialEntry,
  matches,
  teams,
  onClose,
  getEntryTotalPoints,
}: {
  member: MemberData
  initialEntry?: EntryData
  matches: MatchData[]
  teams: TeamData[]
  onClose: () => void
  getEntryTotalPoints: (entry: EntryData) => number
}) {
  const entries = (member.entries || []).sort((a, b) => a.entry_number - b.entry_number)
  const hasMultipleEntries = entries.length > 1
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(
    initialEntry?.entry_id || (entries.length > 0 ? entries[0].entry_id : null)
  )
  const selectedEntry = entries.find(e => e.entry_id === selectedEntryId) || entries[0]

  // Fetch bracket picker data client-side for the selected entry
  const [bpData, setBpData] = useState<{
    groupRankings: BPGroupRanking[]
    thirdPlaceRankings: BPThirdPlaceRanking[]
    knockoutPicks: BPKnockoutPick[]
  } | null>(null)
  const [loadingBp, setLoadingBp] = useState(false)

  useEffect(() => {
    if (!selectedEntryId) return
    setLoadingBp(true)
    const supabase = createClient()
    Promise.all([
      supabase.from('bracket_picker_group_rankings').select('*').eq('entry_id', selectedEntryId),
      supabase.from('bracket_picker_third_place_rankings').select('*').eq('entry_id', selectedEntryId),
      supabase.from('bracket_picker_knockout_picks').select('*').eq('entry_id', selectedEntryId),
    ]).then(([grRes, tpRes, kpRes]) => {
      setBpData({
        groupRankings: (grRes.data ?? []) as BPGroupRanking[],
        thirdPlaceRankings: (tpRes.data ?? []) as BPThirdPlaceRanking[],
        knockoutPicks: (kpRes.data ?? []) as BPKnockoutPick[],
      })
      setLoadingBp(false)
    })
  }, [selectedEntryId])

  // Convert teams to tournament Team type
  const tournamentTeams: Team[] = useMemo(() =>
    teams.map((t) => ({
      team_id: t.team_id,
      country_name: t.country_name,
      country_code: t.country_code,
      group_letter: t.group_letter,
      fifa_ranking_points: t.fifa_ranking_points,
      flag_url: t.flag_url,
    })),
  [teams])

  const tournamentMatches = useMemo(() =>
    matches.map((m) => ({
      match_id: m.match_id,
      match_number: m.match_number,
      stage: m.stage,
      group_letter: m.group_letter,
      match_date: m.match_date,
      venue: m.venue,
      status: m.status,
      home_team_id: m.home_team_id,
      away_team_id: m.away_team_id,
      home_team_placeholder: m.home_team_placeholder,
      away_team_placeholder: m.away_team_placeholder,
      home_team: m.home_team ? { country_name: m.home_team.country_name, flag_url: null } : null,
      away_team: m.away_team ? { country_name: m.away_team.country_name, flag_url: null } : null,
    })),
  [matches])

  // Resolve bracket from bracket picker data
  const bracket = useMemo(() => {
    if (!bpData || bpData.groupRankings.length === 0) return null
    return resolveFullBracketFromPicks({
      groupRankings: bpData.groupRankings,
      thirdPlaceRankings: bpData.thirdPlaceRankings,
      knockoutPicks: bpData.knockoutPicks,
      teams: tournamentTeams,
      matches: tournamentMatches,
    })
  }, [bpData, tournamentTeams, tournamentMatches])

  // Team lookup
  const teamMap = useMemo(() => new Map(teams.map(t => [t.team_id, t])), [teams])

  // Stage labels for knockout
  const knockoutStageOrder = ['round_32', 'round_16', 'quarter_final', 'semi_final', 'third_place', 'final']
  const stageNames: Record<string, string> = {
    round_32: 'Round of 32',
    round_16: 'Round of 16',
    quarter_final: 'Quarter Finals',
    semi_final: 'Semi Finals',
    third_place: 'Third Place',
    final: 'Final',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="bg-surface rounded-t-sheet sm:rounded-card shadow-card-elevated sm:max-w-lg w-full sm:mx-4 max-h-[85vh] flex flex-col dark:shadow-none dark:border dark:border-border-default">
        {/* Header */}
        <div className="p-4 sm:p-6 pb-3 border-b border-border-subtle shrink-0">
          <h3 className="text-xl font-bold text-ink">
            {member.users.full_name || member.users.username}&apos;s Bracket Picks
          </h3>
          {selectedEntry && (
            <p className="text-sm text-muted mt-1">
              {selectedEntry.entry_name} &middot; {formatNumber(getEntryTotalPoints(selectedEntry))} pts
              {selectedEntry.has_submitted_predictions ? '' : ' (not submitted)'}
            </p>
          )}
          {hasMultipleEntries && (
            <div className="flex gap-1.5 mt-3 overflow-x-auto">
              {entries.map((entry) => (
                <button
                  key={entry.entry_id}
                  onClick={() => setSelectedEntryId(entry.entry_id)}
                  className={`px-3 py-1.5 rounded-pill text-xs font-medium whitespace-nowrap transition ${
                    selectedEntryId === entry.entry_id
                      ? 'bg-primary-600 text-white'
                      : 'bg-mist text-muted hover:bg-silver'
                  }`}
                >
                  {entry.entry_name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 p-4 sm:px-6">
          {loadingBp ? (
            <div className="text-center py-8">
              <div className="text-muted text-sm">Loading bracket picks...</div>
            </div>
          ) : !bpData || bpData.groupRankings.length === 0 ? (
            <p className="text-muted text-sm py-4">No bracket picks submitted.</p>
          ) : (
            <>
              {/* Champion highlight */}
              {bracket?.champion && (
                <div className="mb-5 text-center p-4 rounded-card bg-gradient-to-br from-warning-500/12 to-warning-500/20 border-2 border-warning-500/30">
                  <div className="text-3xl mb-1">&#127942;</div>
                  <p className="text-xs font-semibold text-warning-600 uppercase tracking-wide mb-1">Predicted Champion</p>
                  <div className="flex items-center justify-center gap-2">
                    {bracket.champion.flag_url && (
                      <img src={bracket.champion.flag_url} alt="" className="w-8 h-6 rounded-[2px] object-cover" />
                    )}
                    <span className="text-lg font-bold text-ink">{bracket.champion.country_name}</span>
                  </div>
                  {(bracket.runnerUp || bracket.thirdPlace) && (
                    <div className="flex justify-center gap-6 mt-2 text-xs text-muted">
                      {bracket.runnerUp && (
                        <span>
                          <span className="text-muted">2nd:</span>{' '}
                          <span className="font-semibold">{bracket.runnerUp.country_name}</span>
                        </span>
                      )}
                      {bracket.thirdPlace && (
                        <span>
                          <span className="text-muted">3rd:</span>{' '}
                          <span className="font-semibold">{bracket.thirdPlace.country_name}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Group Rankings */}
              <div className="mb-5">
                <h4 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Group Rankings</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {GROUP_LETTERS.map((letter) => {
                    const groupRanks = bpData.groupRankings
                      .filter(r => r.group_letter === letter)
                      .sort((a, b) => a.predicted_position - b.predicted_position)
                    if (groupRanks.length === 0) return null
                    return (
                      <div key={letter} className="bg-snow rounded-chip p-2.5">
                        <div className="text-xs font-bold text-ink mb-1.5">Group {letter}</div>
                        <div className="space-y-1">
                          {groupRanks.map((rank, i) => {
                            const team = teamMap.get(rank.team_id)
                            return (
                              <div key={rank.team_id} className="flex items-center gap-1.5">
                                <span className={`text-[10px] font-bold w-4 text-center ${
                                  i === 0 ? 'text-success-600' : i === 1 ? 'text-primary-600' : 'text-muted'
                                }`}>{i + 1}</span>
                                {team?.flag_url && (
                                  <img src={team.flag_url} alt="" className="w-5 h-3.5 rounded-[2px] object-cover" />
                                )}
                                <span className="text-xs text-ink truncate">{team?.country_name || 'Unknown'}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Third-Place Rankings */}
              <div className="mb-5">
                <h4 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Third-Place Rankings</h4>
                <div className="bg-snow rounded-chip p-3">
                  <div className="space-y-1">
                    {[...bpData.thirdPlaceRankings]
                      .sort((a, b) => a.rank - b.rank)
                      .map((ranking, i) => {
                        const team = teamMap.get(ranking.team_id)
                        const qualifies = i < 8
                        return (
                          <div key={ranking.team_id} className={`flex items-center gap-2 py-0.5 ${!qualifies ? 'opacity-40' : ''}`}>
                            <span className={`text-[10px] font-bold w-5 text-center ${qualifies ? 'text-success-600' : 'text-muted'}`}>
                              {i + 1}
                            </span>
                            {team?.flag_url && (
                              <img src={team.flag_url} alt="" className="w-5 h-3.5 rounded-[2px] object-cover" />
                            )}
                            <span className="text-xs text-ink flex-1 truncate">{team?.country_name || 'Unknown'}</span>
                            <span className="text-xs text-muted">Grp {ranking.group_letter}</span>
                            {qualifies ? (
                              <span className="text-[10px] font-medium text-success-900 bg-success-600/12 px-1.5 py-0.5 rounded-chip">Q</span>
                            ) : (
                              <span className="text-[10px] font-medium text-muted bg-mist px-1.5 py-0.5 rounded-chip">E</span>
                            )}
                          </div>
                        )
                      })}
                  </div>
                </div>
              </div>

              {/* Knockout Bracket */}
              <div className="mb-3">
                <h4 className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">Knockout Bracket</h4>
                {knockoutStageOrder.map((stage) => {
                  const stageMatches = matches
                    .filter(m => m.stage === stage)
                    .sort((a, b) => a.match_number - b.match_number)
                  if (stageMatches.length === 0) return null

                  const stagePicks = stageMatches.map(m => {
                    const pick = bpData.knockoutPicks.find(kp => kp.match_id === m.match_id)
                    const winnerTeam = pick ? teamMap.get(pick.winner_team_id) : null
                    const resolved = bracket?.knockoutTeamMap.get(m.match_number)
                    return { match: m, pick, winnerTeam, resolved }
                  })

                  return (
                    <div key={stage} className="mb-3">
                      <div className="text-[10px] font-semibold text-muted uppercase tracking-wide mb-1">
                        {stageNames[stage]}
                      </div>
                      <div className="space-y-1">
                        {stagePicks.map(({ match, pick, winnerTeam, resolved }) => (
                          <div key={match.match_id} className="bg-snow rounded-chip px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="t-num t-num-regular text-xs text-muted shrink-0 w-7 text-right">
                                #{match.match_number}
                              </span>
                              <div className="flex-1 min-w-0">
                                {resolved ? (
                                  <span className="text-xs text-muted">
                                    {resolved.home?.country_name || 'TBD'} vs {resolved.away?.country_name || 'TBD'}
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted">TBD vs TBD</span>
                                )}
                              </div>
                              {winnerTeam ? (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {winnerTeam.flag_url && (
                                    <img src={winnerTeam.flag_url} alt="" className="w-5 h-3.5 rounded-[2px] object-cover" />
                                  )}
                                  <span className="text-xs font-semibold text-success-700">{winnerTeam.country_name}</span>
                                  {pick?.predicted_penalty && (
                                    <span className="text-[9px] text-primary-600 font-medium">(PSO)</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-muted">No pick</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:px-6 pt-3 border-t border-border-subtle shrink-0">
          <div className="flex justify-end">
            <Button variant="gray" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// =============================================
// UNLOCK PREDICTIONS MODAL
// =============================================

function UnlockPredictionsModal({
  member,
  initialEntry,
  loading,
  onUnlock,
  onClose,
  isProgressive,
  predictions,
}: {
  member: MemberData
  initialEntry?: EntryData
  loading: boolean
  onUnlock: (entry?: EntryData) => void
  onClose: () => void
  isProgressive?: boolean
  predictions?: PredictionData[]
}) {
  // For progressive mode, an entry is "submitted" if it has any predictions (round submissions are per-round)
  const submittedEntries = (member.entries || []).filter(e =>
    e.has_submitted_predictions ||
    (isProgressive && (predictions ?? []).some(p => p.entry_id === e.entry_id))
  )
  const hasMultipleSubmitted = submittedEntries.length > 1
  const [selectedEntryId, setSelectedEntryId] = useState<string | 'all'>(
    initialEntry?.entry_id || (hasMultipleSubmitted ? 'all' : (submittedEntries[0]?.entry_id || 'all'))
  )

  const selectedEntry = selectedEntryId === 'all'
    ? undefined
    : submittedEntries.find(e => e.entry_id === selectedEntryId)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="bg-surface rounded-t-sheet sm:rounded-card shadow-card-elevated sm:max-w-md w-full sm:mx-4 p-4 sm:p-6 dark:shadow-none dark:border dark:border-border-default">
        <h3 className="text-lg font-bold text-ink mb-3">
          Unlock Predictions
        </h3>
        <p className="text-sm text-muted mb-2">
          Unlock predictions for{' '}
          <span className="font-bold">{member.users.username}</span>?
        </p>

        {/* Entry selector when multiple submitted entries */}
        {hasMultipleSubmitted && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-ink mb-2">
              Select entry to unlock
            </label>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm text-ink cursor-pointer p-2 rounded-chip hover:bg-snow">
                <input
                  type="radio"
                  name="unlock_entry"
                  checked={selectedEntryId === 'all'}
                  onChange={() => setSelectedEntryId('all')}
                  className="text-primary-600"
                />
                <span className="font-medium">All entries</span>
                <span className="text-xs text-muted">({submittedEntries.length} submitted)</span>
              </label>
              {submittedEntries.map((entry) => (
                <label
                  key={entry.entry_id}
                  className="flex items-center gap-2 text-sm text-ink cursor-pointer p-2 rounded-chip hover:bg-snow"
                >
                  <input
                    type="radio"
                    name="unlock_entry"
                    checked={selectedEntryId === entry.entry_id}
                    onChange={() => setSelectedEntryId(entry.entry_id)}
                    className="text-primary-600"
                  />
                  <span className="font-medium">{entry.entry_name}</span>
                  <span className="text-xs text-muted">
                    {entry.predictions_submitted_at
                      ? `submitted ${new Date(entry.predictions_submitted_at).toLocaleString()}`
                      : ''}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <Alert variant="warning">
            This will allow them to edit and resubmit {selectedEntry ? selectedEntry.entry_name : 'their predictions'}. Only use this for special circumstances (e.g., technical issues).
          </Alert>

        {/* Show submitted entries info (only when single entry or no selector) */}
        {!hasMultipleSubmitted && submittedEntries.length > 0 && (
          <div className="text-xs text-muted mb-4 space-y-0.5">
            {submittedEntries.map(e => (
              <p key={e.entry_id}>
                {e.entry_name} submitted: {e.predictions_submitted_at ? new Date(e.predictions_submitted_at).toLocaleString() : 'N/A'}
              </p>
            ))}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <Button
            variant="gray"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => onUnlock(selectedEntry)}
            loading={loading}
            loadingText="Unlocking..."
          >
            {selectedEntry ? `Unlock ${selectedEntry.entry_name}` : 'Unlock All'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// =============================================
// ADJUST POINTS MODAL
// =============================================

function AdjustPointsModal({
  member,
  initialEntry,
  pointAdjustment,
  setPointAdjustment,
  adjustReason,
  setAdjustReason,
  error,
  loading,
  onConfirm,
  onClose,
  getEntryTotalPoints,
}: {
  member: MemberData
  initialEntry?: EntryData
  pointAdjustment: number
  setPointAdjustment: (v: number | ((p: number) => number)) => void
  adjustReason: string
  setAdjustReason: (v: string) => void
  error: string | null
  loading: boolean
  onConfirm: (entry: EntryData) => void
  onClose: () => void
  getEntryTotalPoints: (entry: EntryData) => number
}) {
  const entries = (member.entries || []).sort((a, b) => a.entry_number - b.entry_number)
  const hasMultipleEntries = entries.length > 1
  const [selectedEntryId, setSelectedEntryId] = useState<string>(
    initialEntry?.entry_id || entries[0]?.entry_id || ''
  )

  const selectedEntry = entries.find(e => e.entry_id === selectedEntryId) || entries[0]

  if (!selectedEntry) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="bg-surface rounded-t-sheet sm:rounded-card shadow-card-elevated sm:max-w-md w-full sm:mx-4 p-4 sm:p-6 dark:shadow-none dark:border dark:border-border-default">
        <h3 className="text-xl font-bold text-ink mb-4">
          Adjust Points - {member.users.username}
        </h3>

        {error && <Alert variant="error" className="mb-4">{error}</Alert>}

        {/* Entry selector when multiple entries */}
        {hasMultipleEntries && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-ink mb-2">
              Select entry
            </label>
            <div className="flex gap-1.5 overflow-x-auto">
              {entries.map((entry) => (
                <button
                  key={entry.entry_id}
                  onClick={() => setSelectedEntryId(entry.entry_id)}
                  className={`px-3 py-1.5 rounded-pill text-xs font-medium whitespace-nowrap transition ${
                    selectedEntryId === entry.entry_id
                      ? 'bg-primary-600 text-white'
                      : 'bg-mist text-muted hover:bg-silver'
                  }`}
                >
                  {entry.entry_name} ({formatNumber(getEntryTotalPoints(entry))} pts)
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mb-4">
          <p className="text-sm text-muted">
            {selectedEntry.entry_name} current points:{' '}
            <span className="font-bold">
              {formatNumber(getEntryTotalPoints(selectedEntry))}
            </span>
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-ink mb-1">
            Adjustment
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPointAdjustment((p: number) => p - 1)}
              className="w-10 h-10 rounded border border-border-default text-lg font-bold text-ink hover:bg-mist"
            >
              -
            </button>
            <input
              type="number"
              value={pointAdjustment}
              onChange={(e) =>
                setPointAdjustment(parseInt(e.target.value) || 0)
              }
              className="w-24 h-10 text-center border border-border-default rounded-control font-bold text-lg text-ink"
            />
            <button
              onClick={() => setPointAdjustment((p: number) => p + 1)}
              className="w-10 h-10 rounded border border-border-default text-lg font-bold text-ink hover:bg-mist"
            >
              +
            </button>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-ink mb-1">
            Reason (required)
          </label>
          <textarea
            value={adjustReason}
            onChange={(e) => setAdjustReason(e.target.value)}
            placeholder="Explain the reason for this adjustment..."
            rows={3}
            className="w-full px-3 py-2 border border-border-default rounded-control text-sm text-ink focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        <p className="text-sm text-muted mb-4">
          New total:{' '}
          <span className="font-bold text-primary-600">
            {formatNumber(getEntryTotalPoints(selectedEntry) + pointAdjustment)}
          </span>
        </p>

        <div className="flex gap-3 justify-end">
          <Button
            variant="gray"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => onConfirm(selectedEntry)}
            loading={loading}
            loadingText="Saving..."
          >
            Confirm Adjustment
          </Button>
        </div>
      </div>
    </div>
  )
}

// =============================================
// DELETE ENTRY MODAL
// =============================================
//
// Lists the member's entries with a per-row Delete button. The ≥1-entry
// rule is mirrored client-side so non-admin members can't have their
// last entry deleted from here — to fully remove a non-admin player,
// the admin uses "Remove from Pool" instead. Pool admins (the target
// member's role) can be emptied to zero.

function DeleteEntryModal({
  member,
  loading,
  error,
  onDelete,
  onClose,
  getEntryTotalPoints,
}: {
  member: MemberData
  loading: boolean
  error: string | null
  onDelete: (entry: EntryData) => void
  onClose: () => void
  getEntryTotalPoints: (entry: EntryData) => number
}) {
  const entries = (member.entries || []).slice().sort(
    (a, b) => a.entry_number - b.entry_number,
  )
  const [confirmingEntryId, setConfirmingEntryId] = useState<string | null>(null)
  const targetIsAdmin = member.role === 'admin'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="bg-surface rounded-t-sheet sm:rounded-card shadow-card-elevated sm:max-w-md w-full sm:mx-4 p-4 sm:p-6 dark:shadow-none dark:border dark:border-border-default">
        <h3 className="text-lg font-bold text-danger-600 mb-1">Delete Entry</h3>
        <p className="text-sm text-muted mb-3">
          Pick an entry to delete from{' '}
          <span className="font-bold">{member.users.username}</span>.
        </p>
        {!targetIsAdmin && (
          <div className="bg-snow border border-border-default rounded-chip p-3 mb-3">
            <p className="text-xs text-muted">
              Players need at least one entry. To take {member.users.username}{' '}
              out of the pool entirely, use Remove from Pool.
            </p>
          </div>
        )}
        {error && <Alert variant="error" className="mb-3">{error}</Alert>}

        <div className="space-y-2 mb-4">
          {entries.length === 0 && (
            <p className="text-sm text-muted">No entries to delete.</p>
          )}
          {entries.map((entry) => {
            const isLast = entries.length === 1
            const blocked = !targetIsAdmin && isLast
            const isConfirming = confirmingEntryId === entry.entry_id
            return (
              <div
                key={entry.entry_id}
                className="flex items-center justify-between gap-3 p-3 rounded-chip border border-border-default"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink truncate">
                    {entry.entry_name}
                  </p>
                  <p className="text-xs text-muted">
                    {formatNumber(getEntryTotalPoints(entry))} pts ·{' '}
                    {entry.has_submitted_predictions ? 'Submitted' : 'Pending'}
                  </p>
                </div>
                {blocked ? (
                  <span
                    className="text-xs text-muted"
                    title="Players must keep at least one entry"
                  >
                    Last entry
                  </span>
                ) : isConfirming ? (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => setConfirmingEntryId(null)}
                      disabled={loading}
                      className="px-2.5 py-1.5 text-xs rounded-control font-semibold bg-mist text-ink hover:bg-silver transition disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => onDelete(entry)}
                      disabled={loading}
                      className="px-2.5 py-1.5 text-xs rounded-control font-semibold bg-danger-600 text-white hover:bg-danger-700 transition disabled:opacity-50"
                    >
                      {loading ? 'Deleting…' : 'Confirm'}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingEntryId(entry.entry_id)}
                    disabled={loading}
                    className="px-2.5 py-1.5 text-xs rounded-control font-semibold bg-danger-600/12 text-danger-800 hover:bg-danger-600/20 transition disabled:opacity-50"
                  >
                    Delete
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex justify-end">
          <Button variant="gray" onClick={onClose} disabled={loading}>
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
