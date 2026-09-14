# SportPool — legal review

**Date:** 13 September 2026
**Scope:** web app (`app/`), mobile app (`mobile/`), production database, live production HTML/headers,
the three published legal documents (Terms 2026-09-07, Privacy 2026-09-07, Refund 2026-08-23),
pricing and FAQ copy.
**Not legal advice.** This is an engineering-grade compliance review: every finding below is either a
quoted obligation or something verified in the code/database, with the file or query that shows it.

The documents themselves are unusually good — plain-language, specific, and honest about awkward things
(immutable chat, public video URLs, presence tracking). Almost everything below is either a *structural*
requirement the prose is missing, or a place where **the code does not do what the document promises**.

---

## A. Blockers before Paddle checkout goes live

### A1. The operating entity is still unnamed 🔴
`app/terms/page.tsx:307` carries a deliberate comment: jurisdiction settled (Bermuda), entity not.
Consequences once you sell:

- EU Consumer Rights Directive Art 6(1)(b)–(c) and the UK Consumer Contracts Regulations 2013 require the
  trader's **identity and geographic address** to be given before a consumer contract is concluded.
  Paddle being merchant of record satisfies Paddle's obligations, not the underlying supplier's.
- A governing-law clause choosing Bermuda is weak if no Bermudian entity is party to the contract.
- Bermuda PIPA requires the *organisation* to be identifiable in its privacy notice.

**Fix:** name entity + registered address in Terms §14, Privacy §12, Refund §1, and the site footer.
This is one sentence in four places and it gates everything else in this section.

### A2. Bermuda PIPA is not addressed at all 🔴
You chose Bermuda law. Bermuda's Personal Information Protection Act has been fully in force since
1 January 2025 and, if the entity is Bermudian, it applies to the whole platform:

| PIPA | Obligation | Status |
|---|---|---|
| s.5(2) | Designate a **Privacy Officer** and publish their contact | ❌ not designated/published |
| s.9 | Privacy notice contents (purposes, disclosure, Privacy Officer) | ⚠ partial |
| s.15 | Accountability for **overseas transfers** (Supabase `us-east-1`, Vercel, Resend, Paddle) | ❌ not stated |
| s.17 | Breach notification to the Commissioner **and** affected individuals | ❌ no documented process |

### A3. GDPR/UK GDPR Article 13 elements missing from the Privacy Policy 🔴
The policy describes *what* is collected better than most commercial policies but omits most of what
Art 13 actually mandates:

- **Legal bases** for each purpose (Art 13(1)(c)) — nowhere stated.
- **Retention periods** (Art 13(2)(a)) — "as long as your account is active" only.
- **Rights** (Art 13(2)(b)–(d)): §9 lists access/correct/delete/manage but omits **object**,
  **restrict**, **portability**, **withdraw consent**, and the **right to complain to a supervisory
  authority**.
- **Transfer safeguard** (Art 13(1)(f)): §7 discloses that data goes to the US but names no mechanism
  (SCCs / EU-US Data Privacy Framework certification of the processor).
- **Art 27 representative**: with no EU/UK establishment and users in both (Premier League pools), an EU
  and a UK representative are required unless the processing is genuinely occasional and low-risk — chat,
  presence and push mean it is not.
- **Art 30 ROPA**: the <250-employee exemption does not apply to regular, non-occasional processing.

---

## B. The code contradicts the documents (verified)

### B1. Unsubscribe is not honoured for segmented broadcasts 🔴
Terms §4 and Privacy §5 both promise "every broadcast email carries a one-click unsubscribe link".
The link exists (`{{{RESEND_UNSUBSCRIBE_URL}}}`, `app/admin/super/BroadcastTab.tsx:194`) — but the
unsubscribe it records is discarded for every segment except `all`:

- `lib/email/segments.ts:~100` — `usersQuery()` selects every user with an email. **No opt-out filter
  exists anywhere in the file**, and no `email_opt_out`-style column exists on `users`.
- `app/api/admin/broadcast/route.ts:95–118` — for any non-`all` segment the route **deletes every contact
  in the Broadcast Target audience and re-creates them** from that query. A freshly created Resend contact
  is subscribed by default, so the prior unsubscribe is erased rather than respected.

Exposure: PECR reg 22 / GDPR Art 21(3), CAN-SPAM §5(a)(4) (10-business-day honour), CASL.
**Fix:** persist opt-out in our own database (webhook from Resend + a column on `users`), filter it in
`usersQuery()`, and never re-create a contact for a suppressed address.

### B2. Deleting an account does not remove you from the Resend audience 🔴
`removeContactFromResend()` (`lib/email/contacts.ts:28`) **has no callers** — verified by grep.
`app/api/account/delete/route.ts` never calls it. So after deletion the address remains a contact at a
third-party processor and can still receive broadcasts. Contradicts Privacy §8 and GDPR Art 17 /
PIPA s.12. One line in the delete route.

