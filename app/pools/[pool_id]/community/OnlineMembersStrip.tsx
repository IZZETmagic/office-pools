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
    <div className="md:hidden border-b border-neutral-200 dark:border-border-default">
      <div className="flex items-center gap-2.5 px-3 py-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {/* Online count */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-2 h-2 rounded-full bg-success-500" />
          <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 tabular-nums">
            {onlineUsers.length}
          </span>
        </div>

        {/* Separator */}
        <div className="w-px h-6 bg-neutral-200 dark:bg-border-default shrink-0" />

        {/* Member avatars */}
        {onlineUsers.slice(0, 12).map((user) => (
          <div key={user.user_id} className="flex flex-col items-center gap-0.5 shrink-0">
            <div className="relative">
              <div className="w-[34px] h-[34px] rounded-full flex items-center justify-center text-[10px] font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300">
                {getInitials(user.full_name, user.username)}
              </div>
              {/* Green online dot */}
              <div className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-success-500 ring-2 ring-white dark:ring-neutral-900" />
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
