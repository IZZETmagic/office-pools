export interface FAQItem {
  question: string
  answer: string
}

export interface FAQCategory {
  title: string
  icon: string
  items: FAQItem[]
}

export const faqCategories: FAQCategory[] = [
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
      {
        question: 'How do I delete my account?',
        answer:
          'Go to Profile → Settings and choose "Delete Account." Deleting your account removes your pool memberships, entries, predictions, scores, and chat messages. Some records may be retained in anonymized form for analytics or legal compliance. This action cannot be undone.',
      },
      {
        question: 'How do I change which emails I receive?',
        answer:
          'Go to Profile → Notifications to toggle email categories on or off — pool activity, predictions, match results, leaderboards, admin messages, and community updates can each be controlled separately. Broadcast emails also include an unsubscribe link at the bottom.',
      },
    ],
  },
  {
    title: 'Emails & Notifications',
    icon: '🔔',
    items: [
      {
        question: 'What types of emails does Sport Pool send?',
        answer:
          'Emails fall into six categories: Pool Activity (member joins, invites, pool updates), Predictions (deadline reminders, confirmations), Match Results (scores and points earned), Leaderboard (rank changes, weekly recaps), Admin (settings changes, member actions), and Community (mentions and broadcasts).',
      },
      {
        question: 'Can I control which emails I get?',
        answer:
          'Yes. Each of the six email categories can be turned on or off independently from Profile → Notifications. You can also use the unsubscribe link at the bottom of any broadcast email to opt out of that type immediately.',
      },
      {
        question: 'Can I stop emails entirely?',
        answer:
          'You can turn off every notification category from your profile settings. Some essential account emails (such as password resets and confirmations you explicitly request) will still be sent because they are required to operate your account.',
      },
    ],
  },
  {
    title: 'Pool Community',
    icon: '💬',
    items: [
      {
        question: 'What is pool chat?',
        answer:
          'Every pool has a built-in chat where members can talk, trash-talk, react with emoji, pin important messages, and @mention each other. Chat is a great way to keep the group engaged between matches.',
      },
      {
        question: 'Who can see my chat messages?',
        answer:
          'Chat messages, reactions, pins, and @mentions are visible to every member of that pool. Pool admins and Sport Pool super admins may also view chat content for moderation. Messages are not shared with members of other pools.',
      },
      {
        question: 'Can admins moderate chat?',
        answer:
          'Yes. Pool admins can remove messages and members that violate our Acceptable Use rules. Sport Pool may also remove content or accounts at our discretion if they break our Terms of Service.',
      },
    ],
  },
  {
    title: 'Entry Fees & Branded Pools',
    icon: '💳',
    items: [
      {
        question: 'Does Sport Pool take payments or charge fees?',
        answer:
          'No. Sport Pool is free and does not process payments. We are not a payment processor and we do not collect, hold, or disburse money.',
      },
      {
        question: 'How do pool admins collect entry fees?',
        answer:
          'Any entry fee or prize arrangement is organized off-platform by the pool admin — typically using an external payment app like Venmo, PayPal, or cash. Sport Pool provides only an optional tool for admins to mark each member\'s entry as paid or unpaid. We are not a party to fee or prize arrangements, and any dispute is between the members and the admin.',
      },
      {
        question: 'What is a branded pool?',
        answer:
          'A branded pool is a white-labeled pool operated by an organization with a custom name, logo, color, and landing page. Branded pools work the same as regular pools — predictions, leaderboards, chat, and scoring are all available — but feature the sponsor\'s branding. All platform rules and Acceptable Use policies still apply inside branded pools.',
      },
    ],
  },
]
