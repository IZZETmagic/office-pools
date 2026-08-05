import type { MemberData } from '../types'
import { getInitials } from './helpers'

type OnlineUser = {
  user_id: string
  username: string
  full_name: string
  active_pool_id?: string | null
}

type OnlineMembersStripProps = {
  members: MemberData[]
  onlineUsers: OnlineUser[]
  currentUserId: string
  poolId: string
}

export function OnlineMembersStrip({ members, onlineUsers, currentUserId, poolId }: OnlineMembersStripProps) {
  if (members.length === 0) return null

  // Include current user as online (presence excludes yourself from onlineUsers)
  const onlineIds = new Set(onlineUsers.map(u => u.user_id))
  onlineIds.add(currentUserId)

  // Presence is app-wide: green dot = viewing this pool right now,
  // amber dot = online elsewhere in the app. The current user is always
  // "here" (they're literally looking at this strip).
  const inPoolIds = new Set(
    onlineUsers.filter(u => u.active_pool_id === poolId).map(u => u.user_id)
  )
  inPoolIds.add(currentUserId)

  const byName = (a: MemberData, b: MemberData) =>
    (a.users.full_name || a.users.username).localeCompare(b.users.full_name || b.users.username)

  const onlineMembers = members.filter(m => onlineIds.has(m.user_id)).sort(byName)
  const offlineMembers = members.filter(m => !onlineIds.has(m.user_id)).sort(byName)

  const onlineCount = onlineIds.size

  return (
    <div className="md:hidden border-b border-border-default bg-surface">
      <div className="flex items-center gap-2 px-3 py-2.5 overflow-x-auto scrollbar-none">
        {/* Online count badge */}
        <div className="flex items-center gap-1 shrink-0">
          <div className="w-1.5 h-1.5 rounded-pill bg-success-500" />
          <span className="t-num t-num-medium text-[10px] text-muted">
            {onlineCount}
          </span>
        </div>

        {/* Online members */}
        {onlineMembers.map((member) => {
          const isHere = inPoolIds.has(member.user_id)
          return (
            <div key={member.user_id} className="flex flex-col items-center shrink-0">
              <div className="relative">
                <div className="w-8 h-8 rounded-pill flex items-center justify-center t-detail font-bold bg-mist text-ink">
                  {getInitials(member.users.full_name, member.users.username)}
                </div>
                <div
                  className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-pill ring-[1.5px] ring-white ${
                    isHere
                      ? 'dark:ring-success-500 bg-success-500'
                      : 'dark:ring-warning-400 bg-warning-400'
                  }`}
                  title={isHere ? 'In this pool' : 'Online in the app'}
                />
              </div>
            </div>
          )
        })}

        {/* Divider between online and offline */}
        {offlineMembers.length > 0 && onlineMembers.length > 0 && (
          <div className="w-px h-5 bg-border-default shrink-0" />
        )}

        {/* Offline members */}
        {offlineMembers.map((member) => (
          <div key={member.user_id} className="flex flex-col items-center shrink-0">
            <div className="relative">
              <div className="w-8 h-8 rounded-pill flex items-center justify-center t-detail font-bold bg-mist/50 text-muted">
                {getInitials(member.users.full_name, member.users.username)}
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-pill ring-[1.5px] ring-surface bg-silver" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
