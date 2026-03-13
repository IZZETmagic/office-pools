import { getInitials } from './helpers'

type TypingIndicatorProps = {
  typingUsers: { user_id: string; username: string; full_name: string }[]
}

export function TypingIndicator({ typingUsers }: TypingIndicatorProps) {
  if (typingUsers.length === 0) return null

  const names = typingUsers.map(u => u.full_name || u.username)
  const text = names.length === 1
    ? `${names[0]} is typing...`
    : names.length === 2
    ? `${names[0]} and ${names[1]} are typing...`
    : `${names[0]} and ${names.length - 1} others are typing...`

  return (
    <div className="flex items-center gap-2 px-3 sm:px-4 py-1.5">
      {/* Mini avatars */}
      <div className="flex -space-x-1.5">
        {typingUsers.slice(0, 3).map((user) => (
          <div
            key={user.user_id}
            className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 ring-1 ring-surface"
          >
            {getInitials(user.full_name, user.username)}
          </div>
        ))}
      </div>

      {/* Animated dots */}
      <div className="flex items-center gap-0.5">
        <span className="w-1 h-1 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-1 h-1 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-1 h-1 rounded-full bg-neutral-400 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>

      {/* Text */}
      <span className="text-[10px] text-neutral-400 truncate">{text}</span>
    </div>
  )
}
