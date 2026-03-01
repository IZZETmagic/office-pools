import Link from 'next/link'
import type { Metadata } from 'next'
import { Button } from '@/components/ui/Button'

export const metadata: Metadata = {
  title: 'Terms of Service - Sport Pool',
  description:
    'Terms of Service for Sport Pool — the free FIFA World Cup 2026 prediction pool platform.',
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-surface">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-surface/95 backdrop-blur-sm border-b border-neutral-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="text-xl font-bold text-neutral-900">
              ⚽ Sport Pool
            </Link>
            <div className="flex items-center gap-3">
              <Button href="/login" variant="outline" size="sm">
                Log In
              </Button>
              <Button href="/signup" size="sm">
                Sign Up
              </Button>
            </div>
          </div>
        </div>
      </nav>

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
          <p className="text-sm text-neutral-500 mb-12">Last updated: March 1, 2026</p>

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
                  <strong>Sport Pool is not a gambling platform.</strong> No real money, prizes, or anything of monetary value is wagered, won, or lost through the Service. The platform is intended purely for entertainment and friendly competition. Pool administrators may independently organize prizes outside the platform, but Sport Pool has no involvement in, responsibility for, or liability related to any such arrangements.
                </p>
                <p>
                  Scoring rules, multipliers, and bonus points are customizable by pool administrators. Sport Pool calculates points automatically based on the configured rules and official match results.
                </p>
              </div>
            </div>

            {/* 5. Acceptable Use */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                5. Acceptable Use
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>You agree not to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Manipulate or attempt to manipulate scores, rankings, or leaderboard positions through any unauthorized means</li>
                  <li>Create multiple accounts to gain an unfair advantage in any pool</li>
                  <li>Use automated tools, bots, or scripts to access or interact with the Service</li>
                  <li>Harass, abuse, or threaten other users</li>
                  <li>Upload or transmit harmful content, spam, or malware</li>
                  <li>Attempt to access other users&apos; accounts or private data</li>
                  <li>Use the Service for any illegal purpose or in violation of any applicable laws</li>
                  <li>Interfere with or disrupt the Service or its infrastructure</li>
                </ul>
                <p>
                  We reserve the right to suspend or terminate accounts that violate these guidelines at our sole discretion.
                </p>
              </div>
            </div>

            {/* 6. Intellectual Property */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                6. Intellectual Property
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

            {/* 7. Disclaimers */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                7. Disclaimers
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

            {/* 8. Limitation of Liability */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                8. Limitation of Liability
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

            {/* 9. Termination */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                9. Termination
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

            {/* 10. Changes to Terms */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                10. Changes to Terms
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

            {/* 11. Contact */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                11. Contact
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
