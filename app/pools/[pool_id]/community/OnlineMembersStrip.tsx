import { getInitials } from './helpers'

type OnlineUser = {
  user_id: string
  username: string
  full_name: string
}

type OnlineMembersStripProps = {
  onlineUsers: OnlineUser[]
}

export function OnlineMembersStrip({ onlineUsers }: OnlineMembersStripProps) {
  if (onlineUsers.length === 0) return null

  return (
    <div className="md:hidden mb-2">
      <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide px-1 py-1">
        {onlineUsers.slice(0, 10).map((user) => (
          <div key={user.user_id} className="flex flex-col items-center gap-0.5 shrink-0">
            <div className="relative">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                {getInitials(user.full_name, user.username)}
              </div>
              {/* Green online dot */}
              <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-success-500 ring-2 ring-surface" />
            </div>
            <span className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate max-w-[48px] text-center leading-tight">
              {user.full_name?.split(' ')[0] || user.username}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
