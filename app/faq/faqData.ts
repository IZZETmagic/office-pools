export interface FAQItem {
  question: string
  answer: string
}

export interface FAQCategory {
  title: string
  /**
   * SF-Symbol-style name for `components/ui/Icon`, not an emoji.
   *
   * These were emoji until 2026-09-07. An emoji is rendered by the reader's OS,
   * so the section headers looked like a different product on Windows than on a
   * Mac and could not take the brand colour at all — and 🏊 was standing in for
   * "pools" only because the word collides with swimming, which is not what the
   * section is about. `trophy.fill` is the icon the RN app already uses for its
   * Pools tab, so the two surfaces now agree.
   *
   * ⚠ Must exist in ICON_MAP — an unmapped name renders a fallback circle and
   * only warns in development.
   */
  icon: string
  items: FAQItem[]
}

/**
 * The public FAQ.
 *
 * Rewritten 2026-09-07 against the two post-World-Cup Tally surveys — 23 pool
 * admins and 81 players — rather than from a guess at what people ask. Every
 * addition below traces to something more than one person actually said, and
 * the biggest clusters were, in order:
 *
 *   1. "Why did I have to predict everything up front?" (12+)   -> Predictions
 *   2. Missed a deadline / no warning / locked out of the rest  -> Predictions
 *   3. Scored nothing on a knockout tie despite the right call  -> Scoring
 *   4. Won on penalties, got nothing                            -> Scoring
 *   5. Could not see anyone else's picks                        -> Predictions
 *   6. Points arrived late, totals moved, ranks looked wrong     -> Scoring
 *
 * ⚠ Answers are checked against the engine, not against intent. The knockout,
 * shootout, extra-time and tie-break answers state what lib/scoring and
 * shadow_finalize_totals actually do — if the scoring changes, these change in
 * the same commit or they become confident lies. `lib/scoring/fieldHelp.ts` is
 * the sibling copy for the same mechanics inside a pool; the two must agree.
 *
 * ⚠ Nothing here names a tournament or a date it cannot check. The entries this
 * replaced ("When does the 2026 World Cup start?" — "starts on June 11, 2026")
 * were still answering in the present tense weeks after the final, because a
 * fixed date in copy has no way to notice it has passed. app/FAQAccordion.tsx
 * carries the same warning for the landing-page five; what competition is
 * running lives in app/competitions.ts, which renders itself.
 */
