'use client'

// =============================================================
// Avatar motion — idle life, as a throwaway harness
// =============================================================
// Three idle animations on the real composed avatar: a blink, a slow gaze drift, and a hair
// sway. Nothing here is wired into the product; it exists to be looked at.
//
// ⚠ The compositor is NOT forked. composeAvatar runs exactly as it does everywhere else and
// this page only GROUPS the paths it returns, by matching each path's `d` against the eye and
// hair assets it was built from. An animation that needed the compositor changed would be a
// different proposal.
//
// ⚠ CSS only, so this is the WEB answer. react-native-svg does not run CSS animation — mobile
// would need Reanimated, on top of a mask/gradient stack that is still unproven on a device.
// =============================================================

import { useEffect, useMemo, useState } from 'react'
import { notFound } from 'next/navigation'
import { composeAvatar, type AvatarAssets, type AvatarConfig } from '@/lib/avatar/compose'

/** Tokens as the assets carry them, before the recolour pass. */
const EYE_WHITE = 'rgb(255,255,255)'

const BASE: AvatarConfig = {
  base: 'base-neck-100',
  skin: '#F5C9A6',
  hair: 'm03-quiff',
  hairColour: '#4A3B32',
  facialHair: null,
  eyes: 'eye-01-base',
  mouth: 'mouth-02-smile',
  eyeColour: '#5B3A1E',
  mouthColour: '#B67A70',
  shirt: '#3B6EFF',
  background: '#FFFFFF',
  fade: true,
}

const CAST: Array<Partial<AvatarConfig> & { name: string }> = [
  { name: 'quiff', hair: 'm03-quiff' },
  { name: 'long hair + bushy beard', hair: 'm14-longhair', facialHair: 'bushybeard', skin: '#E0AC7E' },
  { name: 'locs', hair: 'm15-locs', hairColour: '#2B1B12', skin: '#8D5524', shirt: '#16A34A' },
  { name: 'long straight', hair: 'f13-longstraight', hairColour: '#6B4A2F', skin: '#FFE0C4', shirt: '#DB2777' },
  { name: 'curls + stubble', hair: 'm07-curls', facialHair: 'stubble', hairColour: '#1A1110', skin: '#6B4226', shirt: '#F59E0B' },
  { name: 'shag', hair: 'f14-shag', hairColour: '#D4A857', skin: '#F7D9BC', shirt: '#7C3AED' },
]

