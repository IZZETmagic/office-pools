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
      <div className="shrink-0 w-6 h-6 rounded-pill flex items-center justify-center text-[8px] font-bold bg-silver text-muted">
        {getInitials(typingUsers[0].full_name, typingUsers[0].username)}
      </div>

      {/* Animated dots — opacity pulse with staggered timing */}
      <div className="flex items-center gap-[3px] bg-mist rounded-pill px-2.5 py-1.5">
        <span className="w-1.5 h-1.5 rounded-pill bg-muted animate-[typing-pulse_1.2s_ease-in-out_infinite]" />
        <span className="w-1.5 h-1.5 rounded-pill bg-muted animate-[typing-pulse_1.2s_ease-in-out_0.2s_infinite]" />
        <span className="w-1.5 h-1.5 rounded-pill bg-muted animate-[typing-pulse_1.2s_ease-in-out_0.4s_infinite]" />
      </div>

      {/* Text */}
      <span className="text-[10px] text-muted truncate">{text}</span>
    </div>
  )
}
