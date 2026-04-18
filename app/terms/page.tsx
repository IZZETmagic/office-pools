import Link from 'next/link'
import type { Metadata } from 'next'
import { PublicNav } from '@/components/PublicNav'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'Terms of Service for Sport Pool — the free FIFA World Cup 2026 prediction pool platform.',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-surface">
      {/* Navigation */}
      <PublicNav />

      {/* Header */}
      <section className="py-16 sm:py-24 bg-surface-secondary">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-neutral-900">
              Terms of Service
            </h1>
            <p className="mt-4 text-lg text-neutral-700 max-w-2xl mx-auto">
              Please read these terms carefully before using Sport Pool.
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
                  Sport Pool (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates the website at sportpool.io (the &quot;Service&quot;). Sport Pool is a free prediction pool platform that allows users to create and join prediction pools for the FIFA World Cup 2026 and compete with friends on leaderboards.
                </p>
                <p>
                  By accessing or using the Service, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.
                </p>
              </div>
            </div>

            {/* 2. Eligibility */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                2. Eligibility
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  You must be at least 13 years of age to use the Service. By creating an account, you represent that you meet this age requirement. Each person may only create one account. Creating multiple accounts to gain an unfair advantage is prohibited and may result in account termination.
                </p>
              </div>
            </div>

            {/* 3. Account Responsibilities */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                3. Account Responsibilities
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  When you create an account, you agree to provide accurate and complete information, including your name, email address, and username. You are responsible for maintaining the confidentiality of your password and for all activity that occurs under your account.
                </p>
                <p>
                  You agree to notify us immediately of any unauthorized use of your account. We are not liable for any loss or damage arising from your failure to protect your account credentials.
                </p>
              </div>
            </div>

            {/* 4. How the Service Works */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                4. How the Service Works
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  Sport Pool allows users to create prediction pools, invite friends, and predict match results for the FIFA World Cup 2026. Points are awarded based on the accuracy of predictions, and leaderboards track participant rankings within each pool.
                </p>
                <p>
                  <strong>Sport Pool is not a gambling platform.</strong> No real money, prizes, or anything of monetary value is wagered, won, or lost through the Service. The platform is intended purely for entertainment and friendly competition. See Section 5 for how entry fees and prizes are handled.
                </p>
                <p>
                  Scoring rules, multipliers, and bonus points are customizable by pool administrators. Sport Pool calculates points automatically based on the configured rules and official match results. Pool administrators may also allow members to submit multiple independent entries to a single pool, each with its own predictions and leaderboard position.
                </p>
                <p>
                  The Service includes community features such as in-pool chat, emoji reactions, pinned messages, and @mentions. See Section 7 for rules that apply to content you post.
                </p>
                <p>
                  By creating an account, you consent to receive transactional emails necessary to operate the Service &mdash; for example, account notifications, prediction deadline reminders, match results, and administrative messages. You can control which categories of notifications you receive from your profile settings, and broadcast emails include a one-click unsubscribe link.
                </p>
              </div>
            </div>

            {/* 5. Entry Fees & Prizes */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                5. Entry Fees &amp; Prizes
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  Sport Pool does not collect, hold, process, or disburse money. We are not a payment processor, escrow service, or prize sponsor.
                </p>
                <p>
                  Pool administrators may independently organize entry fees and prizes with the members of their pool &mdash; for example, collecting contributions through an external payment app and awarding a prize to the winner. Sport Pool provides only an optional tool for admins to mark a member&apos;s entry as paid or unpaid. This flag is a record-keeping convenience; it does not evidence payment to Sport Pool, does not create any obligation on Sport Pool, and does not make Sport Pool a party to any fee or prize arrangement.
                </p>
                <p>
                  Any dispute over fees, prizes, or payouts is solely between the members and the pool administrator. You agree that Sport Pool has no liability for any such arrangement and is not responsible for ensuring that fees are collected or that prizes are paid.
                </p>
                <p>
                  You are responsible for ensuring that any fee or prize arrangement you participate in complies with the laws of your jurisdiction, including any laws governing contests, sweepstakes, or gambling.
                </p>
              </div>
            </div>

            {/* 6. Branded Pools */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                6. Branded Pools
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  Organizations, companies, and communities may operate branded (white-labeled) pools on Sport Pool. A branded pool may display a custom name, logo, color, and landing page chosen by the sponsoring organization.
                </p>
                <p>
                  Brand assets displayed in a branded pool remain the property of their respective owners and are used with permission of the sponsoring organization. Sport Pool does not endorse any branded pool, offer, or external prize.
                </p>
                <p>
                  If you participate in a branded pool, any relationship with the sponsoring organization (including any promotions, prizes, or communications they provide) is between you and that organization. Sport Pool&apos;s role is limited to operating the underlying platform, and platform-wide rules including Section 7 (User-Generated Content) and Section 8 (Acceptable Use) apply inside branded pools.
                </p>
              </div>
            </div>

            {/* 7. User-Generated Content */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                7. User-Generated Content
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  Some features of the Service let you post content that other users can see &mdash; including pool names and descriptions, entry names, chat messages, emoji reactions, pinned messages, and @mentions. We call these collectively &quot;User Content.&quot;
                </p>
                <p>
                  You are solely responsible for the User Content you post. You represent that you have the right to post it and that it does not violate any law or any third party&apos;s rights. By posting User Content, you grant Sport Pool a non-exclusive, royalty-free, worldwide license to host, store, reproduce, and display that content as necessary to operate the Service &mdash; for example, showing your chat messages to other members of the same pool.
                </p>
                <p>
                  Pool administrators and Sport Pool may remove User Content that we believe violates these Terms, the Acceptable Use rules in Section 8, or applicable law, and we may do so without notice. We are not obligated to pre-screen or monitor User Content, and we make no guarantee about the accuracy, legality, or safety of content posted by other users.
                </p>
              </div>
            </div>

            {/* 8. Acceptable Use */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                8. Acceptable Use
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>You agree not to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Manipulate or attempt to manipulate scores, rankings, or leaderboard positions through any unauthorized means</li>
                  <li>Create multiple accounts to gain an unfair advantage in any pool</li>
                  <li>Use automated tools, bots, or scripts to access or interact with the Service</li>
                  <li>Harass, bully, threaten, dox, or discriminate against other users, including in pool chat or @mentions</li>
                  <li>Post hate speech, sexually explicit content, or content that encourages violence or self-harm</li>
                  <li>Impersonate another person, including pool administrators or Sport Pool staff</li>
                  <li>Post spam, unsolicited promotions, phishing links, or malware in chat, pool names, or any other field</li>
                  <li>Upload or transmit harmful content, spam, or malware</li>
                  <li>Attempt to access other users&apos; accounts or private data</li>
                  <li>Use the Service for any illegal purpose or in violation of any applicable laws</li>
                  <li>Interfere with or disrupt the Service or its infrastructure</li>
                </ul>
                <p>
                  We reserve the right to remove content, suspend, or terminate accounts that violate these guidelines at our sole discretion.
                </p>
              </div>
            </div>

            {/* 9. Intellectual Property */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                9. Intellectual Property
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  The Service, including its design, features, code, and branding, is owned by Sport Pool and protected by intellectual property laws. You may not copy, modify, distribute, or reverse-engineer any part of the Service without our written consent.
                </p>
                <p>
                  You retain ownership of any content you submit through the Service, such as pool names and descriptions. By submitting content, you grant us a non-exclusive, worldwide license to use, display, and store that content as necessary to operate the Service.
                </p>
              </div>
            </div>

            {/* 10. Disclaimers */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                10. Disclaimers
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, either express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement.
                </p>
                <p>
                  We do not guarantee that the Service will be uninterrupted, error-free, or secure. Match results and scoring are processed based on data available to us, and while we strive for accuracy, we do not guarantee the correctness of any data displayed on the platform.
                </p>
                <p>
                  Sport Pool does not provide financial, gambling, or betting advice. The Service is for entertainment purposes only.
                </p>
              </div>
            </div>

            {/* 11. Limitation of Liability */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                11. Limitation of Liability
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  To the maximum extent permitted by law, Sport Pool and its operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of data, profits, or goodwill, arising out of or in connection with your use of the Service.
                </p>
                <p>
                  Our total liability for any claim related to the Service shall not exceed the amount you paid to use the Service (which, as a free platform, is zero).
                </p>
              </div>
            </div>

            {/* 12. Termination */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                12. Termination
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  You may delete your account at any time through your profile settings. Upon deletion, your account data will be removed, though some information may be retained in anonymized form for analytical purposes.
                </p>
                <p>
                  We may suspend or terminate your account at any time if you violate these Terms of Service or engage in conduct that we determine to be harmful to other users or the Service. Pool administrators may also remove members from their pools at their discretion.
                </p>
              </div>
            </div>

            {/* 13. Changes to Terms */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                13. Changes to Terms
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  We may update these Terms of Service from time to time. When we make changes, we will update the &quot;Last updated&quot; date at the top of this page. Your continued use of the Service after changes are posted constitutes your acceptance of the revised terms.
                </p>
                <p>
                  We encourage you to review these terms periodically to stay informed of any updates.
                </p>
              </div>
            </div>

            {/* 14. Contact */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                14. Contact
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  If you have any questions about these Terms of Service, please{' '}
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
