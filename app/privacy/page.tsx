import Link from 'next/link'
import type { Metadata } from 'next'
import { PublicNav } from '@/components/PublicNav'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'Privacy Policy for SportPool — learn how we collect, use, and protect your personal information.',
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-surface">
      {/* Navigation */}
      <PublicNav />

      {/* Header */}
      <section className="py-16 sm:py-24 bg-surface-secondary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-neutral-900">
              Privacy Policy
            </h1>
            <p className="mt-4 text-lg text-neutral-700 max-w-2xl mx-auto">
              Your privacy matters to us. This policy explains how we handle your information.
            </p>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="py-16 sm:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-sm text-neutral-500 mb-12">Last updated: September 7, 2026</p>

          <div className="space-y-10">
            {/* 1. Overview */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                1. Overview
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  SportPool (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates the website at sportpool.io and the SportPool mobile apps for iOS and Android (together, the &quot;Service&quot;). This Privacy Policy describes how we collect, use, and protect your personal information when you use our Service.
                </p>
                <p>
                  SportPool is a social prediction platform. You join or create a pool built around a competition &mdash; a tournament such as the FIFA World Cup, or a league season such as the Premier League &mdash; and make predictions that are scored against real results. Different pools run different games (Pick&apos;em, Predict the Table, Last Man Standing, and Showdown head-to-head duels), and the information we hold about you depends in part on which of them you play.
                </p>
                <p>
                  By using SportPool, you agree to the collection and use of information as described in this policy. If you do not agree, please do not use the Service.
                </p>
              </div>
            </div>

            {/* 2. Information We Collect */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                2. Information We Collect
              </h2>
              <div className="space-y-4 text-neutral-700 leading-relaxed">
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-2">Account Information</h3>
                  <p>
                    When you create an account, we collect your full name, email address, and username. Your password is securely handled by our authentication provider and is not stored in plain text.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-2">Activity Data</h3>
                  <p>
                    We collect data related to your use of the Service. Depending on the pools you join, this includes:
                  </p>
                  <ul className="list-disc pl-6 mt-2 space-y-1">
                    <li>Your pool memberships, entries, and any pool settings you configure as an administrator</li>
                    <li>Your predictions &mdash; match scorelines and bracket picks, predicted final league tables, Last Man Standing club selections, and any other picks a pool&apos;s game asks for</li>
                    <li>Your scores, points breakdowns, leaderboard rankings, and weekly movement</li>
                    <li>In Showdown pools, the opponent you were drawn against each matchweek, the result of that duel, and your running head-to-head record</li>
                    <li>In Last Man Standing pools, whether you are still in and the round in which you were eliminated</li>
                    <li>Derived statistics about how you play &mdash; your recent form, streaks, hit rate, exact-score count, and how your picks compare with the rest of your pool</li>
                    <li>Experience points, levels, and badges you unlock, and whether you have seen the notification for each</li>
                  </ul>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-2">Purchases and Pool Upgrades</h3>
                  <p>
                    Pools can be upgraded to a paid tier. Checkout is handled entirely by <strong>Paddle</strong>, which acts as the merchant of record and is the legal seller of the transaction. You are sent to Paddle&apos;s hosted checkout to pay, and your card, bank, and billing details are entered on Paddle&apos;s systems, not ours.
                  </p>
                  <p className="mt-2">
                    <strong>We never see, receive, or store your card number, CVV, or bank details.</strong> What we do store is a record of the purchase: the Paddle transaction and customer identifiers, the price identifier and tier purchased, the amount and currency, the pool it applied to, the account that bought it, and the date. We use that record to unlock the tier, to support you if something goes wrong, and to keep accurate financial records.
                  </p>
                  <p className="mt-2">
                    Paddle&apos;s own handling of your payment data is governed by{' '}
                    <a href="https://www.paddle.com/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-primary-600 hover:text-primary-700 font-medium transition">
                      Paddle&apos;s privacy policy
                    </a>
                    . See our{' '}
                    <Link href="/refund-policy" className="text-primary-600 hover:text-primary-700 font-medium transition">
                      Refund Policy
                    </Link>{' '}
                    for how purchases and refunds work.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-2">Entry-Fee Tracking</h3>
                  <p>
                    Separately from any purchase made through SportPool, pool administrators may track whether members have paid an entry fee to <em>that pool</em>. If an admin marks your entry as paid, we store a paid/unpaid flag and the date it was recorded. <strong>SportPool does not collect, process, or hold entry fees, prize money, or payouts, and no card, bank, or payment-processor data is collected or stored for them.</strong> Any actual collection of those fees happens between you and your pool administrator, outside the Service.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-2">Technical Data</h3>
                  <p>
                    We may collect technical information such as your IP address, browser type and version, device information, and user agent string. This data is collected when you accept our Terms of Service and when you interact with certain features of the Service.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-2">Cookies &amp; Analytics Data</h3>
                  <p>
                    We use cookies and similar technologies to keep you signed in and, where enabled, to understand how visitors use the Service. See Section 4 for the full list and purpose of each cookie.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-2">Presence and Activity Signals</h3>
                  <p>
                    So that pool members can see who is around, we record and keep a short presence record for your account: when you were last seen, whether you are currently active, which pool you are currently viewing, and whether you are on the web or in the mobile app. The mobile app updates this roughly every 25 seconds while it is open on screen, and marks you inactive as soon as it is backgrounded. Other members of a pool you share can see that you are online and in that pool. Typing indicators are transmitted live to the members of the pool you are typing in and are not stored.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-2">Local Device Storage</h3>
                  <p>
                    <strong>On the web,</strong> we store a small amount of data in your browser&apos;s local storage: your light/dark color-mode preference (<code className="text-sm">sport-pool-color-mode</code>), and temporary backups of in-progress predictions (<code className="text-sm">predictions_backup_*</code>) so you don&apos;t lose work if you go offline or refresh the page. This data lives on your device only and is cleared when you clear your browser data.
                  </p>
                  <p className="mt-2">
                    <strong>In the mobile app,</strong> your sign-in session is held in your device&apos;s secure keystore (Keychain on iOS, Keystore on Android) rather than in ordinary app storage, and the app keeps a local cache of pool, fixture, and leaderboard data so screens load quickly and work briefly offline. Both are removed when you sign out or delete the app.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-2">Banter (Pool Chat)</h3>
                  <p>
                    Every pool has a group chat called Banter. When you take part, we store the text of your messages, who sent them and when, which pool they belong to, any members you @mention, the message you were replying to, emoji reactions and who added them, messages an admin has pinned, and how far through the conversation you have read.
                  </p>
                  <p className="mt-2">
                    <strong>Most Banter messages are not typed.</strong> The app posts share cards to the chat on your behalf when something happens worth sharing &mdash; a badge or level you have earned, a leaderboard update, or a prediction you chose to share. These are stored like any other message, and alongside the visible card we keep the structured detail behind it: for a badge card, your level, total experience points and the badges themselves; for a prediction card, what you predicted and what actually happened; for a leaderboard card, the standings at that moment, which can include the name of whoever was leading.
                  </p>
                  <p className="mt-2">
                    <strong>Banter messages cannot be edited or deleted &mdash; by you, by your pool admin, or by us through the app.</strong> Once a message is posted it stays in that pool&apos;s history. Please treat anything you send as permanent. You can remove an emoji reaction you added, and deleting your account removes your messages everywhere (see Section 8), but there is no way to take back a single message.
                  </p>
                  <p className="mt-2">
                    Banter history is visible to whoever is a member of the pool <em>now</em>. Someone who joins the pool later can read everything posted before they arrived. If you leave a pool, you lose access to its chat but <strong>the messages you already posted stay there</strong> and remain visible to the members who remain.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-2">Camera Access (Mobile App Only)</h3>
                  <p>
                    The mobile app can join a pool by scanning an invite QR code. If you choose that option, the app asks for camera permission and opens a live camera view solely to read the code in frame. <strong>No photo or video is captured, saved, or transmitted anywhere</strong> &mdash; the camera is read in memory, only the invite code is extracted, and the camera session is shut down as soon as you leave the scanner. You can join by typing a code instead and never grant camera access at all, and you can revoke the permission at any time in your device settings.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-2">Shareable Video Cards</h3>
                  <p>
                    In Showdown pools you can generate a short video card of a duel &mdash; the reveal of who you were drawn against, or the result once it is settled. The card shows both members&apos; display names and the score. Because the point of the card is to be shared outside the app, the rendered video file is stored on a public URL and can be viewed by anyone who has that link, without signing in. Only a member of the pool who is one of the two people in the duel can generate a card, but once generated the file itself is not access-controlled. Please treat these links as public.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-2">Administrative Logs</h3>
                  <p>
                    When a pool admin or super admin takes an action that affects other users &mdash; such as removing a member, adjusting points, updating settings, or moderating chat &mdash; we record the action, the administrator, the affected user or entry, and a timestamp, so that actions remain auditable.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-2">Communications</h3>
                  <p>
                    If you contact us through the contact form, we collect the name, email address, and message content you provide. We also store records of email notifications sent to you through the Service.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-2">Mobile Push Notifications</h3>
                  <p>
                    When you use the SportPool mobile app and grant notification permission, your device&apos;s operating system issues us a push notification token (an APNs device token on iOS or an Expo push token routed via Firebase Cloud Messaging on Android). We store this token, the platform it was issued for, and your per-category notification preferences so we can deliver pushes about pool activity, prediction deadlines, match results, leaderboard changes, mentions, and badges or level-ups you earn. You can revoke notification permission at any time in your device settings, and you can toggle individual categories off from your profile in the app &mdash; in either case we stop sending the affected pushes and remove invalid tokens automatically.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-2">Crash and Error Reports</h3>
                  <p>
                    When enabled, the mobile app sends crash reports and error telemetry (stack traces, app version, device model, OS version) to Sentry so we can diagnose and fix bugs. No prediction content or personal pool data is sent to Sentry.
                  </p>
                </div>
              </div>
            </div>

            {/* 3. How We Use Your Information */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                3. How We Use Your Information
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>We use the information we collect to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Provide, operate, and maintain the Service</li>
                  <li>Create and manage your account</li>
                  <li>Calculate scores, update leaderboards, settle duels and rounds, and process predictions</li>
                  <li>Run the games a pool has chosen &mdash; including drawing Showdown opponents, tracking Last Man Standing survival, and scoring predicted league tables</li>
                  <li>Show you and your fellow members how you are playing, including form, streaks, levels, and badges</li>
                  <li>Deliver community features such as Banter chat, reactions, @mentions, and online presence</li>
                  <li>Complete pool upgrade purchases, unlock the tier you bought, handle refund requests, and keep accurate financial and tax records</li>
                  <li>Generate the shareable video cards you ask for</li>
                  <li>Send you email notifications about pool activity, prediction deadlines, match results, leaderboard updates, and administrative events, subject to your notification preferences</li>
                  <li>Send push notifications to your mobile device about the same categories of events when you use the SportPool mobile app and have granted notification permission, subject to your per-category notification preferences</li>
                  <li>Respond to your contact form inquiries</li>
                  <li>Maintain administrative audit logs so pool and super admin actions remain accountable</li>
                  <li>Diagnose crashes and errors, and improve the Service through analytics and usage patterns (where enabled &mdash; see Section 4)</li>
                  <li>Log your acceptance of our Terms of Service for legal compliance</li>
                  <li>Detect and prevent fraud, abuse, or unauthorized access</li>
                </ul>
              </div>
            </div>

            {/* 4. Cookies & Tracking */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                4. Cookies &amp; Tracking
              </h2>
              <div className="space-y-4 text-neutral-700 leading-relaxed">
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-2">Essential Cookies</h3>
                  <p>
                    These cookies are required for the Service to function and are always set when you sign in:
                  </p>
                  <ul className="list-disc pl-6 mt-2 space-y-1">
                    <li>
                      <code className="text-sm">sb-&lt;project&gt;-auth-token</code> &mdash; a signed session token issued by our authentication provider (Supabase) that keeps you signed in across pages. It is marked HttpOnly, Secure, and SameSite=Lax.
                    </li>
                    <li>
                      <code className="text-sm">sb-&lt;project&gt;-auth-token-code-verifier</code> &mdash; a short-lived PKCE code verifier used during the sign-in callback. It is removed automatically once you are signed in.
                    </li>
                    <li>
                      <code className="text-sm">cookieyes-consent</code> &mdash; records the cookie choices you made in our consent banner, so we can honour them and stop asking. It stores a random consent identifier and a yes/no for each category, and nothing else about you.
                    </li>
                  </ul>
                  <p className="mt-2">
                    Theme and prediction-draft preferences are stored in your browser&apos;s local storage, not in cookies (see Section 2). The mobile app does not use cookies.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-2">Your Cookie Choices</h3>
                  <p>
                    On your first visit, a consent banner (provided by CookieYes) asks how you want non-essential cookies handled. You can <strong>Accept All</strong>, <strong>Reject All</strong>, or <strong>Customise</strong> per category. Nothing but the essential cookies above is set until you choose, and rejecting is a single click that is honoured in every region &mdash; not only where consent is legally required. You can reopen the banner and change your mind at any time.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-2">Analytics Cookies</h3>
                  <p>
                    We use Google Tag Manager and Google Analytics to collect aggregated usage data (pages visited, time on page, general interaction patterns). These cookies do not identify individual users to us.
                  </p>
                  <p className="mt-2">
                    The analytics tag loads in a consent-aware mode: <strong>until you accept the analytics category, it is denied permission to write or read any cookie</strong>, so no <code className="text-sm">_ga</code>, <code className="text-sm">_gid</code>, <code className="text-sm">_gat</code>, or <code className="text-sm">_dc_gtm_*</code> cookie is set and no analytics identifier is stored on your device. Those cookies appear only after you have accepted analytics, and disappear again if you withdraw that consent. Declining analytics does not affect any part of SportPool.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-2">Fonts</h3>
                  <p>
                    Web fonts are compiled into the Service and served from our own domain. Loading a SportPool page does not make a request to Google Fonts and does not expose your IP address to a font provider.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-2">No Advertising or Cross-Site Tracking</h3>
                  <p>
                    We do not use advertising cookies, marketing pixels, or cross-site tracking technologies, and we do not serve personalised advertising. Our consent banner lists an advertising category because it is a standard tool covering cookies a site of this kind might use; we set no cookies in it.
                  </p>
                </div>
              </div>
            </div>

            {/* 5. Third-Party Services */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                5. Third-Party Services
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>We use the following third-party services to operate SportPool:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    <strong>Supabase</strong> &mdash; Provides our database and authentication infrastructure. Your account information and activity data are stored securely on Supabase servers.
                  </li>
                  <li>
                    <strong>Vercel</strong> &mdash; Hosts the Service. Vercel may collect standard server logs including IP addresses and request data. We also use Vercel Blob to store rendered video cards (see Section 2) and Vercel&apos;s ephemeral compute sandboxes to render them.
                  </li>
                  <li>
                    <strong>Paddle</strong> &mdash; Merchant of record for pool upgrade purchases. Paddle collects and processes your payment and billing information directly, handles any sales tax or VAT due in your country, and returns to us only the transaction record described in Section 2.
                  </li>
                  <li>
                    <strong>Resend</strong> &mdash; Handles email delivery for notifications, deadline reminders, and contact form messages. We also sync your email address to a Resend audience so that pool admins and SportPool can send you broadcast emails to which you are subscribed. Every broadcast email includes a one-click unsubscribe link.
                  </li>
                  <li>
                    <strong>Google Analytics / Google Tag Manager</strong> &mdash; Collects aggregated usage analytics to help us understand how the Service is used. Subject to your cookie preferences and local law.
                  </li>
                  <li>
                    <strong>CookieYes</strong> &mdash; Provides the cookie consent banner and records your choices. It receives your consent selections and standard connection data such as your IP address in order to log that consent.
                  </li>
                  <li>
                    <strong>Apple Push Notification service (APNs)</strong> &mdash; Used to deliver push notifications to iOS devices. Apple receives the encrypted notification payload and your APNs device token in order to route the notification to your device.
                  </li>
                  <li>
                    <strong>Expo Push Service &amp; Firebase Cloud Messaging (FCM)</strong> &mdash; Used to deliver push notifications to Android devices. Expo&apos;s hosted service relays the notification payload and your Expo push token to Google&apos;s Firebase Cloud Messaging, which then delivers the notification to your device.
                  </li>
                  <li>
                    <strong>Expo (EAS Update)</strong> &mdash; Delivers over-the-air updates to the mobile app. When the app checks for an update, Expo receives technical details about your installation such as the app version, platform, and update channel. No account or pool data is sent.
                  </li>
                  <li>
                    <strong>Sentry</strong> &mdash; When enabled in the SportPool mobile app, collects anonymized crash reports and error telemetry (stack traces, app version, device model, OS version) so we can diagnose and fix bugs. No prediction content or personal pool data is sent to Sentry.
                  </li>
                  <li>
                    <strong>API-Football</strong> &mdash; Supplies the fixtures, results, standings, line-ups, and match statistics that the Service scores against. This is a one-way feed into SportPool: <strong>no member data of any kind is sent to them.</strong>
                  </li>
                </ul>
                <p>
                  Each of these services has their own privacy policies governing how they handle data. We encourage you to review their respective policies.
                </p>
              </div>
            </div>

            {/* 6. Data Sharing */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                6. Data Sharing
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  <strong>We do not sell, rent, or trade your personal information to third parties.</strong>
                </p>
                <p>
                  We share data only with the third-party service providers listed above, and only as necessary to operate the Service.
                </p>
                <p>
                  <strong>Within a pool,</strong> your username, entries, scores, leaderboard position, form and streak statistics, level and badges, and online presence are visible to the other members of that pool. Your email address is never shared with other users.
                </p>
                <p>
                  <strong>Your predictions become visible to other members only once they can no longer be changed.</strong> Picks are sealed until the relevant deadline &mdash; a match kickoff, a matchweek lock, or a table deadline &mdash; and are then shown to the pool. In Showdown pools, the opponent you have been drawn against is likewise hidden from you until the reveal for that matchweek.
                </p>
                <p>
                  Messages, reactions, pins, and @mentions you post in a pool&apos;s Banter chat are visible to every member of that pool, including members who join after you posted. They are delivered live to members who have the chat open at the time, and can trigger an email or push notification to the people you mention.
                </p>
                <p>
                  Pool admins and SportPool super admins can read chat content. To be clear about what that does and does not mean: an admin can pin a message, but <strong>no one using the app can edit or remove a message once it is sent</strong>. If something in a pool&apos;s chat needs to come down, please{' '}
                  <Link href="/contact" className="text-primary-600 hover:text-primary-700 font-medium transition">
                    contact us
                  </Link>{' '}
                  and we will deal with it directly.
                </p>
                <p>
                  Video cards you generate are stored at public URLs and can be viewed by anyone holding the link, including people who are not SportPool members (see Section 2).
                </p>
                <p>
                  We may disclose your information if required by law, legal process, or government request, or if we believe disclosure is necessary to protect our rights, your safety, or the safety of others.
                </p>
              </div>
            </div>

            {/* 7. Where Your Data Is Stored */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                7. Where Your Data Is Stored
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  Our database and authentication infrastructure are hosted in the United States (Supabase, <code className="text-sm">us-east-1</code>). Our other providers operate globally. If you use SportPool from outside the United States, your information will be transferred to and processed in the United States and in other countries where our providers operate, which may have different data protection laws than your own.
                </p>
              </div>
            </div>

            {/* 8. Data Retention */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                8. Data Retention
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  We retain your personal information for as long as your account is active or as needed to provide the Service.
                </p>
                <p>
                  When you delete your account, we delete your account record, your pool memberships and entries, all of your predictions and scores across every game mode, your experience points, levels and badges, your Banter messages and reactions, your presence record, your push tokens and notification preferences, your terms-acceptance record, and your sign-in credentials. Deletion is immediate and cannot be undone.
                </p>
                <p>
                  Deleting your account is the only way to remove Banter messages you have posted, and it removes them from every pool at once &mdash; they will disappear from the chat history other members see. Leaving a single pool does not remove them.
                </p>
                <p>
                  Two things are kept after deletion. Records of email we have already sent you are retained but stripped of your account identifier. Records of purchases made through Paddle are retained, unlinked from your account, because we are required to keep accurate financial and tax records; Paddle retains its own copy under its own policy.
                </p>
                <p>
                  Video cards already generated and shared remain at their public URLs until we remove them. If you want a card taken down, please contact us.
                </p>
                <p>
                  Contact form submissions are retained for as long as needed to resolve your inquiry. Some information may be retained in anonymized or aggregated form for analytical purposes.
                </p>
              </div>
            </div>

            {/* 9. Your Rights */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                9. Your Rights
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>You have the right to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Access</strong> the personal information we hold about you</li>
                  <li><strong>Correct</strong> any inaccurate or incomplete information</li>
                  <li><strong>Delete</strong> your account and associated data from your profile settings</li>
                  <li><strong>Manage</strong> which categories of email and push notifications you receive from your profile settings, and revoke push notification permission at any time in your device&apos;s system settings</li>
                  <li><strong>Revoke</strong> camera permission for QR scanning at any time in your device&apos;s system settings</li>
                  <li><strong>Unsubscribe</strong> from broadcast emails using the unsubscribe link in any such email</li>
                </ul>
                <p>
                  You can delete your account directly from your profile settings, or see{' '}
                  <Link href="/delete-account" className="text-primary-600 hover:text-primary-700 font-medium transition">
                    our account deletion page
                  </Link>{' '}
                  for full instructions. One prerequisite applies: if you are the administrator of a pool, you must first transfer that role to another member, so that deleting your account does not leave their pool without an admin. We will tell you which pools this affects if you try.
                </p>
                <p>
                  To exercise any of the other rights above, please{' '}
                  <Link href="/contact" className="text-primary-600 hover:text-primary-700 font-medium transition">
                    contact us
                  </Link>
                  .
                </p>
              </div>
            </div>

            {/* 10. Children's Privacy */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                10. Children&apos;s Privacy
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  The Service is not intended for children under the age of 13. We do not knowingly collect personal information from children under 13. If you believe we have collected information from a child under 13, please{' '}
                  <Link href="/contact" className="text-primary-600 hover:text-primary-700 font-medium transition">
                    contact us
                  </Link>{' '}
                  and we will promptly delete that information.
                </p>
              </div>
            </div>

            {/* 11. Changes to This Policy */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                11. Changes to This Policy
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  We may update this Privacy Policy from time to time. When we make changes, we will update the &quot;Last updated&quot; date at the top of this page. Your continued use of the Service after changes are posted constitutes your acceptance of the revised policy.
                </p>
                <p>
                  We encourage you to review this policy periodically to stay informed about how we protect your information.
                </p>
              </div>
            </div>

            {/* 12. Contact */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                12. Contact
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  If you have any questions about this Privacy Policy or wish to exercise any of the rights described in Section 9, you can email us at{' '}
                  <a href="mailto:privacy@sportpool.io" className="text-primary-600 hover:text-primary-700 font-medium transition">
                    privacy@sportpool.io
                  </a>{' '}
                  or use our{' '}
                  <Link href="/contact" className="text-primary-600 hover:text-primary-700 font-medium transition">
                    contact form
                  </Link>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
