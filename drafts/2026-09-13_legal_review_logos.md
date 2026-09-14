# SportPool — legal review: league and club marks

**Date:** 13 September 2026
**Scope:** every surface that renders a competition logo, club crest, trophy, flag or brand colour —
web, Expo app, email, Showdown video cards, TV boards, branded landing pages, marketing assets,
store graphics. Not legal advice; every claim below names the file or the query behind it.

**Summary.** Club crests are hot-linked and are the *lesser* problem. The sharper exposure is the
competition marks: the Premier League lion, the UEFA starball, and four more are **committed to this
repository, altered, served from our own domain, and bundled into both app-store binaries**. The
World Cup trophy was drawn from scratch specifically to avoid a copyright problem, and the comment
explaining why mitigates the wrong risk.

---

## 1. Inventory — what we show, from where, and whether we store it

| Mark | Source | Stored or linked | Where it renders |
|---|---|---|---|
| 6 competition logos (PL 39, UCL 2, Ligue 1 61, Bundesliga 78, Serie A 135, La Liga 140) | `media.api-sports.io/football/leagues/{id}.png` | **Stored, altered, committed** — `public/competitions/*.png` + `mobile/assets/competitions/*.png` | Pool-card rail (web, signed-in) + mobile app |
| The same 6 logos, **unmodified** | same | **Committed** — `scripts/assets/competition-logos/*.png` | Build input only; not served |
| World Cup mark | drawn in-house | `public/competitions/1.svg`, also inlined in `mobile/components/CompetitionRail.tsx` | Pool-card rail |
| Club crests (every club, every league) | `league_clubs.crest_url` → `media.api-sports.io/football/teams/*.png` | **Hot-linked**, URL stored | Web pool detail, results, tables, LMS, duels; `mobile/components/scouting/kit/Crest.tsx` |
| Competition brand colours | hand-entered | `lib/design/competitionColor.ts` (PL `#3D195B` — "the Premier League's own purple") | Rails, stripes, chips |
| Club brand colours | hand-entered, keyed off the crest URL's club id | `mobile/lib/design/clubColors.ts` | Match cards, duel cards |
| 48 national flags | — | `public/flags/` | World Cup surfaces |
| Competition **names** in copy and SEO | — | `app/competitions.ts`, `app/layout.tsx:93` (`"Premier League pool"`) | Landing page, metadata |

**Clean — no third-party marks found:** `public/og-image.png`, `public/play-store-feature-graphic.png`,
`public/marketing/*` (inspected), all email templates (`lib/email/`), Showdown video cards (`remotion/`),
TV boards (`app/tv/[slug]`) and branded landing pages (`app/play/[slug]`) — those render only the
sponsoring organisation's own uploaded logo.

**Exposure note:** on the web, the rail is behind auth (`/pools` 307s to `/login` for a logged-out
visitor — verified against production). The app binaries are not: the altered marks ship inside the
iOS and Android bundles, which is public distribution.

---

## 2. 🔴 The committed, altered competition marks

`scripts/build-competition-silhouettes.ts` fetches each league's logo from the provider, keys out the
background, forces the primary ink to white, trims and commits the result. Three separate acts:

1. **Copying** the unmodified marks into the repo (`scripts/assets/competition-logos/`). I opened
   `39.png` — it is the Premier League lion, complete and unaltered.
2. **Adapting** them into one-colour derivatives.
3. **Distributing** those derivatives from `sportpool.io` and inside two store binaries.

### Why the alteration makes it worse, not better
The header comment reasons that forcing the primary ink solid and stepping other tones down
"reproduces both leagues' published treatments from one rule". That is the problem stated out loud:
the output is aimed at each league's own **one-colour artwork**, a specific protected treatment.
Every one of these rights holders publishes brand guidelines that forbid recolouring, re-cutting or
re-proportioning the mark. Under copyright, adaptation is a restricted act in its own right; under
trade mark law, altering a mark defeats the "honest practices" proviso that the referential-use
defence depends on (EU TMR Art 14(2); UK TMA 1994 s.11(2)).

> `⚠ THE OUTPUT IS COMMITTED, which means these are ours now.`
> — `scripts/build-competition-silhouettes.ts`

True of the build pipeline. The opposite of true of the rights.

### The defences, and why they are thin here
- **Referential / nominative use** (EU TMR Art 14(1)(c); UK TMA s.11(2)(b)–(c); US *New Kids*,
  *Toyota v Tabari*) permits using a mark to say what your service refers to — but only "so much of
  the mark as is reasonably necessary". US courts have specifically held that reaching for the
  **stylised logo** when the **word** would identify the thing goes beyond that. Our rail could say
  "Premier League" in text, or use our own abstract mark in the league's colour. That it doesn't is
  the weak point, and it is a design choice we can reverse.
- **Reputation / unfair advantage** (EU Art 9(2)(c); UK s.10(3)) needs no confusion — only that we take
  advantage of the mark's repute without due cause. A rail whose entire job is to make a pool card
  instantly recognisable as *that* competition is, by its own design rationale, using the repute.
  **This gets materially worse the day paid tiers go on sale**, because the marks then decorate a
  paid product.
- **Copyright** has no nominative-use analogue. UK fair dealing has no category that fits, and US fair
  use is a poor fit for a commercial, non-transformative, whole-mark reproduction.

### The realistic enforcement route
Not litigation. The Premier League and UEFA both run standing brand-protection programmes, and the
cheap move against a small app is an IP complaint to Apple and Google, which can pull the listing with
little process and no notice. That is the risk to plan around.

