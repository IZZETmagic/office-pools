'use client'

import { useState } from 'react'
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
        <svg
          className={`w-5 h-5 text-neutral-500 shrink-0 ml-4 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${
          isOpen ? 'max-h-96 pb-5' : 'max-h-0'
        }`}
      >
        <p className="text-neutral-600 leading-relaxed">{item.answer}</p>
      </div>
    </div>
  )
}

function AccordionSection({ category }: { category: FAQCategory }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <div>
      <h2 className="text-2xl sm:text-3xl font-bold text-neutral-900 flex items-center gap-3 mb-2">
        <span className="text-2xl">{category.icon}</span>
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
