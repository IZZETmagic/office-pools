/**
 * Sample data for every SportPool email template.
 *
 * Shared deliberately: scripts/preview-emails.ts (browser review) and
 * scripts/send-email-previews.ts (real test send) BOTH build from this list, so the
 * inbox can never show something the browser preview didn't. If you add a template,
 * add it here once and both surfaces pick it up.
 */

import { dataRows, greeting, panel, paragraph, sectionLabel } from '../lib/email/components'
import * as T from '../lib/email/templates'

const POOL_URL = 'https://sportpool.io/pools/demo-pool'
const DASH_URL = 'https://sportpool.io/dashboard'

export type Sample = { id: string; group: string; label: string; subject: string; html: string }

const rendered: Sample[] = []

/**
 * Resolve Resend merge tags to sample values.
 *
 * `{{{FIRST_NAME|there}}}` and `{{{RESEND_UNSUBSCRIBE_URL}}}` are substituted by Resend
 * only on Broadcast sends. The countdown series and the broadcast composer both use
 * them, so without this they render literally — as a curly-brace blob in the preview and,
 * worse, in a real test send, which reads as a bug rather than as a merge tag.
 */
function resolveMergeTags(html: string): string {
  return html
    .replace(/\{\{\{FIRST_NAME\|([^}]*)\}\}\}/g, 'Ryan')
    .replace(/\{\{\{RESEND_UNSUBSCRIBE_URL\}\}\}/g, 'https://sportpool.io/profile?tab=settings')
}

function add(group: string, label: string, out: { subject: string; html: string }) {
  rendered.push({
    id: `f${rendered.length}`,
    group,
    label,
    subject: out.subject,
    html: resolveMergeTags(out.html),
  })
}

// --- Pool activity -----------------------------------------------------------------

add('Pool activity', 'poolJoined', T.poolJoinedTemplate({
  userName: 'Ryan', poolName: 'Bermuda Office Pool', poolCode: 'BDA26', poolUrl: POOL_URL,
}))

add('Pool activity', 'memberRemoved', T.memberRemovedTemplate({
  userName: 'Ryan', poolName: 'Bermuda Office Pool',
}))

add('Pool activity', 'poolArchived', T.poolArchivedTemplate({
  userName: 'Ryan', poolName: 'Bermuda Office Pool', actorName: 'Carson',
  archiveUrl: 'https://sportpool.io/profile?tab=archived',
}))

add('Pool activity', 'poolRestored', T.poolRestoredTemplate({
  userName: 'Ryan', poolName: 'Bermuda Office Pool', actorName: 'Carson', poolUrl: POOL_URL,
}))

// --- Predictions -------------------------------------------------------------------

add('Predictions', 'predictionsSubmitted', T.predictionsSubmittedTemplate({
  userName: 'Ryan', poolName: 'Bermuda Office Pool', entryName: "Ryan's Rockets",
  matchCount: 48, poolUrl: POOL_URL,
}))

add('Predictions', 'predictionsAutoSubmitted (partial)', T.predictionsAutoSubmittedTemplate({
  userName: 'Ryan', poolName: 'Bermuda Office Pool', entryName: "Ryan's Rockets",
  matchCount: 31, totalMatches: 48, poolUrl: POOL_URL,
}))

add('Predictions', 'predictionsAutoSubmitted (complete)', T.predictionsAutoSubmittedTemplate({
  userName: 'Ryan', poolName: 'Bermuda Office Pool', entryName: "Ryan's Rockets",
  matchCount: 48, totalMatches: 48, poolUrl: POOL_URL,
}))

add('Predictions', 'deadlineReminder', T.deadlineReminderTemplate({
  userName: 'Ryan', poolName: 'Bermuda Office Pool',
  deadline: 'Thursday, June 11 at 3:00 PM AST',
  unsubmittedEntries: ["Ryan's Rockets", 'The Underdogs', 'Bermuda Triangle'],
  poolUrl: POOL_URL,
}))

add('Predictions', 'predictionsUnlocked', T.predictionsUnlockedTemplate({
  userName: 'Ryan', poolName: 'Bermuda Office Pool', entryName: "Ryan's Rockets",
  poolUrl: POOL_URL,
}))

