import Link from 'next/link'
import type { Metadata } from 'next'
import { PublicNav } from '@/components/PublicNav'
import { TERMS_LAST_UPDATED } from '@/lib/termsVersion'

export const metadata: Metadata = {
  title: 'Terms of Service',
  description:
    'Terms of Service for SportPool — the social sports prediction platform.',
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
              Please read these terms carefully before using SportPool.
            </p>
          </div>
        </div>
      </section>

      {/* Content */}
      <section className="py-16 sm:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* ⚠ Not a literal. The date and the version written to
              `terms_agreements` come from one constant so they cannot drift —
              see lib/termsVersion.ts for what went wrong when they could. */}
          <p className="text-sm text-neutral-500 mb-12">Last updated: {TERMS_LAST_UPDATED}</p>

          <div className="space-y-10">
            {/* 1. Overview */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                1. Overview
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  SportPool (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) operates the SportPool service &mdash; the website at sportpool.io, the SportPool apps for iOS and Android, and the pages we publish alongside them (together, the &quot;Service&quot;). SportPool is a social prediction platform: you create or join a pool, predict what will happen in a sporting competition, and compete with the other members of that pool on a leaderboard.
                </p>
                <p>
                  We support different competitions at different times &mdash; a global tournament one summer, a domestic league season the next. Which competitions are available changes, and these Terms apply to all of them.
                </p>
                <p>
                  Our mobile apps can update themselves over the air, so the version you are running may change without you installing anything from an app store.
                </p>
                <p>
                  By creating an account or otherwise using the Service, you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.
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
                  You must be at least 13 years of age to use the Service, or older if the country you live in sets a higher minimum age for consenting to online services on your own behalf. By creating an account, you represent that you meet this age requirement. Each person may only create one account. Creating multiple accounts to gain an unfair advantage is prohibited and may result in account termination.
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
                  A pool is built around one competition, and its administrator chooses the format. The format decides what you are asked to do &mdash; predict a scoreline or a result for each match, build a knockout bracket, predict round by round as a tournament unfolds, order a league&apos;s final table, back one club a week without ever repeating one, or be drawn against another member for a weekly head-to-head. We add and retire formats over time.
                </p>
                <p>
                  Points are awarded automatically from official results and the scoring rules configured for that pool. Scoring rules, multipliers and bonuses are customizable by pool administrators within the limits of the chosen format. Administrators may also allow members to submit multiple independent entries to a single pool, each with its own predictions and leaderboard position; how many members and entries a pool may hold can depend on the pool&apos;s plan (Section 5).
                </p>
                <p>
                  <strong>SportPool is not a gambling platform.</strong> No real money, prizes, or anything of monetary value is wagered, won, or lost through the Service. Every outcome we score comes from the sporting event itself &mdash; we do not add chance of our own. Experience points, levels, badges and other progress markers record how you have played and nothing more: they have no cash value, cannot be bought, sold, or transferred, and may change if a pool is rescored. See Section 6 for how entry fees and prizes arranged between members are handled.
                </p>
                <p>
                  The Service includes community features such as in-pool chat, emoji reactions, pinned messages, and @mentions. See Section 8 for rules that apply to content you post.
                </p>
                <p>
                  By creating an account, you consent to receive the messages needed to operate the Service &mdash; by email, and, if you use one of our apps and allow notifications, by push notification. These cover prediction deadlines, match results, leaderboard and pool activity, achievements, and administrative messages. You can switch each category on or off in your notification settings, turn push off entirely in your device settings, and every broadcast email carries a one-click unsubscribe link.
                </p>
              </div>
            </div>

            {/* 5. Plans & Payment */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                5. Plans &amp; Payment
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  Creating a pool is free. We also offer paid plans that raise a pool&apos;s member and entry limits and unlock additional features; current plans and prices are on our{' '}
                  <Link href="/pricing" className="text-primary-600 hover:text-primary-700 font-medium transition">
                    pricing page
                  </Link>
                  . Paid plans are optional, and a pool never loses anything it already has by staying on the free plan.
                </p>
                <p>
                  When you buy a paid plan through our website, <strong>Paddle.com acts as the merchant of record</strong>: Paddle is the seller for that transaction, Paddle&apos;s name is what appears on your statement, and Paddle handles any sales tax or VAT due in your country. Refunds and cancellations are governed by our{' '}
                  <Link href="/refund-policy" className="text-primary-600 hover:text-primary-700 font-medium transition">
                    Refund Policy
                  </Link>
                  , which forms part of these Terms. If we ever sell something inside the iOS or Android app, Apple or Google is the seller for that purchase and their refund process applies instead.
                </p>
                <p>
                  A paid plan is bought by a pool administrator for one pool. It is not a personal subscription and it does not transfer between pools. It changes what a pool can do &mdash; it does not change how accurate predictions are rewarded relative to the other members of that pool.
                </p>
                <p>
                  Nothing in these Terms limits any right you have under the consumer law of the country you live in. Where that law gives you more than these Terms do, the law wins.
                </p>
              </div>
            </div>

            {/* 6. Entry Fees & Prizes */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                6. Entry Fees &amp; Prizes Between Members
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  This section is about money that moves between members of a pool, which is a different thing from the plans in Section 5. SportPool does not collect, hold, process, or disburse entry fees or prize money. We are not a payment processor, escrow service, or prize sponsor for any such arrangement.
                </p>
                <p>
                  Pool administrators may independently organize entry fees and prizes with the members of their pool &mdash; for example, collecting contributions through an external payment app and awarding a prize to the winner. SportPool provides only an optional tool for admins to mark a member&apos;s entry as paid or unpaid. This flag is a record-keeping convenience; it does not evidence payment to SportPool, does not create any obligation on SportPool, and does not make SportPool a party to any fee or prize arrangement.
                </p>
                <p>
                  Any dispute over fees, prizes, or payouts is solely between the members and the pool administrator. You agree that SportPool has no liability for any such arrangement and is not responsible for ensuring that fees are collected or that prizes are paid.
                </p>
                <p>
                  You are responsible for ensuring that any fee or prize arrangement you participate in complies with the laws of your jurisdiction, including any laws governing contests, sweepstakes, or gambling. This applies whatever format your pool uses, and it is worth checking before you organize one: some jurisdictions treat a paid-entry competition differently depending on how it is run, and elimination formats in particular are treated as regulated contests in some places.
                </p>
              </div>
            </div>

            {/* 7. Branded Pools */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                7. Branded Pools
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  Organizations, companies, and communities may operate branded (white-labeled) pools on SportPool. A branded pool may display a custom name, logo, color, and landing page chosen by the sponsoring organization.
                </p>
                <p>
                  A branded pool may also have public pages: a landing page and a big-screen leaderboard, each at its own address on sportpool.io. Anyone with the link can open them, and search engines may index them. They show the pool&apos;s name and branding, how many members it has, and the leaderboard &mdash; including entry names and scores. They do not show chat, individual predictions, or anyone&apos;s email address.
                </p>
                <p>
                  If you would rather your entry name did not appear on a public page, choose an entry name that does not identify you, or speak to your pool administrator &mdash; they control whether the pool has public pages at all.
                </p>
                <p>
                  Brand assets displayed in a branded pool remain the property of their respective owners and are used with permission of the sponsoring organization. SportPool does not endorse any branded pool, offer, or external prize.
                </p>
                <p>
                  If you participate in a branded pool, any relationship with the sponsoring organization (including any promotions, prizes, or communications they provide) is between you and that organization. SportPool&apos;s role is limited to operating the underlying platform, and platform-wide rules including Section 8 (User-Generated Content) and Section 9 (Acceptable Use) apply inside branded pools.
                </p>
              </div>
            </div>

            {/* 8. User-Generated Content */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                8. User-Generated Content
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  Some features of the Service let you post content that other users can see &mdash; including pool names and descriptions, entry names, chat messages, emoji reactions, pinned messages, @mentions, and any images you upload, such as a pool logo. We call these collectively &quot;User Content.&quot;
                </p>
                <p>
                  You are solely responsible for the User Content you post. You represent that you have the right to post it and that it does not violate any law or any third party&apos;s rights. By posting User Content, you grant SportPool a non-exclusive, royalty-free, worldwide license to host, store, reproduce, and display that content as necessary to operate the Service &mdash; for example, showing your chat messages to the other members of your pool, or showing your entry name and score on your pool&apos;s public pages if it has them (Section 7).
                </p>
                <p>
                  Pool administrators and SportPool may remove User Content that we believe violates these Terms, the Acceptable Use rules in Section 9, or applicable law, and we may do so without notice. We are not obligated to pre-screen or monitor User Content, and we make no guarantee about the accuracy, legality, or safety of content posted by other users.
                </p>
              </div>
            </div>

            {/* 9. Acceptable Use */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                9. Acceptable Use
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>You agree not to:</p>
                <ul className="list-disc pl-6 space-y-2">
                  <li>Manipulate or attempt to manipulate scores, rankings, or leaderboard positions through any unauthorized means</li>
                  <li>Create multiple accounts to gain an unfair advantage in any pool</li>
                  <li>Use automated tools, bots, or scripts to access or interact with the Service</li>
                  <li>Harass, bully, threaten, dox, or discriminate against other users, including in pool chat or @mentions</li>
                  <li>Post hate speech, sexually explicit content, or content that encourages violence or self-harm</li>
                  <li>Impersonate another person, including pool administrators or SportPool staff</li>
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

            {/* 10. Intellectual Property */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                10. Intellectual Property
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  The Service, including its design, features, code, and branding, is owned by SportPool and protected by intellectual property laws. You may not copy, modify, distribute, or reverse-engineer any part of the Service without our written consent.
                </p>
                <p>
                  You retain ownership of any content you submit through the Service, such as pool names and descriptions. By submitting content, you grant us a non-exclusive, worldwide license to use, display, and store that content as necessary to operate the Service.
                </p>
                <p>
                  Competition names, club names, crests, and other marks shown on the Service belong to their respective owners. We are not affiliated with, endorsed by, or sponsored by any competition organizer, league, or club, and we claim no right in their marks. Fixtures, results, and related sports data are supplied by third-party data providers; we display that data as we receive it, and we may correct scores and standings &mdash; including recalculating points already awarded &mdash; when a provider corrects its own.
                </p>
              </div>
            </div>

            {/* 11. Disclaimers */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                11. Disclaimers
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, either express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement.
                </p>
                <p>
                  We do not guarantee that the Service will be uninterrupted, error-free, or secure. Match results and scoring are processed based on data available to us, and while we strive for accuracy, we do not guarantee the correctness of any data displayed on the platform.
                </p>
                <p>
                  SportPool does not provide financial, gambling, or betting advice. The Service is for entertainment purposes only.
                </p>
              </div>
            </div>

            {/* 12. Limitation of Liability */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                12. Limitation of Liability
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  To the maximum extent permitted by law, SportPool and its operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of data, profits, or goodwill, arising out of or in connection with your use of the Service.
                </p>
                <p>
                  Our total liability for all claims relating to the Service in any twelve-month period will not exceed the greater of (a) the total amount you paid us for the Service in that period, or (b) US$100.
                </p>
                <p>
                  Nothing in these Terms excludes or limits any liability that cannot lawfully be excluded or limited, including liability for fraud, or for death or personal injury caused by negligence.
                </p>
              </div>
            </div>

            {/* 13. Termination */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                13. Termination
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

            {/* 14. Governing Law & Disputes */}
            {/* ⚠ The operating entity and its registered address are deliberately
                not named here. Ryan settled the jurisdiction (Bermuda, 2026-09-07)
                but not the entity, and a wrong company name in a governing-law
                clause is worse than no company name. Add the sentence when the
                entity is confirmed; the clause stands without it. */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                14. Governing Law &amp; Disputes
              </h2>
              <div className="space-y-3 text-neutral-700 leading-relaxed">
                <p>
                  These Terms of Service are governed by the laws of Bermuda, without regard to its conflict-of-laws rules, and the courts of Bermuda have exclusive jurisdiction over any dispute arising out of or relating to these Terms or the Service.
                </p>
                <p>
                  Nothing in this section removes any right you may have to bring a claim under the mandatory consumer law of the country you live in, or to bring that claim in your local courts where that law gives you the right to do so.
                </p>
                <p>
                  If any part of these Terms is found to be unenforceable, the rest remains in force.
                </p>
              </div>
            </div>

            {/* 15. Changes to Terms */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                15. Changes to Terms
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

            {/* 16. Contact */}
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-neutral-900 mb-4">
                16. Contact
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
