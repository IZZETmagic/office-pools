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
    : `${names.length} people are typing...`

  return (
    <div className="flex items-center gap-2 px-3 sm:px-4 py-1.5">
      {/* Mini avatar */}
      <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400">
        {getInitials(typingUsers[0].full_name, typingUsers[0].username)}
      </div>

      {/* Animated dots — opacity pulse with staggered timing */}
      <div className="flex items-center gap-[3px] bg-neutral-100 dark:bg-neutral-800 rounded-full px-2.5 py-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-[typing-pulse_1.2s_ease-in-out_infinite]" />
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-[typing-pulse_1.2s_ease-in-out_0.2s_infinite]" />
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 animate-[typing-pulse_1.2s_ease-in-out_0.4s_infinite]" />
      </div>

      {/* Text */}
      <span className="text-[10px] text-neutral-400 truncate">{text}</span>
    </div>
  )
}
