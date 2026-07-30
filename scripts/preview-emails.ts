/**
 * Renders every email template with representative sample data into a single browsable
 * page, so the whole set can be reviewed in light AND dark without sending anything.
 *
 *   npx tsx scripts/preview-emails.ts
 *   open .preview-emails/index.html
 *
 * The dark toggle rewrites `@media (prefers-color-scheme:dark)` to `@media all` inside
 * each iframe. That exercises the real rules the email ships rather than a preview-only
 * class, so what you see is what Apple Mail / iOS Mail / Outlook mac will render.
 *
 * Caveat worth remembering while reviewing: Gmail and Outlook for Windows ignore
 * prefers-color-scheme entirely and run their own force-invert over the inline light
 * styles. Nothing here predicts that — only a real test send would.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { dataRows, greeting, panel, paragraph, sectionLabel } from '../lib/email/components'
import * as T from '../lib/email/templates'

const OUT_DIR = join(process.cwd(), '.preview-emails')

const POOL_URL = 'https://sportpool.io/pools/demo-pool'
const DASH_URL = 'https://sportpool.io/dashboard'

type Rendered = { id: string; group: string; label: string; subject: string; html: string }

const rendered: Rendered[] = []

function add(group: string, label: string, out: { subject: string; html: string }) {
  rendered.push({
    id: `f${rendered.length}`,
    group,
    label,
    subject: out.subject,
    html: out.html,
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

// --- Write the index ----------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true })

for (const r of rendered) {
  writeFileSync(join(OUT_DIR, `${r.id}.html`), r.html, 'utf8')
}

const groups = [...new Set(rendered.map((r) => r.group))]

const nav = groups
  .map(
    (g) => `<div class="navgroup"><h3>${g}</h3>${rendered
      .filter((r) => r.group === g)
      .map((r) => `<a href="#${r.id}">${r.label}</a>`)
      .join('')}</div>`
  )
  .join('')

const cards = groups
  .map(
    (g) => `<section><h2 class="grouphead">${g}</h2>${rendered
      .filter((r) => r.group === g)
      .map(
        (r) => `<article id="${r.id}" class="card">
          <header><h3>${r.label}</h3><p class="subject"><span>Subject</span> ${escapeHtml(r.subject)}</p></header>
          <iframe data-frame data-key="${r.id}" title="${r.label}"></iframe>
        </article>`
      )
      .join('')}</section>`
  )
  .join('')

// Frames are populated via srcdoc from this map rather than src="<file>.html".
// A file:// iframe loaded by src is cross-origin in Chrome, so contentDocument would be
// null and the dark toggle would silently do nothing; srcdoc inherits the parent origin,
// so the preview works from disk with no server. The per-template files are still
// written alongside for opening one email on its own.
const payload = JSON.stringify(Object.fromEntries(rendered.map((r) => [r.id, r.html])))

const index = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SportPool email preview — ${rendered.length} templates</title>
<style>
  :root{--bg:#F7F8FC;--fg:#1B2340;--muted:#7B87A8;--line:#EEF1F8;--card:#FFFFFF;}
  body.dark{--bg:#121520;--fg:#E8EAF0;--muted:#8B97B8;--line:#232840;--card:#1C2030;}
  *{box-sizing:border-box;}
  body{margin:0;background:var(--bg);color:var(--fg);font-family:'Nunito',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;}
  nav{position:sticky;top:0;align-self:flex-start;height:100vh;overflow-y:auto;width:250px;flex:none;padding:20px 16px;border-right:1px solid var(--line);background:var(--card);}
  nav h2{font-size:15px;margin:0 0 4px;}
  nav .count{font-size:12px;color:var(--muted);margin:0 0 16px;}
  .navgroup h3{font-size:10px;text-transform:uppercase;letter-spacing:1.2px;color:var(--muted);margin:16px 0 6px;}
  nav a{display:block;font-size:12px;color:var(--fg);text-decoration:none;padding:4px 6px;border-radius:6px;opacity:.85;}
  nav a:hover{background:var(--line);opacity:1;}
  main{flex:1;padding:20px 28px 80px;min-width:0;}
  .bar{position:sticky;top:0;z-index:5;background:var(--bg);padding:12px 0 14px;border-bottom:1px solid var(--line);margin-bottom:20px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;}
  button{font:inherit;font-weight:700;font-size:13px;padding:9px 16px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--fg);cursor:pointer;}
  button.on{background:#3B6EFF;border-color:#3B6EFF;color:#fff;}
  .hint{font-size:12px;color:var(--muted);}
  .grouphead{font-size:11px;text-transform:uppercase;letter-spacing:1.4px;color:var(--muted);margin:32px 0 12px;}
  .card{background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden;margin:0 0 20px;}
  .card header{padding:14px 18px;border-bottom:1px solid var(--line);}
  .card h3{margin:0;font-size:14px;}
  .subject{margin:6px 0 0;font-size:12px;color:var(--muted);}
  .subject span{display:inline-block;font-size:9px;letter-spacing:1.2px;text-transform:uppercase;border:1px solid var(--line);border-radius:4px;padding:1px 5px;margin-right:6px;}
  iframe{display:block;width:100%;height:760px;border:0;background:#fff;}
  body.dark iframe{background:#121520;}
</style>
</head>
<body>
<nav>
  <h2>Email preview</h2>
  <p class="count">${rendered.length} templates</p>
  ${nav}
</nav>
<main>
  <div class="bar">
    <button id="toggle">Force dark mode</button>
    <span class="hint">Rewrites <code>@media (prefers-color-scheme:dark)</code> &rarr; <code>@media all</code> in each frame. Gmail &amp; Outlook/Windows ignore that query and force-invert instead &mdash; unverifiable here.</span>
  </div>
  ${cards}
</main>
<script>
  var EMAILS = ${payload};
  var dark = false;

  function apply(frame){
    var doc = frame.contentDocument;
    if(!doc) return;
    doc.querySelectorAll('style').forEach(function(s){
      if(dark){
        if(s.textContent.indexOf('@media (prefers-color-scheme:dark)') > -1){
          s.dataset.orig = s.textContent;
          s.textContent = s.textContent.replace('@media (prefers-color-scheme:dark)', '@media all');
        }
      } else if(s.dataset.orig){
        s.textContent = s.dataset.orig;
        delete s.dataset.orig;
      }
    });
  }

  var frames = [].slice.call(document.querySelectorAll('[data-frame]'));
  frames.forEach(function(f){
    f.addEventListener('load', function(){ apply(f); });
    f.srcdoc = EMAILS[f.dataset.key];
  });

  document.getElementById('toggle').addEventListener('click', function(){
    dark = !dark;
    this.classList.toggle('on', dark);
    this.textContent = dark ? 'Back to light mode' : 'Force dark mode';
    document.body.classList.toggle('dark', dark);
    frames.forEach(apply);
  });
</script>
</body></html>`

writeFileSync(join(OUT_DIR, 'index.html'), index, 'utf8')

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

console.log(`Rendered ${rendered.length} templates -> ${join(OUT_DIR, 'index.html')}`)
console.log(`  open ${join(OUT_DIR, 'index.html')}`)
