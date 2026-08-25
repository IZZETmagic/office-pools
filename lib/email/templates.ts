import {
  type CalloutVariant,
  cls,
  color,
  darkModeStyles,
  emailRadii,
  FONT_STACK,
  type,
  weights,
} from './brand'
import {
  bulletList,
  callout,
  calloutLine,
  calloutList,
  codeChip,
  dataRows,
  greeting,
  lead,
  panel,
  paragraph,
  quoteBlock,
  scoreline,
  secondaryButton,
  sectionLabel,
  standingsTable,
  statBlock,
} from './components'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'

const FONT = `font-family:${FONT_STACK};`

/**
 * The SportPool email shell — the RN app's identity in HTML: two-tone "SportPool"
 * wordmark in Nunito 900 on a midnight header (matching mobile/components/ui/Wordmark.tsx
 * with onDark), primary-blue CTA, tokens from ./brand.
 *
 * Light and dark both ship. Dark reaches Apple Mail, iOS Mail and Outlook macOS/iOS via
 * prefers-color-scheme, and Outlook.com via [data-ogsc]. Gmail and Outlook for Windows
 * ignore both and run their own force-invert over the inline light styles — nothing we
 * can hook, so the light design stays the source of truth there.
 *
 * `unsubscribeUrl` exists for broadcast sends, which need Resend's
 * {{{RESEND_UNSUBSCRIBE_URL}}} merge tag instead of the profile settings link.
 */
