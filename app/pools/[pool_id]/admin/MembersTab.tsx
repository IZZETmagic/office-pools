'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PoolData, MemberData, EntryData, PredictionData, MatchData, TeamData, BPGroupRanking, BPThirdPlaceRanking, BPKnockoutPick } from '../types'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { useToast } from '@/components/ui/Toast'
import { Input } from '@/components/ui/Input'
import {
  getKnockoutWinner,
  type GroupStanding,
  type PredictionMap,
  type Match,
  type Team,
  GROUP_LETTERS,
} from '@/lib/tournament'
import { resolveFullBracket } from '@/lib/bracketResolver'
import { resolveFullBracketFromPicks } from '@/lib/bracketPickerResolver'

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
  const [copied, setCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  const adminCount = members.filter((m) => m.role === 'admin').length
  const isProgressive = pool.prediction_mode === 'progressive'

  // For progressive mode, an entry is "unlockable" if it has any predictions (round submissions exist per-round)
  // For other modes, check has_submitted_predictions
  const hasUnlockableEntries = (member: MemberData) =>
    (member.entries || []).some(e =>
      e.has_submitted_predictions ||
      (isProgressive && predictions.some(p => p.entry_id === e.entry_id))
    )

  // Get the true total points for an entry (client-side computed match + bonus, falling back to pool_entries)
  function getEntryTotalPoints(entry: EntryData): number {
    return computedEntryTotals.get(entry.entry_id) ?? entry.total_points
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
      await refreshMembers()
    } catch (err: any) {
      setError(err.message || 'Failed to unlock predictions')
    }
    setLoading(false)
    setModal({ type: 'none' })
  }

  function copyPoolCode() {
    navigator.clipboard.writeText(pool.pool_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function getInviteLink() {
    return `${window.location.origin}/join/${pool.pool_code}`
  }

  function copyInviteLink() {
    navigator.clipboard.writeText(getInviteLink())
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  async function toggleQRCode() {
    if (showQR) {
      setShowQR(false)
      return
    }
    if (!qrDataUrl) {
      const QRCode = (await import('qrcode')).default
      const url = await QRCode.toDataURL(getInviteLink(), { width: 200, margin: 2 })
      setQrDataUrl(url)
    }
    setShowQR(true)
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-neutral-900">Pool Members</h2>
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          <span className="text-sm text-neutral-500">Code:</span>
          <button
            onClick={copyPoolCode}
            className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 px-2 py-0.5 rounded transition cursor-pointer"
            title="Copy pool code"
          >
            {pool.pool_code}
            {copied ? (
              <svg className="w-3.5 h-3.5 text-success-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
            ) : (
              <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" /></svg>
            )}
          </button>
          <span className="text-neutral-300">|</span>
          <button
            onClick={copyInviteLink}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-800 bg-neutral-100 hover:bg-neutral-200 px-2 py-0.5 rounded transition cursor-pointer"
            title="Copy invite link"
          >
            {linkCopied ? 'Copied!' : 'Copy Invite Link'}
            {linkCopied ? (
              <svg className="w-3.5 h-3.5 text-success-500" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
            ) : (
              <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-3.061a4.5 4.5 0 00-1.242-7.244l-4.5-4.5a4.5 4.5 0 00-6.364 6.364L4.34 8.374" /></svg>
            )}
          </button>
          <button
            onClick={toggleQRCode}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-800 bg-neutral-100 hover:bg-neutral-200 px-2 py-0.5 rounded transition cursor-pointer"
            title="Show QR code"
          >
            QR
            <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" /><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" /></svg>
          </button>
        </div>
        {showQR && qrDataUrl && (
          <div className="mt-3 p-3 bg-white rounded-lg border border-neutral-200 inline-block">
            <img src={qrDataUrl} alt={`QR code for joining ${pool.pool_name}`} width={200} height={200} />
            <p className="text-xs text-neutral-400 text-center mt-1">Scan to join this pool</p>
          </div>
        )}
      </div>

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

      {/* Search and Sort */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <Input
          type="text"
          placeholder="Search by username..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:max-w-xs"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="px-3 py-2 border border-neutral-300 rounded-xl text-sm text-neutral-700 bg-surface"
        >
          <option value="rank">Sort by Rank</option>
          <option value="points">Sort by Points</option>
          <option value="username">Sort by Username</option>
          <option value="joined">Sort by Joined Date</option>
        </select>
      </div>

      {/* Members - Mobile card view */}
      <div className="sm:hidden space-y-2">
        {filteredMembers.map((member) => {
          const isCurrentUser = member.user_id === currentUserId
          return (
            <div
              key={member.member_id}
              className={`rounded-xl border p-3 ${isCurrentUser ? 'bg-primary-50 border-primary-200' : 'bg-surface border-neutral-200'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-neutral-500">#{getBestEntry(member)?.current_rank || '-'}</span>
                    <span className="text-sm font-medium text-neutral-900 truncate">
                      {member.users.username}
                      {isCurrentUser && <span className="text-xs text-primary-500 ml-1">(you)</span>}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 mt-0.5">{member.users.full_name}</p>
                </div>
                <span className="text-lg font-bold text-primary-600 shrink-0">{getBestEntry(member) ? getEntryTotalPoints(getBestEntry(member)!) : 0}</span>
              </div>
              {/* Entries badges for multi-entry members */}
              {(member.entries || []).length > 1 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {(member.entries || []).map(entry => (
                    <span
                      key={entry.entry_id}
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        entry.has_submitted_predictions
                          ? 'bg-success-50 text-success-700'
                          : 'bg-neutral-100 text-neutral-500'
                      }`}
                    >
                      {entry.entry_name}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-neutral-100">
                <div className="flex items-center gap-1.5">
                  <Badge variant={member.role === 'admin' ? 'blue' : 'gray'}>
                    {member.role === 'admin' ? 'Admin' : 'Player'}
                  </Badge>
                  {(member.entries || []).every(e => e.has_submitted_predictions) ? (
                    <Badge variant="green">Submitted</Badge>
                  ) : (member.entries || []).some(e => e.has_submitted_predictions) ? (
                    <Badge variant="yellow">Partial</Badge>
                  ) : (
                    <Badge variant="yellow">Pending</Badge>
                  )}
                </div>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const action = e.target.value
                    e.target.value = ''
                    setError(null)
                    switch (action) {
                      case 'view_predictions':
                        setModal({ type: 'view_predictions', member })
                        break
                      case 'adjust_points':
                        setPointAdjustment(0)
                        setAdjustReason('')
                        setModal({ type: 'adjust_points', member })
                        break
                      case 'promote':
                        setModal({ type: 'promote', member })
                        break
                      case 'demote':
                        setModal({ type: 'demote', member })
                        break
                      case 'remove':
                        setRemoveConfirmed(false)
                        setModal({ type: 'remove', member })
                        break
                      case 'unlock_predictions':
                        setModal({ type: 'unlock_predictions', member })
                        break
                    }
                  }}
                  className="text-xs px-2 py-1.5 border border-neutral-300 rounded bg-surface text-neutral-700 cursor-pointer"
                >
                  <option value="" disabled>Actions</option>
                  <option value="view_predictions">View Predictions</option>
                  <option value="adjust_points">Adjust Points</option>
                  {hasUnlockableEntries(member) && <option value="unlock_predictions">Unlock Predictions</option>}
                  {member.role === 'player' && <option value="promote">Promote</option>}
                  {member.role === 'admin' && adminCount > 1 && <option value="demote">Demote</option>}
                  {member.role === 'player' && <option value="remove">Remove</option>}
                </select>
              </div>
            </div>
          )
        })}
      </div>

      {/* Members - Desktop table view */}
      <div className="hidden sm:block bg-surface rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-neutral-50 border-b border-neutral-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 uppercase">
                  Rank
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 uppercase">
                  Member
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-neutral-700 uppercase">
                  Points
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-neutral-700 uppercase">
                  Predictions
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-neutral-700 uppercase">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-neutral-700 uppercase">
                  Joined
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-neutral-700 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {filteredMembers.map((member) => {
                const isCurrentUser = member.user_id === currentUserId

                return (
                  <tr
                    key={member.member_id}
                    className={isCurrentUser ? 'bg-primary-50' : 'hover:bg-neutral-50'}
                  >
                    <td className="px-4 py-3">
                      <span className="text-sm font-bold text-neutral-900">
                        #{getBestEntry(member)?.current_rank || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-neutral-900">
                          {member.users.username}
                          {isCurrentUser && <span className="text-xs text-primary-500 ml-1">(you)</span>}
                        </p>
                        <p className="text-xs text-neutral-600">
                          {member.users.full_name}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-lg font-bold text-primary-600">
                        {getBestEntry(member) ? getEntryTotalPoints(getBestEntry(member)!) : 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {(member.entries || []).every(e => e.has_submitted_predictions) ? (
                          <Badge variant="green">Submitted</Badge>
                        ) : (member.entries || []).some(e => e.has_submitted_predictions) ? (
                          <Badge variant="yellow">Partial</Badge>
                        ) : (
                          <Badge variant="yellow">Pending</Badge>
                        )}
                        {(member.entries || []).length > 1 && (
                          <span className="text-xs text-neutral-500">{(member.entries || []).length} entries</span>
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
                    <td className="px-4 py-3 text-sm text-neutral-600">
                      {new Date(member.joined_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="relative inline-block">
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            const action = e.target.value
                            e.target.value = ''
                            setError(null)
                                    switch (action) {
                              case 'view_predictions':
                                setModal({
                                  type: 'view_predictions',
                                  member,
                                })
                                break
                              case 'adjust_points':
                                setPointAdjustment(0)
                                setAdjustReason('')
                                setModal({ type: 'adjust_points', member })
                                break
                              case 'promote':
                                setModal({ type: 'promote', member })
                                break
                              case 'demote':
                                setModal({ type: 'demote', member })
                                break
                              case 'remove':
                                setRemoveConfirmed(false)
                                setModal({ type: 'remove', member })
                                break
                              case 'unlock_predictions':
                                setModal({ type: 'unlock_predictions', member })
                                break
                            }
                          }}
                          className="text-xs px-2 py-1.5 border border-neutral-300 rounded bg-surface text-neutral-700 cursor-pointer"
                        >
                          <option value="" disabled>
                            Actions
                          </option>
                          <option value="view_predictions">
                            View Predictions
                          </option>
                          <option value="adjust_points">Adjust Points</option>
                          {hasUnlockableEntries(member) && <option value="unlock_predictions">Unlock Predictions</option>}
                          {member.role === 'player' && (
                            <option value="promote">Promote to Admin</option>
                          )}
                          {member.role === 'admin' && adminCount > 1 && (
                            <option value="demote">Demote to Player</option>
                          )}
                          {member.role === 'player' && (
                            <option value="remove">Remove from Pool</option>
                          )}
                        </select>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

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
          <div className="bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl sm:max-w-md w-full sm:mx-4 p-4 sm:p-6 dark:shadow-none dark:border dark:border-border-default">
            <h3 className="text-lg font-bold text-neutral-900 mb-3">
              Promote to Admin
            </h3>
            <p className="text-sm text-neutral-600 mb-2">
              Are you sure you want to make{' '}
              <span className="font-bold">{modal.member.users.username}</span>{' '}
              an admin?
            </p>
            <p className="text-sm text-neutral-600 mb-4">
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
          <div className="bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl sm:max-w-md w-full sm:mx-4 p-4 sm:p-6 dark:shadow-none dark:border dark:border-border-default">
            <h3 className="text-lg font-bold text-neutral-900 mb-3">
              Demote to Player
            </h3>
            <p className="text-sm text-neutral-600 mb-4">
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

      {/* Remove Modal */}
      {modal.type === 'remove' && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
          <div className="bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl sm:max-w-md w-full sm:mx-4 p-4 sm:p-6 dark:shadow-none dark:border dark:border-border-default">
            <h3 className="text-lg font-bold text-danger-600 mb-3">
              Remove Member
            </h3>
            <p className="text-sm text-neutral-600 mb-2">
              Are you sure you want to remove{' '}
              <span className="font-bold">{modal.member.users.username}</span>{' '}
              from this pool?
            </p>
            <div className="bg-danger-50 border border-danger-200 rounded-xl p-3 mb-4">
              <p className="text-sm text-danger-600">
                This will delete all their predictions. This action cannot be
                undone.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-neutral-700 mb-4 cursor-pointer">
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
                className="px-4 py-2 text-sm rounded-xl font-semibold bg-danger-600 text-white hover:bg-danger-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
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
}: {
  member: MemberData
  initialEntry?: EntryData
  predictions: PredictionData[]
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
    return resolveFullBracket({
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
    // Group stage: use actual team names
    if (match.stage === 'group') {
      return side === 'home'
        ? match.home_team?.country_name || 'TBD'
        : match.away_team?.country_name || 'TBD'
    }
    // Knockout: resolve from member's predictions
    const resolved = knockoutTeamMap.get(match.match_number)
    if (resolved) {
      const team = side === 'home' ? resolved.home : resolved.away
      if (team) return team.country_name
    }
    return 'TBD'
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl sm:max-w-lg w-full sm:mx-4 max-h-[85vh] flex flex-col dark:shadow-none dark:border dark:border-border-default">
        {/* Header */}
        <div className="p-4 sm:p-6 pb-3 border-b border-neutral-100 shrink-0">
          <h3 className="text-xl font-bold text-neutral-900">
            {member.users.full_name || member.users.username}&apos;s Predictions
          </h3>
          {selectedEntry && (
            <p className="text-sm text-neutral-600 mt-1">
              {selectedEntry.entry_name} &middot; {getEntryTotalPoints(selectedEntry)} pts
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
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                    selectedEntryId === entry.entry_id
                      ? 'bg-primary-600 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
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
            <p className="text-neutral-600 text-sm py-4">
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
                    <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">
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
                            className="bg-neutral-50 rounded-xl px-3 py-2"
                          >
                            <div className="flex items-center gap-2">
                              {/* Match number */}
                              <span className="text-xs font-mono text-neutral-400 shrink-0 w-7 text-right">
                                #{match.match_number}
                              </span>

                              {/* Home team */}
                              <span className="flex-1 text-right text-sm font-medium text-neutral-800 truncate">
                                {homeName}
                              </span>

                              {/* Score */}
                              <span className="font-mono font-bold text-neutral-900 text-sm shrink-0 px-1">
                                {pred.predicted_home_score} - {pred.predicted_away_score}
                              </span>

                              {/* Away team */}
                              <span className="flex-1 text-left text-sm font-medium text-neutral-800 truncate">
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

              {/* Champion highlight */}
              {champion && (
                <div className="mt-2 text-center p-4 rounded-2xl bg-gradient-to-br from-primary-50 via-accent-50 to-accent-50 border border-accent-100">
                  <div className="text-3xl mb-1">&#127942;</div>
                  <p className="text-xs font-semibold text-accent-500 uppercase tracking-wide mb-0.5">
                    Predicted Champion
                  </p>
                  <h4 className="text-xl font-bold text-neutral-900">
                    {champion.country_name}
                  </h4>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:px-6 pt-3 border-t border-neutral-100 shrink-0">
          <div className="flex justify-between">
            {memberPreds.length > 0 ? (
              <button
                onClick={exportToCsv}
                className="text-sm text-primary-600 hover:text-primary-800 font-medium flex items-center gap-1.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
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
      <div className="bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl sm:max-w-lg w-full sm:mx-4 max-h-[85vh] flex flex-col dark:shadow-none dark:border dark:border-border-default">
        {/* Header */}
        <div className="p-4 sm:p-6 pb-3 border-b border-neutral-100 shrink-0">
          <h3 className="text-xl font-bold text-neutral-900">
            {member.users.full_name || member.users.username}&apos;s Bracket Picks
          </h3>
          {selectedEntry && (
            <p className="text-sm text-neutral-600 mt-1">
              {selectedEntry.entry_name} &middot; {getEntryTotalPoints(selectedEntry)} pts
              {selectedEntry.has_submitted_predictions ? '' : ' (not submitted)'}
            </p>
          )}
          {hasMultipleEntries && (
            <div className="flex gap-1.5 mt-3 overflow-x-auto">
              {entries.map((entry) => (
                <button
                  key={entry.entry_id}
                  onClick={() => setSelectedEntryId(entry.entry_id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                    selectedEntryId === entry.entry_id
                      ? 'bg-primary-600 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
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
              <div className="text-neutral-400 text-sm">Loading bracket picks...</div>
            </div>
          ) : !bpData || bpData.groupRankings.length === 0 ? (
            <p className="text-neutral-600 text-sm py-4">No bracket picks submitted.</p>
          ) : (
            <>
              {/* Champion highlight */}
              {bracket?.champion && (
                <div className="mb-5 text-center p-4 rounded-2xl bg-gradient-to-br from-warning-50 to-warning-100 border-2 border-warning-300">
                  <div className="text-3xl mb-1">&#127942;</div>
                  <p className="text-xs font-semibold text-warning-600 uppercase tracking-wide mb-1">Predicted Champion</p>
                  <div className="flex items-center justify-center gap-2">
                    {bracket.champion.flag_url && (
                      <img src={bracket.champion.flag_url} alt="" className="w-8 h-6 rounded-md object-cover" />
                    )}
                    <span className="text-lg font-bold text-neutral-900">{bracket.champion.country_name}</span>
                  </div>
                  {(bracket.runnerUp || bracket.thirdPlace) && (
                    <div className="flex justify-center gap-6 mt-2 text-xs text-neutral-600">
                      {bracket.runnerUp && (
                        <span>
                          <span className="text-neutral-400">2nd:</span>{' '}
                          <span className="font-semibold">{bracket.runnerUp.country_name}</span>
                        </span>
                      )}
                      {bracket.thirdPlace && (
                        <span>
                          <span className="text-neutral-400">3rd:</span>{' '}
                          <span className="font-semibold">{bracket.thirdPlace.country_name}</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Group Rankings */}
              <div className="mb-5">
                <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Group Rankings</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {GROUP_LETTERS.map((letter) => {
                    const groupRanks = bpData.groupRankings
                      .filter(r => r.group_letter === letter)
                      .sort((a, b) => a.predicted_position - b.predicted_position)
                    if (groupRanks.length === 0) return null
                    return (
                      <div key={letter} className="bg-neutral-50 rounded-xl p-2.5">
                        <div className="text-xs font-bold text-neutral-700 mb-1.5">Group {letter}</div>
                        <div className="space-y-1">
                          {groupRanks.map((rank, i) => {
                            const team = teamMap.get(rank.team_id)
                            return (
                              <div key={rank.team_id} className="flex items-center gap-1.5">
                                <span className={`text-[10px] font-bold w-4 text-center ${
                                  i === 0 ? 'text-success-600' : i === 1 ? 'text-primary-600' : 'text-neutral-400'
                                }`}>{i + 1}</span>
                                {team?.flag_url && (
                                  <img src={team.flag_url} alt="" className="w-5 h-3.5 rounded-md object-cover" />
                                )}
                                <span className="text-xs text-neutral-800 truncate">{team?.country_name || 'Unknown'}</span>
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
                <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Third-Place Rankings</h4>
                <div className="bg-neutral-50 rounded-xl p-3">
                  <div className="space-y-1">
                    {[...bpData.thirdPlaceRankings]
                      .sort((a, b) => a.rank - b.rank)
                      .map((ranking, i) => {
                        const team = teamMap.get(ranking.team_id)
                        const qualifies = i < 8
                        return (
                          <div key={ranking.team_id} className={`flex items-center gap-2 py-0.5 ${!qualifies ? 'opacity-40' : ''}`}>
                            <span className={`text-[10px] font-bold w-5 text-center ${qualifies ? 'text-success-600' : 'text-neutral-400'}`}>
                              {i + 1}
                            </span>
                            {team?.flag_url && (
                              <img src={team.flag_url} alt="" className="w-5 h-3.5 rounded-md object-cover" />
                            )}
                            <span className="text-xs text-neutral-800 flex-1 truncate">{team?.country_name || 'Unknown'}</span>
                            <span className="text-xs text-neutral-400">Grp {ranking.group_letter}</span>
                            {qualifies ? (
                              <span className="text-[10px] font-medium text-success-600 bg-success-50 px-1.5 py-0.5 rounded">Q</span>
                            ) : (
                              <span className="text-[10px] font-medium text-neutral-400 bg-neutral-100 px-1.5 py-0.5 rounded">E</span>
                            )}
                          </div>
                        )
                      })}
                  </div>
                </div>
              </div>

              {/* Knockout Bracket */}
              <div className="mb-3">
                <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">Knockout Bracket</h4>
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
                      <div className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wide mb-1">
                        {stageNames[stage]}
                      </div>
                      <div className="space-y-1">
                        {stagePicks.map(({ match, pick, winnerTeam, resolved }) => (
                          <div key={match.match_id} className="bg-neutral-50 rounded-xl px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-neutral-400 shrink-0 w-7 text-right">
                                #{match.match_number}
                              </span>
                              <div className="flex-1 min-w-0">
                                {resolved ? (
                                  <span className="text-xs text-neutral-500">
                                    {resolved.home?.country_name || 'TBD'} vs {resolved.away?.country_name || 'TBD'}
                                  </span>
                                ) : (
                                  <span className="text-xs text-neutral-400">TBD vs TBD</span>
                                )}
                              </div>
                              {winnerTeam ? (
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {winnerTeam.flag_url && (
                                    <img src={winnerTeam.flag_url} alt="" className="w-5 h-3.5 rounded-md object-cover" />
                                  )}
                                  <span className="text-xs font-semibold text-success-700">{winnerTeam.country_name}</span>
                                  {pick?.predicted_penalty && (
                                    <span className="text-[9px] text-primary-600 font-medium">(PSO)</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-neutral-400">No pick</span>
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
        <div className="p-4 sm:px-6 pt-3 border-t border-neutral-100 shrink-0">
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
      <div className="bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl sm:max-w-md w-full sm:mx-4 p-4 sm:p-6 dark:shadow-none dark:border dark:border-border-default">
        <h3 className="text-lg font-bold text-neutral-900 mb-3">
          Unlock Predictions
        </h3>
        <p className="text-sm text-neutral-600 mb-2">
          Unlock predictions for{' '}
          <span className="font-bold">{member.users.username}</span>?
        </p>

        {/* Entry selector when multiple submitted entries */}
        {hasMultipleSubmitted && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Select entry to unlock
            </label>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer p-2 rounded-xl hover:bg-neutral-50">
                <input
                  type="radio"
                  name="unlock_entry"
                  checked={selectedEntryId === 'all'}
                  onChange={() => setSelectedEntryId('all')}
                  className="text-primary-600"
                />
                <span className="font-medium">All entries</span>
                <span className="text-xs text-neutral-500">({submittedEntries.length} submitted)</span>
              </label>
              {submittedEntries.map((entry) => (
                <label
                  key={entry.entry_id}
                  className="flex items-center gap-2 text-sm text-neutral-700 cursor-pointer p-2 rounded-xl hover:bg-neutral-50"
                >
                  <input
                    type="radio"
                    name="unlock_entry"
                    checked={selectedEntryId === entry.entry_id}
                    onChange={() => setSelectedEntryId(entry.entry_id)}
                    className="text-primary-600"
                  />
                  <span className="font-medium">{entry.entry_name}</span>
                  <span className="text-xs text-neutral-500">
                    {entry.predictions_submitted_at
                      ? `submitted ${new Date(entry.predictions_submitted_at).toLocaleString()}`
                      : ''}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-start gap-3 bg-warning-50 border border-warning-200 rounded-xl p-3 mb-4">
          <svg className="w-5 h-5 text-warning-800 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <p className="text-sm text-warning-800 leading-5">
            This will allow them to edit and resubmit {selectedEntry ? selectedEntry.entry_name : 'their predictions'}. Only use this for special circumstances (e.g., technical issues).
          </p>
        </div>

        {/* Show submitted entries info (only when single entry or no selector) */}
        {!hasMultipleSubmitted && submittedEntries.length > 0 && (
          <div className="text-xs text-neutral-500 mb-4 space-y-0.5">
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
      <div className="bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl sm:max-w-md w-full sm:mx-4 p-4 sm:p-6 dark:shadow-none dark:border dark:border-border-default">
        <h3 className="text-xl font-bold text-neutral-900 mb-4">
          Adjust Points - {member.users.username}
        </h3>

        {error && <Alert variant="error" className="mb-4">{error}</Alert>}

        {/* Entry selector when multiple entries */}
        {hasMultipleEntries && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Select entry
            </label>
            <div className="flex gap-1.5 overflow-x-auto">
              {entries.map((entry) => (
                <button
                  key={entry.entry_id}
                  onClick={() => setSelectedEntryId(entry.entry_id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                    selectedEntryId === entry.entry_id
                      ? 'bg-primary-600 text-white'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  {entry.entry_name} ({getEntryTotalPoints(entry)} pts)
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mb-4">
          <p className="text-sm text-neutral-600">
            {selectedEntry.entry_name} current points:{' '}
            <span className="font-bold">
              {getEntryTotalPoints(selectedEntry)}
            </span>
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Adjustment
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPointAdjustment((p: number) => p - 1)}
              className="w-10 h-10 rounded border border-neutral-300 text-lg font-bold text-neutral-700 hover:bg-neutral-100"
            >
              -
            </button>
            <input
              type="number"
              value={pointAdjustment}
              onChange={(e) =>
                setPointAdjustment(parseInt(e.target.value) || 0)
              }
              className="w-24 h-10 text-center border border-neutral-300 rounded-xl font-bold text-lg text-neutral-900"
            />
            <button
              onClick={() => setPointAdjustment((p: number) => p + 1)}
              className="w-10 h-10 rounded border border-neutral-300 text-lg font-bold text-neutral-700 hover:bg-neutral-100"
            >
              +
            </button>
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-neutral-700 mb-1">
            Reason (required)
          </label>
          <textarea
            value={adjustReason}
            onChange={(e) => setAdjustReason(e.target.value)}
            placeholder="Explain the reason for this adjustment..."
            rows={3}
            className="w-full px-3 py-2 border border-neutral-300 rounded-xl text-sm text-neutral-900 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>

        <p className="text-sm text-neutral-600 mb-4">
          New total:{' '}
          <span className="font-bold text-primary-600">
            {getEntryTotalPoints(selectedEntry) + pointAdjustment}
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
