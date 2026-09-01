// =============================================================
// THE DUEL RECAP — the shareable version
// =============================================================
// A settled Showdown duel as a 1080×1920 vertical card, which is the shape a
// WhatsApp status or an Instagram story wants. The in-app ceremony is
// DuelRecapSheet + the duel page; this is the artifact that LEAVES the app.
//
// ## ⚠ IT INHERITS THE RECAP'S RULE
//
// app/pools/[pool_id]/DuelRecapSheet.tsx carries it: **the recap may never be
// the only way to learn the result.** That applies here twice over — a video is
// slower than a modal, and it is watched by people who are not in the pool. The
// duel card, the season table and the leaderboard all say the same thing
// already, and must keep saying it whether or not this is ever rendered.
//
// ## ⚠ WHAT IT MAY NOT DECIDE
//
// Nothing here computes a score, a winner or a payout. `points` arrives from
// `league_duels.points_a`, which SQL wrote (migration 121), and the only
// interpretation applied to it is `duelResult` from lib/league/duelPoints.ts —
// the same function the web components use. A composition that did its own
// arithmetic would be a second scoring engine that nobody registered.
//
// ## ⚠ THE BYE IS STRUCTURAL
//
// `them === null` is a bye. It cannot be read off the points: DUEL_BYE and
// DUEL_TIE are both 250 by design, so `duelResult` calls a bye a tie. Check the
// opponent first, every time.
//
// ## ⚠ NUNITO THROUGHOUT — AND THAT IS DELIBERATE
//
// `t-display` in app/globals.css scopes Anton to Showdown's ceremony surfaces
// and allow-lists exactly what this card is made of: the two fighter names, the
// V between them, a duel scoreline, and the verdict on a decided duel. So the
// in-app duel card is part Anton, and this composition **is not**. Ryan's call,
// 2026-09-01, after seeing both rendered.
//
// ⚠ DO NOT "FIX" THIS BACK. The mismatch against `t-display` is intentional,
// not an oversight — a reader who finds the app's duel card in a condensed
// display face and this one in Nunito is looking at a decision, not a bug. If
// it is ever revisited, revisit it here and in globals.css together.
//
// Remotion shares nothing with next/font, so the face is loaded explicitly
// below — the same hazard globals.css already flags for the React Native side.
// =============================================================

import React from 'react'
import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'

// ⚠ RELATIVE, not `@/`. Remotion bundles this outside Next, so the tsconfig
// `@/*` alias is not guaranteed to resolve in its webpack config. These are
// pure functions with no Tailwind and no React, so they travel fine.
import { avatarGradient, avatarColor, avatarInk } from '../lib/design/avatarGradient'
import { getInitials } from '../lib/design/initials'
import { duelResult } from '../lib/league/duelPoints'
import { palette } from '../lib/design/tokens'

import { FONT, MIDNIGHT, LOUD, CLAMP, hexA } from './theme'

export type DuelPerson = {
  user_id: string
  full_name: string | null
  username: string | null
}

export type DuelSide = {
  name: string
  person: DuelPerson
  /** The weekly accuracy the duel was judged on. */
  score: number
}

export type DuelRecapProps = {
  poolName: string
  matchweek: number
  you: DuelSide
  /** ⚠ NULL IS A BYE. See the header. */
  them: DuelSide | null
  /** What the engine paid `you`. Read from the row, never recomputed. */
  points: number
}

const W = 1080

