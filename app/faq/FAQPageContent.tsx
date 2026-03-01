'use client'

import { useState } from 'react'

interface FAQItem {
  question: string
  answer: string
}

interface FAQCategory {
  title: string
  icon: string
  items: FAQItem[]
}

const faqCategories: FAQCategory[] = [
  {
    title: 'General',
    icon: '📋',
    items: [
      {
        question: 'What is Sport Pool?',
        answer:
          'Sport Pool is a free prediction pool platform for the FIFA World Cup 2026. Create or join pools with friends, predict match results for all 104 matches, and compete on live leaderboards.',
      },
      {
        question: 'Is Sport Pool free?',
        answer:
          'Yes! Sport Pool is completely free to use. Create unlimited pools, invite as many friends as you want, and enjoy all features at no cost.',
      },
      {
        question: 'When does the 2026 World Cup start?',
        answer:
          'The FIFA World Cup 2026 kicks off on June 11, 2026 and runs through July 19, 2026. The tournament spans approximately five weeks.',
      },
      {
        question: 'How many matches are in the tournament?',
        answer:
          'The 2026 World Cup features 104 matches in total: 48 group stage matches across 12 groups, followed by 56 knockout round matches including the Round of 32, Round of 16, Quarter Finals, Semi Finals, Third Place Match, and the Final.',
      },
      {
        question: 'Which countries are hosting?',
        answer:
          'The 2026 World Cup is jointly hosted by the United States, Canada, and Mexico. Matches will be played across venues in all three countries.',
      },
    ],
  },
  {
    title: 'Pools',
    icon: '🏊',
    items: [
      {
        question: 'How do I create a pool?',
        answer:
          'After signing up, go to your dashboard and click "Create Pool." Follow the setup wizard to choose a tournament, name your pool, set a prediction deadline, configure privacy settings, and customize scoring rules. Your pool is ready in under a minute.',
      },
      {
        question: 'How do I join a pool?',
        answer:
          'You need a pool code from the pool creator. Go to your dashboard, click "Join Pool," and enter the code. You\'ll be added to the pool and your first entry is created automatically.',
      },
      {
        question: 'Can I join multiple pools?',
        answer:
          'Absolutely! You can join as many pools as you want with a single account. Each pool has its own leaderboard and scoring settings, so you can compete in different groups at the same time.',
      },
      {
        question: 'What is the pool code?',
        answer:
          'Every pool has a unique code that the admin can share with friends. It\'s the key to joining a pool. Pool admins can find the code in their pool settings or share it directly.',
      },
      {
        question: "What's the difference between public and private pools?",
        answer:
          'Public pools allow anyone with the pool code to join immediately. Private pools require admin approval after requesting to join. Both types use a pool code for access.',
      },
      {
        question: 'Can members have multiple entries?',
        answer:
          'Pool admins can allow members to submit multiple sets of predictions (up to 10 entries per member). Each entry is scored independently and appears as its own row on the leaderboard. For example, you could have a "Serious" entry and a "Fun" entry.',
      },
    ],
  },
  {
    title: 'Predictions',
    icon: '🎯',
    items: [
      {
        question: 'How do I make predictions?',
        answer:
          'Navigate to your pool and click on your entry to access the predictions flow. You\'ll predict scores for each stage: group matches, Round of 32, Round of 16, Quarter Finals, Semi Finals, and the Final. Enter your predicted home and away scores for each match.',
      },
      {
        question: 'When is the prediction deadline?',
        answer:
          'Each pool admin sets their own prediction deadline, usually before the tournament starts. You can see the deadline on the pool details page. Make sure to submit your predictions before this date.',
      },
      {
        question: 'Can I change my predictions?',
        answer:
          'Yes, you can edit your predictions as many times as you want before the pool\'s deadline. Once the deadline passes, predictions are locked and can no longer be modified.',
      },
      {
        question: 'What happens if I miss the deadline?',
        answer:
          'If you have draft predictions when the deadline passes, they will be automatically submitted for you. If you haven\'t made any predictions, you can still view the pool and leaderboard, but you won\'t be able to submit or earn points.',
      },
      {
        question: 'How do knockout predictions work?',
        answer:
          'For knockout rounds, you predict the full-time score for each match. The teams in knockout matches are determined by your group stage predictions, so your bracket builds automatically based on which teams you predict to advance.',
      },
      {
        question: 'What are PSO (penalty shoot-out) predictions?',
        answer:
          'When enabled by the pool admin, you can predict penalty shoot-out scores for knockout matches that end in a draw. PSO predictions earn bonus points on top of your full-time score prediction. This adds an extra layer of strategy to knockout rounds.',
      },
    ],
  },
  {
    title: 'Scoring',
    icon: '⭐',
    items: [
      {
        question: 'How does scoring work?',
        answer:
          'Points are awarded based on how close your predictions are to actual match results. By default, you earn 5 points for an exact score, 3 points for the correct goal difference, and 1 point for predicting the correct winner. Pool admins can customize all point values.',
      },
      {
        question: 'What are knockout stage multipliers?',
        answer:
          'Pool admins can set multipliers for knockout rounds to increase the stakes as the tournament progresses. For example, a 2x multiplier on the Final means all points earned for that match are doubled.',
      },
      {
        question: 'What are bonus points?',
        answer:
          'Bonus points reward you for accurately predicting broader tournament outcomes beyond individual match scores. These include group standing bonuses, bracket pairing accuracy, match winner predictions, and tournament podium predictions (champion, runner-up, third place).',
      },
      {
        question: 'How do group standing bonuses work?',
        answer:
          'After all group matches are complete, you earn bonus points for correctly predicting which teams finish first and second in each group. The default awards 150 points for getting both the winner and runner-up correct, with partial credit for getting one or both in the wrong position.',
      },
      {
        question: 'How do tournament podium bonuses work?',
        answer:
          'You can earn significant bonus points for predicting the overall tournament outcome. By default, correctly predicting the champion earns 1,000 points, with additional points for the runner-up and third place finisher.',
      },
      {
        question: 'Can the pool admin change scoring rules?',
        answer:
          'Yes! Pool admins have full control over all scoring settings. They can adjust match point values, knockout multipliers, bonus point amounts, and enable or disable features like PSO predictions. This lets every pool tailor the competition to their group.',
      },
    ],
  },
  {
    title: 'Account & Profile',
    icon: '👤',
    items: [
      {
        question: 'How do I create an account?',
        answer:
          'Click "Sign Up" and enter your full name, a unique username, email address, and password. Your username is how other pool members will see you on leaderboards.',
      },
      {
        question: 'Can I change my username?',
        answer:
          'Your username is set during signup and is used to identify you across all pools. Currently, usernames cannot be changed after account creation, so choose wisely!',
      },
      {
        question: 'How do I manage my profile?',
        answer:
          'Visit the Profile page from the navigation menu. You can view your account details, see all the pools you\'ve joined, review your prediction history, and track your overall performance across all pools.',
      },
    ],
  },
]

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
