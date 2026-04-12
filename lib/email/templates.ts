const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'

export function baseTemplate(params: {
  preheader: string
  heading: string
  body: string
  ctaText?: string
  ctaUrl?: string
}): string {
  const { preheader, heading, body, ctaText, ctaUrl } = params

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <span style="display:none;max-height:0;overflow:hidden;">${preheader}</span>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,#16a34a,#15803d);padding:24px 32px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;letter-spacing:-0.025em;">Sport Pool</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#171717;font-size:18px;font-weight:600;">${heading}</h2>
          ${body}
          ${ctaText && ctaUrl ? `
          <div style="text-align:center;margin:24px 0;">
            <a href="${ctaUrl}" style="display:inline-block;padding:12px 32px;background:#16a34a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">${ctaText}</a>
          </div>` : ''}
        </td></tr>
        <tr><td style="padding:16px 32px;border-top:1px solid #e5e5e5;text-align:center;">
          <p style="margin:0;color:#a3a3a3;font-size:12px;line-height:1.5;">
            <a href="${APP_URL}" style="color:#a3a3a3;text-decoration:none;">Sport Pool</a> &middot;
            <a href="${APP_URL}/profile?tab=settings" style="color:#a3a3a3;text-decoration:none;">Notification Settings</a> &middot;
            <a href="${APP_URL}/profile?tab=settings" style="color:#a3a3a3;text-decoration:none;">Unsubscribe</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
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
    html: baseTemplate({
      preheader: `You've joined ${poolName} - time to make your predictions!`,
      heading: `Welcome to ${poolName}!`,
      body: `
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Hi ${userName},</p>
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">You've successfully joined the pool <strong>${poolName}</strong> (code: <code style="background:#f5f5f5;padding:2px 6px;border-radius:4px;font-size:13px;">${poolCode}</code>).</p>
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Head over to the pool and start making your predictions before the deadline!</p>
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
    html: baseTemplate({
      preheader: `Your predictions for ${entryName} in ${poolName} are locked in!`,
      heading: 'Predictions Submitted!',
      body: `
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Hi ${userName},</p>
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Your predictions for <strong>${entryName}</strong> in <strong>${poolName}</strong> have been submitted successfully.</p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="color:#166534;margin:0;font-size:14px;"><strong>${matchCount}</strong> match predictions locked in</p>
        </div>
        <p style="color:#525252;line-height:1.6;margin:0;">Good luck!</p>
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
    html: baseTemplate({
      preheader: `The deadline passed and your draft for ${entryName} was automatically submitted`,
      heading: 'Draft Auto-Submitted',
      body: `
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Hi ${userName},</p>
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">The prediction deadline for <strong>${poolName}</strong> has passed. Your draft predictions for <strong>${entryName}</strong> were automatically submitted.</p>
        <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="color:#92400e;margin:0;font-size:14px;"><strong>${matchCount}</strong> of <strong>${totalMatches}</strong> match predictions submitted${isPartial ? ' (partial)' : ''}</p>
        </div>
        ${isPartial ? '<p style="color:#525252;line-height:1.6;margin:0 0 12px;">Matches without predictions will not earn any points.</p>' : ''}
        <p style="color:#525252;line-height:1.6;margin:0;">Good luck!</p>
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
  const entriesList = unsubmittedEntries
    .map((e) => `<li style="color:#525252;padding:2px 0;">${e}</li>`)
    .join('')
  return {
    subject: `Prediction deadline approaching for ${poolName}`,
    html: baseTemplate({
      preheader: `Less than 24 hours to submit your predictions for ${poolName}!`,
      heading: 'Deadline Approaching!',
      body: `
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Hi ${userName},</p>
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">The prediction deadline for <strong>${poolName}</strong> is <strong>${deadline}</strong>.</p>
        <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="color:#92400e;margin:0 0 8px;font-weight:600;">Unsubmitted entries:</p>
          <ul style="margin:0;padding-left:20px;">${entriesList}</ul>
        </div>
        <p style="color:#525252;line-height:1.6;margin:0;">Don't miss out - submit your predictions now!</p>
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
  const entriesHtml = entries
    .map(
      (e) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f5f5f5;color:#525252;font-size:14px;">${e.entryName}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f5f5f5;color:#525252;font-size:14px;text-align:right;font-weight:600;">
          ${e.pointsEarned > 0 ? `+${e.pointsEarned} pts` : '0 pts'}
          ${e.isExact ? ' <span style="color:#16a34a;">&#10003; Exact</span>' : ''}
        </td>
      </tr>`
    )
    .join('')

  return {
    subject: `${scoreStr} - ${poolName} results`,
    html: baseTemplate({
      preheader: `${scoreStr} - see how your predictions did!`,
      heading: 'Match Result',
      body: `
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Hi ${userName},</p>
        <div style="background:#f5f5f5;border-radius:8px;padding:16px;text-align:center;margin:0 0 16px;">
          <p style="margin:0;font-size:18px;font-weight:700;color:#171717;">${scoreStr}</p>
        </div>
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Here's how your entries did in <strong>${poolName}</strong>:</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
          ${entriesHtml}
        </table>
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
    html: baseTemplate({
      preheader: `${entryName}: #${oldRank} → #${newRank} in ${poolName}`,
      heading: `Rank Update ${emoji}`,
      body: `
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Hi ${userName},</p>
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Your entry <strong>${entryName}</strong> in <strong>${poolName}</strong> has ${improved ? 'moved up' : 'changed position'}:</p>
        <div style="background:${improved ? '#f0fdf4' : '#fef2f2'};border:1px solid ${improved ? '#bbf7d0' : '#fecaca'};border-radius:8px;padding:16px;text-align:center;margin:16px 0;">
          <p style="margin:0;font-size:24px;font-weight:700;color:${improved ? '#166534' : '#991b1b'};">#${oldRank} &rarr; #${newRank}</p>
          <p style="margin:4px 0 0;color:#737373;font-size:13px;">${totalPoints} total points</p>
        </div>
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
  const topFiveHtml = topFive
    .map(
      (e) => `
      <tr>
        <td style="padding:6px 12px;border-bottom:1px solid #f5f5f5;color:#525252;font-size:14px;">#${e.rank}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #f5f5f5;color:#525252;font-size:14px;">${e.entryName}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #f5f5f5;color:#525252;font-size:14px;text-align:right;font-weight:600;">${e.points} pts</td>
      </tr>`
    )
    .join('')

  return {
    subject: `Weekly recap: #${currentRank} in ${poolName}`,
    html: baseTemplate({
      preheader: `You're ranked #${currentRank} of ${totalEntrants} in ${poolName} this week`,
      heading: `Weekly Recap - ${poolName}`,
      body: `
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Hi ${userName},</p>
        <p style="color:#525252;line-height:1.6;margin:0 0 16px;">Here's your weekly standings update for <strong>${poolName}</strong>:</p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;text-align:center;margin:0 0 16px;">
          <p style="margin:0;font-size:14px;color:#166534;">Your Rank</p>
          <p style="margin:4px 0;font-size:28px;font-weight:700;color:#166534;">#${currentRank} <span style="font-size:14px;font-weight:400;">of ${totalEntrants}</span></p>
          <p style="margin:4px 0 0;color:#737373;font-size:13px;">${totalPoints} total pts (+${weekPoints} this week)</p>
        </div>
        <p style="color:#525252;line-height:1.6;margin:0 0 8px;font-weight:600;">Top 5:</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;">
          ${topFiveHtml}
        </table>
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
    html: baseTemplate({
      preheader: `Your predictions for ${entryName} have been unlocked for editing`,
      heading: 'Predictions Unlocked',
      body: `
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Hi ${userName},</p>
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">A pool admin has unlocked your predictions for <strong>${entryName}</strong> in <strong>${poolName}</strong>.</p>
        <p style="color:#525252;line-height:1.6;margin:0;">You can now edit and resubmit your predictions.</p>
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
    html: baseTemplate({
      preheader: `You are no longer a member of ${poolName}`,
      heading: 'Removed from Pool',
      body: `
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Hi ${userName},</p>
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">A pool admin has removed you from <strong>${poolName}</strong>.</p>
        <p style="color:#525252;line-height:1.6;margin:0;">If you believe this was a mistake, please contact the pool administrator.</p>
      `,
      ctaText: 'Browse Pools',
      ctaUrl: `${APP_URL}/pools?tab=discover`,
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
    html: baseTemplate({
      preheader: `The prediction deadline for ${poolName} has been changed`,
      heading: 'Deadline Updated',
      body: `
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Hi ${userName},</p>
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">The prediction deadline for <strong>${poolName}</strong> has been updated.</p>
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;text-align:center;margin:16px 0;">
          <p style="margin:0;color:#1e40af;font-weight:600;">New Deadline</p>
          <p style="margin:4px 0 0;color:#1e40af;font-size:16px;">${newDeadline}</p>
        </div>
        <p style="color:#525252;line-height:1.6;margin:0;">Make sure your predictions are submitted before then!</p>
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
    html: baseTemplate({
      preheader: `${roundName} is ready! Make your predictions for ${matchCount} matches.`,
      heading: `${roundName} Predictions Open!`,
      body: `
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Hi ${userName},</p>
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">The <strong>${roundName}</strong> is now open for predictions in <strong>${poolName}</strong>!</p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="color:#166534;margin:0 0 8px;font-size:14px;font-weight:600;">${matchCount} matches to predict</p>
          <p style="color:#166534;margin:0;font-size:13px;">Deadline: ${deadlineFormatted}</p>
        </div>
        <p style="color:#525252;line-height:1.6;margin:0;">Head over to the pool and make your predictions before the deadline!</p>
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
    html: baseTemplate({
      preheader: `Your ${roundName} predictions for ${entryName} in ${poolName} are locked in!`,
      heading: `${roundName} Predictions Submitted!`,
      body: `
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Hi ${userName},</p>
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Your <strong>${roundName}</strong> predictions for <strong>${entryName}</strong> in <strong>${poolName}</strong> have been submitted.</p>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="color:#166534;margin:0;font-size:14px;"><strong>${matchCount}</strong> match predictions locked in</p>
        </div>
        <p style="color:#525252;line-height:1.6;margin:0;">Good luck! Points will be awarded as matches complete.</p>
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
    html: baseTemplate({
      preheader: `Your draft ${roundName} predictions for ${entryName} were auto-submitted.`,
      heading: `${roundName} Auto-Submitted`,
      body: `
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Hi ${userName},</p>
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">The deadline for <strong>${roundName}</strong> in <strong>${poolName}</strong> has passed. Your draft predictions for <strong>${entryName}</strong> were automatically submitted.</p>
        <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="color:#92400e;margin:0;font-size:14px;"><strong>${matchCount}</strong> of <strong>${totalRoundMatches}</strong> matches had predictions saved</p>
          ${matchCount < totalRoundMatches ? `<p style="color:#92400e;margin:4px 0 0;font-size:13px;">Matches without predictions will score 0 points.</p>` : ''}
        </div>
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
  const entriesList = unsubmittedEntries.map(e => `<li style="color:#92400e;font-size:13px;">${e}</li>`).join('')
  return {
    subject: `Reminder: ${roundName} predictions closing soon - ${poolName}`,
    html: baseTemplate({
      preheader: `Don't miss out! ${roundName} predictions close soon.`,
      heading: `${roundName} Deadline Approaching`,
      body: `
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Hi ${userName},</p>
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">The <strong>${roundName}</strong> deadline for <strong>${poolName}</strong> is approaching.</p>
        <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="color:#92400e;margin:0 0 8px;font-weight:600;">Deadline: ${deadlineFormatted}</p>
          ${unsubmittedEntries.length > 0 ? `
          <p style="color:#92400e;margin:0 0 4px;font-size:13px;">Unsubmitted entries:</p>
          <ul style="margin:0;padding-left:20px;">${entriesList}</ul>
          ` : ''}
        </div>
        <p style="color:#525252;line-height:1.6;margin:0;">Submit your predictions before time runs out!</p>
      `,
      ctaText: 'Submit Predictions',
      ctaUrl: poolUrl,
    }),
  }
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
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;">
            <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:0.05em;white-space:nowrap;">Group ${g.letter}</p>
            ${g.teams.map((t) => `<p style="margin:0;padding:2px 0;color:#374151;font-size:13px;line-height:1.5;white-space:nowrap;"><img src="${t.flagUrl}" width="16" height="11" alt="" style="vertical-align:middle;margin-right:5px;border-radius:1px;" />${t.code}</p>`).join('')}
          </div>
        </td>`
      )
      .join('')
    groupRows.push(`<tr>${cellsHtml}</tr>`)
  }

  return {
    subject: `The field is set — World Cup 2026 kicks off in ${daysUntilKickoff} days!`,
    html: baseTemplate({
      preheader: `All 48 teams confirmed for FIFA World Cup 2026. ${daysUntilKickoff} days to go!`,
      heading: `All 48 Teams Are Confirmed!`,
      body: `
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Hi ${userName},</p>
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">The wait is over — all <strong>48 teams</strong> for the FIFA World Cup 2026 have been decided. Here's the full draw:</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
          ${groupRows.join('')}
        </table>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;text-align:center;margin:16px 0;">
          <p style="margin:0;font-size:14px;color:#166534;">Kickoff: <strong>June 11, 2026</strong></p>
          <p style="margin:4px 0 0;font-size:24px;font-weight:700;color:#166534;">${daysUntilKickoff} days to go</p>
        </div>
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Now is the perfect time to get ready. Whether you need to create a new pool, join one, or spread the word about yours — here's what to do:</p>
        <ul style="color:#525252;font-size:14px;line-height:1.8;margin:0 0 12px;padding-left:20px;">
          <li><strong>New here?</strong> Create a pool and invite your group.</li>
          <li><strong>Looking to join?</strong> Ask a friend for their pool code and jump in.</li>
          <li><strong>Already in a pool?</strong> Share your pool code with friends, family, and coworkers — the more people, the more fun!</li>
        </ul>
      `,
      ctaText: 'Get Started',
      ctaUrl: dashboardUrl,
    }),
  }
}

// --- Countdown Reminder Templates ---

export type CountdownMilestone = '60days' | '30days' | '14days' | '7days' | '1day'

const COUNTDOWN_CONFIG: Record<
  CountdownMilestone,
  {
    subject: (days: number) => string
    preheader: (days: number) => string
    heading: string
    emoji: string
    accentBg: string
    accentBorder: string
    accentText: string
  }
> = {
  '60days': {
    subject: (d) => `${d} days until the World Cup — time to get your pool ready!`,
    preheader: (d) => `FIFA World Cup 2026 kicks off in ${d} days. Create or join a pool now!`,
    heading: 'Two Months to Go!',
    emoji: '&#x1F3C6;',
    accentBg: '#f0fdf4',
    accentBorder: '#bbf7d0',
    accentText: '#166534',
  },
  '30days': {
    subject: (d) => `One month to go — World Cup 2026 is almost here!`,
    preheader: (d) => `Just ${d} days until kickoff. Make sure your pool is ready!`,
    heading: 'One Month to Go!',
    emoji: '&#x26BD;',
    accentBg: '#f0fdf4',
    accentBorder: '#bbf7d0',
    accentText: '#166534',
  },
  '14days': {
    subject: (d) => `Two weeks until kickoff — is your pool ready?`,
    preheader: (d) => `${d} days to go. Invite your friends before it's too late!`,
    heading: 'Two Weeks to Go!',
    emoji: '&#x1F525;',
    accentBg: '#fffbeb',
    accentBorder: '#fde68a',
    accentText: '#92400e',
  },
  '7days': {
    subject: (d) => `One week until the World Cup — predictions open soon!`,
    preheader: (d) => `Just ${d} days left. Get your pool and predictions ready!`,
    heading: 'One Week to Go!',
    emoji: '&#x1F6A8;',
    accentBg: '#fffbeb',
    accentBorder: '#fde68a',
    accentText: '#92400e',
  },
  '1day': {
    subject: () => `TOMORROW — FIFA World Cup 2026 kicks off!`,
    preheader: () => `It's almost here! Make sure your predictions are locked in.`,
    heading: "It's Tomorrow!",
    emoji: '&#x1F389;',
    accentBg: '#fef2f2',
    accentBorder: '#fecaca',
    accentText: '#991b1b',
  },
}

const COUNTDOWN_BODY: Record<CountdownMilestone, (params: { userName: string; daysUntilKickoff: number; poolCount: number; dashboardUrl: string }) => string> = {
  '60days': ({ userName, daysUntilKickoff, poolCount, dashboardUrl }) => `
    <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Hi ${userName},</p>
    <p style="color:#525252;line-height:1.6;margin:0 0 12px;">The FIFA World Cup 2026 is just <strong>${daysUntilKickoff} days away</strong> and the excitement is building! All 48 teams have been confirmed and the group stage draw is set.</p>
    <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Now's the time to rally your friends, family, and coworkers:</p>
    <ul style="color:#525252;font-size:14px;line-height:1.8;margin:0 0 12px;padding-left:20px;">
      <li><strong>Create a pool</strong> and share the code with your group</li>
      <li><strong>Join a pool</strong> if someone's already sent you a code</li>
      <li><strong>Spread the word</strong> — the more people, the better the competition</li>
    </ul>
    ${poolCount > 0 ? `<p style="color:#525252;line-height:1.6;margin:0;">You're in <strong>${poolCount} pool${poolCount > 1 ? 's' : ''}</strong> so far. Keep inviting!</p>` : `<p style="color:#525252;line-height:1.6;margin:0;">You haven't joined a pool yet — get started now!</p>`}
  `,

  '30days': ({ userName, daysUntilKickoff, poolCount }) => `
    <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Hi ${userName},</p>
    <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Can you believe it? The World Cup is just <strong>${daysUntilKickoff} days away</strong>. We're counting down and we hope you are too!</p>
    ${poolCount > 0 ? `
    <p style="color:#525252;line-height:1.6;margin:0 0 12px;">You're in <strong>${poolCount} pool${poolCount > 1 ? 's' : ''}</strong>. Here's what to do:</p>
    <ul style="color:#525252;font-size:14px;line-height:1.8;margin:0 0 12px;padding-left:20px;">
      <li><strong>Share your pool code</strong> with anyone who hasn't joined yet</li>
      <li><strong>Check the groups</strong> — start thinking about your predictions</li>
      <li><strong>Create another pool</strong> for a different friend group or office</li>
    </ul>
    ` : `
    <p style="color:#525252;line-height:1.6;margin:0 0 12px;">There's still time to get in on the action:</p>
    <ul style="color:#525252;font-size:14px;line-height:1.8;margin:0 0 12px;padding-left:20px;">
      <li><strong>Create a pool</strong> and become the organizer</li>
      <li><strong>Join a pool</strong> using a friend's code</li>
    </ul>
    `}
    <p style="color:#525252;line-height:1.6;margin:0;">Don't wait — the best pools are the ones that start early!</p>
  `,

  '14days': ({ userName, daysUntilKickoff, poolCount }) => `
    <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Hi ${userName},</p>
    <p style="color:#525252;line-height:1.6;margin:0 0 12px;">We're just <strong>${daysUntilKickoff} days</strong> from the biggest World Cup in history. 48 teams. 3 host nations. This is going to be special.</p>
    ${poolCount > 0 ? `
    <p style="color:#525252;line-height:1.6;margin:0 0 12px;">You're in <strong>${poolCount} pool${poolCount > 1 ? 's' : ''}</strong> — nice! Here's your checklist:</p>
    <ul style="color:#525252;font-size:14px;line-height:1.8;margin:0 0 12px;padding-left:20px;">
      <li>Last call to <strong>invite friends</strong> to your pools</li>
      <li>Group Stage predictions will <strong>open soon</strong></li>
      <li>Start doing your <strong>homework on the groups</strong></li>
    </ul>
    ` : `
    <p style="color:#525252;line-height:1.6;margin:0 0 12px;">It's not too late! Create or join a pool and be part of the action.</p>
    `}
  `,

  '7days': ({ userName, daysUntilKickoff, poolCount }) => `
    <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Hi ${userName},</p>
    <p style="color:#525252;line-height:1.6;margin:0 0 16px;"><strong>${daysUntilKickoff} days.</strong> That's it. The World Cup is almost here.</p>
    ${poolCount > 0 ? `
    <div style="background:#f5f5f5;border-radius:8px;padding:16px;margin:0 0 16px;">
      <p style="color:#171717;margin:0 0 8px;font-weight:600;">Your pre-kickoff checklist:</p>
      <p style="color:#525252;margin:0;font-size:14px;line-height:1.8;">&#9745; Joined ${poolCount} pool${poolCount > 1 ? 's' : ''}<br/>&#9744; Invite any last friends<br/>&#9744; Make your Group Stage predictions when they open<br/>&#9744; Clear your schedule for June 11!</p>
    </div>
    ` : `
    <p style="color:#525252;line-height:1.6;margin:0 0 12px;">You're not in a pool yet! There's still time — create one or ask a friend for their pool code.</p>
    `}
  `,

  '1day': ({ userName, poolCount }) => `
    <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Hi ${userName},</p>
    <p style="color:#525252;line-height:1.6;margin:0 0 12px;font-size:16px;"><strong>IT'S ALMOST HERE.</strong></p>
    <p style="color:#525252;line-height:1.6;margin:0 0 12px;">The FIFA World Cup 2026 kicks off <strong>tomorrow, June 11th</strong>. 48 teams. 104 matches. One champion.</p>
    ${poolCount > 0 ? `
    <p style="color:#525252;line-height:1.6;margin:0 0 12px;">You're in <strong>${poolCount} pool${poolCount > 1 ? 's' : ''}</strong>. Make sure your predictions are in!</p>
    <ul style="color:#525252;font-size:14px;line-height:1.8;margin:0 0 12px;padding-left:20px;">
      <li>Double-check your <strong>Group Stage predictions</strong></li>
      <li>Share your pool code one last time — the more the merrier</li>
      <li>Get ready for the beautiful game</li>
    </ul>
    ` : `
    <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Last chance to join a pool before kickoff! Ask a friend for their code or create your own.</p>
    `}
    <p style="color:#525252;line-height:1.6;margin:0;">See you on the pitch. &#x26BD;</p>
  `,
}

export function countdownReminderTemplate(params: {
  userName: string
  milestone: CountdownMilestone
  daysUntilKickoff: number
  poolCount: number
  dashboardUrl: string
}): { subject: string; html: string } {
  const { userName, milestone, daysUntilKickoff, poolCount, dashboardUrl } = params
  const config = COUNTDOWN_CONFIG[milestone]
  const bodyFn = COUNTDOWN_BODY[milestone]

  return {
    subject: config.subject(daysUntilKickoff),
    html: baseTemplate({
      preheader: config.preheader(daysUntilKickoff),
      heading: `${config.emoji} ${config.heading}`,
      body: `
        ${bodyFn({ userName, daysUntilKickoff, poolCount, dashboardUrl })}
        <div style="background:${config.accentBg};border:1px solid ${config.accentBorder};border-radius:8px;padding:16px;text-align:center;margin:16px 0;">
          <p style="margin:0;font-size:14px;color:${config.accentText};">Kickoff: <strong>June 11, 2026</strong></p>
          <p style="margin:4px 0 0;font-size:28px;font-weight:700;color:${config.accentText};">${daysUntilKickoff} days</p>
        </div>
      `,
      ctaText: poolCount > 0 ? 'Go to Dashboard' : 'Create or Join a Pool',
      ctaUrl: dashboardUrl,
    }),
  }
}

// --- Community Templates ---

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
    html: baseTemplate({
      preheader: `${mentionerName} mentioned you in the ${poolName} chat`,
      heading: `You were mentioned in ${poolName}`,
      body: `
        <p style="color:#525252;line-height:1.6;margin:0 0 12px;">Hi ${recipientName},</p>
        <p style="color:#525252;line-height:1.6;margin:0 0 16px;"><strong>${mentionerName}</strong> mentioned you in the <strong>${poolName}</strong> chat:</p>
        <div style="background:#f5f5f5;border-left:3px solid #16a34a;padding:12px 16px;border-radius:0 8px 8px 0;margin:0 0 16px;">
          <p style="color:#404040;line-height:1.6;margin:0;font-size:14px;">${truncated}</p>
        </div>
      `,
      ctaText: 'View in Chat',
      ctaUrl: `${poolUrl}?tab=community`,
    }),
  }
}
