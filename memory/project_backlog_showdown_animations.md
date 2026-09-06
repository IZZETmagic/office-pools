---
name: project-backlog-showdown-animations
description: Stack recommendation for Showdown's visualizations and animations — server-side MP4 (tunnel walk-out reveal), share-preview images, in-app reveal playback, designer hand-off animations.
metadata:
  type: project
---

Showdown's virality wedge is the **tunnel walk-out reveal** — a 4-second MP4 of two players' avatars walking out of a stadium tunnel, generated per pairing and shared to WhatsApp. Adjacent surfaces (matchup card with H2H form guide, duel result card, Banter Cup payout reveal) need their own visualizations and motion. There's no single tool that covers all four surfaces — this doc records the recommended stack and the tradeoffs that led to it.

**Why:** This is a Phase 3a critical-path item (item 5) and is also explicitly called out in Phase 3a.pre as a standalone spike. The reveal animation is the highest-effort visual surface in Showdown and the one most likely to need iteration. Choosing the stack pre-WC means the Phase 3a sprint can integrate, not investigate.

**How to apply:**

Use the right tool for each surface — they have genuinely different constraints (server-side vs in-app, video vs image, programmatic vs designer-authored).

| Surface | Tool | Why |
| --- | --- | --- |
| Tunnel walk-out reveal MP4 (server-side render, per pairing) | **Remotion** | React-based programmatic video. Composition = React tree → ffmpeg pipeline. Renders deterministically on a server. Vercel-friendly via `@remotion/lambda` or self-hosted render. 4s clips render fast. Avatars + tunnel background + animation timing all expressible in React. |
| Matchup card share preview (OG image, per pairing) | **`next/og`** (a.k.a. `@vercel/og`) | Same React-component-to-image pipeline as Remotion but for static PNG/JPEG. Way cheaper than video. WhatsApp + OG previews + share-sheet thumbnails all served from one route. |
| In-app reveal playback, matchup card transitions, duel result card flips (Expo) | **Reanimated + Skia** | Already in the mobile codebase. Native-thread animations, 60fps. Skia for the canvas-style reveal compositing. Reanimated for transitions and spring physics. |
| Vector loops / designer hand-off animations (e.g. confetti, Banter Cup trophy spin) | **Lottie** | Designer authors in After Effects → exports `.lottie` → drop into Expo via `lottie-react-native` and into web via `lottie-web`. Cross-platform, no engineering needed per loop. |

**Why not the alternatives:**
- **Puppeteer + ffmpeg** for browser-recorded MP4: works but brittle, slow renders, hard to scale. Remotion was built specifically to replace this pattern.
- **Rive** for interactive animations: excellent in-app, but server-render to MP4 is non-trivial — would need a parallel pipeline. Skip unless we adopt Rive across the mobile app for unrelated reasons.
- **Pure CSS/SVG animation**: zero MP4 output. Fine for in-browser preview, not for the shareable artifact.
- **Native After Effects render farms**: too heavy and expensive for per-pairing renders.

**Design phase tooling (Jun–Jul 2026, parallel to WC):**
- **Figma** (MCP available this session) — frame each surface, define motion specs, export assets.
- **Stitch** (MCP available) — generate screen variants quickly for matchup card / duel result card.
- **v0** — useful for spinning up the React component shape of matchup card and duel result card; iterate locally afterwards.

**Phase mapping:**
- Phase 3a.pre: standalone **Remotion** spike (one tunnel-walk-out composition rendered locally, 4s output, no Supabase integration). Validates the stack before Phase 3a commits.
- Phase 3a: integrate Remotion render route on web, wire to pairing engine, hook into WhatsApp share intent. Ship `next/og` matchup card previews.
- Phase 3b.1: Reanimated + Skia for in-app reveal playback + matchup card transitions. Lottie for any vector loops the designer hands off.

**Hard constraints (R-11 applied to the prep spike):**
- Spike lives in a sandbox path (e.g. `web/app/experiments/showdown-reveal/`) or a scratch repo — no production route, no WC-visible surface.
- No new dependencies added to the live web app's bundle during WC. Remotion is dev-time only until Phase 3a.
- No Supabase integration during WC.

**Open questions to settle during the prep spike:**
- Render cost per MP4 — local Remotion + Vercel function vs Remotion Lambda. Drives the render budget for high-volume gameweeks.
- Avatar source — Supabase storage URL fetched at render-time, or pre-resolved into the Remotion props? Caching strategy matters at gameweek-eve render bursts.
- Reveal length — 4s is the current spec; A/B against 3s and 5s during v1.1.

**Related artifacts:**
- `assets/showdown-storyboard/MOTION_SPEC.md` — v0.1 spec: beat structure, easing curves, layering, mood treatments, surface implementation notes. Companion to the storyboard frames in the same directory.
- `assets/showdown-storyboard/{cinematic,hyped,irreverent,office-pool}/` — storyboard frames per mood (Gemini Flash, 16:9).

Related: [[project-backlog-showdown]] (the full Showdown mode spec), [[project-backlog-showdown-prep]] (Phase 3a.pre scope including this spike).
