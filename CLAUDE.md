# Project context for Claude

## What this is

**SportPool** — a social sports prediction/pick'em platform. The repo is named `office-pools` and the
product is **SportPool**; they're the same thing.

FIFA World Cup 2026 shipped and completed (final 16 Jul 2026). The product is now generalising from
that single tournament into a **multi-competition, multi-sport platform** — Premier League 2026/27 is
the next target (Aug 2026), followed by Showdown (H2H duels). Expect World-Cup-shaped assumptions to
be baked into the schema and scoring; see `SPORTPOOL_PROGRAMME.md` → *Project: Multi-sport platform*.

## Stack

- **Web:** Next.js
- **Mobile:** Expo / React Native (`mobile/`)
- **Backend:** Supabase (Postgres + edge functions + crons)
- **Email:** Resend
- **Deploy:** Vercel

## Running it

Web (repo root):

```bash
npm run dev      # local dev server
npm run build    # production build
npm run test     # vitest
npm run lint     # eslint
```

Mobile (`mobile/`):

```bash
npm start        # expo start
npm run ios      # expo start --ios
npm run android  # expo start --android
```

## Planning and decisions

`SPORTPOOL_PROGRAMME.md` is the single source of truth for the backlog **and for decisions already
made**. Check it before proposing product changes — if a decision is recorded there, don't re-open it
without a reason, and if a proposal contradicts one, say so explicitly rather than quietly diverging.

## The disclosure gate

Before proposing any mechanic that touches **notifications, rewards, streaks, social pressure, or
engagement**, it must pass this:

> **Would it still work if you wrote its actual mechanism in a one-sentence tooltip?**
>
> *"We pre-built next season with your 14 members so you only have to confirm"* — passes.
> *"We hold your score back a day so you come back"* — fails.

Dark patterns are covert by definition. If explaining it plainly kills it, it was manipulation — so
don't propose it. Apply this when the feature is being *designed*, not at review time.

For a genuinely new mechanic, apply the full five gates in `SPORTPOOL_PROGRAMME.md` → *Project:
Multi-sport platform → Decision 8*. The fifth is the one specific to this product: **all uncertainty
must be inherited from the sporting event.** Randomness we add ourselves is gambling design, whether
or not money moves.
