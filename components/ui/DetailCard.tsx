import { Card } from './Card'

/**
 * The card shape from the RN scoring screen: a t-section-header over a hairline
 * rule, then label/value rows — label muted on the left, value on the right.
 *
 * Extracted from ScoringRulesTab when Pool Info adopted the same shape. Both
 * tabs are lists of "here is a thing, here is its value", so they should not
 * drift apart; anything that needs to change for one almost certainly needs to
 * change for the other.
 */
export function DetailCard({
  title, children, className,
}: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className ?? 'mb-4'}>
      <h3 className="t-section-header text-ink pb-3 mb-1 border-b border-border-subtle">{title}</h3>
      {children}
    </Card>
  )
}

/** Uppercase micro-label for a group of rows inside a card. */
export function DetailCaption({ children }: { children: React.ReactNode }) {
  return <p className="t-caption text-muted mt-4 mb-1">{children}</p>
}

/**
 * One label/value line.
 *
 * The value slot carries no type class on purpose — callers put a t-num figure,
 * a Badge or plain bold text in it, and those want different treatments. Giving
 * it a default here would mean every caller fighting to override it.
 */
export function DetailRow({
  label, children,
}: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center gap-3 py-2.5">
      <span className="t-body text-muted">{label}</span>
      <span className="text-right shrink-0">{children}</span>
    </div>
  )
}
