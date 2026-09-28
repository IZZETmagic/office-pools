'use client'

// =============================================================
// Three identity systems, one primitive
// =============================================================
// Every screen in the app gets the same three options, so the choice is made
// ONCE and applied everywhere rather than negotiated per surface.
//
//   1. SOLID    — filled plate in the club's primary, code in white.
//   2. DUOTONE  — the same fill with a ring in the club's SECOND colour.
//                 Two colours separate clubs one cannot: Arsenal's red-and-white
//                 against United's red-and-black.
//   3. OUTLINE  — surface fill, club-colour border and code. Quiet, editorial,
//                 and the only one that survives on a coloured ground.
//
// Sizes are the app's real ones: 88 match header, 56 pool card, 36 match row,
// 28 table row, 20 dense list. Radii come from theme/radii.ts — never a
// circle, because the app's language is the rounded square.
// =============================================================

import type { CSSProperties } from 'react'
import type { Club } from './clubs'

export type System = 'solid' | 'duotone' | 'outline'
export type PlateSize = 20 | 28 | 36 | 56 | 88

/** radii.ts: xs 6, sm 12, md 18, lg 24. The plate steps with its size. */
const RADIUS: Record<PlateSize, number> = { 20: 6, 28: 8, 36: 10, 56: 16, 88: 24 }
const FONT: Record<PlateSize, number> = { 20: 8, 28: 10, 36: 12, 56: 17, 88: 26 }
const RING: Record<PlateSize, number> = { 20: 1.5, 28: 2, 36: 2.5, 56: 3.5, 88: 5 }

export const T = {
  snow: '#F7F8FC', surface: '#FFFFFF', mist: '#EEF1F8', silver: '#D4DAE8',
  slate: '#7B87A8', ink: '#1B2340', midnight: '#0B0F1A',
  primary: '#3B6EFF', accent: '#F5C518', green: '#22C55E', red: '#EF4444', amber: '#F59E0B',
  snowD: '#121520', surfaceD: '#1C2030', mistD: '#232840', silverD: '#2E3448',
  slateD: '#8B97B8', inkD: '#E8EAF0',
}

export const BLACK = '"Nunito", system-ui, sans-serif'

export function Plate({
  club, system, size = 36, onDark = false,
}: {
  club: Club
  system: System
  size?: PlateSize
  onDark?: boolean
}) {
  const base: CSSProperties = {
    width: size,
    height: size,
    borderRadius: RADIUS[size],
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
    fontFamily: BLACK,
    fontWeight: 900,
    fontSize: FONT[size],
    letterSpacing: size >= 56 ? '0.01em' : '0.02em',
    lineHeight: 1,
  }

  if (system === 'solid') {
    return <span style={{ ...base, background: club.primary, color: '#fff' }}>{club.code}</span>
  }
  if (system === 'duotone') {
    return (
      <span
        style={{
          ...base,
          background: club.primary,
          color: '#fff',
          boxShadow: `inset 0 0 0 ${RING[size]}px ${club.secondary}`,
        }}
      >
        {club.code}
      </span>
    )
  }
  return (
    <span
      style={{
        ...base,
        background: onDark ? 'rgba(255,255,255,0.06)' : '#fff',
        color: onDark ? lighten(club.primary) : club.primary,
        border: `${RING[size] * 0.8}px solid ${onDark ? lighten(club.primary) : club.primary}`,
      }}
    >
      {club.code}
    </span>
  )
}

/** Outline on a dark ground needs the ink lifted, or a navy club vanishes. */
export function lighten(hex: string): string {
  const s = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16))
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  if (lum > 0.45) return hex
  const mix = (c: number) => Math.round(c + (255 - c) * 0.45)
  return `#${[mix(r), mix(g), mix(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}

/** The bar a club owns on a wide surface — a rule, never a fill behind text. */
export function ClubRule({ club, system, width = 44 }: { club: Club; system: System; width?: number }) {
  if (system === 'duotone') {
    return (
      <span style={{ display: 'flex', width, height: 4, borderRadius: 2, overflow: 'hidden' }}>
        <span style={{ flex: 2, background: club.primary }} />
        <span style={{ flex: 1, background: club.secondary }} />
      </span>
    )
  }
  return <span style={{ display: 'block', width, height: 4, borderRadius: 2, background: club.primary }} />
}
