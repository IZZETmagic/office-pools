type QuickActionsProps = {
  onSharePrediction: () => void
  onFlexBadges: () => void
  onDropStandings: () => void
}

export function QuickActions({
  onSharePrediction,
  onFlexBadges,
  onDropStandings,
}: QuickActionsProps) {
  return (
    <div className="border-t border-neutral-100 dark:border-border-default/50 px-3 sm:px-4 py-2">
      <div className="flex items-center gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <button
          onClick={onSharePrediction}
          className="inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap px-3 py-1.5 rounded-full bg-primary-50 dark:bg-primary-900/15 text-primary-700 dark:text-primary-400 border border-primary-200 dark:border-primary-800 hover:bg-primary-100 dark:hover:bg-primary-900/25 active:scale-[0.97] transition-all"
        >
          🎯 Share Prediction
        </button>
        <button
          onClick={onFlexBadges}
          className="inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap px-3 py-1.5 rounded-full bg-neutral-50 dark:bg-neutral-400/15 text-neutral-600 dark:text-neutral-700 border border-neutral-200 dark:border-border-default hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-[0.97] transition-all"
        >
          🏆 Flex Badges
        </button>
        <button
          onClick={onDropStandings}
          className="inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap px-3 py-1.5 rounded-full bg-neutral-50 dark:bg-neutral-400/15 text-neutral-600 dark:text-neutral-700 border border-neutral-200 dark:border-border-default hover:bg-neutral-100 dark:hover:bg-neutral-800 active:scale-[0.97] transition-all"
        >
          📊 Drop Standings
        </button>
      </div>
    </div>
  )
}
