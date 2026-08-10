'use client'

import { useState } from 'react'
import { Icon } from '@/components/ui/Icon'

/**
 * Five questions, chosen by what the page does NOT already say. "How long does
 * it take to set up" and "how do people join" were cut because the three cards
 * under "Running it shouldn't be a second job" answer both in full — repeating
 * them here made the FAQ the tallest block on the page while adding nothing.
 * What is left is cost, formats, scoring detail, in-season effort and the
 * missed-deadline case, none of which appear anywhere else.
 *
 * Weighted toward the person deciding whether to run a pool, since that is who
 * the landing page has to convert — but not exclusively. Cost, deadlines and
 * what happens if someone forgets are things anyone in a pool asks, which is
 * why the section is headed "The usual questions" rather than named for
 * commissioners.
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
    <div className="divide-y divide-border-subtle">
      {faqs.map((faq, i) => {
        const open = openIndex === i
        return (
          <div key={i}>
            <button
              onClick={() => setOpenIndex(open ? null : i)}
              aria-expanded={open}
              className="w-full flex items-center justify-between gap-4 py-5 text-left cursor-pointer group"
            >
              <span className={`t-card-title transition-colors ${open ? 'text-primary-600' : 'text-ink group-hover:text-primary-600'}`}>
                {faq.question}
              </span>
              <span
                className={`shrink-0 grid place-items-center w-7 h-7 rounded-pill transition-all duration-200 ${
                  open ? 'bg-primary-600 text-white rotate-180' : 'bg-mist text-muted group-hover:bg-primary-600/10 group-hover:text-primary-600'
                }`}
              >
                <Icon name="chevron.down" size={14} weight="bold" />
              </span>
            </button>

            {/* grid-rows 0fr -> 1fr rather than a max-height. The previous
                version capped the answer at max-h-40, which silently clipped
                anything over about six lines — and these answers were rewritten
                longer when the page was aimed at commissioners. This animates to
                the content's real height, whatever it turns out to be. */}
            <div
              className={`grid transition-all duration-200 ease-out motion-reduce:transition-none ${
                open ? 'grid-rows-[1fr] pb-5' : 'grid-rows-[0fr]'
              }`}
            >
              <p className="overflow-hidden t-body text-muted leading-relaxed">{faq.answer}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
