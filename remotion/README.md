# Remotion — the shareable Showdown cards

Two cards. The recap renders **on the server**; the reveal is composition-only
so far.

    POST /api/pools/:pool_id/duel-recap   { duelId }   ->  SSE progress, then a Blob URL
    POST /api/pools/:pool_id/duel-reveal  { duelId }   ->  same, for an unplayed duel

Measured end to end against the real sandbox on 2026-09-01: **snapshot restore
0.5s, render 27.5s, 30.1s total**, output served publicly as a valid MP4. The
0.5s is the entire argument for baking the snapshot into the build — a cold
`createSandbox` spends minutes provisioning and downloading a browser.

```bash
npx remotion studio remotion/index.ts                       # preview + scrub
npx remotion render remotion/index.ts DuelRecap out.mp4     # 5s, ~6s on an M-series laptop
npx remotion still  remotion/index.ts DuelReveal out.png --frame=52
npx tsx scripts/dump-duel-fixture.ts                        # refresh the recap's data
npx tsx scripts/dump-duel-fixture.ts --reveal               # refresh the reveal's
```

Four compositions, two cards:

| id | what it is |
|---|---|
| `DuelRecap` / `DuelRecapBye` | a **settled** duel — who won, what it paid |
| `DuelReveal` / `DuelRevealBye` | the seal coming off — who you drew, and their season so far |

Each bye has its own entry because it is a **different card**, not a duel with a
missing opponent, and because a variant nobody looks at is a variant that ships
wrong.

`theme.ts` holds what both share — the font load especially, which must be ONE
call: two `loadFont`s for the same family are two resources Remotion blocks
frame 0 on.

## ⚠ There is a narrow window in which a reveal is renderable

A reveal describes a matchweek that is **open but not yet played**. Measured
against the seeded pools on 2026-09-01:

| | MW1 | MW2 | MW3+ |
|---|---|---|---|
| revealed | yes | yes | **no** (sealed) |
| duels | none | all settled | unplayed |

So there is currently **no duel in the reveal window** — MW2 is revealed but
already settled (that is a recap), MW3 onward is sealed. The route correctly
404s on every one of them. That is the gate working, not a bug, but it means the
reveal cannot be demoed against real data until a matchweek opens, or until a
duel is seeded into that state deliberately.

## ⚠ The reveal has a security precondition the recap does not

`league_duel_is_revealed()` (migration 116) seals the draw so it opens one
matchweek at a time — which is the only reason the reveal is a reveal rather
than theatre. But it is enforced in **RLS**, which defends the authenticated
path only. `lib/league/poolCards.ts` already filters explicitly because it reads
duels with the service-role client, and **a server-side render is service-role
too**.

So whatever assembles `DuelRevealProps` must prove the matchweek is open before
rendering. The composition cannot check it. Get it wrong and you produce a
shareable MP4 naming somebody's future opponent, straight past the seal.

The recap has no equivalent hazard: a settled duel is already public to the pool.
That is why it is the safe one to take to server rendering first.

## Studio editability — how far it goes, and where it stops

Written against `/remotion-markup` and `/remotion-interactivity` on 2026-09-01,
after the compositions had already been built without them.

**Done:** `name` on every `AbsoluteFill`, `Interactive.Div` on the animated
leaves, `scale`/`translate`/`rotate` shorthands instead of `transform` strings
(zero `transform:` left in the folder), inline `interpolate()` on the top-level
animated elements, and `defaultProps` without type assertions — Remotion is
explicit that an assertion stops the Props editor saving visual edits back.

**Verified as a no-op:** five reference frames across all four compositions were
hashed before and after. All five byte-identical, so this changed structure and
nothing else.

**⚠ What Studio will still grey out, and why it cannot be fixed:**

- `Tunnel` computes ring positions with `Math.exp()` over a modulo of `frame`.
  Studio only interprets `interpolate(frame, …)` with hardcoded ranges; a
  procedural corridor is not expressible that way.
- `Flashbulbs` loops over seeded `random()`. Same reason.
- `Side`, `Figure`, `YouChip` and `NamePlate` receive an already-computed
  number as a prop. Studio can only read `frame`, so nothing inside them is
  keyframable. Inlining them would mean deleting the components and duplicating
  each one per instance — worse code for editability nobody has asked for yet.

**⚠ The one place we deliberately diverge:** the guidance wants every style value
hardcoded, including colour. Ours read `MIDNIGHT`, `LOUD` and `palette.*` from
`lib/design/tokens.ts`, which exists so web, RN and email cannot drift apart.
Hardcoding hex here to win a colour picker would reintroduce exactly the drift
that file was written to prevent. Animation is inlined; colour stays tokenised.

## ⚠ Three things that will bite

**1. `remotion` and `@remotion/cli` are devDependencies, deliberately.** Nothing
in `app/` imports them, so they stay out of the production tree and out of the
runtime bundle. The moment anything real imports `remotion` — a `<Player>`
preview in a route, or a server-side render — `remotion` has to move to
`dependencies` or the Vercel build will resolve it in dev and fail in
production. `@remotion/cli` can stay in dev either way; it is the studio and the
renderer CLI, not a runtime.

