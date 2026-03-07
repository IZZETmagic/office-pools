'use client'

import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/Badge'
import type { PoolRoundState, EntryRoundSubmission, RoundStateValue } from '@/app/pools/[pool_id]/types'
import { ROUND_LABELS } from '@/lib/tournament'
import type { RoundKey } from '@/lib/tournament'

type RoundStatusCardProps = {
  roundState: PoolRoundState
  submission: EntryRoundSubmission | null
  matchCount: number
  completedMatchCount: number
}

function getStateBadge(state: RoundStateValue) {
  switch (state) {
    case 'locked':
      return <Badge variant="gray">Locked</Badge>
    case 'open':
      return <Badge variant="blue">Open</Badge>
    case 'in_progress':
      return <Badge variant="yellow">In Progress</Badge>
    case 'completed':
      return <Badge variant="green">Completed</Badge>
  }
}

function getSubmissionStatus(
  roundState: PoolRoundState,
  submission: EntryRoundSubmission | null
): { label: string; color: string } {
  if (roundState.state === 'locked') {
    return { label: 'Not yet available', color: 'text-neutral-400' }
  }
  if (submission?.has_submitted) {
    if (submission.auto_submitted) {
      return { label: 'Auto-submitted', color: 'text-amber-600' }
    }
    return { label: 'Submitted', color: 'text-green-600' }
  }
  if (roundState.state === 'completed' || roundState.state === 'in_progress') {
    const isPastDeadline = roundState.deadline && new Date(roundState.deadline) < new Date()
    if (isPastDeadline) {
      return { label: 'Missed', color: 'text-red-600' }
    }
  }
  return { label: 'Draft', color: 'text-amber-600' }
}

function CountdownTimer({ deadline }: { deadline: string }) {
  const [timeLeft, setTimeLeft] = useState('')

  useEffect(() => {
    function update() {
      const now = new Date().getTime()
      const target = new Date(deadline).getTime()
      const diff = target - now

      if (diff <= 0) {
        setTimeLeft('Deadline passed')
        return
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h ${minutes}m`)
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m`)
      } else {
        const seconds = Math.floor((diff % (1000 * 60)) / 1000)
        setTimeLeft(`${minutes}m ${seconds}s`)
      }
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [deadline])

  const isPast = new Date(deadline).getTime() < new Date().getTime()

  return (
    <span className={isPast ? 'text-red-600 font-medium' : 'text-neutral-700 font-medium'}>
      {timeLeft}
    </span>
  )
}

export function RoundStatusCard({ roundState, submission, matchCount, completedMatchCount }: RoundStatusCardProps) {
  const roundName = ROUND_LABELS[roundState.round_key as RoundKey] ?? roundState.round_key
  const submissionStatus = getSubmissionStatus(roundState, submission)

  return (
    <div className="bg-surface border border-border-default rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-neutral-900">{roundName}</h3>
        {getStateBadge(roundState.state)}
      </div>

      {/* Deadline & countdown */}
      {roundState.deadline && (roundState.state === 'open' || roundState.state === 'in_progress') && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-neutral-500">Deadline</span>
          <CountdownTimer deadline={roundState.deadline} />
        </div>
      )}

      {/* Submission status */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-neutral-500">Status</span>
        <span className={submissionStatus.color}>{submissionStatus.label}</span>
      </div>

      {/* Match progress */}
      {roundState.state !== 'locked' && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-neutral-500">
            <span>Matches completed</span>
            <span>{completedMatchCount} / {matchCount}</span>
          </div>
          <div className="w-full h-1.5 bg-neutral-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-300"
              style={{ width: matchCount > 0 ? `${(completedMatchCount / matchCount) * 100}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {/* Locked message */}
      {roundState.state === 'locked' && (
        <p className="text-xs text-neutral-400 italic">
          Available after the previous round completes
        </p>
      )}

      {/* Missed round message */}
      {submissionStatus.label === 'Missed' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3">
          <p className="text-xs text-red-700">
            You missed the deadline for this round. You scored 0 points but can still predict future rounds.
          </p>
        </div>
      )}
    </div>
  )
}