export const faqCategories: FAQCategory[] = [
  {
    title: 'General',
    icon: 'clipboard',
    items: [
      {
        question: 'What is SportPool?',
        answer:
          'SportPool is a prediction pool platform. Create or join a pool with friends, family or colleagues, predict how matches will finish, and follow a leaderboard that updates itself as results come in. Nothing is wagered on the platform, and nobody has to tally anything by hand.',
      },
      {
        question: 'Is SportPool free?',
        answer:
          'Creating an account, joining a pool and making predictions are free, and we never take a cut of whatever your group arranges between yourselves. Larger pools and some extra admin controls are priced as a one-time seasonal fee rather than a subscription — the Pricing page lists what each tier includes.',
      },
      {
        question: 'Which competitions can I run a pool for?',
        answer:
          'The competitions we currently cover, and the ones we are adding next, are listed on the home page. The most requested in post-tournament feedback were the UEFA Euros, the Champions League and the Premier League, followed by the NFL, NBA, NHL and March Madness. If the one you want is not there yet, tell us through the contact form — that list is how we decide the order.',
      },
      {
        question: 'Do I need to know the sport well to play?',
        answer:
          'No. You are predicting scorelines, not tactics, and pools are usually won by whoever stays consistent rather than whoever knows the most. If football is new to you, it helps to know that most matches finish with one or two goals a side — 1-0, 2-1 and 1-1 come up far more often than the heavy scorelines do.',
      },
      {
        question: 'Where do I find the rules for my pool?',
        answer:
          'Inside the pool. The Scoring Rules tab lists every point value in force, including anything your admin has changed, and Pool Info covers the format, the deadline, how many entries are allowed and who the admin is. The How to Play guide opens the first time you visit a pool and can be reopened from Pool Info at any time.',
      },
    ],
  },
  {
    title: 'Pools',
    icon: 'trophy.fill',
    items: [
      {
        question: 'How do I create a pool?',
        answer:
          'After signing up, go to your dashboard and click "Create Pool." Follow the setup wizard to choose a competition, name your pool, pick a format, set a prediction deadline, configure privacy settings, and customize scoring rules. Your pool is ready in under a minute.',
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
          'On a free pool each member has one entry. Paid tiers raise that — Pool Plus allows up to three per person and Pool Max and Ultra are unlimited — and the admin decides whether to switch it on. Each entry is scored independently and appears as its own row on the leaderboard, so you could keep a "Serious" entry and a "Fun" one side by side.',
      },
      {
        question: 'How many people can join my pool?',
        answer:
          'A free pool holds up to 10 members, Pool Plus up to 30, and Pool Max and Ultra are unlimited. If your pool is at its limit the next person to try will be told so rather than being quietly turned away, and upgrading lifts the cap immediately without disturbing anyone already in.',
      },
      {
        question: 'Can I see who has not made their predictions yet?',
        answer:
          'Yes, if you are the pool admin. The Members tab marks every member Submitted, Partial or Pending for the round that is currently open, so you can see at a glance who still needs a nudge instead of asking the whole group. Chasing late picks was the most common answer when we asked admins what took the most work.',
      },
      {
        question: 'Can the admin change settings after the pool has started?',
        answer:
          'Yes. Point values, multipliers, the deadline and most other settings stay editable, and changing a scoring value recalculates every entry so the leaderboard always matches what the Scoring Rules tab says. Predictions already submitted are never altered — only what they are worth.',
      },
      {
        question: 'What happens if a pool is deleted?',
        answer:
          'Deleting a pool is permanent. It removes the pool along with its entries, predictions, scores and chat for everyone in it, and there is no restore. Only the pool admin can delete a pool. If you just want out of a pool somebody else created, leave it instead — that keeps the pool intact for everyone else.',
      },
    ],
  },
  {
    title: 'Predictions',
    icon: 'target',
    items: [
      {
        question: 'How do I make predictions?',
        answer:
          'Navigate to your pool and click on your entry to open the predictions flow. Depending on the format your admin chose, you will either fill in every stage at once or work through one round at a time. Enter your predicted home and away scores for each match.',
      },
      {
        question: 'Do I have to predict the whole tournament before it starts?',
        answer:
          'That depends on the format your admin picked. A full-tournament pool asks for everything up front against a single deadline. A progressive pool opens one round at a time, so you predict the Round of 16 once you know who is actually in it. A bracket pool asks only who advances, not scorelines. This was the single most common piece of feedback after the 2026 World Cup, so it is worth asking your admin which one they chose — or choosing progressive yourself if you are the one setting the pool up.',
      },
      {
        question: 'Can I change my knockout picks once I know who qualified?',
        answer:
          'In a progressive pool, yes — each round opens after the previous one finishes, so you always pick against the real fixtures. In a full-tournament or bracket pool, no: everything locks at the single deadline before the competition starts, and the bracket you predicted is the one you are scored against for the rest of the tournament.',
      },
      {
        question: 'When is the prediction deadline?',
        answer:
          'Each pool admin sets their own deadline, and you can see it on the pool details page. In a progressive pool every round has its own deadline as well. Individual matches also lock at kickoff, so a match that has already started can never be predicted, whatever the pool deadline says.',
      },
      {
        question: 'Can I change my predictions?',
        answer:
          'Yes, as many times as you want before the relevant deadline. Once it passes, predictions are locked and can no longer be modified.',
      },
      {
        question: 'What happens if I miss the deadline?',
        answer:
          'If you have draft predictions when the deadline passes, they are submitted for you automatically rather than thrown away. If you made none at all, you can still watch the pool, the leaderboard and the chat — you just cannot score for the matches you missed.',
      },
      {
        question: 'Why were matches I had not missed locked too?',
        answer:
          'In a full-tournament pool there is only one deadline, so missing it locks the whole entry, including matches weeks away — that is the trade-off for predicting everything up front. In a progressive pool each round has its own deadline and missing one does not lock the next: the following round opens as normal and you can score in it.',
      },
      {
        question: 'Can an admin reopen my predictions after the deadline?',
        answer:
          'Yes. A pool admin can unlock a single entry, which reopens it for editing without affecting anyone else, and you get an email when they do. Whether to do it is entirely their call — we do not reopen entries on request, because the admin is the one who knows whether it would be fair to the rest of the group.',
      },
      {
        question: 'How will I know a deadline is coming?',
        answer:
          'We email a reminder before a deadline, send a push notification if you have the app installed, and confirm your predictions once they are in. You can turn any of these off under Profile → Notifications — and if you have been missing deadlines, that is the first place to check.',
      },
      {
        question: 'Can I see what everyone else predicted?',
        answer:
          'Yes, once nobody can still change them. In a full-tournament or bracket pool, every entry opens up after the pool deadline passes. In a progressive pool each round is revealed as it locks, so earlier rounds are visible while later ones stay hidden. You are never shown someone\'s picks for anything you could still edit yourself.',
      },
      {
        question: 'How do knockout predictions work?',
        answer:
          'For knockout rounds, you predict the full-time score for each match. In a full-tournament or bracket pool the teams in those matches come from your own group stage predictions, so your bracket builds itself from who you predicted to advance. In a progressive pool each knockout round is predicted against the real fixtures once they are known.',
      },
      {
        question: 'What are PSO (penalty shoot-out) predictions?',
        answer:
          'When enabled by the pool admin, you can predict penalty shoot-out scores for knockout matches that end level. PSO predictions earn points on top of your full-time score prediction, and only for matches that actually reach penalties.',
      },
    ],
  },
  {
    title: 'Scoring',
    icon: 'star.fill',
    items: [
      {
        question: 'How does scoring work?',
        answer:
          'Points are awarded on how close your prediction was, in three tiers: the exact score, the correct winner with the correct goal difference, or the correct winner alone. Only the highest tier you reach is awarded — an exact score does not also pay the two below it. Pool admins set all three values.',
      },
      {
        question: 'What are knockout stage multipliers?',
        answer:
          'Pool admins can set multipliers for knockout rounds to increase the stakes as the tournament progresses. For example, a 2x multiplier on the Final means all points earned for that match are doubled.',
      },
      {
        question: 'Why did I score nothing on a knockout match when I picked the right winner?',
        answer:
          'In a full-tournament or bracket pool, a knockout match is scored against the tie you predicted. If your bracket had a different pair of teams meeting in that fixture, the scoreline you entered was for a match that never happened, so it scores nothing. Calling the right team to go through still pays — the correct knockout winner bonus is awarded per tie and does not require the pairing to match. A progressive pool avoids the problem entirely, because every round is predicted against the real fixtures.',
      },
      {
        question: 'My team won on penalties, so why did I get no points for the match?',
        answer:
          'The match and the shootout are scored separately. A tie that finishes level is a draw for scoring purposes, and the shootout is its own prediction — so a 1-1 won on penalties is scored against your predicted 1-1, not against "that team to win". If your admin has penalty predictions switched on, the shootout pays on top of the match score; if they are switched off, the shootout does not score at all.',
      },
      {
        question: 'Do goals scored in extra time count?',
        answer:
          'Yes. A knockout match is scored on the result after extra time, so a goal in the 105th minute counts exactly like one in the 5th. Only the penalty shootout is kept separate.',
      },
      {
        question: 'What are bonus points?',
        answer:
          'Bonus points reward broader outcomes beyond individual scorelines: group standings, how many qualifiers you called, bracket pairings, knockout winners, and the tournament podium — champion, runner-up and third place.',
      },
      {
        question: 'How do group standing bonuses work?',
        answer:
          'After all of a group\'s matches are complete, you earn a bonus for correctly predicting which teams finish first and second. Getting both right in the right order pays most, with smaller awards for the right two in the wrong order, or one of the two in the wrong position. Only one standings bonus is awarded per group.',
      },
      {
        question: 'How do tournament podium bonuses work?',
        answer:
          'You can earn significant bonus points for predicting the overall outcome. By default, correctly predicting the champion earns 1,000 points, with additional points for the runner-up and third place finisher. These are awarded once, from the completed matches.',
      },
      {
        question: 'Why did my points change after I had already seen them?',
        answer:
          'Points settle in stages rather than all at once. Match points land as each match finishes, but group standings and qualification bonuses can only be worked out once every group match is complete — so a large block of points arrives at the end of the group stage and can reshuffle the table. Points also recalculate if your admin changes a scoring value or a result is corrected. If a total still looks wrong, open the points breakdown and raise it with your pool admin.',
      },
      {
        question: 'Two of us have the same points — who is ranked higher?',
        answer:
          'Ties are broken in this order: total points, then the number of exact scores, then the number of correct results, then bonus points, and finally whoever submitted their predictions first. If all of those are identical, the entries genuinely share a rank rather than being separated arbitrarily.',
      },
      {
        question: 'How do I see exactly where my points came from?',
        answer:
          'Tap any entry on the leaderboard to open its points breakdown — match by match, with bonuses listed separately and any admin adjustment on its own line. There is a CSV export in the corner of that panel if you want the whole thing in a spreadsheet.',
      },
      {
        question: 'Can someone who falls behind early still catch up?',
        answer:
          'That depends on how your admin set the pool up, and it is worth asking before the competition starts. Round multipliers make later rounds worth more than group matches, and the podium bonuses are usually large enough to move the top of the table on the final weekend. A pool with flat scoring throughout tends to be decided early — that is the trade-off.',
      },
      {
        question: 'Can the pool admin change scoring rules?',
        answer:
          'Yes. Pool admins have full control over match point values, knockout multipliers, bonus amounts, and whether features like penalty predictions are enabled. Changing a value recalculates every entry, so the leaderboard always matches the published rules.',
      },
    ],
  },
  {
    title: 'Account & Profile',
    icon: 'person.crop.circle.fill',
    items: [
      {
        question: 'How do I create an account?',
        answer:
          'Click "Sign Up" and enter your full name, a unique username, email address, and password. Your username is how other pool members will see you on leaderboards.',
      },
      {
        question: 'I forgot my password and cannot sign in.',
        answer:
          'Use the "Forgot password?" link on the sign-in page and we will email you a reset link. If it has not arrived within a few minutes, check your spam folder and make sure you are using the address you signed up with — a pool invitation may have gone to a different one. If you are still locked out, contact us and we will help.',
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
    icon: 'bell.fill',
    items: [
      {
        question: 'What types of emails does SportPool send?',
        answer:
          'Emails fall into six categories: Pool Activity (member joins, invites, pool updates), Predictions (deadline reminders, confirmations), Match Results (scores and points earned), Leaderboard (rank changes, weekly recaps), Admin (settings changes, member actions), and Community (mentions and broadcasts).',
      },
      {
        question: 'Can I control which emails I get?',
        answer:
          'Yes. Each of the six email categories can be turned on or off independently from Profile → Notifications. You can also use the unsubscribe link at the bottom of any broadcast email to opt out of that type immediately.',
      },
      {
        question: 'Why did I not get a reminder before the deadline?',
        answer:
          'Usually because the Predictions category is switched off under Profile → Notifications, or the reminder landed in spam — adding notifications@sportpool.io to your contacts fixes that. It is also worth checking with your admin: reminders are tied to the deadline set on the pool, so a deadline that moves at short notice leaves little time for one to be useful.',
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
    icon: 'bubble.left.and.bubble.right.fill',
    items: [
      {
        question: 'What is pool chat?',
        answer:
          'Every pool has a built-in chat where members can talk, trash-talk, react with emoji, pin important messages, and @mention each other. Chat is a great way to keep the group engaged between matches.',
      },
      {
        question: 'Who can see my chat messages?',
        answer:
          'Chat messages, reactions, pins, and @mentions are visible to every member of that pool. Pool admins and SportPool super admins may also view chat content for moderation. Messages are not shared with members of other pools.',
      },
      {
        question: 'Can admins moderate chat?',
        answer:
          'Yes. Pool admins can remove messages and members that violate our Acceptable Use rules. SportPool may also remove content or accounts at our discretion if they break our Terms of Service.',
      },
    ],
  },
  {
    title: 'Entry Fees & Branded Pools',
    icon: 'dollarsign.circle.fill',
    items: [
      {
        question: 'Does SportPool take a cut of entry fees or prizes?',
        answer:
          'No. We do not process entry fees or prizes, and we never take a cut of them. We are not a payment processor and we do not collect, hold, or disburse prize money.',
      },
      {
        question: 'How do pool admins collect entry fees?',
        answer:
          'Any entry fee or prize arrangement is organized off-platform by the pool admin — typically using an external payment app like Venmo, PayPal, or cash. SportPool provides only an optional tool for admins to mark each member\'s entry as paid or unpaid. We are not a party to fee or prize arrangements, and any dispute is between the members and the admin.',
      },
      {
        question: 'What is a branded pool?',
        answer:
          'A branded pool is a white-labeled pool operated by an organization with a custom name, logo, color, and landing page. Branded pools work the same as regular pools — predictions, leaderboards, chat, and scoring are all available — but feature the sponsor\'s branding. All platform rules and Acceptable Use policies still apply inside branded pools.',
      },
    ],
  },
]