export function brandedTemplate(params: {
  preheader: string
  heading: string
  body: string
  ctaText?: string
  ctaUrl?: string
  unsubscribeUrl?: string
  /** Right-aligned label in the header band, e.g. "Support". */
  headerLabel?: string
  /**
   * Which footer to render:
   *  - `subscription` (default) — site link, notification settings, unsubscribe.
   *  - `support` — a human reply, so it offers a reply prompt and NO unsubscribe.
   *  - `none` — internal ops mail nobody subscribed to; wordmark only.
   */
  footer?: 'subscription' | 'support' | 'none'
}): string {
  const { preheader, heading, body, ctaText, ctaUrl, headerLabel } = params
  const footer = params.footer ?? 'subscription'
  const unsubscribeUrl = params.unsubscribeUrl || `${APP_URL}/profile?tab=settings`

  // `sportClass` matters: on the footer the "Sport" half sits on the card, so it needs a
  // dark hook or it stays near-black on a near-black surface. In the header it sits on the
  // always-midnight band, so it is hard-white in both modes and takes no class.
  const wordmark = (
    size: number,
    sportColor: string,
    poolColor: string,
    sportClass = ''
  ) =>
    `<span class="${sportClass}" style="${FONT}font-size:${size}px;line-height:${Math.round(size * 1.15)}px;font-weight:${weights.black};letter-spacing:-0.5px;color:${sportColor};">Sport<span class="${cls.wordmarkPool}" style="color:${poolColor};">Pool</span></span>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <!-- Font import kept in its own block: clients that strip @import (Gmail) still keep the rules below. Nunito falls back to the system stack everywhere it isn't supported. -->
  <style>@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;900&display=swap');</style>
  <style>${darkModeStyles()}
  </style>
</head>
<body class="${cls.page}" style="margin:0;padding:0;background:${color('page')};${FONT}">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</span>
  <table role="presentation" class="${cls.page}" width="100%" cellpadding="0" cellspacing="0" style="background:${color('page')};padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" class="sp-container ${cls.card}" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:560px;background:${color('surface')};border-radius:${emailRadii.md}px;overflow:hidden;border:1px solid ${color('hairline')};">
        <tr><td style="background:${color('header')};padding:26px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="text-align:${headerLabel ? 'left' : 'center'};">${wordmark(type.wordmark.size, '#FFFFFF', color('primary', 'dark'))}</td>
              ${headerLabel ? `<td style="text-align:right;${FONT}color:${color('muted')};font-size:${type.caption.size}px;font-weight:${weights.bold};letter-spacing:1.2px;text-transform:uppercase;">${headerLabel}</td>` : ''}
            </tr>
          </table>
        </td></tr>
        <tr><td class="sp-pad" style="padding:32px;">
          <h1 class="${cls.heading}" style="margin:0 0 18px;color:${color('heading')};${FONT}font-size:${type.heading.size}px;line-height:${type.heading.lineHeight}px;font-weight:${weights.black};letter-spacing:-0.3px;">${heading}</h1>
          ${body}
          ${
            ctaText && ctaUrl
              ? `
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto 8px;">
            <tr><td class="${cls.cta}" style="background:${color('primary')};border-radius:${emailRadii.sm}px;">
              <a href="${ctaUrl}" class="${cls.cta}" style="display:inline-block;${FONT}color:#FFFFFF;font-weight:${weights.black};font-size:15px;line-height:20px;padding:14px 36px;border-radius:${emailRadii.sm}px;">${ctaText}</a>
            </td></tr>
          </table>`
              : ''
          }
        </td></tr>
        <tr><td class="sp-pad ${cls.hairline}" style="padding:20px 32px 26px;border-top:1px solid ${color('hairline')};text-align:center;">
          <p style="margin:0 0 8px;">${wordmark(14, color('heading'), color('primary'), cls.heading)}</p>
          ${
            footer === 'none'
              ? ''
              : `<p class="${cls.muted}" style="margin:0;color:${color('muted')};${FONT}font-size:12px;line-height:20px;">
            <a href="${APP_URL}" class="${cls.link}" style="color:${color('muted')};">sportpool.io</a> &middot;
            ${
              footer === 'support'
                ? 'Need more help? Just reply to this email'
                : `<a href="${APP_URL}/profile?tab=settings" class="${cls.link}" style="color:${color('muted')};">Notification Settings</a> &middot;
            <a href="${unsubscribeUrl}" class="${cls.link}" style="color:${color('muted')};">Unsubscribe</a>`
            }
          </p>`
          }
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

/**
 * Support replies. Same tokens and shell as everything else — it reads as support
 * rather than as marketing through the header label and the reply-to footer, not
 * through a different palette.
 */
export function supportTemplate(params: {
  preheader: string
  heading: string
  body: string
  ctaText?: string
  ctaUrl?: string
}): string {
  const { preheader, heading, body, ctaText, ctaUrl } = params

  // A support reply is a human answering a question, not a subscription — so it carries
  // a reply prompt and no unsubscribe link. `footer: 'support'` is what enforces that.
  return brandedTemplate({
    preheader,
    heading,
    body,
    ctaText,
    ctaUrl,
    headerLabel: 'Support',
    footer: 'support',
  })
}

// --- Pool Activity Templates ---

export function poolJoinedTemplate(params: {
  userName: string
  poolName: string
  poolCode: string
  poolUrl: string
}): { subject: string; html: string } {
  const { userName, poolName, poolCode, poolUrl } = params
  return {
    subject: `Welcome to ${poolName}!`,
    html: brandedTemplate({
      preheader: `You've joined ${poolName} - time to make your predictions!`,
      heading: `Welcome to ${poolName}!`,
      body: `
        ${greeting(userName)}
        ${paragraph(`You've successfully joined the pool <strong>${poolName}</strong> (code: ${codeChip(poolCode)}).`)}
        ${paragraph(`Head over to the pool and start making your predictions before the deadline!`)}
      `,
      ctaText: 'Make Predictions',
      ctaUrl: `${poolUrl}?tab=predictions`,
    }),
  }
}

// --- Prediction Templates ---

export function predictionsSubmittedTemplate(params: {
  userName: string
  poolName: string
  entryName: string
  matchCount: number
  poolUrl: string
}): { subject: string; html: string } {
  const { userName, poolName, entryName, matchCount, poolUrl } = params
  return {
    subject: `Predictions submitted for ${poolName}`,
    html: brandedTemplate({
      preheader: `Your predictions for ${entryName} in ${poolName} are locked in!`,
      heading: 'Predictions Submitted!',
      body: `
        ${greeting(userName)}
        ${paragraph(`Your predictions for <strong>${entryName}</strong> in <strong>${poolName}</strong> have been submitted successfully.`)}
        ${callout('success', calloutLine('success', `<strong>${matchCount}</strong> match predictions locked in`))}
        ${paragraph('Good luck!', { marginBottom: 0 })}
      `,
      ctaText: 'View Pool',
      ctaUrl: poolUrl,
    }),
  }
}

export function predictionsAutoSubmittedTemplate(params: {
  userName: string
  poolName: string
  entryName: string
  matchCount: number
  totalMatches: number
  poolUrl: string
}): { subject: string; html: string } {
  const { userName, poolName, entryName, matchCount, totalMatches, poolUrl } = params
  const isPartial = totalMatches > 0 && matchCount < totalMatches
  return {
    subject: `Your draft predictions were auto-submitted for ${poolName}`,
    html: brandedTemplate({
      preheader: `The deadline passed and your draft for ${entryName} was automatically submitted`,
      heading: 'Draft Auto-Submitted',
      body: `
        ${greeting(userName)}
        ${paragraph(`The prediction deadline for <strong>${poolName}</strong> has passed. Your draft predictions for <strong>${entryName}</strong> were automatically submitted.`)}
        ${callout('warning', calloutLine('warning', `<strong>${matchCount}</strong> of <strong>${totalMatches}</strong> match predictions submitted${isPartial ? ' (partial)' : ''}`))}
        ${isPartial ? paragraph('Matches without predictions will not earn any points.') : ''}
        ${paragraph('Good luck!', { marginBottom: 0 })}
      `,
      ctaText: 'View Pool',
      ctaUrl: poolUrl,
    }),
  }
}

export function deadlineReminderTemplate(params: {
  userName: string
  poolName: string
  deadline: string
  unsubmittedEntries: string[]
  poolUrl: string
}): { subject: string; html: string } {
  const { userName, poolName, deadline, unsubmittedEntries, poolUrl } = params
  return {
    subject: `Prediction deadline approaching for ${poolName}`,
    html: brandedTemplate({
      preheader: `Less than 24 hours to submit your predictions for ${poolName}!`,
      heading: 'Deadline Approaching!',
      body: `
        ${greeting(userName)}
        ${paragraph(`The prediction deadline for <strong>${poolName}</strong> is <strong>${deadline}</strong>.`)}
        ${callout(
          'warning',
          `${calloutLine('warning', 'Unsubmitted entries:', { bold: true, marginBottom: 8 })}
           ${calloutList('warning', unsubmittedEntries)}`
        )}
        ${paragraph(`Don't miss out - submit your predictions now!`, { marginBottom: 0 })}
      `,
      ctaText: 'Submit Predictions',
      ctaUrl: `${poolUrl}?tab=predictions`,
    }),
  }
}

// --- Match Result Templates ---

export function matchResultTemplate(params: {
  userName: string
  homeTeam: string
  awayTeam: string
  homeScore: number
  awayScore: number
  entries: { entryName: string; pointsEarned: number; isExact: boolean }[]
  poolName: string
  poolUrl: string
}): { subject: string; html: string } {
  const { userName, homeTeam, awayTeam, homeScore, awayScore, entries, poolName, poolUrl } = params
  const scoreStr = `${homeTeam} ${homeScore} - ${awayScore} ${awayTeam}`

  return {
    subject: `${scoreStr} - ${poolName} results`,
    html: brandedTemplate({
      preheader: `${scoreStr} - see how your predictions did!`,
      heading: 'Match Result',
      body: `
        ${greeting(userName)}
        ${scoreline(scoreStr)}
        ${paragraph(`Here's how your entries did in <strong>${poolName}</strong>:`)}
        ${standingsTable(
          entries.map((e) => ({
            name: e.entryName,
            value: `${e.pointsEarned > 0 ? `+${e.pointsEarned}` : '0'} pts${e.isExact ? ' &#10003; Exact' : ''}`,
            valueVariant: e.isExact ? ('success' as const) : undefined,
          }))
        )}
      `,
      ctaText: 'View Results',
      ctaUrl: `${poolUrl}?tab=results`,
    }),
  }
}

// --- Leaderboard Templates ---

export function rankChangeTemplate(params: {
  userName: string
  poolName: string
  entryName: string
  oldRank: number
  newRank: number
  totalPoints: number
  poolUrl: string
}): { subject: string; html: string } {
  const { userName, poolName, entryName, oldRank, newRank, totalPoints, poolUrl } = params
  const improved = newRank < oldRank
  const emoji = improved ? '&#x1F4C8;' : '&#x1F4C9;'
  return {
    subject: `${improved ? 'You moved up' : 'Rank update'} in ${poolName}`,
    html: brandedTemplate({
      preheader: `${entryName}: #${oldRank} → #${newRank} in ${poolName}`,
      heading: `Rank Update ${emoji}`,
      body: `
        ${greeting(userName)}
        ${paragraph(`Your entry <strong>${entryName}</strong> in <strong>${poolName}</strong> has ${improved ? 'moved up' : 'changed position'}:`)}
        ${statBlock({
          label: improved ? 'Moved up' : 'New position',
          value: `#${oldRank} &rarr; #${newRank}`,
          sub: `${totalPoints} total points`,
          variant: improved ? 'success' : 'danger',
        })}
      `,
      ctaText: 'View Leaderboard',
      ctaUrl: `${poolUrl}?tab=leaderboard`,
    }),
  }
}

export function weeklyRecapTemplate(params: {
  userName: string
  poolName: string
  currentRank: number
  totalPoints: number
  weekPoints: number
  totalEntrants: number
  topFive: { rank: number; entryName: string; points: number }[]
  poolUrl: string
}): { subject: string; html: string } {
  const { userName, poolName, currentRank, totalPoints, weekPoints, totalEntrants, topFive, poolUrl } = params

  return {
    subject: `Weekly recap: #${currentRank} in ${poolName}`,
    html: brandedTemplate({
      preheader: `You're ranked #${currentRank} of ${totalEntrants} in ${poolName} this week`,
      heading: `Weekly Recap - ${poolName}`,
      body: `
        ${greeting(userName)}
        ${paragraph(`Here's your weekly standings update for <strong>${poolName}</strong>:`, { marginBottom: 16 })}
        ${statBlock({
          label: 'Your rank',
          value: `#${currentRank} of ${totalEntrants}`,
          sub: `${totalPoints} total pts (+${weekPoints} this week)`,
          variant: 'success',
        })}
        ${sectionLabel('Top 5')}
        ${standingsTable(
          topFive.map((e) => ({ rank: `#${e.rank}`, name: e.entryName, value: `${e.points} pts` }))
        )}
      `,
      ctaText: 'View Full Leaderboard',
      ctaUrl: `${poolUrl}?tab=leaderboard`,
    }),
  }
}

// --- Admin Templates ---

export function predictionsUnlockedTemplate(params: {
  userName: string
  poolName: string
  entryName: string
  poolUrl: string
}): { subject: string; html: string } {
  const { userName, poolName, entryName, poolUrl } = params
  return {
    subject: `Predictions unlocked in ${poolName}`,
    html: brandedTemplate({
      preheader: `Your predictions for ${entryName} have been unlocked for editing`,
      heading: 'Predictions Unlocked',
      body: `
        ${greeting(userName)}
        ${paragraph(`A pool admin has unlocked your predictions for <strong>${entryName}</strong> in <strong>${poolName}</strong>.`)}
        ${paragraph('You can now edit and resubmit your predictions.', { marginBottom: 0 })}
      `,
      ctaText: 'Edit Predictions',
      ctaUrl: `${poolUrl}?tab=predictions`,
    }),
  }
}

export function memberRemovedTemplate(params: {
  userName: string
  poolName: string
}): { subject: string; html: string } {
  const { userName, poolName } = params
  return {
    subject: `You've been removed from ${poolName}`,
    html: brandedTemplate({
      preheader: `You are no longer a member of ${poolName}`,
      heading: 'Removed from Pool',
      body: `
        ${greeting(userName)}
        ${paragraph(`A pool admin has removed you from <strong>${poolName}</strong>.`)}
        ${paragraph('If you believe this was a mistake, please contact the pool administrator.', { marginBottom: 0 })}
      `,
      ctaText: 'Browse Pools',
      ctaUrl: `${APP_URL}/pools?tab=discover`,
    }),
  }
}

