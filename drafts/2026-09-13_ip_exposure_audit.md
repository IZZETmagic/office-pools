# SportPool — third-party IP exposure audit

**Date:** 13 September 2026
**Question asked:** everywhere the app may be exposed through team logos, names, images "or anything".
**Scope:** every tracked binary asset (excluding `ios/`), every hot-linked external URL, every
third-party name in shipped copy, all 874 mobile + ~660 web npm packages, fonts, icon sets, and the
data feed itself. Not legal advice. Each row names the file, query or command behind it.

**Method.** `git ls-files` for the full asset inventory; `grep` for every external media host; a
licence scan over both `node_modules` trees; direct inspection of the images whose provenance was not
obvious; live checks against production. Where I could not verify something, it is listed in §14
rather than guessed at.

---

## 1. The ladder

| # | Thing | Source | Stored? | Surface | Verdict |
|---|---|---|---|---|---|
| 1 | 6 competition logos, **altered** | provider | **Yes — repo + both app binaries** | Pool card rail | 🔴 Remove |
| 2 | Player photographs | provider | No — hot-linked | 3 mobile screens | 🔴 Remove |
| 3 | 6 competition logos, unmodified | provider | **Yes — `scripts/assets/`** | Build input | 🔴 Delete |
| 4 | World Cup trophy silhouette | drawn in-house | Yes | Pool card rail | 🟠 Redraw |
| 5 | Club crests | provider | No — hot-linked | Web + mobile, many | 🟠 Verify, then decide |
| 6 | HugeIcons **Pro** | paid registry | In bundle | Web + mobile icons | 🟡 Verify licence |
| 7 | Remotion | npm | In build | Video cards | 🟡 Eligible now; tripwire |
| 8 | Sponsor logos in branded pools | uploaded by us | Yes — Supabase Storage | Public pages | 🟡 No indemnity |
| 9 | "FIFA World Cup 2026" in copy | — | — | How-to-play tabs | 🟡 Trim |
| 10 | React logo PNGs | Expo template | Yes — `mobile/assets/images/` | Unused | 🟡 Delete |
| 11 | Competition + club **names** | — | Yes (facts) | Everywhere | 🟢 Keep |
| 12 | Fixtures, results, stats | provider | Yes | Everywhere | 🟢 Keep |
| 13 | National flags | **flagcdn.com** | Yes — `public/flags/` | WC surfaces + email | 🟢 Public domain |
| 14 | Fonts (Geist, Nunito, Roboto Mono) | Google Fonts | Self-hosted | Everywhere | 🟢 OFL |
| 15 | MaterialIcons, SF Symbols | Google / Apple | In bundle | Mobile | 🟢 Correct pattern |
| 16 | Badge art, storyboards, app icon, OG, marketing | in-house / AI | Yes | Various | 🟢 See §11 |

---

## 2. 🔴 Competition marks — stored, altered, distributed

Covered in full in `2026-09-13_legal_review_logos.md` §2. In one line: `scripts/build-competition-
silhouettes.ts` fetches each league's logo, recolours and trims it, and commits the result to
`public/competitions/` and `mobile/assets/competitions/`, while the **unmodified** originals sit in
`scripts/assets/competition-logos/` (I opened `39.png` — the Premier League lion, whole).

Three acts — copying, adapting, distributing — and the alteration is an aggravating factor, since
every one of those brand guidelines forbids recolouring the mark. Referential use protects naming a
competition far more than reproducing its device.

**The escape hatch already exists.** `getCompetitionMark()` returns `null` for any competition without
a mark and `CompetitionRail` falls back to the plain colour bar — a deliberate, tested path. Emptying
the `MARKED` set removes every one of these in a line. See `app/dev-harness/crest-free` for what
replaces it.

## 3. 🔴 Player photographs

`mobile/lib/playerStats.ts:335` builds `media.api-sports.io/football/players/{id}.png`; rendered in
`scouting/kit/PeopleCard.tsx:226`, `match/LineupsTab.tsx:543`, `match/PlayerStatSheet.tsx:132`.
Web does not use them. Nothing is stored — the file explicitly declined a `photo_url` column because
the URL is derivable, which means **not one of these images has ever been copied to our servers**.

Hardest category on this page, because three rights stack on one image:

1. **Copyright in the photograph** — the photographer or agency (Getty, PA, Action Images, club media).
   Not the player, not the club, not the data provider.
2. **The player's own rights** — passing off / false endorsement in the UK (*Irvine v TalkSport*,
   *Rihanna v Topshop*); genuine personality rights in much of the EU (Germany KUG §22, France Art 9
   Code civil, Spain LO 1/1982). Squad likenesses are normally cleared collectively (FIFPRO).
3. **Data protection** — a photo of an identifiable living person is personal data needing a lawful
   basis and Art 14 notice. *Not* special-category data: that would require biometric identification.

With a crest there is one owner. Here there are two or three, and the data provider is none of them —
so even a favourable answer on §5 would not cover this.

