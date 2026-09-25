'use client'

// =============================================================
// Avatars — an asset browser and builder for the avatar system
// =============================================================
// Read-only: it composes and previews, it writes nothing. It exists so the asset set can be
// reviewed against real combinations rather than one-off screenshots — a beard has to work
// with every expression, and hair with every skin tone, and those are the combinations that
// actually break.
//
// The asset markup (~360KB) is FETCHED from /avatar-assets.json rather than imported, so it
// never enters the admin bundle. Regenerate it with:
//     uv run assets/character-base/nano/build-builder.py
// =============================================================

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { composeAvatar, stripNose, PALETTE, type AvatarAssets, type AvatarConfig } from '@/lib/avatar/compose'
import {
  AVATAR_BACKGROUNDS,
  AVATAR_COLOUR_NAMES,
  AVATAR_GRADIENTS,
  duelColourIndices,
} from '@/lib/design/avatarGradient'

type View = 'build' | 'grid' | 'selector'

const DEFAULT: AvatarConfig = {
  base: 'base-neck-100',
  skin: '#F5C9A6',
  hair: 'm03-quiff',
  hairColour: '#4A3B32',
  facialHair: null,
  glasses: null,
  earrings: null,
  garment: null,
  mark: true,
  metalColour: '#D4A017',
  // ⭐ One input drives both the frame and the lens — see LENS_TOWARD_GLASS in compose.ts.
  frameColour: '#22262E',
  expression: 'x-happy',
  eyeColour: '#5B3A1E',
  mouthColour: '#B67A70',
  shirt: '#3B6EFF',
  background: PALETTE.background[0],
  // The beard fade is a flag in compose.ts that defaults to OFF, so it has to be asked for.
  // Left unset, a fullbeard or stubble sideburn band renders as solid hair colour — a hard
  // bar up the side of the face with no dissolve at the top, which is what shipped to dev.
  //
  // ⚠ Turned on HERE and not by flipping the default, deliberately. <linearGradient> is
  // unproven on react-native-svg, and this is the one surface where the fade has actually been
  // looked at. The back-out in compose.ts stays intact: drop this line and it is off again.
  fade: true,
}

function Swatches({
  label, colours, value, onChange,
}: { label: string; colours: readonly string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div className="mb-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">{label}</div>
      <div className="flex flex-wrap gap-2">
        {colours.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            title={c}
            aria-pressed={c === value}
            className={`w-7 h-7 rounded-full border-2 border-white ${
              c === value ? 'ring-2 ring-blue-600' : 'ring-1 ring-gray-200'
            }`}
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  )
}

function Chips({
  label, options, value, onChange, format = (s: string) => s,
}: {
  label: string
  options: (string | null)[]
  value: string | null
  onChange: (v: string | null) => void
  format?: (s: string) => string
}) {
  return (
    <div className="mb-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o ?? '—'}
            type="button"
            onClick={() => onChange(o)}
            aria-pressed={o === value}
            className={`px-2.5 py-1 rounded-full text-xs border ${
              o === value
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
            }`}
          >
            {o === null ? 'none' : format(o)}
          </button>
        ))}
      </div>
    </div>
  )
}

// =============================================================
// What a member would actually see
// =============================================================
// ⚠⚠ A MOCK, AND DELIBERATELY NOT WIRED. It writes nothing and saves nothing — the Save button
// is inert. Its job is to answer "what would this look like?" before anyone builds the real
// screen, which is cheaper to argue about here than in a member-facing route.
//
// ⭐ It is NOT the Builder with nicer paint. The Builder is a debug tool: every asset, raw keys,
// a JSON dump. A member gets a small number of choices in plain words, and — the part that only
// matters for SportPool — is SHOWN WHAT THEIR COLOUR DOES. The colour is not decoration; it is
// the glow on their side of a Showdown duel and the ring beside their name on a leaderboard,
// so the mock previews those two surfaces live rather than describing them.
//
// ⚠ Desktop only for now, as asked. The two-column layout collapses at lg: but no phone
// layout has been designed, so do not read this as the responsive answer.