// Sent to every member (except the admin who acted) when a pool is archived.
// The members did not choose this and their trophy counts change because of it,
// so the email states the mechanism plainly rather than softening it: nothing is
// deleted, it is read-only, it stops counting, and it can come back.
export function poolArchivedTemplate(params: {
  userName: string
  poolName: string
  actorName: string
  archiveUrl: string
}): { subject: string; html: string } {
  const { userName, poolName, actorName, archiveUrl } = params
  return {
    subject: `${poolName} has been archived`,
    html: brandedTemplate({
      preheader: `${actorName} archived ${poolName} — nothing has been deleted`,
      heading: 'Pool archived',
      body: `
        ${greeting(userName)}
        ${paragraph(`<strong>${actorName}</strong> archived <strong>${poolName}</strong>.`)}
        ${paragraph('Nothing has been deleted. Every prediction, score and badge from that pool is still there, and we have moved it to Archived in your profile where you can still look through it.')}
        ${paragraph('While it is archived it stops counting toward your trophies and your overall stats, so you may see those numbers drop. If a pool admin restores it, everything comes straight back.')}
        ${paragraph('Only a pool admin can restore it.', { marginBottom: 0 })}
      `,
      ctaText: 'View Archived Pools',
      ctaUrl: archiveUrl,
    }),
  }
}

// The undo half. Sent when an admin restores a pool, because the archive email
// promised these numbers would come back and members should hear that they have.
export function poolRestoredTemplate(params: {
  userName: string
  poolName: string
  actorName: string
  poolUrl: string
}): { subject: string; html: string } {
  const { userName, poolName, actorName, poolUrl } = params
  return {
    subject: `${poolName} is back`,
    html: brandedTemplate({
      preheader: `${actorName} restored ${poolName}`,
      heading: 'Pool restored',
      body: `
        ${greeting(userName)}
        ${paragraph(`<strong>${actorName}</strong> restored <strong>${poolName}</strong>, so it is active again.`)}
        ${paragraph('It counts toward your trophies and your overall stats again, exactly as it did before.', { marginBottom: 0 })}
      `,
      ctaText: 'Open Pool',
      ctaUrl: poolUrl,
    }),
  }
}

export function deadlineChangedTemplate(params: {
  userName: string
  poolName: string
  newDeadline: string
  poolUrl: string
}): { subject: string; html: string } {
  const { userName, poolName, newDeadline, poolUrl } = params
  return {
    subject: `Deadline updated for ${poolName}`,
    html: brandedTemplate({
      preheader: `The prediction deadline for ${poolName} has been changed`,
      heading: 'Deadline Updated',
      body: `
        ${greeting(userName)}
        ${paragraph(`The prediction deadline for <strong>${poolName}</strong> has been updated.`)}
        ${callout(
          'info',
          `${calloutLine('info', 'New deadline', { bold: true, size: 11, marginBottom: 4 })}
           ${calloutLine('info', newDeadline, { bold: true, size: 17 })}`,
          { align: 'center' }
        )}
        ${paragraph('Make sure your predictions are submitted before then!', { marginBottom: 0 })}
      `,
      ctaText: 'View Pool',
      ctaUrl: poolUrl,
    }),
  }
}

// --- Progressive Predictions Templates ---

export function roundOpenTemplate(params: {
  userName: string
  poolName: string
  roundName: string
  deadline: string
  matchCount: number
  poolUrl: string
}): { subject: string; html: string } {
  const { userName, poolName, roundName, deadline, matchCount, poolUrl } = params
  const deadlineFormatted = new Date(deadline).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  })
  return {
    subject: `${roundName} predictions now open - ${poolName}`,
    html: brandedTemplate({
      preheader: `${roundName} is ready! Make your predictions for ${matchCount} matches.`,
      heading: `${roundName} Predictions Open!`,
      body: `
        ${greeting(userName)}
        ${paragraph(`The <strong>${roundName}</strong> is now open for predictions in <strong>${poolName}</strong>!`)}
        ${callout(
          'success',
          `${calloutLine('success', `${matchCount} matches to predict`, { bold: true, marginBottom: 6 })}
           ${calloutLine('success', `Deadline: ${deadlineFormatted}`, { size: 13 })}`
        )}
        ${paragraph('Head over to the pool and make your predictions before the deadline!', { marginBottom: 0 })}
      `,
      ctaText: 'Make Predictions',
      ctaUrl: poolUrl,
    }),
  }
}