### B3. Everything else in the deletion promise is true ✅
Verified against production FK delete rules (`pg_constraint`), not against the migration files:

- CASCADE: `pool_messages`, `pool_message_reactions`, `pool_pinned_messages`, `user_presence`,
  `push_tokens`, `push_notification_preferences`, all five push-dedup tables, `terms_agreements`,
  `user_activity`, `pool_members`, `pool_entries`.
- All **29** entry-level children cascade — including every `league_*` table (`league_predictions`,
  `league_table_predictions`, `league_lms_picks`, `league_lms_survivors`, `league_duels` on both
  `entry_a` and `entry_b`), `badge_unlocks`, `entry_xp_state` and the shadow-engine tables. A league,
  Showdown or LMS player can erase cleanly; the delete route's WC-era explicit deletes are belt-and-braces.
- `pool_purchases.purchased_by` is SET NULL — exactly the "retained, unlinked from your account"
  promise in Privacy §8.
- `notification_log.user_id` is NO ACTION and the route nulls it explicitly. ⚠ but see C5.

### B4. The consent audit trail is destroyed on deletion ⚠
`terms_agreements.user_id` CASCADEs. The table exists *to be* an audit trail (see `lib/termsVersion.ts`),
and after a user deletes their account there is no record they ever accepted anything — including for the
limitation period in which they could still bring a claim. Privacy §8 does disclose this, so it is honest;
it is a risk trade-off worth taking deliberately rather than by FK default. Option: retain
`{hashed user id, terms_version, timestamp}` under legitimate interests and say so.

---

## C. Content safety and moderation — the largest structural gap 🔴

### C1. There is no report, no block, and no takedown path
Grep across `app/`, `components/`, `lib/`, `mobile/` finds **no** report, flag, block, mute, or profanity
filter anywhere. Banter is immutable by design and Privacy §6 says so: "no one using the app can edit or
remove a message once it is sent… contact us and we will deal with it directly."

That is a moderation *policy*, and three regimes require a *mechanism*:

- **DSA Art 16** — every hosting provider offering services in the EU must operate a notice-and-action
  mechanism. The micro/small-enterprise exemption (Art 19) covers Section 3 obligations, **not** Art 16.
  Art 12 also requires a single electronic point of contact, and Art 14 requires the T&Cs to describe
  moderation policies and redress.
- **UK Online Safety Act** — Banter makes SportPool a user-to-user service. Duties include an illegal
  content risk assessment, a **children's access assessment** (you admit 13+), and **complaints and
  reporting mechanisms**. Proportionate for a small service, but not optional, and the records must exist.
- **Apple Guideline 1.2 / Google Play UGC policy** — a report mechanism, the ability to block abusive
  users, and a content filter are prerequisites for shipping a UGC app. The current binary passed review;
  the next submission is the exposure.

**Recommended build:** a report action on each message → a moderation queue; a `hidden_at` soft-hide so
staff can take content down without breaking the "nobody can edit history" promise to members; block/mute;
a published contact address and response SLA; a short moderation section in the Terms.

### C2. No age assurance at signup 🔴
`app/signup/SignupForm.tsx` collects name, username, email, password and a Terms checkbox. No date of
birth, no age gate. Terms §2 asserts 13+ "or older if your country sets a higher minimum" — but nothing
tests it.

- **GDPR Art 8**: the digital-consent age is 16 in Germany, the Netherlands and Ireland (13–16 varies).
  Consent-based processing for a 14-year-old German user is invalid without parental authorisation.
- **OSA**: a children's access assessment effectively presumes under-18 users.
- App Store / Play age rating and the under-13 promise in Privacy §10 both rest on this.

**Fix:** a neutral DOB field at signup, hard-block under 13, store the declared age band.

### C3. No DMCA designated agent ⚠
Hosting is US-based (Vercel, Supabase `us-east-1`) and users post text while admins upload images
(`app/api/admin/branded-pools/upload-logo/route.ts`). §512 safe harbour requires a designated agent
registered with the US Copyright Office (~$6) and published contact details. Neither exists.

### C4. Public, indexable pages are disclosed in the Terms but not the Privacy Policy ⚠
`app/robots.ts` allows crawling everything except `/admin/`, `/dashboard`, `/profile`, `/api/`,
password routes and `/account-deleted` — so `/play/[slug]` and `/tv/[slug]` are indexable, and
`app/play/[slug]/getLeaderboard.ts` publishes `entry_name` and scores. Terms §7 handles this well
(including the advice to choose a non-identifying entry name); Privacy §6 never mentions it.
Add a sentence to §6 and confirm each branded pool's admin opted in.