add('Predictions', 'deadlineChanged', T.deadlineChangedTemplate({
  userName: 'Ryan', poolName: 'Bermuda Office Pool',
  newDeadline: 'Friday, June 12 at 11:00 AM AST', poolUrl: POOL_URL,
}))

// A five-pool reminder exercises all three urgency variants at once.
add('Predictions', 'pendingPredictionsReminder (5 pools)', T.pendingPredictionsReminderTemplate({
  firstName: 'Ryan',
  pools: [
    { poolName: 'Bermuda Office Pool', predictionsLeft: 12, totalPredictions: 48, deadline: '2026-06-11T18:00:00Z', daysLeft: 0, poolUrl: POOL_URL },
    { poolName: 'Family Cup', predictionsLeft: 3, totalPredictions: 48, deadline: '2026-06-12T18:00:00Z', daysLeft: 1, poolUrl: POOL_URL },
    { poolName: 'Five-a-side Crew', predictionsLeft: 20, totalPredictions: 48, deadline: '2026-06-14T18:00:00Z', daysLeft: 3, poolUrl: POOL_URL },
    { poolName: 'The Long Shot League', predictionsLeft: 48, totalPredictions: 48, deadline: '2026-06-18T18:00:00Z', daysLeft: 7, poolUrl: POOL_URL },
    { poolName: 'Pub Quiz Pickers', predictionsLeft: 1, totalPredictions: 48, deadline: '2026-06-20T18:00:00Z', daysLeft: 9, poolUrl: POOL_URL },
  ],
}))

add('Predictions', 'pendingPredictionsReminder (1 pool)', T.pendingPredictionsReminderTemplate({
  firstName: 'Ryan',
  pools: [
    { poolName: 'Bermuda Office Pool', predictionsLeft: 12, totalPredictions: 48, deadline: '2026-06-11T18:00:00Z', daysLeft: 2, poolUrl: POOL_URL },
  ],
}))

// --- Results & leaderboard ----------------------------------------------------------

add('Results', 'matchResult', T.matchResultTemplate({
  userName: 'Ryan', homeTeam: 'Brazil', awayTeam: 'Argentina', homeScore: 2, awayScore: 1,
  entries: [
    { entryName: "Ryan's Rockets", pointsEarned: 12, isExact: true },
    { entryName: 'The Underdogs', pointsEarned: 5, isExact: false },
    { entryName: 'Bermuda Triangle', pointsEarned: 0, isExact: false },
  ],
  poolName: 'Bermuda Office Pool', poolUrl: POOL_URL,
}))

add('Results', 'rankChange (up)', T.rankChangeTemplate({
  userName: 'Ryan', poolName: 'Bermuda Office Pool', entryName: "Ryan's Rockets",
  oldRank: 7, newRank: 3, totalPoints: 184, poolUrl: POOL_URL,
}))

add('Results', 'rankChange (down)', T.rankChangeTemplate({
  userName: 'Ryan', poolName: 'Bermuda Office Pool', entryName: "Ryan's Rockets",
  oldRank: 3, newRank: 9, totalPoints: 184, poolUrl: POOL_URL,
}))

add('Results', 'weeklyRecap', T.weeklyRecapTemplate({
  userName: 'Ryan', poolName: 'Bermuda Office Pool', currentRank: 4, totalPoints: 184,
  weekPoints: 37, totalEntrants: 42,
  topFive: [
    { rank: 1, entryName: 'Carson the Conqueror', points: 231 },
    { rank: 2, entryName: 'Group Stage Gladiators', points: 219 },
    { rank: 3, entryName: 'The Underdogs', points: 197 },
    { rank: 4, entryName: "Ryan's Rockets", points: 184 },
    { rank: 5, entryName: 'Bermuda Triangle', points: 176 },
  ],
  poolUrl: POOL_URL,
}))

add('Results', 'pointsAdjusted (positive)', T.pointsAdjustedTemplate({
  userName: 'Ryan', poolName: 'Bermuda Office Pool', entryName: "Ryan's Rockets",
  adjustment: 15, reason: 'Knockout tie-break correction — your R16 picks were scored against the wrong bracket route.',
  newTotal: 199, poolUrl: POOL_URL,
}))

add('Results', 'pointsAdjusted (negative)', T.pointsAdjustedTemplate({
  userName: 'Ryan', poolName: 'Bermuda Office Pool', entryName: "Ryan's Rockets",
  adjustment: -8, reason: 'Duplicate bonus award removed.', newTotal: 176, poolUrl: POOL_URL,
}))