const TITLE = (s: string) =>
  s.replace(/^(x-|[a-z]\d+-|base-neck-)/, '').replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {hint ? <p className="text-xs text-gray-500 mt-0.5 mb-2.5">{hint}</p> : <div className="mb-2.5" />}
      {children}
    </section>
  )
}

/** A row of choices as words, the way a member would read them. */
function Options({
  options, value, onChange, allowNone = true,
}: { options: string[]; value: string | null; onChange: (v: string | null) => void; allowNone?: boolean }) {
  const all: (string | null)[] = allowNone ? [null, ...options] : options
  return (
    <div className="flex flex-wrap gap-1.5">
      {all.map((o) => (
        <button
          key={o ?? 'none'}
          type="button"
          onClick={() => onChange(o)}
          aria-pressed={o === value}
          className={`px-3 py-1.5 rounded-lg text-[13px] border transition ${
            o === value
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'
          }`}
        >
          {o === null ? 'None' : TITLE(o)}
        </button>
      ))}
    </div>
  )
}

/**
 * The frame a head preview is cropped to.
 *
 * ⭐ Chosen by rendering, not arithmetic. The asset bounding boxes are useless here — several
 * hair styles carry a full-canvas <mask> rect, so every one of them measures 0..2048. Four
 * crops were rendered against a bald head, a quiff, floor-length hair, locs, spacebuns and a
 * topknot; this is the only one that holds the tall styles without clipping AND ends above the
 * shirt line at y1520, which is what "the head only" means.
 */
const HEAD_CROP = '300 60 1440 1440'

/**
 * One asset, shown on a bare head in its own square card.
 *
 * ⚠⚠ THE PREVIEW IS THE ASSET AND NOTHING ELSE. Ryan, 2026-09-25: hair should be shown "on the
 * base avatars head ONLY (no eyes, no mouth, no nose, only the ears)". Eyes and mouth take null
 * already; the NOSE does not, because compose lifts and re-lays it rather than treating it as a
 * slot — hence `stripNose`. A face looking out of a hair swatch is showing the member a
 * decision they are not making.
 *
 * ⚠ Every card is the same square whatever the asset does, so the grid does not reflow between
 * a buzz cut and floor-length hair.
 */
function AssetCards({
  options, value, onChange, render, columns = 4,
}: {
  options: (string | null)[]
  value: string | null
  onChange: (v: string | null) => void
  render: (key: string | null) => string
  columns?: number
}) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const selected = o === value
        return (
          <button
            key={o ?? 'none'}
            type="button"
            onClick={() => onChange(o)}
            aria-pressed={selected}
            className="group text-left"
          >
            <div
              className={`aspect-square rounded-card overflow-hidden bg-surface transition ${
                selected
                  ? 'ring-2 ring-primary-600 ring-offset-2 ring-offset-surface'
                  : 'border border-silver/50 group-hover:border-silver'
              } [&>svg]:w-full [&>svg]:h-full [&>svg]:block`}
              dangerouslySetInnerHTML={{ __html: render(o) }}
            />
            <div className={`mt-1.5 text-center text-[11px] truncate ${
              selected ? 'text-ink font-semibold' : 'text-muted'
            }`}>
              {o === null ? 'None' : TITLE(o)}
            </div>
          </button>
        )
      })}
    </div>
  )
}

