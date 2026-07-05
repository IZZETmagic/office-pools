# Project context for Claude

## What this is

**office-pools** — a pick'em pool app, currently shipping a FIFA World Cup 2026 product.

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
