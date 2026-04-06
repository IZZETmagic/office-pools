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
          <p className="text-sm text-neutral-500 mb-12">Last updated: March 1, 2026</p>

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
                    We use cookies and similar technologies to understand how you use the Service. This includes anonymous usage data such as pages visited, time spent on pages, and general interaction patterns. See Section 4 for more details.
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
                  <li>Send you email notifications about pool activity, prediction deadlines, match results, and leaderboard updates</li>
                  <li>Respond to your contact form inquiries</li>
                  <li>Improve the Service through analytics and usage patterns</li>
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
                    These are required for the Service to function properly. They include authentication cookies that keep you signed in and session cookies that maintain your preferences (such as theme settings).
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-2">Analytics Cookies</h3>
                  <p>
                    We use Google Analytics (via Google Tag Manager) to collect anonymous data about how visitors use the Service. This helps us understand usage patterns and improve the experience. Google Analytics uses cookies to track interactions, but does not identify individual users to us.
                  </p>
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-2">Cookie Consent</h3>
                  <p>
                    We use CookieYes to manage your cookie preferences. When you first visit the Service, you will see a cookie consent banner where you can accept or decline non-essential cookies. You can change your preferences at any time through the cookie settings link.
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
                    <strong>Google Analytics / Google Tag Manager</strong> &mdash; Collects anonymous usage analytics to help us understand how the Service is used. Subject to your cookie consent preferences.
                  </li>
                  <li>
                    <strong>CookieYes</strong> &mdash; Manages cookie consent preferences and displays the cookie consent banner.
                  </li>
                  <li>
                    <strong>Resend</strong> &mdash; Handles email delivery for notifications, deadline reminders, and contact form messages.
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
                  <li><strong>Delete</strong> your account and associated data</li>
                  <li><strong>Opt out</strong> of non-essential cookies through the cookie consent banner</li>
                  <li><strong>Unsubscribe</strong> from email notifications using the unsubscribe link in any email</li>
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
                  If you have any questions about this Privacy Policy or how we handle your data, please{' '}
                  <Link href="/contact" className="text-primary-600 hover:text-primary-700 font-medium transition">
                    contact us
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
