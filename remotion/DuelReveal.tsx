// =============================================================
// THE WALKOUT
// =============================================================
// A settled fixture is a result. An opening matchweek is an ANNOUNCEMENT, and
// this is it: you come down a tunnel, three gates each tell you a little more
// about who is waiting, the doors blow open, and there they are.
//
// ## The shape
//
//   0–44     THE WALK      dark corridor, camera cruising, you established
//   44–170   THE GATES     three light gates, each carrying one clue
//   170–200  THE CHARGE    camera accelerates, streaks, the mouth grows
//   200–208  THE BLOWOUT   full white
//   208–214  THE BREATH    black. the only still moment in the film
//   214–244  THE REVEAL    them, and the whole corridor floods their colour
//   244–270  THE VERDICT   what it means, held
//
// ⚠ THE BREATH IS NOT DEAD AIR. Six frames of black between the blowout and the
// reveal is the cheapest thing in this file and it does more than any of the
// motion: without it the flash and the face are one event and the eye never
// resets. Every broadcast reveal has this beat. Do not "tighten" it away.
//
// ## ⚠ THE CLUE LADDER IS THE POINT
//
// EA reveal a player by nationality, then position, then club — three facts,
// each narrowing it, and by the third you have usually guessed. The pleasure is
// deduction, not surprise. Ours are record → duel points → rank, broad to
// narrow, and RANK IS LAST because in a ten-person pool it is effectively the
// answer.
//
// ⚠ Every clue is already on the leaderboard. Nothing is withheld and sold back:
// "we show you three public facts before naming them" passes the disclosure
// gate. And nothing is randomised — the round-robin fixed this pairing weeks
// ago — so gate 5 is untouched.
//
// ## ⚠ NOTHING IDENTIFIES THEM BEFORE THE BLOWOUT
//
// Not the initials, not the name, and NOT THEIR COLOUR — a member's colour is
// their identity everywhere else in the product, so a corridor glowing pink
// names them as surely as a caption would. Before the flash the tunnel is white.
// This has been got wrong twice already; check it again if you touch the timing.
//
// ## ⚠ EVERY VALUE COMES FROM `useCurrentFrame()`
//
// `useFrame()` from @react-three/fiber is forbidden in Remotion: it runs on its
// own clock, so each rendered frame would sample the scene at a different point
// and the file would flicker. The corridor moves because the CAMERA does, in
// world space, off the frame number.
// =============================================================

import React from 'react'
import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  random,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion'
import { ThreeCanvas } from '@remotion/three'

import { avatarGradient, avatarColor, avatarInk } from '../lib/design/avatarGradient'
import { getInitials } from '../lib/design/initials'
import { FONT, LOUD, CLAMP } from './theme'

export type RevealPerson = {
  user_id: string
  full_name: string | null
  username: string | null
}

/** What a side has done so far. Derived — no column holds the record. */
export type RevealSeason = {
  duelPoints: number
  rank: number | null
  won: number
  tied: number
  lost: number
}

export type RevealSide = {
  name: string
  person: RevealPerson
  season: RevealSeason
}

export type DuelRevealProps = {
  poolName: string
  matchweek: number
  you: RevealSide
  /** ⚠ NULL IS A BYE — structural everywhere in Showdown. */
  them: RevealSide | null
}

export const DUEL_REVEAL_DURATION = 270
export const DUEL_REVEAL_SIZE = { width: 1080, height: 1920 }

/**
 * The beats, in frames at 30fps.
 *
 * ⚠ `gateN` is the frame the camera PASSES that gate, and it is tied to the
 * travel curve rather than guessed. Move one and the other has to move: at
 * cruise the camera covers ~0.14 world units a frame, so gates sitting at
 * z = 6.2 / 12.1 / 18.0 are met at ~44 / ~86 / ~128.
 */
const BEAT = {
  walk: 0,
  gate1: 44,
  gate2: 86,
  gate3: 128,
  charge: 170,
  blowout: 200,
  breath: 208,
  reveal: 214,
  verdict: 244,
} as const

/** Where the gates sit in world space. Paired with the frames above. */
const GATE_Z = [6.2, 12.1, 18.0]