export function roundSubmittedTemplate(params: {
  userName: string
  poolName: string
  roundName: string
  entryName: string
  matchCount: number
  poolUrl: string
}): { subject: string; html: string } {
  const { userName, poolName, roundName, entryName, matchCount, poolUrl } = params
  return {
    subject: `${roundName} predictions submitted - ${poolName}`,
    html: brandedTemplate({
      preheader: `Your ${roundName} predictions for ${entryName} in ${poolName} are locked in!`,
      heading: `${roundName} Predictions Submitted!`,
      body: `
        ${greeting(userName)}
        ${paragraph(`Your <strong>${roundName}</strong> predictions for <strong>${entryName}</strong> in <strong>${poolName}</strong> have been submitted.`)}
        ${callout('success', calloutLine('success', `<strong>${matchCount}</strong> match predictions locked in`))}
        ${paragraph('Good luck! Points will be awarded as matches complete.', { marginBottom: 0 })}
      `,
      ctaText: 'View Pool',
      ctaUrl: poolUrl,
    }),
  }
}

export function roundAutoSubmittedTemplate(params: {
  userName: string
  poolName: string
  roundName: string
  entryName: string
  matchCount: number
  totalRoundMatches: number
  poolUrl: string
}): { subject: string; html: string } {
  const { userName, poolName, roundName, entryName, matchCount, totalRoundMatches, poolUrl } = params
  return {
    subject: `${roundName} predictions auto-submitted - ${poolName}`,
    html: brandedTemplate({
      preheader: `Your draft ${roundName} predictions for ${entryName} were auto-submitted.`,
      heading: `${roundName} Auto-Submitted`,
      body: `
        ${greeting(userName)}
        ${paragraph(`The deadline for <strong>${roundName}</strong> in <strong>${poolName}</strong> has passed. Your draft predictions for <strong>${entryName}</strong> were automatically submitted.`)}
        ${callout(
          'warning',
          `${calloutLine('warning', `<strong>${matchCount}</strong> of <strong>${totalRoundMatches}</strong> matches had predictions saved`, { marginBottom: matchCount < totalRoundMatches ? 4 : 0 })}
           ${matchCount < totalRoundMatches ? calloutLine('warning', 'Matches without predictions will score 0 points.', { size: 13 }) : ''}`
        )}
      `,
      ctaText: 'View Pool',
      ctaUrl: poolUrl,
    }),
  }
}

export function roundDeadlineReminderTemplate(params: {
  userName: string
  poolName: string
  roundName: string
  deadline: string
  unsubmittedEntries: string[]
  poolUrl: string
}): { subject: string; html: string } {
  const { userName, poolName, roundName, deadline, unsubmittedEntries, poolUrl } = params
  const deadlineFormatted = new Date(deadline).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  })
  return {
    subject: `Reminder: ${roundName} predictions closing soon - ${poolName}`,
    html: brandedTemplate({
      preheader: `Don't miss out! ${roundName} predictions close soon.`,
      heading: `${roundName} Deadline Approaching`,
      body: `
        ${greeting(userName)}
        ${paragraph(`The <strong>${roundName}</strong> deadline for <strong>${poolName}</strong> is approaching.`)}
        ${callout(
          'warning',
          `${calloutLine('warning', `Deadline: ${deadlineFormatted}`, { bold: true, marginBottom: unsubmittedEntries.length > 0 ? 8 : 0 })}
           ${
             unsubmittedEntries.length > 0
               ? `${calloutLine('warning', 'Unsubmitted entries:', { size: 13, marginBottom: 4 })}
                  ${calloutList('warning', unsubmittedEntries)}`
               : ''
           }`
        )}
        ${paragraph('Submit your predictions before time runs out!', { marginBottom: 0 })}
      `,
      ctaText: 'Submit Predictions',
      ctaUrl: poolUrl,
    }),
  }
}

// --- League Templates ---

/**
 * "Matchweek 12 is scored." Sent once, when a matchweek is both fully played
 * AND fully counted.
 *
 * ⚠ Deliberately FACTUAL. It reports what happened — points, position,
 * movement — and does not ask for anything. CLAUDE.md's disclosure gate is
 * satisfied by "when a matchweek finishes, we tell you how you did"; a version
 * that leaned on the movement to pull somebody back ("you've slipped to 4th —
 * don't let them get away") would fail it, and is the reason the movement line
 * is stated plainly and then left alone.
 *
 * Voice is plural "we", per the house rule — never first person.
 */