**Fix:** `playerPhotoUrl()` returns `null`. One line, no migration, no assets. The card's own comment
says the photo is *"Decorative — the name sits beside it"*, and name + shirt number + position are
facts we own. Substitute: an initial disc in the club's colour, which also fixes the players who
currently have no photo at all.

## 4. 🟠 The World Cup trophy

`public/competitions/1.svg` was drawn in-house specifically to avoid copying a stock silhouette. Right
instinct, wrong risk: reproduction of an artistic work includes making a 2D copy of a 3D work (UK CDPA
s.17(3)), so drawing it yourself avoids copying someone's *drawing*, not the *sculpture*. Gazzaniga
died in 2016 → protected to roughly 2086; FIFA also holds marks in the trophy shape. Mitigated by
heavy abstraction and by the competition being over. Redraw as a generic ball-and-plinth.

## 5. 🟠 Club crests

Hot-linked from `league_clubs.crest_url` (verified in production:
`media.api-sports.io/football/teams/487.png`), never copied, and **never proxied** — I checked
specifically: the only "proxy" references in the codebase are about protecting the API quota, not
about re-serving images. So the EU embedding line of cases (*Svensson*, *BestWater*, *VG Bild-Kunst*)
is available **if** the provider is authorised to publish them. That is unverified — see §14.

Fallback if the answer is unfavourable: `mobile/lib/design/clubColors.ts` + the abbreviation. Already
built, already contrast-checked, already has a clash rule.

## 6. 🟡 HugeIcons Pro

`@hugeicons-pro/core-solid-rounded@4.2.3` resolves from `https://npm.hugeicons.com` with a token read
from `HUGEICONS_NPM_TOKEN` (`.npmrc` is committed; the token is **not** — good practice, and the file
says so). It ships in both web and mobile bundles.

The package's `package.json` declares `"license": "MIT"`, but that covers the code wrapper, not the
artwork — Pro is a paid product behind a token-gated registry. Questions to answer from your
subscription:

1. Does the plan cover **distribution in a commercial application**, including inside app-store binaries?
2. Is it per-developer, per-application, or per-organisation — and does monetising change the tier?
3. Is it perpetual, or does lapsing the subscription end the right to ship builds already published?

If any answer is unfavourable, `@hugeicons/core-free-icons` and `lucide-react-native` are already
installed.

## 7. 🟡 Remotion — compliant today, with a tripwire

`node_modules/remotion/LICENSE.md`: free for individuals, non-profits, and **for-profit organisations
with up to 3 employees**; a paid company licence above that. The only disallowed use is building a
competing product from its code, which is not what the video cards do.

So SportPool is eligible today. **The trigger is the fourth employee, not revenue** — which is exactly
the kind of condition that gets missed. Put it in the programme next to the entity decision.

## 8. 🟢 Software licences otherwise clean

Scanned both trees by declared licence field. Nothing copyleft ships in either client bundle:

- Web: 547 MIT, 38 ISC, 35 Apache-2.0, 12 BSD-2, 8 BSD-3, 7 MPL-2.0, plus permissive singletons.
- Mobile (874 packages): the only flags are `node-forge` (BSD-3 **or** GPL-2.0 — take BSD),
  `caniuse-lite` (CC-BY-4.0, build-time data), and two dev-only packages with no declared licence.
- `@img/sharp-libvips-darwin-arm64` is **LGPL-3.0-or-later** — dynamically linked, build-time, never
  in the client bundle. Standard and fine; do not statically link it.

## 9. 🟢 Fonts

Geist, Geist Mono and Nunito come through `next/font/google` — compiled and served from our own domain,
which is both the OFL-compliant path and the reason Privacy §4's "no request to Google Fonts" claim is
true. Mobile uses `@expo-google-fonts/nunito` and `roboto-mono`, also OFL. Anton was removed in
September. Keep the OFL notices with any redistributed font files.

## 10. 🟢 Icon sets — the SF Symbols pattern is already right

`@expo/vector-icons`: **only MaterialIcons** is imported (Apache-2.0, notice only, no attribution
burden). No FontAwesome, so no CC-BY attribution obligation. No Twemoji or Noto emoji is bundled.

SF Symbols via `expo-symbols` appears in `mobile/components/ui/icon-symbol.ios.tsx` — a `.ios.tsx`
platform file, with `icon-symbol.tsx` falling back to MaterialIcons elsewhere. Apple's licence permits
SF Symbols **only in apps for Apple platforms**, so the platform split is exactly the compliant
pattern. Keep it: never let a SF Symbol name render on Android or web.

## 11. 🟢 Our own artwork — with one deletion and one caveat

- **Flags** (`public/flags/`, 48): from **flagcdn.com** — confirmed by the conversion comment in
  `app/api/admin/send-announcement/route.ts:77`. Flagpedia's flags are public domain, free for any use,
  no attribution required. Self-hosting them is fine.