const dAttrs = (frag: string) =>
  new Set([...frag.matchAll(/d="([^"]*)"/g)].map((m) => m[1]))

/**
 * Wrap the eye and hair paths of a composed avatar so CSS can move them.
 *
 * ⚠ Matching is on `d`, never on fill: the recolour pass rewrites every fill, so the colour a
 * path ends up with tells you nothing about which asset it came from. `d` survives untouched.
 */
function groupForMotion(svg: string, assets: AvatarAssets, cfg: AvatarConfig): string {
  const eyeFrag = cfg.eyes ? assets.eyes[cfg.eyes] ?? assets.specialEyes[cfg.eyes] ?? '' : ''
  const hairFrag = cfg.hair ? assets.hair[cfg.hair] ?? '' : ''

  const eyeAll = dAttrs(eyeFrag)
  const hairAll = dAttrs(hairFrag)
  // Whites carry the one token the recolour never touches; everything else in the eye is iris.
  const whites = new Set(
    [...eyeFrag.matchAll(/<path[^>]*\/?>/g)]
      .filter((m) => m[0].includes(EYE_WHITE))
      .map((m) => /d="([^"]*)"/.exec(m[0])?.[1] ?? ''),
  )

  // ⚠⚠ <defs> IS OFF LIMITS. A hair asset keeps its face mask in there, and the mask's own
  // silhouette paths carry the same `d` values as the hair — so matching on `d` alone wraps
  // them too, and animating a mask's contents rewrites what it hides. Rotating them flooded
  // the whole tile with hair on locs and long-straight. Lift the defs out, work on what is
  // left, put them back untouched.
  const defs: string[] = []
  const body = svg.replace(/<defs>[\s\S]*?<\/defs>/g, (block) => {
    defs.push(block)
    return `<!--DEFS${defs.length - 1}-->`
  })

  const paths = [...body.matchAll(/<path[^>]*\/?>/g)].map((m) => m[0])
  const kind = (p: string) => {
    const d = /d="([^"]*)"/.exec(p)?.[1]
    if (!d) return 'other'
    if (eyeAll.has(d)) return whites.has(d) ? 'white' : 'iris'
    if (hairAll.has(d)) return 'hair'
    return 'other'
  }

  // The eye group is emitted once, at the first eye path, with the whites under the irises so
  // the irises can be translated on their own without an eye white sliding out from under one.
  const eyePaths = paths.filter((p) => kind(p) === 'white' || kind(p) === 'iris')
  const eyeBlock =
    eyePaths.length > 0
      ? `<g class="av-eyes">${eyePaths.filter((p) => kind(p) === 'white').join('')}` +
        `<g class="av-irises">${eyePaths.filter((p) => kind(p) === 'iris').join('')}</g></g>`
      : ''

  let out = body
  let placedEyes = false
  for (const p of paths) {
    const k = kind(p)
    if (k === 'white' || k === 'iris') {
      out = out.replace(p, placedEyes ? '' : eyeBlock)
      placedEyes = true
    }
  }

  // ⚠⚠ MASKED HAIR MOVES AS A GROUP, NOT AS PATHS. Several styles paint their mass as a
  // full-canvas fill and let the mask cut it to shape — locs and long-straight both do. Rotate
  // that fill on its own and you are rotating a rectangle behind a stationary stencil: the
  // shape does not move, and its edges swing out from under the stencil as hairline slivers at
  // the tile edge. Transform the masked <g> and the stencil travels with it.
  //
  // ⚠ Match the mask ids EXACTLY. The face-only copy is `<g mask="faceonly">` wrapping another
  // `<g mask="facehole-front">`; tagging both would nest two rotations and double the angle.
  // ⚠ The compositor suffixes every id per document, so the names are matched with the suffix
  // left open. This page used to do that suffixing itself — it does not need to any more.
  if (/<g[^>]*mask="url\(#facehole/.test(hairFrag)) {
    out = out.replace(
      /<g([^>]*mask="url\(#(?:facehole|faceonly)--[a-z0-9]+\)"[^>]*)>/g,
      '<g class="av-hair"$1>',
    )
  } else {
    // No mask: the paths are the hair, so wrap them. split/join because the compositor paints
    // the hair TWICE when there is facial hair, and both copies have to sway together.
    for (const p of paths) {
      if (kind(p) === 'hair') out = out.split(p).join(`<g class="av-hair">${p}</g>`)
    }
  }
  return out.replace(/<!--DEFS(\d+)-->/g, (_, i) => defs[Number(i)])
}

