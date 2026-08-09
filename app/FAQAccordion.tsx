'use client'

import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'

/**
 * Written for the person deciding whether to run a pool, because that is who
 * the landing page is for — invited players arrive at /join/[pool_code] instead.
 *
 * Nothing here names a specific tournament or date. The entry this replaced
 * ("When does the 2026 World Cup start?" — "starts on June 11, 2026 and runs
 * through July 19") was still answering in the present tense weeks after the
 * final, because a fixed date in copy has no way to notice it has passed. What
 * competition is running belongs in app/competitions.ts, which the hero renders.
 */
const faqs = [
  {
    question: 'Is SportPool free?',
    answer:
      'Yes. Unlimited pools, as many people in each as you want, no card needed.',
  },
  {
    question: 'How long does it take to set a pool up?',
    answer:
      'About a minute. Name it, choose a format, and share the join link. Scoring ships with sensible defaults, so you only change the rules you actually care about.',
  },
  {
    question: 'Can I decide how scoring works?',
    answer:
      'Yes, and it is the main thing you control. Set what an exact score, a correct goal difference and a correct result are each worth, and add multipliers for the rounds that should carry more weight. Change it any time before the deadline and every score recalculates.',
  },
  {
    question: 'What formats can I run?',
    answer:
      'A full-tournament pool where everything is predicted up front, a progressive pool that unlocks round by round, or a bracket-only pick’em for people who just want to call the winners.',
  },
  {
    question: 'How do people join my pool?',
    answer:
      'You share one link or a short pool code. They create an account and they are in — on the web or in the app. You never have to chase anyone through a spreadsheet.',
  },
  {
    question: 'Do I have to keep it updated during the season?',
    answer:
      'No. Results come in automatically and scores update as matches finish, so the leaderboard moves without you touching it.',
  },
  {
    question: 'What happens when someone misses the deadline?',
    answer:
      'They can still watch the pool and the leaderboard, they just cannot submit or edit predictions for matches that have kicked off. Everything before the deadline stays editable.',
  },
]

export function FAQAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <div className="max-w-3xl mx-auto divide-y divide-neutral-200">
      {faqs.map((faq, i) => (
        <div key={i}>
          <button
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            className="w-full flex items-center justify-between py-5 text-left cursor-pointer"
          >
            <span className="text-lg font-medium text-neutral-900">
              {faq.question}
            </span>
            <Icon name="chevron.down" size={20} className={`text-muted shrink-0 ml-4 transition-transform duration-200 ${openIndex === i ? 'rotate-180' : ''}`} />
          </button>
          <div
            className={`overflow-hidden transition-all duration-200 ${
              openIndex === i ? 'max-h-40 pb-5' : 'max-h-0'
            }`}
          >
            <p className="text-neutral-600 leading-relaxed">{faq.answer}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