// --- Progressive rounds -------------------------------------------------------------

add('Rounds', 'roundOpen', T.roundOpenTemplate({
  userName: 'Ryan', poolName: 'Bermuda Office Pool', roundName: 'Round of 16',
  deadline: '2026-07-04T18:00:00Z', matchCount: 8, poolUrl: POOL_URL,
}))

add('Rounds', 'roundSubmitted', T.roundSubmittedTemplate({
  userName: 'Ryan', poolName: 'Bermuda Office Pool', roundName: 'Round of 16',
  entryName: "Ryan's Rockets", matchCount: 8, poolUrl: POOL_URL,
}))

add('Rounds', 'roundAutoSubmitted (partial)', T.roundAutoSubmittedTemplate({
  userName: 'Ryan', poolName: 'Bermuda Office Pool', roundName: 'Round of 16',
  entryName: "Ryan's Rockets", matchCount: 5, totalRoundMatches: 8, poolUrl: POOL_URL,
}))

add('Rounds', 'roundDeadlineReminder', T.roundDeadlineReminderTemplate({
  userName: 'Ryan', poolName: 'Bermuda Office Pool', roundName: 'Quarter-finals',
  deadline: '2026-07-09T18:00:00Z',
  unsubmittedEntries: ["Ryan's Rockets", 'The Underdogs'], poolUrl: POOL_URL,
}))

add('Rounds', 'roundDeadlineReminder (none unsubmitted)', T.roundDeadlineReminderTemplate({
  userName: 'Ryan', poolName: 'Bermuda Office Pool', roundName: 'Quarter-finals',
  deadline: '2026-07-09T18:00:00Z', unsubmittedEntries: [], poolUrl: POOL_URL,
}))

add('Rounds', 'bracketFix', T.bracketFixTemplate({
  userName: 'Ryan', poolName: 'Bermuda Office Pool', entryName: "Ryan's Rockets",
  poolUrl: POOL_URL,
}))

// --- Announcements & countdowns ------------------------------------------------------

const GROUP_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
add('Announcements', 'allTeamsAnnouncement', T.allTeamsAnnouncementTemplate({
  userName: 'Ryan',
  groups: GROUP_LETTERS.map((letter, i) => ({
    letter,
    teams: ['BRA', 'ARG', 'FRA', 'ENG'].map((code) => ({
      name: code,
      code,
      flagUrl: `https://flagcdn.com/w20/${['br', 'ar', 'fr', 'gb-eng'][i % 4]}.png`,
    })),
  })),
  daysUntilKickoff: 63,
  dashboardUrl: DASH_URL,
}))

for (const milestone of ['60days', '30days', '14days', '7days', '1day'] as const) {
  const days = { '60days': 60, '30days': 30, '14days': 14, '7days': 7, '1day': 1 }[milestone]
  add('Announcements', `countdownReminder — ${milestone}`, T.countdownReminderTemplate({
    milestone, daysUntilKickoff: days, dashboardUrl: DASH_URL,
  }))
}

// --- Growth & re-engagement -----------------------------------------------------------

add('Growth', 'emptyPoolNudge', T.emptyPoolNudgeTemplate({
  firstName: 'Ryan', poolName: 'Bermuda Office Pool', poolCode: 'BDA26', memberCount: 0,
  dashboardUrl: DASH_URL,
}))

add('Growth', 'soloPoolNudge', T.soloPoolNudgeTemplate({
  firstName: 'Ryan', poolName: 'Bermuda Office Pool', poolCode: 'BDA26', memberCount: 1,
  dashboardUrl: DASH_URL,
}))

add('Growth', 'smallPoolBoost', T.smallPoolBoostTemplate({
  firstName: 'Ryan', poolName: 'Bermuda Office Pool', memberCount: 3, poolCode: 'BDA26',
  dashboardUrl: DASH_URL,
}))

add('Growth', 'startAPool', T.startAPoolTemplate({ firstName: 'Ryan', dashboardUrl: DASH_URL }))
add('Growth', 'weMissYou', T.weMissYouTemplate({ firstName: 'Ryan', dashboardUrl: DASH_URL }))
add('Growth', 'readyToJoin', T.readyToJoinTemplate({ firstName: 'Ryan', dashboardUrl: DASH_URL }))
add('Growth', 'pastPredictorHype', T.pastPredictorHypeTemplate({ firstName: 'Ryan', dashboardUrl: DASH_URL }))

