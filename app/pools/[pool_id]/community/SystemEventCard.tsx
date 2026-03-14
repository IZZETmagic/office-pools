import type { SystemEvent } from './types'
import { formatMessageTime } from './helpers'

type SystemEventCardProps = {
  event: SystemEvent
}

export function SystemEventCard({ event }: SystemEventCardProps) {
  // Render content with highlighted name
  const renderContent = () => {
    if (!event.highlighted_name) return event.content

    const parts = event.content.split(event.highlighted_name)
    if (parts.length < 2) return event.content

    return (
      <>
        {parts[0]}
        <span className="font-semibold text-warning-700 dark:text-warning-400">{event.highlighted_name}</span>
        {parts.slice(1).join(event.highlighted_name)}
      </>
    )
  }

  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-xl bg-warning-50/60 dark:bg-warning-900/[0.06] border border-warning-200/60 dark:border-warning-800/15 my-2">
      <span className="text-lg leading-none shrink-0">{event.emoji}</span>
      <p className="text-sm text-neutral-700 dark:text-neutral-300 flex-1 leading-relaxed">
        {renderContent()}
      </p>
      <span className="text-[10px] text-neutral-400 shrink-0 mt-0.5" suppressHydrationWarning>
        {formatMessageTime(event.timestamp)}
      </span>
    </div>
  )
}