export const DuelRecap: React.FC<DuelRecapProps> = ({
  poolName,
  matchweek,
  you,
  them,
  points,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  // ⚠ Structural, before the points are read.
  const bye = them === null
  const outcome = bye ? 'bye' : duelResult(points) ?? 'lost'

  const headline = bye
    ? 'No opponent this week'
    : outcome === 'won'
      ? `You beat ${them!.name}`
      : outcome === 'tied'
        ? `Level with ${them!.name}`
        : `${them!.name} beat you`

  const youInk = avatarInk(you.person.user_id)
  const themInk = them ? avatarInk(them.person.user_id) : null

  const enter = (delay: number) =>
    spring({ frame: frame - delay, fps, config: { damping: 14, mass: 0.7 } })

  return (
    <AbsoluteFill name="Duel recap" style={{ backgroundColor: MIDNIGHT, fontFamily: FONT }}>
      {/* The wash: each side's colour bled in from its own corner. `soft` rather
          than the raw stop because every colour is normalised to one lightness
          there — otherwise a peach corner outshines an indigo one and the
          picture reads as somebody already winning. */}
      <AbsoluteFill
        name="Colour wash"
        style={{
          opacity: interpolate(frame, [0, 24], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
          background: [
            `radial-gradient(60% 42% at 6% 30%, ${hexA(youInk.soft, 0.5)}, transparent 70%)`,
            themInk
              ? `radial-gradient(60% 42% at 94% 62%, ${hexA(themInk.soft, 0.45)}, transparent 70%)`
              : 'radial-gradient(60% 42% at 94% 62%, rgba(255,255,255,0.05), transparent 70%)',
          ].join(','),
        }}
      />

      {/* ⚠ CENTRED, NOT `space-between`. A story is 1080×1920 but the top and
          bottom ~15% belong to the platform — the poster's handle and avatar
          sit over one end, the reply bar and progress pips over the other.
          Spreading three blocks across the full height put the fixture line and
          the payout squarely under that chrome, and left a void through the
          middle where nothing was. Everything now lives in the safe band. */}
      <AbsoluteFill
        name="Safe band"
        style={{ padding: 96, justifyContent: 'center', alignItems: 'center', gap: 110 }}
      >
        {/* ---- the fixture line ---- */}
        <Interactive.Div
          name="Fixture line"
          style={{
            textAlign: 'center',
            opacity: interpolate(frame, [4, 20], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          <div style={{ fontSize: 34, letterSpacing: 6, color: 'rgba(255,255,255,0.45)', fontWeight: 800 }}>
            {poolName.toUpperCase()}
          </div>
          <div style={{ marginTop: 18, fontSize: 44, color: 'rgba(255,255,255,0.75)', fontWeight: 700 }}>
            Matchweek {matchweek}
          </div>
        </Interactive.Div>

        {/* ---- the two of you ---- */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 40, width: '100%', justifyContent: 'center' }}>
          <Side
            side={you}
            enter={enter(8)}
            from={-1}
            winner={outcome === 'won'}
            loser={outcome === 'lost'}
            frame={frame}
          />

          {/* The V. Lighter than the names either side so it separates them
              rather than competing with them. */}
          <Interactive.Div
            name="V"
            style={{
              fontFamily: 'inherit',
              fontWeight: 900,
              letterSpacing: '-0.01em',
              lineHeight: 1.05,
              fontSize: 56,
              color: 'rgba(255,255,255,0.28)',
              // ⚠ `scale`, not `transform` — only the shorthand properties are
              // interactively editable, and only inline `interpolate()` calls
              // become keyframes in Studio.
              scale: interpolate(frame, [20, 44], [0, 1], {
                easing: Easing.spring({ damping: 14 }),
                output: 'perceptual-scale',
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              }),
            }}
          >
            {bye ? '' : 'V'}
          </Interactive.Div>

          {them ? (
            <Side
              side={them}
              enter={enter(14)}
              from={1}
              winner={outcome === 'lost'}
              loser={outcome === 'won'}
              frame={frame}
            />
          ) : (
            <ByeSlot enter={enter(14)} />
          )}
        </div>

        {/* ---- what it was worth ---- */}
        <Interactive.Div
          name="Payout"
          style={{
            textAlign: 'center',
            translate: interpolate(frame, [64, 90], ['0px 60px', '0px 0px'], {
              easing: Easing.spring({ damping: 14 }),
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
            opacity: interpolate(frame, [64, 90], [0, 1], {
              easing: Easing.spring({ damping: 14 }),
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          {/* One treatment, bye or not. The two-branch version existed only to
              keep a bye out of the display face; with a single face there is no
              distinction left to draw, and drawing one anyway would say a bye
              matters less than a defeat. */}
          <Interactive.Div
            name="Verdict"
            style={{
              fontFamily: 'inherit',
              fontWeight: 900,
              letterSpacing: '-0.01em',
              fontSize: 64,
              color: '#FFFFFF',
              lineHeight: 1.2,
              maxWidth: 880,
            }}
          >
            {headline}
          </Interactive.Div>
          <div
            style={{
              marginTop: 36,
              display: 'inline-block',
              padding: '18px 44px',
              borderRadius: 999,
              fontSize: 44,
              fontWeight: 900,
              color: MIDNIGHT,
              // The chip takes the OUTCOME's colour, not the person's — green
              // for a win reads instantly, and a duel has only three outcomes.
              backgroundColor:
                outcome === 'won' ? palette.green.dark
                  : outcome === 'lost' ? palette.red.dark
                    : palette.amber.dark,
            }}
          >
            +{points} duel pts
          </div>
        </Interactive.Div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

// -------------------------------------------------------------
// PIECES
// -------------------------------------------------------------



function Side({
  side, enter, from, winner, loser, frame,
}: {
  side: DuelSide
  enter: number
  /** -1 slides in from the left, 1 from the right. */
  from: -1 | 1
  winner: boolean
  loser: boolean
  frame: number
}) {
  const ring = avatarColor(side.person.user_id)
  // The score counts up rather than appearing — the number IS the argument, so
  // it should take a moment to land.
  const shown = Math.round(interpolate(frame, [30, 62], [0, side.score], CLAMP))

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24,
        translate: `${(1 - enter) * from * 220}px 0px`,
        opacity: Math.min(1, enter * 1.4) * (loser ? 0.55 : 1),
      }}
    >
      <div
        style={{
          width: 260,
          height: 260,
          borderRadius: '50%',
          backgroundImage: avatarGradient(side.person.user_id),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#FFFFFF',
          fontSize: 96,
          fontWeight: 900,
          // The winner keeps a halo in their own colour. It is the same ring
          // DuelRecapSheet draws, at video scale.
          boxShadow: winner
            ? `0 0 0 10px color-mix(in srgb, ${ring} 55%, transparent), 0 0 90px color-mix(in srgb, ${ring} 45%, transparent)`
            : `0 0 0 6px rgba(255,255,255,0.08)`,
        }}
      >
        {getInitials(side.person.full_name, side.person.username)}
      </div>
      <div style={{ ...LOUD, fontWeight: 800, fontSize: 42, color: '#FFFFFF', maxWidth: 400, textAlign: 'center' }}>
        {side.name}
      </div>
      <div style={{ ...LOUD, fontSize: 92, color: winner ? ring : 'rgba(255,255,255,0.65)', lineHeight: 1 }}>
        {shown}
      </div>
    </div>
  )
}

/** A bye has no opponent to draw, and says so rather than showing an empty ring. */
function ByeSlot({ enter }: { enter: number }) {
  return (
    <div
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24,
        opacity: enter * 0.6,
      }}
    >
      <div
        style={{
          width: 260, height: 260, borderRadius: '50%',
          border: '6px dashed rgba(255,255,255,0.18)',
        }}
      />
      <div style={{ fontSize: 40, fontWeight: 800, color: 'rgba(255,255,255,0.5)' }}>Bye</div>
    </div>
  )
}

export const DUEL_RECAP_DURATION = 150
export const DUEL_RECAP_SIZE = { width: W, height: 1920 }
