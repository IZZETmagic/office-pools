import type { MemberData } from '../types'
import { getInitials } from './helpers'

type OnlineUser = {
  user_id: string
  username: string
  full_name: string
}

type OnlineMembersStripProps = {
  members: MemberData[]
  onlineUsers: OnlineUser[]
  currentUserId: string
}

export function OnlineMembersStrip({ members, onlineUsers, currentUserId }: OnlineMembersStripProps) {
  if (members.length === 0) return null

  // Include current user as online (usePresence filters self out of onlineUsers)
  const onlineIds = new Set(onlineUsers.map(u => u.user_id))
  onlineIds.add(currentUserId)

  const byName = (a: MemberData, b: MemberData) =>
    (a.users.full_name || a.users.username).localeCompare(b.users.full_name || b.users.username)

  const onlineMembers = members.filter(m => onlineIds.has(m.user_id)).sort(byName)
  const offlineMembers = members.filter(m => !onlineIds.has(m.user_id)).sort(byName)

  const onlineCount = onlineIds.size

  return (
    <div className="md:hidden border-b border-neutral-200 dark:border-border-default bg-white dark:bg-surface">
      <div className="flex items-center gap-2 px-3 py-2.5 overflow-x-auto scrollbar-none">
        {/* Online count badge */}
        <div className="flex items-center gap-1 shrink-0">
          <div className="w-1.5 h-1.5 rounded-full bg-success-500" />
          <span className="text-[10px] font-semibold text-neutral-500 dark:text-neutral-400 tabular-nums">
            {onlineCount}
          </span>
        </div>

        {/* Online members */}
        {onlineMembers.map((member) => (
          <div key={member.user_id} className="flex flex-col items-center shrink-0">
            <div className="relative">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                {getInitials(member.users.full_name, member.users.username)}
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-[1.5px] ring-white dark:ring-neutral-900 bg-success-500" />
            </div>
          </div>
        ))}

        {/* Divider between online and offline */}
        {offlineMembers.length > 0 && onlineMembers.length > 0 && (
          <div className="w-px h-5 bg-neutral-200 dark:bg-border-default shrink-0" />
        )}

        {/* Offline members */}
        {offlineMembers.map((member) => (
          <div key={member.user_id} className="flex flex-col items-center shrink-0">
            <div className="relative">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold bg-neutral-100 dark:bg-neutral-800/50 text-neutral-400 dark:text-neutral-500">
                {getInitials(member.users.full_name, member.users.username)}
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-[1.5px] ring-white dark:ring-neutral-900 bg-neutral-300 dark:bg-neutral-600" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
