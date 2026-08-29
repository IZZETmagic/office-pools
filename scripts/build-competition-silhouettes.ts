// =============================================================
// One-colour marks for the pool card's rail
// =============================================================
// Run this when a competition is added:
//
//   npx tsx scripts/build-competition-silhouettes.ts
//
// It fetches each competition's logo from the fixtures provider and writes a
// white-on-transparent mark to public/competitions/. The card knocks that mark
// out of the competition's colour — see `.pool-rail` in app/globals.css and
// lib/design/competitionMark.ts.
//
// ## Why derive anything at all
//
// The pool card never names its competition, so the rail is the whole answer to
// "which league is this?". A CSS knockout — `filter: brightness(0) invert(1)` —
// gets that for free on a mark with a transparent ground, and five of the seven
// assets are that. The other two are flat panels: Serie A is a dark mark on
// white, the Bundesliga a white mark on red. Forced white, both render as a
// solid block.
//
// ## The rules, in the order they were learned
//
//   1. THE GROUND IS THE MOST COMMON COLOUR. An asset with no meaningful
//      transparency has a ground; key it out and what is left is the mark. No
//      per-competition config — run over all seven it self-selects, keying
//      #D20515 out of the Bundesliga and #FEFFFE out of Serie A and leaving the
//      five transparent assets untouched.
//
//   2. THE PRIMARY INK IS SOLID, EVERY OTHER TONE STEPS DOWN. Two earlier
//      versions got this wrong. Clamping all ink to opaque destroyed any mark
//      whose structure is carried by colour: Serie A's "A" is dark navy inside
//      a mid-blue shield, and clamped, the shield became a featureless pentagon.
//      Spreading alpha by distance from the ground preserved the structure but
//      INVERTED it — the ground is white, so the navy "A" was furthest and came
//      out brightest, with the shield behind it, which is backwards from the
//      league's own one-colour artwork. So: the primary ink is the most common
//      colour left after the ground, it renders solid, and other tones step
//      down by their distance from it. That reproduces both leagues' published
//      treatments from one rule, with no notion of which shape is which.
//
//   3. TRIM TO THE INK. `background-size: contain` scales padding as readily as
//      artwork, and the assets carry wildly different amounts: Ligue 1's ink
//      fills 30% of its 267x150 frame, the Champions League's fills 100%. Ligue
//      1 drew at 36x20 in the rail where everything else got 36x34 or more.
//
// ⚠ THE OUTPUT IS COMMITTED, which means these are ours now. If the provider
// redraws a logo we do not pick it up until this is re-run.
// =============================================================

import { mkdirSync, copyFileSync, existsSync } from 'fs'
import { join } from 'path'
import { decodePng, encodePng } from './lib/png'

const OUT_DIR = join(process.cwd(), 'public', 'competitions')
const SRC_DIR = join(process.cwd(), 'scripts', 'assets', 'competition-logos')
const MARK_DIR = join(process.cwd(), 'scripts', 'assets', 'competition-marks')

/** Keyed by `tournaments.external_league_id`, exactly as the colour is. */
const COMPETITIONS: Record<number, string> = {
  1: 'World Cup',
  2: 'Champions League',
  39: 'Premier League',
  61: 'Ligue 1',
  78: 'Bundesliga',
  135: 'Serie A',
  140: 'La Liga',
}

const CLEAR_ALPHA = 16 // below this a pixel counts as transparent
const OPAQUE_ASSET_MAX = 0.25 // clear-pixel share under which we derive a ground
const EDGE_BAND = 0.22 // of max ground distance: below it, ground or an edge blend
const TRIM_ALPHA = 8 // alpha above which a pixel counts as ink, for the bounding box
const TRIM_MARGIN = 0.04 // breathing room re-added around the trimmed mark
const INK_FLOOR = 0.7 // alpha of the ink tone furthest from the primary