- **Badge art** (`public/badges/` 23, `mobile/assets/badge-previews-v4/` and four earlier iteration
  sets): in-house. No third-party mark in the ones I inspected.
- **Showdown storyboards** (`assets/showdown-storyboard/`, 32 frames): AI-generated via
  `generate.sh`; the prompts are generic stadium-tunnel scenes with no club or league reference.
  Internal only — not in `public/` or `mobile/assets/`, so not shipped.
- **App icon, OG image, Play Store feature graphic, all marketing assets**: inspected — own artwork,
  no third-party marks.
- ⚠ **Delete `mobile/assets/images/react-logo*.png` and `partial-react-logo.png`** — Expo template
  leftovers. The React atom is a Meta trademark. Unreferenced, so Metro will not bundle them, but they
  are in the repo and cost nothing to remove.
- **Provenance caveat:** AI-generated images are, in the US, not protected by copyright (no human
  author) and in the UK sit awkwardly under CDPA s.9(3). This does not expose you to a claim — it means
  **you cannot stop anyone copying that artwork**. If the badge set is AI-generated, record how each
  asset was made; if any of it matters commercially, have it redrawn by a human under a work-for-hire
  agreement.

## 12. 🟡 Sponsor logos in branded pools — the one place we host someone else's mark

`app/api/admin/branded-pools/upload-logo/route.ts` puts a sponsor's logo in the `pool-logos` bucket,
and it is then displayed on **public, search-indexable** pages (`/play/[slug]`) and on embeddable TV
boards used on venue screens.

Terms §7 asserts these are "used with permission of the sponsoring organization", and §8 has a user
warranty ("You represent that you have the right to post it"). What is missing is an **indemnity** —
there is no indemnity clause anywhere in the Terms. Today, if a sponsor uploads a mark they do not
own, SportPool absorbs the claim with only a representation to point at.

**Fix:** add an indemnity to the Terms, and capture an explicit rights warranty in the branded-pool
admin flow at upload time, with a timestamp.

## 13. 🟢🟡 The data itself, and the word "official"

Fixtures, results, standings and player stats are facts. There is no copyright in a fixture *list*
(*Football DataCo v Yahoo*, CJEU 2012) and the sui generis database right is narrow (*BHB v William
Hill*). Your exposure on data is contractual — your agreement with the provider — not proprietary.

Note for the future, from [Football DataCo's supply terms](https://statsperform.com/fdcterms): even a
**licensed** prediction game may not "claim or suggest that they are in any way official and/or
powered by official data", and may not compete with the league's own fantasy game. I checked every
public surface — landing page, pricing, FAQ, competitions strip, metadata, `app.json` — and **nothing
claims official status, endorsement or partnership.** Keep it that way.

One trim: "FIFA World Cup 2026" appears in `HowToPlayTab.tsx` (three times) and `app/competitions.ts`.
Referential and defensible, but "FIFA" adds no descriptive value there and FIFA's marks are the most
aggressively policed in sport. "World Cup 2026" says the same thing. The landing metadata already
dropped it deliberately.

---

## 14. What I could not verify

1. **API-Football's licence terms** — `api-football.com/terms` returns 403 to automated fetching and
   the RapidAPI listing carries nothing. Determines §5 entirely, and it is the single highest-value
   hour of work on this list.
2. **The HugeIcons Pro subscription** — cannot see what was purchased. Three questions in §6.
3. **App Store / Play Store listing artwork** — screenshots are not in the repo. If any show crests or
   league marks, they are marketing, which is the most exposed category and the place an IP complaint
   lands.
4. **Badge art provenance** — no record of how it was made. §11.

---

## 15. What "we cannot infringe on anything" means in practice

It cannot mean using nothing of anyone's — you cannot run a football product without naming clubs and
reporting results, and the law does not ask you to. It means **nothing unlicensed that is not
defensible.** Three tiers:

**Remove — unlicensed and hard to defend:**
1. The six altered competition marks + the committed originals (§2) — the `MARKED` set, the build
   script, three asset folders, the inlined RN SVG, two guard tests. Half a day.
2. Player photographs (§3) — one function returns `null`.
3. The trophy silhouette (§4) — redraw or retire.
4. `react-logo*.png` (§11) — `git rm`.

**Verify — cheap, and each one decides a category:**
5. API-Football's terms → decides the club crests (§5).
6. HugeIcons Pro subscription scope (§6).
7. Store listing artwork (§14).

**Keep — necessary, referential, and defensible:**
8. Competition and club names, in your own type. Never in a product name, app-store title, domain or
   logo; never "official" or "powered by".
9. All fixture, result and stat data.
10. Brand colours, flags, fonts, your own artwork.
11. Add the one-line disclaimer to the footer. Terms §10 already says it; nobody sees it.

Do the four removals and the audit has no unlicensed third-party artwork anywhere in the product. The
rest is contract verification and one sentence of copy.