export const DuelReveal: React.FC<DuelRevealProps> = ({
  poolName,
  matchweek,
  you,
  them,
}) => {
  const frame = useCurrentFrame()
  const { fps, width, height } = useVideoConfig()
  const bye = them === null

  const spr = (delay: number, damping = 14) =>
    spring({ frame: frame - delay, fps, config: { damping, mass: 0.7 } })

  /**
   * ⚠ THE CAMERA ACCELERATES, and that is most of why this reads as a walkout
   * rather than a screensaver. A constant crawl down a corridor has no arrival
   * in it: cruise through the gates, then run at the doors.
   */
  const travel = interpolate(frame, [0, BEAT.charge, BEAT.blowout], [0, 23.8, 62], {
    easing: Easing.in(Easing.quad),
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const lit = interpolate(frame, [BEAT.reveal, BEAT.reveal + 10], [0, 1], CLAMP)
  const revealed = frame >= BEAT.reveal

  const ink = them ? avatarInk(them.person.user_id) : null
  const ring = them ? avatarColor(them.person.user_id) : '#FFFFFF'

  const blowout = interpolate(
    frame,
    [BEAT.charge + 16, BEAT.blowout, BEAT.breath, BEAT.breath + 1],
    [0, 1, 1, 0],
    CLAMP,
  )
  const breath = frame >= BEAT.breath && frame < BEAT.reveal

  const clues = them
    ? [
        { label: 'THEIR RECORD', value: `${them.season.won}W ${them.season.tied}T ${them.season.lost}L` },
        { label: 'DUEL POINTS', value: String(them.season.duelPoints) },
        { label: 'POOL RANK', value: them.season.rank === null ? 'UNRANKED' : `#${them.season.rank}` },
      ]
    : []
  const gateFrames = [BEAT.gate1, BEAT.gate2, BEAT.gate3]

  return (
    <AbsoluteFill name="Walkout" style={{ backgroundColor: '#04060A', fontFamily: FONT }}>
      <Corridor
        travel={travel}
        width={width}
        height={height}
        tint={lit > 0.5 ? ink?.soft ?? null : null}
        lit={lit}
        /* ⚠ WINDOWED, NOT CLAMPED. `[charge, blowout] -> [0, 1]` holds at 1
           for the rest of the film, so the speed streaks were still flying past
           behind the name plate thirty frames after the camera had stopped.
           They belong to the charge and have to die with it. */
        charge={interpolate(
          frame,
          [BEAT.charge, BEAT.blowout - 6, BEAT.blowout],
          [0, 1, 0],
          CLAMP,
        )}
      />

      {/* ---- you, established before anything else happens ---- */}
      <YouChip side={you} t={spr(10)} dim={revealed ? 0.45 : 1} />

      {/* ---- one clue per gate, arriving and leaving with it ---- */}
      {!revealed &&
        clues.map((c, i) => <ClueCard key={i} clue={c} at={gateFrames[i]} frame={frame} />)}

      {/* ---- who it is ----
          ⚠ NO `@remotion/effects` HERE, AND IT IS NOT AN OVERSIGHT. `zoomBlur`
          and `glow` were built and rendered — they work — but they CANNOT share
          a composition with `<ThreeCanvas>`. Two WebGL consumers, and the second
          one loses:
             · via `<HtmlInCanvas>` — ThreeCanvas's own `delayRender` never
               clears and the render times out at 28s.
             · via `<Solid effects={[glow()]}>` — "Glow framebuffer incomplete:
               0x8cd6", i.e. GL_FRAMEBUFFER_INCOMPLETE_ATTACHMENT.
          Both verified by rendering, not inferred. The corridor is worth more
          than the effect, so the punch below is done in-scene instead.

          The proper fix, if it ever matters enough: render the corridor to a
          file and post-process it as a `<Video effects={[...]}>` in a second
          composition. That is a two-stage pipeline and the server render path
          does not have one. */}
      {revealed && (
        <>
        {/* ⚠ THE BLOOM, standing in for `glow()`. A radial gradient in her
            colour, blown large and faded out over 24 frames. `glow()` would
            bloom only the pixels above a luminance threshold, which is better;
            this is a hand-placed approximation of the same idea and it costs no
            WebGL context. */}
        <AbsoluteFill
          name="Bloom"
          style={{
            background: `radial-gradient(closest-side, color-mix(in srgb, ${ring} 55%, transparent), transparent 70%)`,
            scale: interpolate(frame, [BEAT.reveal, BEAT.reveal + 26], [0.35, 1.9], {
              easing: Easing.out(Easing.cubic),
              output: 'perceptual-scale',
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
            opacity: interpolate(frame, [BEAT.reveal, BEAT.reveal + 6, BEAT.reveal + 30], [0, 0.9, 0.22], CLAMP),
          }}
        />

        {/* The shockwave: one ring thrown outward on impact. */}
        <AbsoluteFill name="Shockwave" style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div
            style={{
              width: 380,
              height: 380,
              borderRadius: '50%',
              border: `3px solid ${ring}`,
              scale: interpolate(frame, [BEAT.reveal, BEAT.reveal + 22], [0.8, 3.4], {
                easing: Easing.out(Easing.cubic),
                output: 'perceptual-scale',
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              }),
              opacity: interpolate(frame, [BEAT.reveal, BEAT.reveal + 4, BEAT.reveal + 22], [0, 0.7, 0], CLAMP),
            }}
          />
        </AbsoluteFill>

        <AbsoluteFill name="Opponent" style={{ alignItems: 'center', justifyContent: 'center' }}>
          {them ? (
            <Interactive.Div
              name="Face"
              style={{
                // ⚠ CENTRED, WITH NO MARGIN NUDGE. The rings are centred on the
                // same canvas, so any offset here sits the face off-axis inside
                // its own tunnel — which is exactly what Ryan spotted.
                width: 380,
                height: 380,
                borderRadius: '50%',
                backgroundImage: avatarGradient(them.person.user_id),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 140,
                fontWeight: 900,
                color: '#FFFFFF',
                scale: interpolate(frame, [BEAT.reveal, BEAT.reveal + 18], [0.55, 1], {
                  easing: Easing.spring({ damping: 12 }),
                  output: 'perceptual-scale',
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                }),
                // ⚠ THE SLAM, standing in for `zoomBlur()`. A plain CSS blur is
                // isotropic where a zoom blur is radial, so it is not the same
                // effect — but decaying from 26px over 10 frames while the disc
                // springs up reads as arriving at speed, which is what the
                // effect was for. No WebGL, so it coexists with the corridor.
                filter: `blur(${interpolate(frame, [BEAT.reveal, BEAT.reveal + 10], [26, 0], CLAMP)}px)`,
                boxShadow: `0 0 0 12px color-mix(in srgb, ${ring} 60%, transparent), 0 0 160px color-mix(in srgb, ${ring} 55%, transparent)`,
              }}
            >
              {getInitials(them.person.full_name, them.person.username)}
            </Interactive.Div>
          ) : (
            <div
              style={{
                width: 380,
                height: 380,
                borderRadius: '50%',
                border: '8px dashed rgba(255,255,255,0.16)',
              }}
            />
          )}
        </AbsoluteFill>

        <AbsoluteFill name="Lower third" style={{ justifyContent: 'flex-end', padding: 96 }}>
          <div style={{ width: '100%' }}>
            <div
              style={{
                height: 10,
                borderRadius: 999,
                marginBottom: 28,
                background: ring,
                transformOrigin: 'left center',
                scale: interpolate(frame, [BEAT.reveal + 4, BEAT.reveal + 20], [0, 1], {
                  easing: Easing.out(Easing.cubic),
                  extrapolateLeft: 'clamp',
                  extrapolateRight: 'clamp',
                }),
              }}
            />
            <Interactive.Div
              name="Name"
              style={{
                fontFamily: 'inherit',
                fontWeight: 900,
                letterSpacing: '-0.01em',
                fontSize: 96,
                lineHeight: 1.05,
                color: '#FFFFFF',
                translate: interpolate(
                  frame,
                  [BEAT.reveal + 6, BEAT.reveal + 24],
                  ['0px 70px', '0px 0px'],
                  { easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
                ),
                opacity: interpolate(frame, [BEAT.reveal + 6, BEAT.reveal + 22], [0, 1], CLAMP),
              }}
            >
              {bye ? 'No opponent this week' : them!.name}
            </Interactive.Div>
            {them && <StatLine season={them.season} frame={frame} accent={ring} />}
            <div
              style={{
                marginTop: 34,
                fontSize: 26,
                fontWeight: 800,
                letterSpacing: 4,
                whiteSpace: 'nowrap',
                color: 'rgba(255,255,255,0.38)',
                opacity: interpolate(frame, [BEAT.verdict, BEAT.verdict + 12], [0, 1], CLAMP),
              }}
            >
              {poolName.toUpperCase()} · MATCHWEEK {matchweek}
            </div>
          </div>
        </AbsoluteFill>
        </>
      )}

      {/* ---- the blowout, then the breath ---- */}
      {blowout > 0 && (
        <AbsoluteFill name="Blowout" style={{ backgroundColor: `rgba(255,255,255,${blowout})` }} />
      )}
      {breath && <AbsoluteFill name="Breath" style={{ backgroundColor: '#04060A' }} />}

      {/* ⚠ NO SOUND, and it is a decision rather than an omission. A whoosh
          per gate and a shutter on the doors were built and rendered; Ryan cut
          them 2026-09-01. A share video that makes noise the moment it
          autoplays in somebody's feed is a share video people scroll past, and
          the walkout has to read with the sound off because that is how most of
          them will be watched.

          ⚠ THE FEEL BELONGS ON MOBILE INSTEAD — see the haptics note in
          app/pools/[pool_id]/DuelRevealCeremony.tsx. A phone can give you the
          gates through your hand without making a sound in a quiet room. */}
    </AbsoluteFill>
  )
}

// -------------------------------------------------------------
// THE CORRIDOR
// -------------------------------------------------------------

/**
 * A real tunnel: Three.js, real perspective, real fog, a camera that travels.
 *
 * ⚠ THIS WAS CONCENTRIC `<div>`s. Scaled rectangles only grow — nothing is ever
 * further away, so there is no parallax, no depth falloff and no camera. It
 * read, correctly, as a portal rather than a hallway.
 *
 * ⚠ FOG IS DOING MOST OF THE WORK. Depth falloff is what gives a corridor
 * length; without it the far rings are as crisp as the near ones and the whole
 * thing flattens back into circles.
 *
 * ⚠ THE MODULO WRAP IS SAFE HERE and is not in the DOM twin. Each frame is
 * computed from scratch, so a ring jumping from the near end to the far end is
 * one discrete change. A CSS transition INTERPOLATES THROUGH the same wrap,
 * which is what sent half the rings backwards in the app version.
 */
function Corridor({
  travel,
  width,
  height,
  tint,
  lit,
  charge,
}: {
  travel: number
  width: number
  height: number
  tint: string | null
  lit: number
  charge: number
}) {
  const COUNT = 20
  const SPACING = 3.6
  const DEPTH = COUNT * SPACING
  const colour = tint ?? '#FFFFFF'

  return (
    <ThreeCanvas width={width} height={height}>
      <ambientLight intensity={0.16} />
      <pointLight position={[0, 0, -DEPTH]} intensity={220} distance={120} color="#FFFFFF" />
      <fog attach="fog" args={['#04060A', 5, DEPTH * 0.85]} />

      {/* The rings the camera flies through. */}
      {Array.from({ length: COUNT }).map((_, i) => {
        const z = -(((i * SPACING - travel) % DEPTH) + DEPTH) % DEPTH
        return (
          <mesh key={`r${i}`} position={[0, 0, z]}>
            <torusGeometry args={[3.1, 0.05, 8, 64]} />
            <meshStandardMaterial
              color={colour}
              emissive={colour}
              emissiveIntensity={0.45 + 2.2 * lit}
              toneMapped={false}
            />
          </mesh>
        )
      })}

      {/* ⚠ THE GATES ARE FIXED IN WORLD SPACE, not scheduled against the frame.
          That is why they feel like places you pass rather than events that
          happen at you: the camera arrives at them, they do not arrive at it. */}
      {GATE_Z.map((gz, i) => (
        <mesh key={`g${i}`} position={[0, 0, -(gz - travel)]}>
          <torusGeometry args={[3.35, 0.16, 10, 64]} />
          <meshStandardMaterial
            color={colour}
            emissive={colour}
            emissiveIntensity={2.4 + 2 * lit}
            toneMapped={false}
          />
        </mesh>
      ))}

      {/* ⚠ A FLOOR, or this is a portal and not a hallway. Rings alone are
          concentric circles on black — good perspective with nothing to stand
          on. A plane running away from the camera is what tells the eye it is
          looking ALONG something rather than INTO it. */}
      <mesh position={[0, -3.1, -DEPTH / 2]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[7, DEPTH]} />
        <meshStandardMaterial color="#080D18" emissive="#141A2E" emissiveIntensity={0.7} />
      </mesh>

      {/* Speed streaks, only during the charge — so the acceleration is seen
          rather than merely implied by the numbers. */}
      {charge > 0.02 &&
        Array.from({ length: 26 }).map((_, i) => {
          const a = random(`streak-angle-${i}`) * Math.PI * 2
          const r = 1.9 + random(`streak-r-${i}`) * 1.1
          const z = -(((random(`streak-z-${i}`) * DEPTH - travel * 1.6) % DEPTH) + DEPTH) % DEPTH
          return (
            <mesh key={`s${i}`} position={[Math.cos(a) * r, Math.sin(a) * r, z]}>
              <boxGeometry args={[0.018, 0.018, 2.2 + charge * 5]} />
              <meshBasicMaterial color="#FFFFFF" transparent opacity={charge * 0.5} toneMapped={false} />
            </mesh>
          )
        })}

      {/* The mouth. What you are walking toward. */}
      <mesh position={[0, 0, -DEPTH]}>
        <circleGeometry args={[2.8, 64]} />
        <meshBasicMaterial color="#FFFFFF" toneMapped={false} />
      </mesh>
    </ThreeCanvas>
  )
}

// -------------------------------------------------------------
// THE FURNITURE
// -------------------------------------------------------------

/**
 * One clue, arriving with its gate and leaving with it.
 *
 * ⚠ THE TEXT IS HTML, NOT 3D. Type in the scene needs a texture and comes out
 * soft at this size; overlaying it lets the geometry carry the physical pass
 * while the words stay crisp. Both are locked to the same frame, which is what
 * makes them read as one object rather than a caption over a video.
 */
function ClueCard({
  clue,
  at,
  frame,
}: {
  clue: { label: string; value: string }
  at: number
  frame: number
}) {
  const IN = at - 22
  const OUT = at + 8
  if (frame < IN || frame > OUT + 8) return null

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Interactive.Div
        name="Clue"
        style={{
          textAlign: 'center',
          opacity: interpolate(frame, [IN, IN + 8, OUT, OUT + 8], [0, 1, 1, 0], CLAMP),
          // Scales past the camera, so the type travels with its gate.
          scale: interpolate(frame, [IN, OUT + 8], [0.72, 2.4], {
            easing: Easing.in(Easing.quad),
            output: 'perceptual-scale',
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          }),
        }}
      >
        <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: 8, color: 'rgba(255,255,255,0.45)' }}>
          {clue.label}
        </div>
        <div style={{ ...LOUD, fontSize: 132, color: '#FFFFFF', marginTop: 14 }}>{clue.value}</div>
      </Interactive.Div>
    </AbsoluteFill>
  )
}

/** Your own side, small and early — the film is about the other one. */
function YouChip({ side, t, dim }: { side: RevealSide; t: number; dim: number }) {
  const s = side.season
  return (
    <div
      style={{
        position: 'absolute',
        top: 96,
        left: 96,
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        opacity: t * dim,
        translate: `${(1 - t) * -40}px 0px`,
      }}
    >
      <div
        style={{
          width: 92,
          height: 92,
          borderRadius: '50%',
          backgroundImage: avatarGradient(side.person.user_id),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 34,
          fontWeight: 900,
          color: '#FFFFFF',
          boxShadow: '0 0 0 4px rgba(255,255,255,0.12)',
        }}
      >
        {getInitials(side.person.full_name, side.person.username)}
      </div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: 4, color: 'rgba(255,255,255,0.4)' }}>
          YOU
        </div>
        <div style={{ fontSize: 30, fontWeight: 800, color: 'rgba(255,255,255,0.8)' }}>
          {s.won}W {s.tied}T {s.lost}L
        </div>
      </div>
    </div>
  )
}

/** Their season, counting in under the name. */
function StatLine({
  season,
  frame,
  accent,
}: {
  season: RevealSeason
  frame: number
  accent: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: 34,
        marginTop: 28,
        opacity: interpolate(frame, [BEAT.reveal + 16, BEAT.reveal + 30], [0, 1], CLAMP),
        translate: interpolate(
          frame,
          [BEAT.reveal + 16, BEAT.reveal + 30],
          ['0px 26px', '0px 0px'],
          { easing: Easing.out(Easing.cubic), extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
        ),
      }}
    >
      <span style={{ fontSize: 38, fontWeight: 800, color: 'rgba(255,255,255,0.66)' }}>
        {season.won}W {season.tied}T {season.lost}L
      </span>
      <span style={{ ...LOUD, fontSize: 56, color: accent }}>
        {Math.round(
          interpolate(frame, [BEAT.reveal + 18, BEAT.reveal + 44], [0, season.duelPoints], CLAMP),
        )}
      </span>
      <span style={{ fontSize: 30, fontWeight: 700, color: 'rgba(255,255,255,0.42)' }}>
        {season.rank === null ? 'unranked' : `#${season.rank} in the pool`}
      </span>
    </div>
  )
}