// --- Feedback surveys ------------------------------------------------------------------

add('Feedback', 'poolAdminFeedbackSurvey', T.poolAdminFeedbackSurveyTemplate({ firstName: 'Ryan', dashboardUrl: DASH_URL }))
add('Feedback', 'playerFeedbackSurvey', T.playerFeedbackSurveyTemplate({ firstName: 'Ryan', dashboardUrl: DASH_URL }))
add('Feedback', 'poolAdminFollowup', T.poolAdminFollowupTemplate({ firstName: 'Ryan', dashboardUrl: DASH_URL }))
add('Feedback', 'playerFollowup', T.playerFollowupTemplate({ firstName: 'Ryan', dashboardUrl: DASH_URL }))

// --- Community -------------------------------------------------------------------------

add('Community', 'mentionNotification', T.mentionNotificationTemplate({
  recipientName: 'Ryan', mentionerName: 'Carson', poolName: 'Bermuda Office Pool',
  messageContent: "Ryan you absolute menace, how did you have Morocco going through? I had them bottom of the group and now I'm eating it in front of the whole office. Respect. Genuinely.",
  poolUrl: POOL_URL,
}))

// --- Shells themselves -------------------------------------------------------------------

// Built with the real helpers so the shell previews dark-mode like everything else.
add('Shells', 'supportTemplate', {
  subject: 'Re: Can I change my pool name?',
  html: T.supportTemplate({
    preheader: 'Following up on your question about renaming a pool',
    heading: 'Re: Can I change my pool name?',
    body: `${greeting('Ryan')}
           ${paragraph('Yes — a pool admin can rename a pool at any time from Pool Info. The code stays the same, so nobody has to rejoin.', { marginBottom: 16 })}
           ${paragraph('— The SportPool Team', { marginBottom: 0 })}`,
    ctaText: 'Open Pool Settings',
    ctaUrl: POOL_URL,
  }),
})

add('Shells', 'brandedTemplate (no CTA)', {
  subject: 'Shell with no call to action',
  html: T.brandedTemplate({
    preheader: 'Bare shell, no CTA button',
    heading: 'A heading with no call to action',
    body: paragraph('Some emails have nothing to click. This is what the shell looks like without a button.', { marginBottom: 0 }),
  }),
})

// Internal ops mail — no subscription footer. Mirrors app/api/contact/route.ts.
add('Shells', 'contact form (internal, footer: none)', {
  subject: '[Contact] Scoring question about the R16 bracket',
  html: T.brandedTemplate({
    preheader: 'Carson Reed: Scoring question about the R16 bracket',
    heading: 'New contact form submission',
    headerLabel: 'Contact',
    footer: 'none',
    body: `
      ${panel(
        dataRows([
          { label: 'Name', value: 'Carson Reed' },
          { label: 'Email', value: 'carson@example.com' },
          { label: 'Subject', value: 'Scoring question about the R16 bracket' },
        ])
      )}
      ${sectionLabel('Message')}
      ${paragraph('My R16 picks scored zero even though I got three of them right.<br><br>Pool code is BDA26 if that helps.', { marginBottom: 0 })}
    `,
  }),
})

// The broadcast composer builds its own body from admin-entered text; this mirrors
// what app/admin/super/BroadcastTab.tsx produces, including the Resend merge tags.
add('Shells', 'broadcast (as BroadcastTab builds it)', {
  subject: 'A note from the SportPool team',
  html: T.brandedTemplate({
    preheader: 'A note from the SportPool team',
    heading: 'A note from the SportPool team',
    body: `${greeting('{{{FIRST_NAME|there}}}')}
           ${paragraph('Broadcast copy is entered as plain text in the admin composer and newline-converted, so this is what an arbitrary announcement looks like in the shell.<br><br>Second paragraph, after a blank line.', { marginBottom: 0 })}`,
    ctaText: 'Go to Dashboard',
    ctaUrl: DASH_URL,
    unsubscribeUrl: '{{{RESEND_UNSUBSCRIBE_URL}}}',
  }),
})

export function buildSamples(): Sample[] {
  return rendered
}