function SelectorMock({ assets, cfg, set }: {
  assets: AvatarAssets
  cfg: AvatarConfig
  set: <K extends keyof AvatarConfig>(k: K, v: AvatarConfig[K]) => void
}) {
  const me = useMemo(() => composeAvatar(cfg, assets), [cfg, assets])

  /**
   * A bare head wearing one asset, cropped to the head, for the picker cards.
   *
   * ⚠ Memoised on the FOUR THINGS THE PREVIEW ACTUALLY SHOWS — the build, the skin and the hair
   * colour. Keying it on the whole config would recompose 26 heads every time the member tried
   * an expression or a top, and each compose is a full rewrite of the base document.
   *
   * ⚠ `--sp-mist`, not the member's own colour: 26 swatches in a saturated background would be
   * a wall of colour with the hair lost inside it. The card is the neutral, the hair is the
   * subject.
   */
  const headPreview = useMemo(() => {
    const cache = new Map<string, string>()
    return (hair: string | null) => {
      const key = hair ?? '—'
      const hit = cache.get(key)
      if (hit) return hit
      const svg = stripNose(
        composeAvatar(
          {
            ...cfg,
            hair,
            expression: null, eyes: null, mouth: null,
            facialHair: null, glasses: null, earrings: null, garment: null, mark: false,
            background: '#EEF1F8',
          },
          assets,
        ),
        cfg.skin,
      ).replace(/viewBox="[^"]*"/, `viewBox="${HEAD_CROP}"`)
      cache.set(key, svg)
      return svg
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, cfg.base, cfg.skin, cfg.hairColour])

  // ⭐ The colour's PURPOSE, shown rather than described. `duelColourIndices` is the real
  // function the duel uses, so if a member picks a colour an opponent already has, this
  // preview moves one side exactly as the duel will.
  const myIndex = AVATAR_BACKGROUNDS.indexOf(cfg.background)
  const OPPONENT = { entryId: 'zzz-opponent', userId: 'demo-opponent', chosen: 'teal' }
  const pair = duelColourIndices(
    { entryId: 'aaa-you', userId: 'demo-you', chosen: AVATAR_COLOUR_NAMES[myIndex] ?? null },
    OPPONENT,
  )
  const myGlow = AVATAR_GRADIENTS[pair.a][0]
  const theirGlow = AVATAR_GRADIENTS[pair.b][0]

  // ⚠ WHICH SIDE MOVED, not "did mine". The first version of this only watched the member's own
  // side and the explanation could therefore NEVER appear: both sides here have chosen, so rule
  // 2 applies and the lower entry id keeps the colour — which in this mock is always the
  // member. The opponent was quietly moving off teal and nothing said why.
  const theirIndex = AVATAR_COLOUR_NAMES.indexOf(OPPONENT.chosen)
  const iMoved = myIndex >= 0 && pair.a !== myIndex
  const theyMoved = theirIndex >= 0 && pair.b !== theirIndex

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
      {/* -------------------------------------------------- the person */}
      <div className="lg:sticky lg:top-4 space-y-4">
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div
            className="w-full aspect-square rounded-xl overflow-hidden [&>svg]:w-full [&>svg]:h-full [&>svg]:block"
            dangerouslySetInnerHTML={{ __html: me }}
          />
          <p className="text-center text-sm font-semibold text-gray-900 mt-3">Alex Mercer</p>
          <p className="text-center text-xs text-gray-500">@alexm</p>
        </div>

        {/* ⭐ Why the colour matters, at the size it is actually seen. */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-3">
            Where people see you
          </p>
          <div className="flex items-center gap-2.5 mb-3">
            <div
              className="w-9 h-9 rounded-full overflow-hidden shrink-0 [&>svg]:w-full [&>svg]:h-full [&>svg]:block"
              dangerouslySetInnerHTML={{ __html: me }}
            />
            <div className="min-w-0 flex-1">
              <div className="h-2 w-24 bg-gray-200 rounded mb-1.5" />
              <div className="h-2 w-14 bg-gray-100 rounded" />
            </div>
            <span className="text-xs font-semibold text-gray-400">2nd</span>
          </div>
          <div
            className="rounded-xl h-16 relative overflow-hidden"
            style={{ background: '#0B0F1A' }}
          >
            <div className="absolute inset-0" style={{
              background: `radial-gradient(60% 120% at 8% 50%, ${myGlow}44 0%, transparent 60%),`
                        + `radial-gradient(60% 120% at 92% 50%, ${theirGlow}38 0%, transparent 60%)`,
            }} />
            <div className="relative h-full flex items-center justify-between px-4">
              <span className="text-[11px] font-semibold" style={{ color: myGlow }}>You</span>
              <span className="text-[10px] text-white/40">Showdown</span>
              <span className="text-[11px] font-semibold" style={{ color: theirGlow }}>Sam</span>
            </div>
          </div>
          <p className="text-[11px] text-gray-500 mt-2 leading-snug">
            {iMoved
              ? 'Sam already has this colour, so the duel moves YOUR side apart for this week — you keep what you picked everywhere else.'
              : theyMoved
                ? 'Sam picked this colour too, so the duel moves THEIR side apart. You keep yours.'
                : 'Your colour is the glow on your side of a duel.'}
          </p>
        </div>

        <button
          type="button"
          disabled
          className="w-full py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold opacity-40 cursor-not-allowed"
        >
          Save
        </button>
        <p className="text-[11px] text-center text-gray-400 -mt-2">Mock — saves nothing</p>
      </div>

      {/* -------------------------------------------------- the choices */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <Section title="Your colour" hint="This is you across the app — your avatar, and your side of a duel.">
          <div className="grid grid-cols-11 gap-2">
            {AVATAR_BACKGROUNDS.map((c, i) => (
              <button
                key={c}
                type="button"
                title={AVATAR_COLOUR_NAMES[i]}
                aria-label={AVATAR_COLOUR_NAMES[i]}
                aria-pressed={cfg.background === c}
                onClick={() => set('background', c)}
                className={`aspect-square rounded-lg transition ${
                  cfg.background === c ? 'ring-2 ring-offset-2 ring-gray-900 scale-105' : 'ring-1 ring-black/10'
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {AVATAR_COLOUR_NAMES[myIndex] ? TITLE(AVATAR_COLOUR_NAMES[myIndex]) : 'Custom'}
          </p>
        </Section>

        <Section title="Face">
          <div className="text-[11px] font-medium text-gray-500 mb-1.5">Skin</div>
          <div className="flex flex-wrap gap-2 mb-4">
            {PALETTE.skin.map((c) => (
              <button key={c} type="button" onClick={() => set('skin', c)} aria-label={c}
                aria-pressed={cfg.skin === c}
                className={`w-8 h-8 rounded-full ${cfg.skin === c ? 'ring-2 ring-offset-2 ring-gray-900' : 'ring-1 ring-black/10'}`}
                style={{ background: c }} />
            ))}
          </div>
          <div className="text-[11px] font-medium text-gray-500 mb-1.5">Expression</div>
          <Options options={Object.keys(assets.expressions)} value={cfg.expression ?? null}
            onChange={(v) => set('expression', v)} allowNone={false} />
        </Section>

        <Section title="Hair">
          <div className="flex flex-wrap gap-2 mb-4">
            {PALETTE.hair.map((c) => (
              <button key={c} type="button" onClick={() => set('hairColour', c)} aria-label={c}
                aria-pressed={cfg.hairColour === c}
                className={`w-8 h-8 rounded-full ${cfg.hairColour === c ? 'ring-2 ring-offset-2 ring-gray-900' : 'ring-1 ring-black/10'}`}
                style={{ background: c }} />
            ))}
          </div>
          <AssetCards
            options={[null, ...Object.keys(assets.hair)]}
            value={cfg.hair}
            onChange={(v) => set('hair', v)}
            render={headPreview}
            columns={5}
          />
        </Section>

        <Section title="Facial hair">
          <Options options={Object.keys(assets.facialhair)} value={cfg.facialHair}
            onChange={(v) => set('facialHair', v)} />
        </Section>

        <Section title="Extras">
          <div className="text-[11px] font-medium text-gray-500 mb-1.5">Eyewear</div>
          <div className="mb-4">
            <Options options={Object.keys(assets.glasses ?? {})} value={cfg.glasses ?? null}
              onChange={(v) => set('glasses', v)} />
          </div>
          <div className="text-[11px] font-medium text-gray-500 mb-1.5">Earrings</div>
          <div className="mb-4">
            <Options options={Object.keys(assets.earrings ?? {})} value={cfg.earrings ?? null}
              onChange={(v) => set('earrings', v)} />
          </div>
          <div className="text-[11px] font-medium text-gray-500 mb-1.5">Top</div>
          <Options options={Object.keys(assets.garments ?? {})} value={cfg.garment ?? null}
            onChange={(v) => set('garment', v)} />
        </Section>
      </div>
    </div>
  )
}

export function AvatarsTab() {
  const [assets, setAssets] = useState<AvatarAssets | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cfg, setCfg] = useState<AvatarConfig>(DEFAULT)
  const [view, setView] = useState<View>('build')

  useEffect(() => {
    let cancelled = false
    fetch('/avatar-assets.json')
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`)
        return r.json()
      })
      .then((d: AvatarAssets) => {
        if (!cancelled) setAssets(d)
      })
      .catch((e) =>
        !cancelled &&
        setError(
          `Could not load /avatar-assets.json (${e.message}). Regenerate it with: uv run assets/character-base/nano/build-builder.py`,
        ),
      )
    return () => {
      cancelled = true
    }
  }, [])

  const set = <K extends keyof AvatarConfig>(k: K, v: AvatarConfig[K]) =>
    setCfg((c) => ({ ...c, [k]: v }))

  const svg = useMemo(() => (assets ? composeAvatar(cfg, assets) : ''), [cfg, assets])

  // The grid is the point of this tab: one facial hair style against every expression is
  // where the layering problems showed up, and no single preview would have caught them.
  //
  // ⚠ Gated on `view`. It composes 6 x 12 = 72 SVGs, each a full string rewrite of the base
  // document — doing that on every colour tweak while the user is looking at the Builder
  // would make the swatches feel laggy for output nobody is reading.
  const grid = useMemo(() => {
    if (!assets || view !== 'grid') return []
    const styles = [null, ...Object.keys(assets.facialhair)]
    return styles.map((fhKey) => ({
      key: fhKey ?? 'none',
      cells: Object.keys(assets.expressions).map((ex) => ({
        ex,
        svg: composeAvatar({ ...cfg, facialHair: fhKey, expression: ex }, assets),
      })),
    }))
  }, [assets, cfg, view])

  if (error) {
    return <div className="p-6 text-sm text-red-700 bg-red-50 rounded-lg border border-red-200">{error}</div>
  }
  if (!assets) return <div className="p-6 text-sm text-gray-500">Loading avatar assets…</div>

  const counts = `${Object.keys(assets.bases).length} bases · ${Object.keys(assets.hair).length} hair · ${
    Object.keys(assets.expressions).length
  } expressions · ${Object.keys(assets.facialhair).length} facial hair · ${
    Object.keys(assets.eyes).length + Object.keys(assets.specialEyes).length
  } eyes · ${Object.keys(assets.mouths).length} mouths`

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex gap-1.5">
          {(['build', 'grid', 'selector'] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={`px-3 py-1.5 rounded-lg text-sm border ${
                view === v
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-200'
              }`}
            >
              {v === 'build' ? 'Builder' : v === 'grid' ? 'Combination grid' : 'Member selector'}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500">{counts}</span>
      </div>

      {view === 'selector' ? (
        <SelectorMock assets={assets} cfg={cfg} set={set} />
      ) : view === 'build' ? (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 items-start">
          <div className="bg-white border border-gray-200 rounded-2xl p-5 lg:sticky lg:top-4">
            <div
              className="w-full aspect-square rounded-xl overflow-hidden [&>svg]:w-full [&>svg]:h-full [&>svg]:block"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <div className="flex items-end gap-3 mt-4 pt-3 border-t border-gray-100">
              {[96, 56, 32].map((px) => (
                <div
                  key={px}
                  style={{ width: px, height: px }}
                  className="rounded overflow-hidden [&>svg]:w-full [&>svg]:h-full [&>svg]:block"
                  dangerouslySetInnerHTML={{ __html: svg }}
                />
              ))}
              <span className="text-[11px] text-gray-400 ml-auto">96 / 56 / 32px</span>
            </div>
            <pre className="mt-4 bg-gray-900 text-gray-200 rounded-xl p-3 text-[11px] overflow-x-auto">
              {JSON.stringify(cfg, null, 1)}
            </pre>
            <p className="text-[11px] text-gray-500 mt-2">
              {new Blob([JSON.stringify(cfg)]).size} bytes — what a member record stores. Never an image,
              so fixing an asset updates every avatar using it.
            </p>
            <Button
              variant="secondary"
              className="mt-3 w-full"
              onClick={() => navigator.clipboard.writeText(svg)}
            >
              Copy SVG
            </Button>
          </div>

          <div className="bg-white border border-gray-200 rounded-2xl p-5">
            <Chips
              label="Expression"
              options={Object.keys(assets.expressions)}
              value={cfg.expression ?? null}
              onChange={(v) => set('expression', v)}
              format={(s) => s.replace(/^x-/, '')}
            />
            <Chips
              label="Hair"
              options={[null, ...Object.keys(assets.hair)]}
              value={cfg.hair}
              onChange={(v) => set('hair', v)}
            />
            <Chips
              label="Facial hair"
              options={[null, ...Object.keys(assets.facialhair)]}
              value={cfg.facialHair}
              onChange={(v) => set('facialHair', v)}
            />
            <Chips
              label="Eyewear"
              options={[null, ...Object.keys(assets.glasses ?? {})]}
              value={cfg.glasses ?? null}
              onChange={(v) => set('glasses', v)}
              format={(s) => s.replace(/^[gs]\d+-/, '')}
            />
            <Chips
              label="SP mark"
              options={[null, 'on']}
              value={cfg.mark ? 'on' : null}
              onChange={(v) => set('mark', v === 'on')}
              format={() => 'on'}
            />
            <Chips
              label="Garment"
              options={[null, ...Object.keys(assets.garments ?? {})]}
              value={cfg.garment ?? null}
              onChange={(v) => set('garment', v)}
              format={(s) => s.replace(/^w\d+-/, '')}
            />
            <Chips
              label="Earrings"
              options={[null, ...Object.keys(assets.earrings ?? {})]}
              value={cfg.earrings ?? null}
              onChange={(v) => set('earrings', v)}
              format={(s) => s.replace(/^e\d+-/, '')}
            />
            <Chips
              label="Build"
              options={Object.keys(assets.bases)}
              value={cfg.base}
              onChange={(v) => v && set('base', v)}
              format={(s) => s.replace('base-neck-', 'neck ')}
            />
            <Swatches label="Skin" colours={PALETTE.skin} value={cfg.skin} onChange={(c) => set('skin', c)} />
            <Swatches label="Hair colour" colours={PALETTE.hair} value={cfg.hairColour} onChange={(c) => set('hairColour', c)} />
            <Swatches label="Eyes" colours={PALETTE.eye} value={cfg.eyeColour} onChange={(c) => set('eyeColour', c)} />
            <Swatches label="Mouth" colours={PALETTE.mouth} value={cfg.mouthColour} onChange={(c) => set('mouthColour', c)} />
            {cfg.earrings ? (
              <Swatches label="Metal" colours={PALETTE.metal} value={cfg.metalColour ?? '#D4A017'} onChange={(c) => set('metalColour', c)} />
            ) : null}
            {cfg.glasses ? (
              <Swatches label="Frame" colours={PALETTE.frame} value={cfg.frameColour ?? '#22262E'} onChange={(c) => set('frameColour', c)} />
            ) : null}
            <Swatches label="Shirt" colours={PALETTE.shirt} value={cfg.shirt} onChange={(c) => set('shirt', c)} />
            <Swatches label="Background" colours={PALETTE.background} value={cfg.background} onChange={(c) => set('background', c)} />
          </div>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-2xl p-5 overflow-x-auto">
          <p className="text-xs text-gray-500 mb-3">
            Every facial hair style against every expression, at the current colours. This is the view
            that catches layering faults — a beard has to work with all twelve mouths, not one.
          </p>
          <table className="border-separate border-spacing-1">
            <tbody>
              <tr>
                <td className="w-20" />
                {Object.keys(assets.expressions).map((ex) => (
                  <td key={ex} className="text-[10px] text-center text-gray-500 font-medium">
                    {ex.replace(/^x-/, '')}
                  </td>
                ))}
              </tr>
              {grid.map((row) => (
                <tr key={row.key}>
                  <td className="text-[11px] text-gray-600 pr-2">{row.key}</td>
                  {row.cells.map((c) => (
                    <td key={c.ex}>
                      <div
                        className="w-[78px] h-[78px] [&>svg]:w-full [&>svg]:h-full [&>svg]:block"
                        dangerouslySetInnerHTML={{ __html: c.svg }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