export function leagueMatchweekResultTemplate(params: {
  userName: string
  poolName: string
  matchweekName: string
  pointsThisWeek: number
  totalPoints: number
  rank: number | null
  previousRank: number | null
  memberCount: number
  poolUrl: string
}): { subject: string; html: string } {
  const {
    userName, poolName, matchweekName, pointsThisWeek, totalPoints,
    rank, previousRank, memberCount, poolUrl,
  } = params

  // Movement is only meaningful once there is something to compare against —
  // the first scored matchweek of a season has no previous position.
  const delta = rank !== null && previousRank !== null ? previousRank - rank : null
  const movement =
    delta === null ? '' :
    delta > 0 ? ` — up ${delta} place${delta === 1 ? '' : 's'}` :
    delta < 0 ? ` — down ${-delta} place${-delta === 1 ? '' : 's'}` :
    ' — no change'

  const position = rank !== null ? `${ordinal(rank)} of ${memberCount}` : 'unranked'

  return {
    subject: `${matchweekName} is scored - ${poolName}`,
    html: brandedTemplate({
      preheader: `You scored ${pointsThisWeek} in ${matchweekName}.`,
      heading: `${matchweekName} Results`,
      body: `
        ${greeting(userName)}
        ${paragraph(`<strong>${matchweekName}</strong> is done and counted in <strong>${poolName}</strong>.`)}
        ${callout(
          'info',
          `${calloutLine('info', `${pointsThisWeek} points this matchweek`, { bold: true, marginBottom: 6 })}
           ${calloutLine('info', `${totalPoints} points overall`, { size: 13, marginBottom: 6 })}
           ${calloutLine('info', `You are ${position}${movement}`, { size: 13 })}`
        )}
        ${paragraph('The next matchweek is open — see how everyone else got on.', { marginBottom: 0 })}
      `,
      ctaText: 'See the table',
      ctaUrl: poolUrl,
    }),
  }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

// --- Announcement Templates ---

export function allTeamsAnnouncementTemplate(params: {
  userName: string
  groups: { letter: string; teams: { name: string; code: string; flagUrl: string }[] }[]
  daysUntilKickoff: number
  dashboardUrl: string
}): { subject: string; html: string } {
  const { userName, groups, daysUntilKickoff, dashboardUrl } = params

  // Build 4 rows × 3 columns grid
  const groupRows: string[] = []
  for (let row = 0; row < 4; row++) {
    const cols = groups.slice(row * 3, row * 3 + 3)
    const cellsHtml = cols
      .map(
        (g) => `
        <td width="33%" style="padding:6px;vertical-align:top;">
          <div class="${cls.callout('neutral')}" style="background:${color('neutralBg')};border:1px solid ${color('hairline')};border-radius:${emailRadii.sm}px;padding:10px 12px;">
            <p class="${cls.muted}" style="${FONT}margin:0 0 6px;font-size:11px;font-weight:${weights.bold};color:${color('primary')};text-transform:uppercase;letter-spacing:1.2px;white-space:nowrap;">Group ${g.letter}</p>
            ${g.teams.map((t) => `<p class="${cls.body}" style="${FONT}margin:0;padding:2px 0;color:${color('body')};font-size:13px;line-height:20px;white-space:nowrap;"><img src="${t.flagUrl}" width="16" height="11" alt="" style="vertical-align:middle;margin-right:5px;border-radius:1px;" />${t.code}</p>`).join('')}
          </div>
        </td>`
      )
      .join('')
    groupRows.push(`<tr>${cellsHtml}</tr>`)
  }

  return {
    subject: `The field is set — World Cup 2026 kicks off in ${daysUntilKickoff} days!`,
    html: brandedTemplate({
      preheader: `All 48 teams confirmed for FIFA World Cup 2026. ${daysUntilKickoff} days to go!`,
      heading: `All 48 Teams Are Confirmed!`,
      body: `
        ${greeting(userName)}
        ${paragraph(`The wait is over — all <strong>48 teams</strong> for the FIFA World Cup 2026 have been decided. Here's the full draw:`)}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
          ${groupRows.join('')}
        </table>
        ${statBlock({
          label: 'Kickoff: June 11, 2026',
          value: `${daysUntilKickoff} days to go`,
          variant: 'success',
        })}
        ${paragraph(`Now is the perfect time to get ready. Whether you need to create a new pool, join one, or spread the word about yours — here's what to do:`)}
        ${bulletList([
          `<strong>New here?</strong> Create a pool and invite your group.`,
          `<strong>Looking to join?</strong> Ask a friend for their pool code and jump in.`,
          `<strong>Already in a pool?</strong> Share your pool code with friends, family, and coworkers — the more people, the more fun!`,
        ])}
      `,
      ctaText: 'Get Started',
      ctaUrl: dashboardUrl,
    }),
  }
}

// --- Countdown Reminder Templates ---

export type CountdownMilestone = '60days' | '30days' | '14days' | '7days' | '1day'

// The urgency ramp: calm green while there is time, amber as it tightens, red on the
// eve. Previously three loose hexes per milestone; now one semantic variant.
const COUNTDOWN_CONFIG: Record<
  CountdownMilestone,
  {
    subject: (days: number) => string
    preheader: (days: number) => string
    heading: string
    emoji: string
    variant: CalloutVariant
  }
> = {
  '60days': {
    subject: (d) => `${d} days until the World Cup — time to get your pool ready!`,
    preheader: (d) => `FIFA World Cup 2026 kicks off in ${d} days. Create or join a pool now!`,
    heading: 'Two Months to Go!',
    emoji: '&#x1F3C6;',
    variant: 'success',
  },
  '30days': {
    subject: (d) => `One month to go — World Cup 2026 is almost here!`,
    preheader: (d) => `Just ${d} days until kickoff. Make sure your pool is ready!`,
    heading: 'One Month to Go!',
    emoji: '&#x26BD;',
    variant: 'success',
  },
  '14days': {
    subject: (d) => `Two weeks until kickoff — is your pool ready?`,
    preheader: (d) => `${d} days to go. Invite your friends before it's too late!`,
    heading: 'Two Weeks to Go!',
    emoji: '&#x1F525;',
    variant: 'warning',
  },
  '7days': {
    subject: (d) => `One week until the World Cup — predictions open soon!`,
    preheader: (d) => `Just ${d} days left. Get your pool and predictions ready!`,
    heading: 'One Week to Go!',
    emoji: '&#x1F6A8;',
    variant: 'warning',
  },
  '1day': {
    subject: () => `TOMORROW — FIFA World Cup 2026 kicks off!`,
    preheader: () => `It's almost here! Make sure your predictions are locked in.`,
    heading: "It's Tomorrow!",
    emoji: '&#x1F389;',
    variant: 'danger',
  },
}

const COUNTDOWN_BODY: Record<CountdownMilestone, (params: { daysUntilKickoff: number; dashboardUrl: string }) => string> = {
  '60days': ({ daysUntilKickoff }) => `
    ${greeting('{{{FIRST_NAME|there}}}')}
    ${paragraph(`The FIFA World Cup 2026 is just <strong>${daysUntilKickoff} days away</strong> and the excitement is building! All 48 teams have been confirmed and the group stage draw is set.`)}
    ${paragraph(`Now's the time to rally your friends, family, and coworkers:`)}
    ${bulletList([
      `<strong>Create a pool</strong> and share the code with your group`,
      `<strong>Join a pool</strong> if someone's already sent you a code`,
      `<strong>Spread the word</strong> — the more people, the better the competition`,
    ])}
  `,

  '30days': ({ daysUntilKickoff }) => `
    ${greeting('{{{FIRST_NAME|there}}}')}
    ${paragraph(`Can you believe it? The World Cup is just <strong>${daysUntilKickoff} days away</strong>. We're counting down and we hope you are too!`)}
    ${paragraph(`Here's what to do next:`)}
    ${bulletList([
      `<strong>Share your pool code</strong> with anyone who hasn't joined yet`,
      `<strong>Check the groups</strong> — start thinking about your predictions`,
      `<strong>Create another pool</strong> for a different friend group or office`,
    ])}
    ${paragraph(`Don't wait — the best pools are the ones that start early!`, { marginBottom: 0 })}
  `,

  '14days': ({ daysUntilKickoff }) => `
    ${greeting('{{{FIRST_NAME|there}}}')}
    ${paragraph(`We're just <strong>${daysUntilKickoff} days</strong> from the biggest World Cup in history. 48 teams. 3 host nations. This is going to be special.`)}
    ${paragraph(`Here's your checklist:`)}
    ${bulletList([
      `Last call to <strong>invite friends</strong> to your pools`,
      `Group Stage predictions will <strong>open soon</strong>`,
      `Start doing your <strong>homework on the groups</strong>`,
    ])}
  `,

  '7days': ({ daysUntilKickoff }) => `
    ${greeting('{{{FIRST_NAME|there}}}')}
    ${paragraph(`<strong>${daysUntilKickoff} days.</strong> That's it. The World Cup is almost here.`, { marginBottom: 16 })}
    ${panel(
      `${sectionLabel('Your pre-kickoff checklist')}
       ${paragraph(`&#9744; Invite any last friends<br/>&#9744; Make your Group Stage predictions when they open<br/>&#9744; Clear your schedule for June 11!`, { marginBottom: 0 })}`
    )}
  `,

  '1day': () => `
    ${greeting('{{{FIRST_NAME|there}}}')}
    ${lead(`IT'S ALMOST HERE.`, { marginBottom: 12 })}
    ${paragraph(`The FIFA World Cup 2026 kicks off <strong>tomorrow, June 11th</strong>. 48 teams. 104 matches. One champion.`)}
    ${bulletList([
      `Double-check your <strong>Group Stage predictions</strong>`,
      `Share your pool code one last time — the more the merrier`,
      `Get ready for the beautiful game`,
    ])}
    ${paragraph(`See you on the pitch. &#x26BD;`, { marginBottom: 0 })}
  `,
}

export function countdownReminderTemplate(params: {
  milestone: CountdownMilestone
  daysUntilKickoff: number
  dashboardUrl: string
}): { subject: string; html: string } {
  const { milestone, daysUntilKickoff, dashboardUrl } = params
  const config = COUNTDOWN_CONFIG[milestone]
  const bodyFn = COUNTDOWN_BODY[milestone]

  return {
    subject: config.subject(daysUntilKickoff),
    html: brandedTemplate({
      preheader: config.preheader(daysUntilKickoff),
      heading: `${config.emoji} ${config.heading}`,
      body: `
        ${bodyFn({ daysUntilKickoff, dashboardUrl })}
        ${statBlock({
          label: 'Kickoff: June 11, 2026',
          value: `${daysUntilKickoff} days`,
          variant: config.variant,
        })}
      `,
      ctaText: 'Go to Dashboard',
      ctaUrl: dashboardUrl,
    }),
  }
}

// --- Pending Predictions Reminder Templates ---

export function pendingPredictionsReminderTemplate(params: {
  firstName: string
  pools: {
    poolName: string
    predictionsLeft: number
    totalPredictions: number
    deadline: string
    daysLeft: number
    poolUrl: string
  }[]
}): { subject: string; html: string } {
  const { firstName, pools } = params

  const poolCount = pools.length
  const subject =
    poolCount === 1
      ? `You have predictions due for ${pools[0].poolName}`
      : `You have predictions due for ${poolCount} pools`

  const poolRows = pools
    .map((p) => {
      const deadlineFormatted = new Date(p.deadline).toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      })
      // Urgency ramp: blue while there is room, amber inside three days, red on the day.
      const variant: CalloutVariant =
        p.daysLeft <= 1 ? 'danger' : p.daysLeft <= 3 ? 'warning' : 'info'
      const daysText =
        p.daysLeft === 0
          ? 'Today!'
          : p.daysLeft === 1
            ? '1 day left'
            : `${p.daysLeft} days left`

      return callout(
        variant,
        `${calloutLine(variant, p.poolName, { bold: true, size: 16, marginBottom: 10 })}
         ${dataRows([
           {
             label: 'Predictions remaining',
             value: `${p.predictionsLeft} of ${p.totalPredictions}`,
             valueVariant: variant,
           },
           { label: 'Deadline', value: deadlineFormatted, valueVariant: variant },
           {
             label: 'Time remaining',
             value: daysText,
             emphasis: true,
             valueVariant: variant,
           },
         ])}
         ${secondaryButton('Make Predictions', p.poolUrl)}`,
        { marginBottom: 12 }
      )
    })
    .join('')

  return {
    subject,
    html: brandedTemplate({
      preheader: `You have ${poolCount === 1 ? 'predictions' : `predictions in ${poolCount} pools`} that still need to be submitted!`,
      heading: 'Predictions Still Needed!',
      body: `
        ${greeting(firstName)}
        ${paragraph(`You still have predictions to submit. Don't miss out on earning points!`, { marginBottom: 16 })}
        ${poolRows}
        ${paragraph(`Submit your predictions before the deadline — any unsaved predictions won't earn points!`, { marginBottom: 0 })}
      `,
    }),
  }
}

// --- Growth & Re-engagement Templates ---

export function emptyPoolNudgeTemplate(params: {
  firstName: string
  poolName: string
  poolCode: string
  memberCount: number
  dashboardUrl: string
}): { subject: string; html: string } {
  const { firstName, poolName, poolCode, dashboardUrl } = params
  return {
    subject: `Your pool "${poolName}" is waiting for members!`,
    html: brandedTemplate({
      preheader: `You created ${poolName} — now it's time to invite people and get the competition started!`,
      heading: 'Your Pool Needs Players!',
      body: `
        ${greeting(firstName)}
        ${paragraph(`You created <strong>${poolName}</strong> — great start! But a pool is no fun without people to compete against.`)}
        ${statBlock({ label: 'Your pool code', value: poolCode, variant: 'success' })}
        ${paragraph('Share this code with friends, family, or coworkers to get them in. The more people, the better the competition!')}
      `,
      ctaText: 'Go to Your Pool',
      ctaUrl: dashboardUrl,
    }),
  }
}

