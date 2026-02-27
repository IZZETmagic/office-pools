const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://sportpool.io'

function baseTemplate(params: {
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
            <a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#a3a3a3;text-decoration:none;">Unsubscribe</a>
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
