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
import { composeAvatar, PALETTE, type AvatarAssets, type AvatarConfig } from '@/lib/avatar/compose'

type View = 'build' | 'grid'

const DEFAULT: AvatarConfig = {
  base: 'base-neck-100',
  skin: '#F5C9A6',
  hair: 'm03-quiff',
  hairColour: '#4A3B32',
  facialHair: null,
  expression: 'x-happy',
  eyeColour: '#5B3A1E',
  mouthColour: '#B67A70',
  shirt: '#3B6EFF',
  background: '#FFFFFF',
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
          {(['build', 'grid'] as View[]).map((v) => (
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
              {v === 'build' ? 'Builder' : 'Combination grid'}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-500">{counts}</span>
      </div>

      {view === 'build' ? (
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
