'use client'

import { useState } from 'react'

const faqs = [
  {
    question: 'Is Sport Pool free?',
    answer:
      'Yes! Sport Pool is completely free to use. Create unlimited pools and invite as many friends as you want.',
  },
  {
    question: 'When does the 2026 World Cup start?',
    answer:
      'The FIFA World Cup 2026 starts on June 11, 2026 and runs through July 19, 2026. It will be hosted across the United States, Canada, and Mexico.',
  },
  {
    question: 'How does scoring work?',
    answer:
      'Pool admins can customize scoring rules. Typically, you earn points for exact scores, correct goal differences, and correct match results. Knockout rounds have multipliers for higher stakes.',
  },
  {
    question: 'Can I join multiple pools?',
    answer:
      'Absolutely! You can join as many pools as you want with a single account.',
  },
  {
    question: 'When is the prediction deadline?',
    answer:
      'Each pool admin sets their own prediction deadline, usually before the tournament starts.',
  },
  {
    question: 'What happens if I miss the deadline?',
    answer:
      'You can still view the pool and leaderboard, but you won\'t be able to submit or edit predictions after the deadline.',
  },
  {
    question: 'Can I change my predictions?',
    answer:
      'Yes, you can edit your predictions any time before the pool\'s deadline.',
  },
]

export function FAQAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <div className="max-w-3xl mx-auto divide-y divide-gray-200">
      {faqs.map((faq, i) => (
        <div key={i}>
          <button
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            className="w-full flex items-center justify-between py-5 text-left cursor-pointer"
          >
            <span className="text-lg font-medium text-gray-900">
              {faq.question}
            </span>
            <svg
              className={`w-5 h-5 text-gray-500 shrink-0 ml-4 transition-transform duration-200 ${
                openIndex === i ? 'rotate-180' : ''
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
              openIndex === i ? 'max-h-40 pb-5' : 'max-h-0'
            }`}
          >
            <p className="text-gray-600 leading-relaxed">{faq.answer}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
