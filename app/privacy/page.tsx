import Link from 'next/link'
import type { Metadata } from 'next'
import { PublicNav } from '@/components/PublicNav'

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'Privacy Policy for Sport Pool — learn how we collect, use, and protect your personal information.',
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
          <p className="text-sm text-neutral-500 mb-12">Last updated: April 18, 2026</p>

          <div className="space-y-10">
            {/* 1. Overview */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                1. Overview
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  Sport Pool (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates the website at sportpool.io (the &quot;Service&quot;). This Privacy Policy describes how we collect, use, and protect your personal information when you use our Service.
                </p>
                <p>
                  By using Sport Pool, you agree to the collection and use of information as described in this policy. If you do not agree, please do not use the Service.
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
                    We collect data related to your use of the Service, including your match predictions, pool memberships, scores, leaderboard rankings, and pool settings you configure as an administrator.
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
                  <h3 className="font-semibold text-neutral-900 mb-2">Local Device Storage</h3>
                  <p>
                    To improve your experience, we store a small amount of data in your browser&apos;s local storage: your chosen theme (<code className="text-sm">sport-pool-theme</code>), your light/dark color-mode preference (<code className="text-sm">sport-pool-color-mode</code>), and temporary backups of in-progress predictions (<code className="text-sm">predictions_backup_*</code>) so you don&apos;t lose work if you go offline or refresh the page. This data lives on your device only and is cleared when you clear your browser data.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-2">User-Generated Content</h3>
                  <p>
                    When you post in a pool&apos;s community chat, we store your messages, emoji reactions, pinned messages, @mentions, and transient signals such as typing indicators and online presence. This content is shown to other members of the same pool.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-2">Entry-Fee Tracking</h3>
                  <p>
                    Pool administrators may track whether members have paid an entry fee. If an admin marks your entry as paid, we store a paid/unpaid flag and the date it was recorded. <strong>Sport Pool does not process payments, and no card, bank, or payment-processor data is collected or stored.</strong> Any actual collection of fees happens outside the Service.
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
                  <li>Calculate scores, update leaderboards, and process predictions</li>
                  <li>Deliver community features such as pool chat, reactions, and @mentions</li>
                  <li>Send you email notifications about pool activity, prediction deadlines, match results, leaderboard updates, and administrative events, subject to your notification preferences</li>
                  <li>Respond to your contact form inquiries</li>
                  <li>Maintain administrative audit logs so pool and super admin actions remain accountable</li>
                  <li>Improve the Service through analytics and usage patterns (where enabled &mdash; see Section 4)</li>
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
                  </ul>
                  <p className="mt-2">
                    Theme and prediction-draft preferences are stored in your browser&apos;s local storage, not in cookies (see Section 2).
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-2">Analytics Cookies</h3>
                  <p>
                    The Service may be configured to load Google Tag Manager and Google Analytics to collect anonymous, aggregated usage data (pages visited, time on page, general interaction patterns). When enabled, Google Analytics sets cookies such as <code className="text-sm">_ga</code>, <code className="text-sm">_gid</code>, <code className="text-sm">_gat</code>, and <code className="text-sm">_dc_gtm_*</code>. These cookies do not identify individual users to us.
                  </p>
                  <p className="mt-2">
                    Analytics are only loaded where we have a lawful basis to do so. We are currently rolling out a cookie consent banner that will let you accept or decline analytics cookies before they are set. Until that banner is live, analytics remain disabled in regions where consent is legally required.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-2">No Advertising or Cross-Site Tracking</h3>
                  <p>
                    We do not use advertising cookies, marketing pixels, or cross-site tracking technologies.
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
                <p>We use the following third-party services to operate Sport Pool:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>
                    <strong>Supabase</strong> &mdash; Provides our database and authentication infrastructure. Your account information and activity data are stored securely on Supabase servers.
                  </li>
                  <li>
                    <strong>Google Analytics / Google Tag Manager</strong> &mdash; When enabled, collects anonymous usage analytics to help us understand how the Service is used. Subject to your cookie preferences and local law.
                  </li>
                  <li>
                    <strong>Resend</strong> &mdash; Handles email delivery for notifications, deadline reminders, and contact form messages. We also sync your email address to a Resend audience so that pool admins and Sport Pool can send you broadcast emails to which you are subscribed. Every broadcast email includes a one-click unsubscribe link.
                  </li>
                  <li>
                    <strong>Vercel</strong> &mdash; Hosts the Service. Vercel may collect standard server logs including IP addresses and request data.
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
                  We share data only with the third-party service providers listed above, and only as necessary to operate the Service. Within the Service, your username, predictions, and scores are visible to other members of the pools you join. Your email address is not shared with other users.
                </p>
                <p>
                  Messages, reactions, pins, and @mentions you post in a pool&apos;s community chat are visible to every member of that pool. Pool admins and Sport Pool super admins may also view chat content for moderation purposes.
                </p>
                <p>
                  We may disclose your information if required by law, legal process, or government request, or if we believe disclosure is necessary to protect our rights, your safety, or the safety of others.
                </p>
              </div>
            </div>

            {/* 7. Data Retention */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                7. Data Retention
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  We retain your personal information for as long as your account is active or as needed to provide the Service. If you delete your account, your personal data will be removed. Some information may be retained in anonymized form for analytical purposes, and certain records (such as terms acceptance logs) may be kept for legal compliance.
                </p>
                <p>
                  Contact form submissions are retained for as long as needed to resolve your inquiry.
                </p>
              </div>
            </div>

            {/* 8. Your Rights */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                8. Your Rights
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>You have the right to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li><strong>Access</strong> the personal information we hold about you</li>
                  <li><strong>Correct</strong> any inaccurate or incomplete information</li>
                  <li><strong>Delete</strong> your account and associated data from your profile settings</li>
                  <li><strong>Manage</strong> which categories of email notifications you receive from your profile settings</li>
                  <li><strong>Unsubscribe</strong> from broadcast emails using the unsubscribe link in any such email</li>
                </ul>
                <p>
                  To exercise any of these rights, please{' '}
                  <Link href="/contact" className="text-primary-600 hover:text-primary-700 font-medium transition">
                    contact us
                  </Link>
                  . You can also delete your account directly from your profile settings.
                </p>
              </div>
            </div>

            {/* 9. Children's Privacy */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                9. Children&apos;s Privacy
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

            {/* 10. Changes to This Policy */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                10. Changes to This Policy
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

            {/* 11. Contact */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                11. Contact
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  If you have any questions about this Privacy Policy or wish to exercise any of the rights described in Section 8, you can email us at{' '}
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
