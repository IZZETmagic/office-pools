'use client'

import { useEffect } from 'react'

import { avatarGradient } from '@/lib/design/avatarGradient'
import { getInitials } from './helpers'
import type { MemberData } from '../types'
import type { ReactionCount } from './types'

/**
 * Who reacted, grouped by emoji — the web half of the RN sheet opened by tapping
 * a reaction pill (handleShowReactors in BanterSheet).
 *
 * Reactions were aggregate-only here: a pill knew its count but not who was
 * behind it, because the loader built a Set of user ids and then discarded it.
 * It is kept now, so this resolves ids against the pool roster the same way RN
 * does — names and the per-user avatar gradient, so a person is the same colour
 * in the list, on their bubble, and in the app.
 */
export function ReactorsModal({
  reactions,
  members,
  currentUserId,
  onClose,
}: {
  reactions: ReactionCount[]
  members: MemberData[]
  currentUserId: string
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const byId = new Map(members.map(m => [m.user_id, m]))
  // Most-reacted first, matching the RN sheet's ordering.
  const groups = [...reactions].sort((a, b) => b.count - a.count)
  const total = reactions.reduce((sum, r) => sum + r.count, 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/40 p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Reactions"
        onClick={e => e.stopPropagation()}
        className="relative w-full sm:max-w-sm bg-surface rounded-t-sheet sm:rounded-card shadow-card-elevated max-h-[70vh] flex flex-col animate-modal-slide-up dark:border dark:border-border-default"
      >
        {/* Grabber, mobile only — this is a bottom sheet on a phone. */}
        <div className="sm:hidden pt-2 pb-1 flex justify-center shrink-0">
          <div className="w-9 h-1 rounded-pill bg-silver" />
        </div>

        <div className="px-4 py-3 border-b border-border-subtle shrink-0 flex items-center justify-between">
          <span className="t-card-title text-ink">
            {total} {total === 1 ? 'reaction' : 'reactions'}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="t-body text-muted hover:text-ink transition-colors"
          >
            Done
          </button>
        </div>

        <div className="overflow-y-auto px-4 py-3 space-y-4">
          {groups.map(group => (
            <div key={group.emoji}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg leading-none">{group.emoji}</span>
                <span className="t-caption text-muted">{group.count}</span>
              </div>
              <div className="space-y-2">
                {group.user_ids.map(userId => {
                  const member = byId.get(userId)
                  const name = member?.users.full_name || member?.users.username || 'Unknown'
                  return (
                    <div key={`${group.emoji}-${userId}`} className="flex items-center gap-2.5">
                      <div
                        className="w-8 h-8 rounded-pill flex items-center justify-center text-[11px] font-bold text-white shrink-0"
                        style={{ backgroundImage: avatarGradient(userId) }}
                      >
                        {getInitials(member?.users.full_name, member?.users.username)}
                      </div>
                      <span className="t-body text-ink truncate">
                        {userId === currentUserId ? 'You' : name}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
