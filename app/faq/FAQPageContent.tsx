'use client'

import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'
import { faqCategories, type FAQItem, type FAQCategory } from './faqData'

function AccordionItem({
  item,
  isOpen,
  onToggle,
}: {
  item: FAQItem
  isOpen: boolean
  onToggle: () => void
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-5 text-left cursor-pointer"
      >
        <span className="text-lg font-medium text-neutral-900">{item.question}</span>
        <Icon name="chevron.down" size={20} className={`text-muted shrink-0 ml-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {/* grid-rows 0fr -> 1fr rather than a max-height, matching the landing
          accordion (app/FAQAccordion.tsx), which moved off `max-h-40` after it
          clipped a rewritten answer.

          Nothing here clips TODAY — measured 2026-09-07, the tallest of the 55
          answers is 312px at a 375px viewport against the old `max-h-96` cap of
          384px. But that is 72px of margin on a phone, and a cap is a bad way to
          hold a limit nobody can see: it truncates mid-sentence with no
          scrollbar and no sign anything was cut, so the first symptom is a
          member reading half an answer. This sizes to the content instead. */}
      <div
        className={`grid transition-all duration-200 ease-out motion-reduce:transition-none ${
          isOpen ? 'grid-rows-[1fr] pb-5' : 'grid-rows-[0fr]'
        }`}
      >
        <p className="overflow-hidden text-neutral-600 leading-relaxed">{item.answer}</p>
      </div>
    </div>
  )
}

function AccordionSection({ category }: { category: FAQCategory }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <div>
      {/* A bare 48px glyph, no chip — deliberately larger than the heading it
          sits beside, so the icon marks the section rather than decorating the
          title. `shrink-0` because an <svg> in a flex row is squashable and
          "Entry Fees & Branded Pools" wraps on a phone. It is `aria-hidden` via
          Icon's default: the <h2> already says which section this is, and a
          screen reader announcing "trophy, Pools" adds nothing. */}
      <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 flex items-center gap-4 mb-2">
        <Icon name={category.icon} size={48} weight="semibold" className="shrink-0 text-primary-600" />
        {category.title}
      </h2>
      <div className="divide-y divide-neutral-200">
        {category.items.map((item, i) => (
          <AccordionItem
            key={i}
            item={item}
            isOpen={openIndex === i}
            onToggle={() => setOpenIndex(openIndex === i ? null : i)}
          />
        ))}
      </div>
    </div>
  )
}

export function FAQPageContent() {
  return (
    <div className="max-w-3xl mx-auto space-y-12 sm:space-y-16">
      {faqCategories.map((category) => (
        <AccordionSection key={category.title} category={category} />
      ))}
    </div>
  )
}