export function soloPoolNudgeTemplate(params: {
  firstName: string
  poolName: string
  poolCode: string
  memberCount: number
  dashboardUrl: string
}): { subject: string; html: string } {
  const { firstName, poolName, poolCode, dashboardUrl } = params
  return {
    subject: `You're the only one in "${poolName}" — invite your crew!`,
    html: brandedTemplate({
      preheader: `${poolName} has one member (you!). Share your pool code and get the competition going.`,
      heading: "It's Lonely at the Top",
      body: `
        ${greeting(firstName)}
        ${paragraph(`You're currently the only member of <strong>${poolName}</strong>. It's hard to have bragging rights with no one to brag to!`)}
        ${statBlock({ label: 'Share your pool code', value: poolCode, variant: 'info' })}
        ${paragraph('Text it to your group chat, drop it in Slack, or share it at the office. Pools are the most fun with 5+ people!')}
      `,
      ctaText: 'Go to Your Pool',
      ctaUrl: dashboardUrl,
    }),
  }
}

export function smallPoolBoostTemplate(params: {
  firstName: string
  poolName: string
  memberCount: number
  poolCode: string
  dashboardUrl: string
}): { subject: string; html: string } {
  const { firstName, poolName, memberCount, poolCode, dashboardUrl } = params
  return {
    subject: `"${poolName}" is growing — keep the momentum going!`,
    html: brandedTemplate({
      preheader: `You've got ${memberCount} members in ${poolName}. A few more and you'll have a real competition!`,
      heading: 'Your Pool Is Growing!',
      body: `
        ${greeting(firstName)}
        ${paragraph(`Nice work — <strong>${poolName}</strong> now has <strong>${memberCount} members</strong>. You're building something fun!`)}
        ${paragraph('Pools really come alive with 8-10+ people. One more share could make all the difference:')}
        ${statBlock({ label: 'Pool code', value: poolCode, variant: 'success' })}
        ${paragraph('Send it to anyone who loves football — the more the merrier!', { marginBottom: 0 })}
      `,
      ctaText: 'View Your Pool',
      ctaUrl: dashboardUrl,
    }),
  }
}

export function startAPoolTemplate(params: {
  firstName: string
  dashboardUrl: string
}): { subject: string; html: string } {
  const { firstName, dashboardUrl } = params
  return {
    subject: 'Love being in a pool? Start your own!',
    html: brandedTemplate({
      preheader: `You're already in a pool — now create one for your other group of friends, family, or coworkers!`,
      heading: 'Start Your Own Pool',
      body: `
        ${greeting(firstName)}
        ${paragraph(`You're already part of the action — but why stop at one pool?`)}
        ${paragraph('Create a pool for:')}
        ${bulletList([
          `Your <strong>office</strong> or work team`,
          `Your <strong>family</strong> group chat`,
          `Your <strong>fantasy league</strong> crew`,
          `Your <strong>local pub</strong> or sports bar`,
        ])}
        ${paragraph(`It only takes 30 seconds to set up. You'll be the commissioner!`, { marginBottom: 0 })}
      `,
      ctaText: 'Create a Pool',
      ctaUrl: `${dashboardUrl}/pools/create`,
    }),
  }
}

export function weMissYouTemplate(params: {
  firstName: string
  dashboardUrl: string
}): { subject: string; html: string } {
  const { firstName, dashboardUrl } = params
  return {
    subject: "The World Cup is coming — don't miss out!",
    html: brandedTemplate({
      preheader: `You signed up for SportPool but haven't joined a pool yet. The World Cup is around the corner!`,
      heading: "We Saved Your Spot",
      body: `
        ${greeting(firstName)}
        ${paragraph(`You created a SportPool account a while back but haven't joined a pool yet. The FIFA World Cup 2026 is getting closer and you don't want to miss the fun!`)}
        ${paragraph(`Here's how to get started:`)}
        ${bulletList([
          `<strong>Got a pool code?</strong> Join an existing pool in seconds`,
          `<strong>Want to run one?</strong> Create your own and invite friends`,
        ])}
        ${paragraph(`48 teams, 104 matches, and bragging rights on the line. Don't sit this one out.`, { marginBottom: 0 })}
      `,
      ctaText: 'Get Started',
      ctaUrl: dashboardUrl,
    }),
  }
}

export function readyToJoinTemplate(params: {
  firstName: string
  dashboardUrl: string
}): { subject: string; html: string } {
  const { firstName, dashboardUrl } = params
  return {
    subject: 'Ready to join a pool? Here\'s how to get started',
    html: brandedTemplate({
      preheader: `You signed up recently — now join or create a pool before the World Cup starts!`,
      heading: 'Time to Jump In!',
      body: `
        ${greeting(firstName)}
        ${paragraph(`Welcome to SportPool! You've signed up — now it's time to get in on the action.`)}
        ${panel(
          `${sectionLabel('Two ways to play')}
           ${paragraph(`<strong>1. Join a pool</strong> — Ask a friend for their pool code and enter it on the dashboard`, { marginBottom: 8 })}
           ${paragraph(`<strong>2. Create a pool</strong> — Set one up in 30 seconds and share the code with your group`, { marginBottom: 0 })}`
        )}
        ${paragraph(`The World Cup is coming — make sure you're part of the competition!`, { marginBottom: 0 })}
      `,
      ctaText: 'Go to Dashboard',
      ctaUrl: dashboardUrl,
    }),
  }
}

export function pastPredictorHypeTemplate(params: {
  firstName: string
  dashboardUrl: string
}): { subject: string; html: string } {
  const { firstName, dashboardUrl } = params
  return {
    subject: "You've done this before — World Cup 2026 is calling",
    html: brandedTemplate({
      preheader: `You're a proven predictor. The World Cup is approaching — time to defend your honor!`,
      heading: 'The Prediction Pro Returns',
      body: `
        ${greeting(firstName)}
        ${paragraph(`You've been here before — you know the thrill of nailing a prediction and watching your name climb the leaderboard.`)}
        ${paragraph(`The FIFA World Cup 2026 is around the corner, and this one is going to be <strong>bigger than ever</strong> — 48 teams, 104 matches, three host nations.`)}
        ${paragraph(`Here's what you can do right now:`)}
        ${bulletList([
          `<strong>Invite more people</strong> to your pools — bigger pool, bigger glory`,
          `<strong>Create a new pool</strong> for a different group`,
          `<strong>Study the groups</strong> — predictions open soon`,
        ])}
        ${paragraph(`You've got the experience. Time to put it to work.`, { marginBottom: 0 })}
      `,
      ctaText: 'Go to Dashboard',
      ctaUrl: dashboardUrl,
    }),
  }
}

// --- Post-Tournament Feedback Surveys ---
// TODO: confirm these URLs after publishing the Tally forms.
// Tally form IDs persist from draft → publish, so once published the
// public URL is https://tally.so/r/<formId>. Update if a form is re-created.
const POOL_ADMIN_FEEDBACK_SURVEY_URL = 'https://tally.so/r/Y59YEN'
const PLAYER_FEEDBACK_SURVEY_URL = 'https://tally.so/r/RGjJKK'

export function poolAdminFeedbackSurveyTemplate(params: {
  firstName: string
  dashboardUrl: string
}): { subject: string; html: string } {
  const { firstName } = params
  return {
    subject: 'How was running your World Cup pool? (3-min survey)',
    html: brandedTemplate({
      preheader: 'Six short questions on what worked, what didn\'t, and what we should build next.',
      heading: 'Help shape what comes next',
      body: `
        ${greeting(firstName)}
        ${paragraph(`Thanks for running a pool this tournament — it doesn't happen without admins like you doing the legwork. Now that the dust has settled, I'd love your honest take.`)}
        ${paragraph(`Six short questions, about three minutes. The answers shape what gets built before the next tournament — and which sports we tackle next.`)}
        ${bulletList([
          `What took the most work?`,
          `What worked well?`,
          `What was confusing or broken?`,
          `Would you run another pool with us?`,
        ])}
        ${paragraph(`Wild ideas, complaints, and kind words all welcome.`, { marginBottom: 0 })}
      `,
      ctaText: 'Take the survey',
      ctaUrl: POOL_ADMIN_FEEDBACK_SURVEY_URL,
    }),
  }
}

export function playerFeedbackSurveyTemplate(params: {
  firstName: string
  dashboardUrl: string
}): { subject: string; html: string } {
  const { firstName } = params
  return {
    subject: 'How was your World Cup? (2-min survey)',
    html: brandedTemplate({
      preheader: 'Five short questions on your favorite moment, biggest frustration, and what\'s next.',
      heading: 'What did you think?',
      body: `
        ${greeting(firstName)}
        ${paragraph(`Thanks for playing this tournament. Hopefully you had as much fun making picks as we had building it.`)}
        ${paragraph(`Five short questions, about two minutes. Your answers help us decide what to fix, what to keep, and which tournament to do next.`)}
        ${bulletList([
          `Favorite moment?`,
          `Biggest frustration?`,
          `Would you play again?`,
          `What sport would you want next?`,
        ])}
        ${paragraph(`Honest feedback is the best gift you can give a small team. Thanks in advance.`, { marginBottom: 0 })}
      `,
      ctaText: 'Take the survey',
      ctaUrl: PLAYER_FEEDBACK_SURVEY_URL,
    }),
  }
}

// --- Post-Tournament Feedback Follow-ups (thank-you + reminder in one) ---
// Sent to the same two audiences a few days after the surveys. Worded to land whether or
// not the recipient already responded (we can't tell who did). Plural "we" voice by
// preference. Same Tally URLs as the surveys, so responses land in the same forms.

export function poolAdminFollowupTemplate(params: {
  firstName: string
  dashboardUrl: string
}): { subject: string; html: string } {
  const { firstName } = params
  return {
    subject: 'Thanks for running a pool — one last nudge',
    html: brandedTemplate({
      preheader: 'Already sent your feedback? Thank you. If not, the survey\'s still open — about 3 minutes.',
      heading: 'Thank you — and a quick reminder',
      body: `
        ${greeting(firstName)}
        ${paragraph(`The World Cup's wrapped, and pools like yours are the whole reason it was any fun. Running one is real work — chasing picks, fielding questions, keeping everyone honest — and it doesn't happen without admins like you. Thank you.`)}
        ${paragraph(`A little while back we sent a short survey about what running your pool was actually like. <strong>If you already filled it out — genuinely, thank you.</strong> Those answers are exactly what we're using to decide what gets built before the next tournament.`)}
        ${paragraph(`<strong>If you haven't gotten to it yet, it's still open</strong> — six questions, about three minutes. Even a line or two makes a difference.`)}
        ${paragraph(`Either way, thanks for being part of this one.`, { marginBottom: 0 })}
      `,
      ctaText: 'Take the survey',
      ctaUrl: POOL_ADMIN_FEEDBACK_SURVEY_URL,
    }),
  }
}

export function playerFollowupTemplate(params: {
  firstName: string
  dashboardUrl: string
}): { subject: string; html: string } {
  const { firstName } = params
  return {
    subject: 'Thanks for playing — did we get your two cents?',
    html: brandedTemplate({
      preheader: 'Already did the survey? Thank you. If not, it\'s still open — about 2 minutes.',
      heading: 'Thanks for playing — one last thing',
      body: `
        ${greeting(firstName)}
        ${paragraph(`That's a wrap on the World Cup. Thanks for making your picks and sticking it out to the final whistle — the whole thing is more fun with more people in it.`)}
        ${paragraph(`A bit ago we sent a quick survey — favorite moment, biggest frustration, what you'd want next. <strong>If you already sent yours back, thank you, truly</strong> — we've read every single one.`)}
        ${paragraph(`<strong>If you haven't yet, it's still open and takes about two minutes.</strong> Your answer genuinely shapes what we do next — including which tournament or sport comes after this one.`)}
        ${paragraph(`Thanks either way. See you next tournament.`, { marginBottom: 0 })}
      `,
      ctaText: 'Take the survey',
      ctaUrl: PLAYER_FEEDBACK_SURVEY_URL,
    }),
  }
}

// --- Community Templates ---

export function pointsAdjustedTemplate(params: {
  userName: string
  poolName: string
  entryName: string
  adjustment: number
  reason: string
  newTotal: number
  poolUrl: string
}): { subject: string; html: string } {
  const { userName, poolName, entryName, adjustment, reason, newTotal, poolUrl } = params
  const sign = adjustment > 0 ? '+' : ''
  const adjustmentVariant: CalloutVariant = adjustment > 0 ? 'success' : 'danger'
  return {
    subject: `Points adjusted in ${poolName} (${sign}${adjustment})`,
    html: brandedTemplate({
      preheader: `Your points for ${entryName} in ${poolName} have been adjusted by ${sign}${adjustment}`,
      heading: 'Points Adjusted',
      body: `
        ${greeting(userName)}
        ${paragraph(`A pool admin has adjusted your points for <strong>${entryName}</strong> in <strong>${poolName}</strong>.`, { marginBottom: 16 })}
        ${panel(
          `${dataRows([
            { label: 'Adjustment', value: `${sign}${adjustment} pts`, emphasis: true, valueVariant: adjustmentVariant },
            { label: 'New total', value: `${newTotal} pts`, emphasis: true },
          ])}
           <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:10px 0 0;">
             <tr><td class="${cls.hairline}" style="border-top:1px solid ${color('hairline')};padding:10px 0 0;">
               ${sectionLabel('Reason')}
               ${paragraph(reason, { marginBottom: 0 })}
             </td></tr>
           </table>`
        )}
        ${paragraph('If you have questions about this adjustment, contact your pool admin.', { marginBottom: 0 })}
      `,
      ctaText: 'View Leaderboard',
      ctaUrl: `${poolUrl}?tab=leaderboard`,
    }),
  }
}

export function bracketFixTemplate(params: {
  userName: string
  poolName: string
  entryName: string
  poolUrl: string
}): { subject: string; html: string } {
  const { userName, poolName, entryName, poolUrl } = params
  return {
    subject: `Action needed: re-submit your knockout picks in ${poolName}`,
    html: brandedTemplate({
      preheader: `We aligned the bracket with FIFA's official schedule. Your group and R32 picks are safe; please re-do R16 through the final.`,
      heading: 'Bracket aligned with FIFA — please re-pick R16 onward',
      body: `
        ${greeting(userName)}
        ${paragraph(`A pool member spotted that our knockout-stage match numbers and pairings did not match FIFA's official 2026 World Cup schedule. We've corrected this so every match number, venue, and bracket route now matches FIFA exactly.`)}
        ${callout(
          'success',
          `${calloutLine('success', `What's preserved for <strong>${entryName}</strong>:`, { bold: true, marginBottom: 8 })}
           ${calloutList('success', [
             'All your group-stage predictions',
             `All your Round of 32 picks (the fixtures didn't change &mdash; just their match numbers)`,
           ])}`
        )}
        ${callout(
          'warning',
          `${calloutLine('warning', 'What needs your attention:', { bold: true, marginBottom: 8 })}
           ${calloutLine('warning', 'Because the bracket routes changed, your picks for these rounds need to be re-submitted:', { size: 13, marginBottom: 8 })}
           ${calloutList('warning', [
             'Round of 16',
             'Quarter-finals',
             'Semi-finals',
             'Third-place match',
             'Final',
           ])}`
        )}
        ${paragraph(`The tournament starts June 11, so you have time to re-do those picks. Open your bracket and step through R16 onward whenever you're ready.`)}
        ${paragraph(`Sorry for the inconvenience &mdash; we want every fixture, route, and Annex C third-place assignment to match FIFA's official bracket so scoring is fair.`, { marginBottom: 0 })}
      `,
      ctaText: 'Update My Picks',
      ctaUrl: `${poolUrl}?tab=predictions`,
    }),
  }
}

export function mentionNotificationTemplate(params: {
  recipientName: string
  mentionerName: string
  poolName: string
  messageContent: string
  poolUrl: string
}): { subject: string; html: string } {
  const { recipientName, mentionerName, poolName, messageContent, poolUrl } = params
  const truncated = messageContent.length > 200 ? messageContent.slice(0, 200) + '...' : messageContent
  return {
    subject: `@${mentionerName} mentioned you in ${poolName}`,
    html: brandedTemplate({
      preheader: `${mentionerName} mentioned you in the ${poolName} chat`,
      heading: `You were mentioned in ${poolName}`,
      body: `
        ${greeting(recipientName)}
        ${paragraph(`<strong>${mentionerName}</strong> mentioned you in the <strong>${poolName}</strong> chat:`, { marginBottom: 16 })}
        ${quoteBlock(truncated)}
      `,
      ctaText: 'View in Chat',
      ctaUrl: `${poolUrl}?tab=community`,
    }),
  }
}