/**
 * Per-competition floor, keyed the same way as everything else here.
 *
 * ⚠ IT HAS TO BE PER COMPETITION. The floor is a trade running in opposite
 * directions for the only two assets that need it: lower it and Serie A's "A"
 * gains contrast, while the Bundesliga's wordmark fades. No single value serves
 * both, so the default is the one that leaves the Bundesliga looking like a
 * hard knockout, and Serie A carries an override.
 *
 * Smaller than "per-competition config" sounds: it is one number with a working
 * default, so a new competition renders correctly without anyone opening this
 * file, and only a mark whose structure lives in mid-tones ever needs tuning.
 */
const FLOOR: Record<number, number> = { 135: 0.3 }

/**
 * Competitions we draw ourselves, because the provider has nothing usable.
 *
 * League 1 — the World Cup — returns api-football's generic placeholder: a
 * plain shield with diagonal hatching, not the competition's mark at all. No
 * amount of keying rescues a placeholder.
 *
 * ⚠ ORIGINAL, NOT A TRACE. The FIFA World Cup Trophy is a 1971 Gazzaniga
 * sculpture still under copyright, and stock "silhouettes" of it carry unknown
 * licensing, so this is a trophy of our own drawing.
 */
const OWN_MARK: Record<number, string> = { 1: 'trophy.svg' }

/** The provider's logo URL — the same one CreatePoolModal builds for the wizard. */
const providerLogo = (leagueId: number) =>
  `https://media.api-sports.io/football/leagues/${leagueId}.png`

type Rgb = [number, number, number]

/** Most common colour among the pixels `keep` admits, averaged within its bin. */
function dominantColour(data: Buffer, keep?: (p: number) => boolean): Rgb | null {
  const bins = new Map<number, [number, number, number, number]>()
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < CLEAR_ALPHA) continue
    if (keep && !keep(i / 4)) continue
    const k = (data[i] >> 4) * 256 + (data[i + 1] >> 4) * 16 + (data[i + 2] >> 4)
    const e = bins.get(k) ?? [0, 0, 0, 0]
    e[0] += data[i]
    e[1] += data[i + 1]
    e[2] += data[i + 2]
    e[3]++
    bins.set(k, e)
  }
  let best: [number, number, number, number] | null = null
  for (const e of bins.values()) if (!best || e[3] > best[3]) best = e
  return best && [best[0] / best[3], best[1] / best[3], best[2] / best[3]]
}

/** Crop to the ink and re-add an even margin. See rule 3 in the header. */
function trim(w: number, h: number, px: Buffer): { w: number; h: number; px: Buffer } {
  let x0 = w
  let y0 = h
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] <= TRIM_ALPHA) continue
      if (x < x0) x0 = x
      if (x > x1) x1 = x
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  if (x1 < 0) return { w, h, px }
  const iw = x1 - x0 + 1
  const ih = y1 - y0 + 1
  const pad = Math.round(Math.max(iw, ih) * TRIM_MARGIN)
  const ow = iw + pad * 2
  const oh = ih + pad * 2
  const out = Buffer.alloc(ow * oh * 4)
  for (let y = 0; y < ih; y++) {
    px.copy(out, ((y + pad) * ow + pad) * 4, ((y + y0) * w + x0) * 4, ((y + y0) * w + x1 + 1) * 4)
  }
  return { w: ow, h: oh, px: out }
}

type Result = {
  clearPct: number
  ground: Rgb | null
  primary: Rgb | null
  inkFloor: number | null
  size: [number, number]
}