**2. These files block the Next build.** `tsconfig.json` includes `**/*.tsx`, so
`remotion/` is type-checked by `next build`, and the dev branch fails on any
type error. A composition is not a scratchpad — it is build-critical code that
happens not to be imported.

**3. Imports here are relative, not `@/`.** Remotion bundles outside Next with
its own webpack config, and the `@/*` alias is not guaranteed to resolve in it.
`../lib/design/...` always does. Only pure modules travel: `avatarGradient`,
`initials`, `duelPoints` and `tokens` have no Tailwind and no React, which is
why the faces come out the same colour as they do in the app. `components/ui/
Avatar.tsx` cannot be reused — it is Tailwind classes that do not exist here.

## What it may not decide

Nothing in a composition computes a score, a winner or a payout. `points`
arrives from `league_duels.points_a`, which SQL wrote, and the only
interpretation applied is `duelResult` from `lib/league/duelPoints.ts` — the
same function `DuelsTab` and `DuelRecapSheet` use. A composition doing its own
arithmetic would be an unregistered second scoring engine.

The bye is **structural** — `them === null`. `DUEL_BYE` and `DUEL_TIE` are both
250 by design, so anything reading the points calls a bye a tie.

## The rule it inherits

From `app/pools/[pool_id]/DuelRecapSheet.tsx`: **the recap may never be the only
way to learn the result.** That binds harder here than in the app — a video is
slower than a modal and gets watched by people outside the pool. The duel card,
the season table and the leaderboard must keep saying the same thing whether or
not this is ever rendered.

## Nunito, and it matches the app

Showdown carried a second typeface (Anton, condensed and uppercase) for one day.
It was removed from **both** the app and these compositions on 2026-09-01 — see
the header on `t-display` in `app/globals.css`. What survives on either side is
a WEIGHT: Nunito 900, tight tracking, no uppercase.

⚠ `LOUD` in `theme.ts` and `t-display` in `globals.css` are the same treatment
written twice, because a composition bundles outside Next and no Tailwind
utility exists here. **Change them together** or the app and its own share card
stop agreeing about what a duel looks like.

Nunito is loaded once, at module scope, weights 700/800/900 only — the
argument-less call fetches every weight and subset, and Remotion blocks frame 0
until they land. Remotion shares nothing with `next/font`, so the face has to be
declared here explicitly; `globals.css` flags the same hazard for React Native.

Sizes were not portable between the two faces: Anton is condensed, so a verdict
that fit on one line at 82px wrapped in Nunito and pushed the payout chip into
the story chrome. 64px here, measured against the longest name in the seeded
pools.

## Known gaps

- 🔴 **No rate limiting.** The route authenticates and caches, so it is not open
  to the world, but a member can still spend sandbox time in a loop across every
  duel they are in. Vercel Spend Management is the only backstop today.
- 🔴 **Never run on Vercel.** Everything above was verified locally against the
  real Sandbox and Blob services, which exercises the same code — but the build
  step has not yet run in a Vercel build, and `VERCEL_DEPLOYMENT_ID` keying is
  therefore unproven. A local snapshot pointer is sitting at
  `snapshot-cache/local.json` from that testing.
- ~~No Blob store~~ **DONE 2026-09-01.** `sportpool-media`
  (`store_A3g9r0uLfkxxzqOt`, iad1, public access) is linked to `office-pools` on
  all three environments, and `BLOB_READ_WRITE_TOKEN` is on the project and in
  `.env.local`. Verified with a put/head/get/del round trip.

  ⚠ Created with `npx vercel@latest`, not the repo's bundled CLI — `create-store
  --yes` only exists in 59.x. On 50.37.1 the link is an interactive prompt that
  cannot be answered in agent mode, which is how the unlinked `sportpool-renders`
  store came to exist. `delete-store` also refuses non-interactively, so that one
  has to go from the dashboard.

  ⚠ `access: 'public'` is deliberate — a share video has to be fetchable by URL
  from WhatsApp or Instagram. The consequence is that a recap naming two members
  of a private pool is viewable by anyone holding the link. Unguessable, but
  permanent, and not membership-checked.
- **The snapshot is a build step, and that couples deploys to Sandbox.**
  `npm run build` is now `next build && tsx scripts/create-snapshot.ts`, so a
  snapshot failure fails the deploy. Ryan's call, 2026-09-01, against the
  alternative of a first render that provisions from cold. The script no-ops off
  Vercel, so local builds are unaffected; `npm run snapshot` forces it.

## ⚠ An upstream bug you will hit again

`addBundleToSandbox` fails on **any bundle containing a subdirectory**:

    cannot create directory '/vercel/sandbox/remotion-bundle/public':
    No such file or directory

`collectBundleDirectories` derives directories from the ancestors of *file*
paths, so the bundle root — which is nobody's ancestor — is never created, and
the first `mkDir` of a subdirectory fails. The upstream template only works
because its bundle is flat.

We avoid it by bundling with `--public-dir` pointed at an empty directory that
`create-snapshot.ts` creates at build time. It has to be **truly** empty: a
single committed `.gitkeep` reproduces the failure exactly, which is how it was
found. That also drops 1.6MB of the app's `public/` (flags, icons, badges) that
no composition ever referenced.

If a composition ever needs a real static asset, this workaround stops being
viable and the upstream bug has to be handled properly.