export default function AvatarMotionHarness() {
  // ⚠ 404 IN PRODUCTION. This is a routable path under `app/`, so without this it ships as a
  // public page on sportpool.io. Same guard the other dev harnesses carry.
  if (process.env.NODE_ENV === 'production') notFound()

  const [assets, setAssets] = useState<AvatarAssets | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [blink, setBlink] = useState(true)
  const [gaze, setGaze] = useState(true)
  const [sway, setSway] = useState(true)
  const [size, setSize] = useState(200)

  useEffect(() => {
    fetch('/avatar-assets.json')
      .then((r) => r.json())
      .then(setAssets)
      .catch((e) => setErr(String(e)))
  }, [])

  const cast = useMemo(() => {
    if (!assets) return []
    return CAST.map((c, i) => {
      const cfg = { ...BASE, ...c } as AvatarConfig
      // ⚠ No id munging here any more: composeAvatar suffixes its own ids per document, so
      // six avatars on one page no longer share a mask. That was fixed in the compositor.
      return { name: c.name, i, svg: groupForMotion(composeAvatar(cfg, assets), assets, cfg) }
    })
  }, [assets])

  const on = [blink && 'blink', gaze && 'gaze', sway && 'sway'].filter(Boolean).join(' ')

  return (
    <div style={{ padding: 28, fontFamily: 'ui-sans-serif, system-ui', background: '#fff' }}>
      <style>{CSS}</style>
      <h1 style={{ fontSize: 22, margin: '0 0 6px' }}>Avatar idle motion</h1>
      <p style={{ color: '#555', margin: '0 0 18px', fontSize: 14, maxWidth: 760 }}>
        The real composed avatar, grouped so CSS can move it. Nothing in the compositor changed.
        Each avatar gets its own offset so they do not blink in unison.
      </p>

      <div style={{ display: 'flex', gap: 18, alignItems: 'center', marginBottom: 22, flexWrap: 'wrap' }}>
        {([['Blink', blink, setBlink], ['Gaze drift', gaze, setGaze], ['Hair sway', sway, setSway]] as const).map(
          ([label, v, set]) => (
            <label key={label} style={{ fontSize: 14, display: 'flex', gap: 7, alignItems: 'center' }}>
              <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} />
              {label}
            </label>
          ),
        )}
        <label style={{ fontSize: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
          Size
          <input type="range" min={64} max={320} value={size} onChange={(e) => setSize(+e.target.value)} />
          <span style={{ color: '#666', width: 44 }}>{size}px</span>
        </label>
      </div>

      {err && <p style={{ color: '#b00' }}>{err}</p>}
      {!assets && !err && <p style={{ color: '#666' }}>Loading assets…</p>}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 26 }}>
        {cast.map(({ name, i, svg }) => (
          <figure key={name} style={{ margin: 0, textAlign: 'center' }}>
            <div
              className={`av ${on}`}
              style={{ width: size, height: size, ['--i' as string]: i }}
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <figcaption style={{ fontSize: 12, color: '#666', marginTop: 6 }}>{name}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}

// ⚠ transform-box: fill-box is what makes this work at all. Without it an SVG transform-origin
// resolves against the whole 2048 viewBox, so "rotate about the crown" becomes "rotate about a
// point somewhere off the canvas" and the hair swings away from the head.
const CSS = `
.av svg { width: 100%; height: 100%; display: block; }
.av .av-eyes, .av .av-irises, .av .av-hair { transform-box: fill-box; }

/* Blink: the eye group squashes to a slit and springs back. 7s apart, 140ms of travel — the
   whole point is that you should not catch it happening. */
.av.blink .av-eyes {
  transform-origin: center;
  animation: av-blink 7s calc(var(--i) * 1.7s) infinite;
}
@keyframes av-blink {
  0%, 96.5%, 100% { transform: scaleY(1); }
  98%             { transform: scaleY(0.06); }
}

/* Gaze: the irises alone drift. ⚠ This is the same arithmetic gaze.py already does offline —
   pointing an iris is a PARAMETER in this system, not a new asset. */
.av.gaze .av-irises {
  animation: av-gaze 11s calc(var(--i) * -2.3s) infinite ease-in-out;
}
@keyframes av-gaze {
  0%, 22%   { transform: translate(0, 0); }
  30%, 46%  { transform: translate(26px, 6px); }
  54%, 70%  { transform: translate(-24px, 2px); }
  78%, 90%  { transform: translate(6px, -10px); }
  100%      { transform: translate(0, 0); }
}

/* Sway: a small rotation about the TOP of the hair's own box, so the roots barely move and the
   ends travel. ⚠ 1.1deg, not more — past about 2deg the hairline lifts off the forehead and a
   sliver of scalp shows through at the temples. */
.av.sway .av-hair {
  transform-origin: 50% 0%;
  animation: av-sway 6.5s calc(var(--i) * -1.1s) infinite ease-in-out;
}
@keyframes av-sway {
  0%, 100% { transform: rotate(-1.1deg); }
  50%      { transform: rotate(1.1deg); }
}

@media (prefers-reduced-motion: reduce) {
  .av * { animation: none !important; }
}
`