export function silhouette(srcPath: string, outPath: string, leagueId: number): Result {
  const inkFloor = FLOOR[leagueId] ?? INK_FLOOR
  const { w, h, data } = decodePng(srcPath)

  let clear = 0
  for (let i = 3; i < data.length; i += 4) if (data[i] < CLEAR_ALPHA) clear++
  const clearPct = clear / (w * h)
  const px = Buffer.alloc(w * h * 4)

  // Already has a transparent ground: keep its alpha, flatten colour to white.
  if (clearPct >= OPAQUE_ASSET_MAX) {
    for (let i = 0; i < data.length; i += 4) {
      px[i] = px[i + 1] = px[i + 2] = 255
      px[i + 3] = data[i + 3]
    }
    const t = trim(w, h, px)
    encodePng(outPath, t.w, t.h, t.px)
    return { clearPct, ground: null, primary: null, inkFloor: null, size: [t.w, t.h] }
  }

  // 1. the ground, and how far every pixel sits from it
  const ground = dominantColour(data)
  if (!ground) throw new Error(`${srcPath}: no opaque pixels`)
  const [gr, gg, gb] = ground
  const fromGround = new Float32Array(w * h)
  let groundMax = 0
  for (let p = 0; p < w * h; p++) {
    const i = p * 4
    const d = Math.hypot(data[i] - gr, data[i + 1] - gg, data[i + 2] - gb)
    fromGround[p] = d
    if (d > groundMax) groundMax = d
  }
  const edge = groundMax * EDGE_BAND

  // 2. the primary ink — the dominant colour among pixels clear of the ground
  const primary = dominantColour(data, (p) => fromGround[p] > edge)
  if (!primary) throw new Error(`${srcPath}: ground fills the frame, nothing left to draw`)
  const [pr, pg, pb] = primary
  const fromPrimary = new Float32Array(w * h)
  let primaryMax = 0
  for (let p = 0; p < w * h; p++) {
    const i = p * 4
    const d = Math.hypot(data[i] - pr, data[i + 1] - pg, data[i + 2] - pb)
    fromPrimary[p] = d
    if (fromGround[p] > edge && d > primaryMax) primaryMax = d
  }

  // 3. primary ink solid, other tones stepping down toward the floor
  for (let p = 0; p < w * h; p++) {
    const i = p * 4
    const a =
      fromGround[p] <= edge
        ? fromGround[p] / edge
        : 1 - (1 - inkFloor) * (primaryMax ? fromPrimary[p] / primaryMax : 0)
    px[i] = px[i + 1] = px[i + 2] = 255
    px[i + 3] = Math.round(255 * Math.max(0, Math.min(1, a)) * (data[i + 3] / 255))
  }

  const t = trim(w, h, px)
  encodePng(outPath, t.w, t.h, t.px)
  return {
    clearPct,
    ground: ground.map(Math.round) as Rgb,
    primary: primary.map(Math.round) as Rgb,
    inkFloor,
    size: [t.w, t.h],
  }
}

async function fetchLogo(leagueId: number, dest: string): Promise<void> {
  if (existsSync(dest)) return
  const res = await fetch(providerLogo(leagueId))
  if (!res.ok) throw new Error(`${providerLogo(leagueId)} → HTTP ${res.status}`)
  const { writeFileSync } = await import('fs')
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  mkdirSync(SRC_DIR, { recursive: true })

  const hex = (c: Rgb) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`
  const drawn = ([w, h]: [number, number]) => {
    const s = Math.min(36 / w, 66 / h)
    return `${Math.round(w * s)}x${Math.round(h * s)}`
  }

  console.log('competition'.padEnd(18), 'clear'.padStart(7), 'floor'.padStart(7), 'in rail'.padStart(8), ' source')
  for (const [idStr, name] of Object.entries(COMPETITIONS)) {
    const id = Number(idStr)

    if (OWN_MARK[id]) {
      const src = join(MARK_DIR, OWN_MARK[id])
      copyFileSync(src, join(OUT_DIR, `${id}.svg`))
      console.log(name.padEnd(18), 'n/a'.padStart(7), '—'.padStart(7), '—'.padStart(8), ` our own mark, ${OWN_MARK[id]}`)
      continue
    }

    const src = join(SRC_DIR, `${id}.png`)
    await fetchLogo(id, src)
    const r = silhouette(src, join(OUT_DIR, `${id}.png`), id)
    const floor = r.inkFloor == null ? '—' : r.inkFloor.toFixed(2) + (FLOOR[id] ? ' *' : '')
    const detail = r.ground
      ? `${hex(r.ground)} ground, ${hex(r.primary!)} primary ink`
      : 'already transparent, passed through'
    console.log(
      name.padEnd(18),
      (100 * r.clearPct).toFixed(1).padStart(6) + '%',
      floor.padStart(7),
      drawn(r.size).padStart(8),
      ` ${detail}`,
    )
  }
  console.log('\n* per-competition floor override')
  console.log(`\nwrote ${Object.keys(COMPETITIONS).length} marks to public/competitions/`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