### C5. `notification_log` keeps the raw email address ⚠
Privacy §8: email records are "retained but stripped of your account identifier". The delete route nulls
`user_id`, but the table also has an `email` column — which *is* the identifier, and leaves the row fully
re-identifiable. The table is currently empty (0 rows in production), so this is cheap to fix now:
null the `email` alongside `user_id`, or hash it.

---

## D. Consumer, payments and IP

### D1. The 14-day withdrawal carve-out needs Paddle configured to match ⚠
Refund §3/§4 grant a 14-day refund "provided your pool has not started", then treat purchases as
non-refundable after the first deadline locks. For EU/UK consumers that carve-out only holds if the
checkout captured **express consent to immediate performance and acknowledgement of losing the
withdrawal right** (CRD Art 16(m) / CCRs reg 37). Paddle supports this — verify it is switched on before
go-live. (The "where the law gives you more, the law wins" saving clause in §1 is good mitigation.)

### D2. The pricing page sells against the prize pool ⚠
`app/pricing/page.tsx:129–134`: *"We never take a cut of your prize pool"* / *"100% of it goes to the
players"*. Terms §6, FAQ and the Refund policy all disclaim any involvement in entry fees — legally
consistent, but pricing is the one surface where prize money is a **product benefit**. Where paid-entry
sports contests are regulated (several US states; Apple Guideline 5.3), marketing that leans on the prize
pool undercuts the "we are merely the software" position. Recommend describing the flat fee without
invoking the prize pool.

### D3. Club crests are hot-linked from the data provider ⚠
Verified: `league_clubs.crest_url` → `https://media.api-sports.io/football/teams/487.png`. Terms §10 has
the right nominative-use disclaimer (no affiliation, marks belong to owners). The exposure is
*contractual*, not trademark: confirm your API-Football plan permits image display, storage of their data,
and **redistribution** — you re-expose that data on public TV boards and through your own API. Get the
plan terms on file and check the attribution requirement.

### D4. In-app purchases ✅ for now
No upgrade/Paddle/pricing surface exists in `mobile/` — verified by grep. The moment a pool upgrade is
purchasable or linkable from the iOS app, Apple Guideline 3.1.1 applies. Keep the purchase path on the web
or use IAP; Refund §7 already anticipates this correctly.

---

## E. Verified good — no action

- **Cookie consent is real.** No CookieYes script in the repo and none in the production HTML, but the
  GTM container `GTM-PGCGQK62` references `cdn-cookieyes.com/client_data/` and carries Consent Mode /
  `analytics_storage` — the banner is deployed through GTM. Privacy §4 is accurate.
  *(One manual check owed: load the site in a clean browser and confirm no `_ga` cookie before consent.)*
- **Fonts are self-hosted** via `next/font/google` at build time — Privacy §4's "no request to Google
  Fonts" claim holds (this is the claim most sites get wrong).
- **Security headers on production:** HSTS 2y, `X-Frame-Options: DENY` + `frame-ancestors 'none'`
  (except the intentionally embeddable `/tv/*`), nosniff, `strict-origin-when-cross-origin`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- **In-app account deletion** exists on mobile (`mobile/app/settings/index.tsx:116`) — Apple 5.1.1(v).
- **Terms version integrity:** one constant feeds both the page and `terms_agreements.terms_version`.
- **No special-category data:** no injury/health data is stored in production (the `/injuries` work is
  research only) — no GDPR Art 9 exposure.
- **Deletion is blocked for pool admins before anything is destroyed** — the ownership guard runs first.

---

## F. Process items (not code)

1. Signed DPAs + SCCs: Supabase, Vercel, Resend, Paddle, Sentry, CookieYes, Expo, Google (GA4).
2. Article 30 record of processing activities.
3. Breach response runbook — GDPR 72h, PIPA "without undue delay".
4. Designate the Privacy Officer (PIPA) and confirm `privacy@sportpool.io` and `support@sportpool.io`
   actually route to a monitored inbox.
5. iOS privacy manifest: no app-level `PrivacyInfo.xcprivacy` and no `ios.privacyManifests` in
   `mobile/app.json`. Add before the next binary submission.
6. Refresh App Store / Play data-safety labels to match the Privacy Policy (presence, chat, push token,
   crash telemetry).
7. Accessibility / European Accessibility Act: as a micro-enterprise (<10 staff, <€2m turnover) the
   service obligations do not bite. Revisit if that changes — an accessibility statement and EN 301 549
   conformance would become mandatory for the e-commerce path.

---

## Suggested order

1. Name the entity (A1) — unblocks A2, A3 and the Paddle launch.
2. B1 + B2 — two small code changes that close live compliance breaches.
3. C2 age gate — small, and it underpins three separate regimes.
4. C1 report/block/takedown — the biggest build, and the one that gates the next app-store submission.
5. A3 privacy-policy rewrite (legal bases, retention, full rights list, transfers, representative) and
   A2 PIPA section — do them in one editing pass with C4 and C5.
6. D1, D3 — verification tasks, not builds.