### Options, best first
1. **Replace the device marks with our own.** The rail's job — per its own design note, answering
   "which competition is this?" — is already 80% carried by `competitionColor.ts`. A competition
   colour plus an abstract house mark plus the name in text does the job with zero third-party IP.
2. **Name-only rail.** Safest, plainest, loses the glanceability the rail was built for.
3. **Licence.** Complete for the sake of the list; realistically neither the PL nor UEFA licences
   device marks to a small prediction product.
4. **If crests stay:** use them unmodified only, in-app only, never in store graphics or marketing,
   and surface the disclaimer (see §5).

Either way: **delete `scripts/assets/competition-logos/*` from the working tree** — they are cached
build inputs with no runtime purpose. Note that git history keeps them; that is acceptable, since the
claim that matters is what we publish.

---

## 3. 🟠 The World Cup trophy — the comment mitigates the wrong risk

`public/competitions/1.svg`:

> `⚠ ORIGINAL, NOT A TRACE. The FIFA World Cup Trophy is a 1971 Gazzaniga sculpture still under`
> `copyright, and stock "silhouettes" of it carry unknown licensing, so this is a trophy of our own drawing.`

The instinct is right and the research is right. The conclusion does not follow. Drawing it yourself
avoids copying *someone else's drawing* — it does not avoid copying **the sculpture**. Reproduction of
an artistic work includes making a two-dimensional copy of a three-dimensional work (UK CDPA 1988
s.17(3), and the equivalent reproduction right in the InfoSoc Directive). Independent drawing of the
same object is not independent creation of a new work. Gazzaniga died in 2016, so copyright runs to
roughly 2086; FIFA additionally holds registered marks in the trophy's shape.

Two things do help: the mark is highly abstracted (a globe, a tapering body, cut slivers — arguably
below "substantial part"), and the World Cup competition is complete, so the asset is near-dormant.
Cheap to fix now: redraw as a generic ball-and-plinth that doesn't read as *that* trophy, or fall back
to the wordmark.

---

## 4. 🟠 Club crests — hot-linking, and one unverified dependency

`mobile/components/scouting/kit/Crest.tsx` and the web equivalents render `league_clubs.crest_url`
directly — verified in production: `https://media.api-sports.io/football/teams/487.png`. We never copy
the file, which is genuinely better than storing it: in the EU, embedding a work that was made freely
available **with the rightsholder's consent** is not a fresh communication to the public
(*Svensson*, *BestWater*, and *VG Bild-Kunst* on circumvented protections).

That defence rests entirely on the provider being authorised to make those images available — which I
could not verify: `api-football.com/terms` returns 403 to automated fetching, and the RapidAPI listing
carries nothing. **This is the single most valuable thing to go and read.** Specific questions to
answer from your own plan's terms:

1. Does the licence cover the **images** at `media.api-sports.io`, or only the JSON data?
2. Is display in a **commercial** product permitted, and does it change on a paid plan?
3. May we **store or cache** their data (we do — `league_clubs`, fixtures, standings)?
4. May we **redistribute** it (we do — our own API, and public TV boards)?
5. Is there an **attribution** requirement we are not meeting?
6. Do they disclaim logo rights and push responsibility onto the customer? (Most sports-data providers
   do. If so, the crests are unlicensed in our hands regardless of what we pay them.)

If the answer to (1) or (6) is unfavourable, the fallback already exists and already looks good:
`mobile/lib/design/clubColors.ts` plus the short name. Crest-free club identity is a solved design
problem in this codebase.

---

## 5. 🟡 Hygiene items

- **The disclaimer is buried.** Terms §10 says it well — no affiliation, marks belong to their owners,
  data from third-party providers. It appears nowhere a user actually sees a mark. Put one line in the
  footer and on the landing page's competition strip. It doesn't create a licence, but under the
  honest-practices test and the US "no suggestion of sponsorship" limb it is exactly the sort of thing
  that is weighed, and it is free.
- **Word marks are fine; keep them descriptive.** `keywords: ["… Premier League pool"]` and the
  competition names in copy are ordinary referential use. Two lines not to cross: never use a
  competition name as a **product or mode name** ("SportPool Premier League"), and never put one in an
  **app-store title or subtitle** — that reads as branding, not reference.
- **Brand colours are low risk.** Single colours are rarely protectable without acquired
  distinctiveness (*Libertel*). Using the PL's purple as an accent beside the competition's name is
  fine, and it is the mitigation for §2, not a problem of its own.
- **Check the store listings.** Screenshots and feature graphics can't be inspected from the repo. If
  any show crests or league marks, replace them — store artwork is marketing, the most exposed
  category, and it is also where an IP complaint lands.
- **Avatar shop (Vector 1):** the recorded "colourways, not crests" decision is correct and this review
  supports it. A cosmetic in a club's colours that the **user** names is not merchandise; the same
  cosmetic sold *as* a club item, with the club's name or crest, is unofficial merchandise and the
  brightest line on this page.

---

## 6. Priority

1. **Decide the rail's future** (§2). It is the only 🔴 and it touches a committed asset, a build
   script, both binaries and a guard test — cheaper to change now than after the PL season opens.
2. **Read the API-Football plan terms** (§4). One afternoon; it determines whether crests stay at all.
3. **Delete the cached unmodified logos** from the tree (§2).
4. **Redraw or retire the trophy** (§3). Low urgency, low cost.
5. **Footer disclaimer + store-listing check** (§5).
6. Re-run this review before paid tiers go live — commercial use changes the weighting of every
   defence above.
