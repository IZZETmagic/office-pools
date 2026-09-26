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
import { HugeiconsIcon } from '@hugeicons/react'
// ⭐ SOLID ROUNDED, from the PRO package — Ryan, 2026-09-26. The free package ships the
// stroke style only, and at tile size a 1.6px outline reads as grey texture where a filled
// glyph reads as a shape. ⚠ `@hugeicons-pro/core-solid-rounded` IS installed (it is a
// dependency and all 5,442 icons are present); the comment in components/ui/Icon.tsx claiming
// otherwise is stale, and its `solid` prop has in fact worked for some time.
import {
  ChairBarberIcon, ColorsIcon, ContrastIcon, GlassesIcon, HatIcon, ScissorIcon, ViewIcon,
} from '@hugeicons-pro/core-solid-rounded'
import { Button } from '@/components/ui/Button'
import { composeAvatar, headOnly, PALETTE, type AvatarAssets, type AvatarConfig } from '@/lib/avatar/compose'
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

/**
 * A palette where EVERY COLOUR IS ITS OWN CARD — a rounded-square chip centred in a bordered
 * tile. Ryan, 2026-09-26, with a picture: the card is the control and the colour is its
 * contents, so the selected state can be carried by the CARD (tinted ground, blue border)
 * instead of a ring drawn around the colour itself.
 *
 * ⭐ ONE COMPONENT, SIX CALLERS. Skin, eye, hair, frame, facial-hair and background were six
 * copy-pasted swatch rows that had already drifted apart — two sizes (w-9 and w-8) and two
 * shapes (circles and rounded-lg) for rows doing the same job.
 *
 * ⚠ THE SELECTED STATE IS ON THE TILE, NOT A RING ROUND THE COLOUR. A ring inherits the
 * swatch's own colour as its neighbour, so on a pale skin tone it all but vanished — which is
 * the failure this layout fixes. The tile's border and ground are independent of the colour it
 * holds, so selection reads the same on #FFE0C4 and on #4A2C14.
 */
function ColourCard({
  colours, value, onChange, names,
}: {
  colours: readonly string[]
  value: string | undefined
  onChange: (c: string) => void
  names?: readonly string[]
}) {
  return (
    // ⚠ A FIXED TILE THAT WRAPS, not a fixed COLUMN COUNT that stretches. This panel is a `1fr`
    // beside a 380px column, so a `repeat(5, 1fr)` grid gave ~100px tiles on a wide screen and
    // ~55px on a narrow one — the same control at two quite different sizes. `auto-fill, 72px`
    // keeps the tile constant and lets the row count fall out of the width, which is also what
    // makes one component work for a 6-colour palette and a 22-colour one.
    <div
      className="grid gap-2.5"
      style={{ gridTemplateColumns: 'repeat(auto-fill, 72px)' }}
    >
      {colours.map((c, i) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          title={names?.[i] ?? c}
          aria-label={names?.[i] ?? c}
          aria-pressed={value === c}
          // ⚠ TOKENS, NOT TAILWIND'S OWN SCALE. `rounded-2xl`/`rounded-xl` are arbitrary here;
          // the house radii are named for what they wrap (app/globals.css: card 24, control 18,
          // chip 12, inset 6) and a tile IS a control. `border-primary-600` is SportPool blue
          // (#3B6EFF) and `bg-primary-100` its visible tint — `primary-50` is #F7F9FF and reads
          // as white on a white panel, which is how the tab strip's active pill went unnoticed.
          className={`aspect-square rounded-control border-2 grid place-items-center transition ${
            value === c
              ? 'border-primary-600 bg-primary-100'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          {/* ⚠ `rounded-chip`, not `rounded-inset`. Concentric rounding says a nested shape
              should be the parent's radius MINUS the padding, which lands near inset's 6px and
              looks mean at this size — and Ryan's reference shows a generously rounded chip.
              The picture is the spec. */}
          <span
            className="block w-[58%] h-[58%] rounded-chip ring-1 ring-black/5"
            style={{ background: c }}
          />
        </button>
      ))}
    </div>
  )
}

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
          className={`px-3 py-1.5 rounded-chip text-[13px] border transition ${
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
 * The frame a head preview is cropped to, and the ground it sits on.
 *
 * ⭐ Chosen by rendering, not arithmetic — three times now. Asset bounding boxes are useless
 * here because several hair styles carry a full-canvas <mask> rect, so every one of them
 * measures 0..2048. The frame is measured off the RENDER instead: every style composed through
 * `headOnly`, drawn on an oversized field, and the non-background pixels bounded.
 *
 * ⭐ Ryan, 2026-09-25: "have the head and hair all fit within the card". Measured across all 26
 * styles the content spans x37..2003 and y5..2051 — `m15-locs` is both the widest and the
 * lowest, and the old frame cut it off at y1985. This holds every style with 60 units to spare
 * and costs 5.7% of the head's size.
 *
 * ⚠ It is one frame for all 26 cards, so it is sized by the LARGEST. Re-measure it whenever a
 * style gains length — a fill that reaches lower than locs would be clipped silently.
 *
 * ⚠⚠ THE FRAME REACHES OUTSIDE THE 2048 CANVAS, which is why the card carries the same colour.
 * The avatar's own background path stops at the canvas edge, so the strip beyond it paints
 * nothing — on a white card that reads as a bite out of the corner. Matching the two makes the
 * overflow invisible. Change one and change the other.
 */
const HEAD_CROP = '-63 -55 2166 2166'
/**
 * ⭐⭐ A SENTINEL, NOT A GROUND COLOUR. Previews used to be composed on `#EEF1F8` with the card
 * painted to match, so a head sat on a filled square. Ryan's reference insets the head on a
 * plain tile instead, which means the CARD must supply the background — and it cannot while an
 * opaque canvas sits on top of it: the selected tint would hide behind a pale square.
 *
 * So the canvas is composed in a colour nothing ships and then deleted, leaving the preview
 * transparent for the card to show through.
 *
 * ⚠ The colour is deliberately hideous. If the strip stops matching, every card turns MAGENTA
 * rather than quietly reverting to a square — a sentinel that looks fine when it leaks is not
 * a sentinel. Do not "tidy" it to something plausible.
 */
const HEAD_GROUND = '#FF00FF'
const HEAD_CANVAS = /<path[^>]*fill="rgb\(255,0,255\)"[^>]*\/?>/

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
/**
 * ⚠⚠ A FIXED TILE THAT WRAPS, NOT A FIXED COLUMN COUNT THAT SHRINKS. `repeat(N, 1fr)` divides
 * whatever width it is given, so the same control was 104px on a desktop panel and FORTY-NINE
 * at 375px — a head at 49px is a smudge, and it sat next to colour swatches that held 72px
 * because they had already been fixed. Ryan, 2026-09-26: "they should remain the same size but
 * just wrap... the smaller the screen the smaller the amount in a row and more rows".
 *
 * ⭐ `auto-fill` at a fixed width is the whole rule: the tile never changes and the COLUMN
 * COUNT falls out of the space. It is the same rule ColourCard uses, at a larger size because
 * a hairstyle needs more room to read than a flat colour does.
 */
const ASSET_TILE = 104

function AssetCards({
  options, value, onChange, render,
}: {
  options: (string | null)[]
  value: string | null
  onChange: (v: string | null) => void
  render: (key: string | null) => string
}) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, ${ASSET_TILE}px)` }}>
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
            {/* ⭐ THE SAME TILE AS A COLOUR SWATCH — a bordered card with its subject inset,
                SportPool blue on its tint when chosen. An asset and a colour are the same kind
                of choice, so they should not be two different controls. ⚠ `border-2` on BOTH
                states, not a border that becomes a ring: a 1px border swapping for a 2px ring
                shifts the tile by a pixel on selection and the whole grid twitches. */}
            <div
              className={`aspect-square rounded-control border-2 p-1.5 transition ${
                selected
                  ? 'border-primary-600 bg-primary-100'
                  : 'border-gray-200 bg-white group-hover:border-gray-300'
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

/**
 * The member selector's seven steps, in the order a person actually builds a face: the skin
 * first, then what is ON it, then what is worn, and the background last.
 *
 * ⭐ Ryan, 2026-09-26. Headwear has no art yet and is deliberately still listed — an empty
 * step says "this is coming" where a missing one says nothing.
 */
// ⚠⚠ THE GLYPHS ARE PROVISIONAL. Ryan, 2026-09-26: "I'm still not sold on them but we will go
// with them for now." They are placeholders that happen to be shipping, not a decision — swap
// them freely, and do not cite this array as precedent.
//
// The reason they are weak is structural rather than a matter of taste: Hugeicons has no beard,
// razor or moustache glyph anywhere in its 5,442, so `Facial hair` is stuck with a grooming
// METAPHOR (a barber chair) instead of the thing itself. `HatGlasses` is the only glyph in the
// set with a moustache, but it carries a hat and spectacles too, which collide with the two
// steps either side of it — three tiles in a row that all read as headwear.
//
// ⭐ The real fix, when it matters: draw the seven from the avatar art we already own. Every
// step's subject exists as a composed asset, so the icon for `Facial hair` could BE a beard.
const STEPS = [
  { key: 'skin', label: 'Skin', icon: ContrastIcon },
  { key: 'eyes', label: 'Eyes', icon: ViewIcon },
  { key: 'hair', label: 'Hair', icon: ScissorIcon },
  { key: 'eyewear', label: 'Glasses & earrings', icon: GlassesIcon },
  { key: 'facialhair', label: 'Facial hair', icon: ChairBarberIcon },
  { key: 'wearables', label: 'Headwear & top', icon: HatIcon },
  { key: 'colour', label: 'Your colour', icon: ColorsIcon },
] as const
type Step = (typeof STEPS)[number]['key']

/**
 * ⭐ The two metals offered, each as its own ROW of every earring — Ryan, 2026-09-26: "one for
 * gold and one for silver and show both". A metal swatch beside a list of names cannot show
 * what the pair will look like, and the pairing is the whole choice; one click sets both.
 *
 * ⚠ `PALETTE.metal` has six. The other four are reachable in the builder and are deliberately
 * not offered here — this surface is the member's, and two is the decision they actually make.
 */
const METALS = [
  { label: 'Gold', colour: PALETTE.metal[0] },
  { label: 'Silver', colour: PALETTE.metal[1] },
] as const

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
      const svg = headOnly(
        composeAvatar(
          {
            ...cfg,
            hair,
            expression: null, eyes: null, mouth: null,
            facialHair: null, glasses: null, earrings: null, garment: null, mark: false,
            background: HEAD_GROUND,
          },
          assets,
        ),
        { skin: cfg.skin, shirt: cfg.shirt, hair: cfg.hairColour },
        (hair && assets.hairBackfill?.[hair]) || '',
        (hair && assets.hairBehind?.[hair]) || '',
      ).replace(/viewBox="[^"]*"/, `viewBox="${HEAD_CROP}"`).replace(HEAD_CANVAS, '')
      cache.set(key, svg)
      return svg
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, cfg.base, cfg.skin, cfg.shirt, cfg.hairColour])

  /**
   * The other families' cards, each memoised on ONLY what its own card shows.
   *
   * ⚠⚠ NEVER key one of these on the whole config. That is the trap the note above records:
   * a cache keyed on `cfg` recomposes every card in the panel on every keystroke, and each
   * compose is a full rewrite of the base document. The dependency list IS the contract —
   * anything a card renders must be in it, and nothing else may be.
   *
   * ⭐ These cards wear the member's CURRENT HAIR, where the hair cards wear a bare head. Long
   * hair covers the ears, so an earring on `m15-locs` either floats or vanishes — a member has
   * to be able to see that before they choose it, and a bald preview would hide it.
   *
   * ⭐ Only the open step renders, so this is CHEAPER than the single long scroll it replaces,
   * which composed every family at once.
   */
  /**
   * ⚠⚠ A PLAIN FUNCTION, NOT A MEMO, AND IT CLOSES OVER NOTHING BUT `assets`. Memoising it on
   * `cfg` looked tidier and was a staleness bug by construction: each family below re-runs only
   * on its OWN narrow dependency list, so it would go on holding a `cardFor` built from an old
   * config. `cfg.shirt` is the one that bites — `headOnly` is told the shirt colour so it can
   * find and DELETE the body, so a stale one leaves the shirt painted into every card.
   *
   * Each family therefore builds its own `full` config inside its own memo. The dependency list
   * IS the contract: anything a card renders must be in it.
   */
  const cardFor = (cache: Map<string, string>, key: string, full: AvatarConfig) => {
    const hit = cache.get(key)
    if (hit) return hit
    const svg = headOnly(
      composeAvatar(full, assets),
      { skin: full.skin, shirt: full.shirt, hair: full.hairColour },
      (full.hair && assets.hairBackfill?.[full.hair]) || '',
      (full.hair && assets.hairBehind?.[full.hair]) || '',
    ).replace(/viewBox="[^"]*"/, `viewBox="${HEAD_CROP}"`).replace(HEAD_CANVAS, '')
    cache.set(key, svg)
    return svg
  }

  const expressionPreview = useMemo(() => {
    const cache = new Map<string, string>()
    const base = { ...cfg, expression: null, eyes: null, mouth: null, facialHair: null,
      glasses: null, earrings: null, garment: null, mark: false, background: HEAD_GROUND }
    return (k: string | null) => cardFor(cache, k ?? '—', { ...base, ...{ hair: cfg.hair, expression: k } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, cfg.base, cfg.skin, cfg.shirt, cfg.hairColour, cfg.eyeColour, cfg.mouthColour, cfg.hair])

  const glassesPreview = useMemo(() => {
    const cache = new Map<string, string>()
    const base = { ...cfg, expression: null, eyes: null, mouth: null, facialHair: null,
      glasses: null, earrings: null, garment: null, mark: false, background: HEAD_GROUND }
    return (k: string | null) => cardFor(cache, k ?? '—', { ...base, ...{ hair: cfg.hair, glasses: k } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, cfg.base, cfg.skin, cfg.shirt, cfg.hairColour, cfg.frameColour, cfg.hair])

  // ⚠ Keyed on the METAL as well as the style: the same hoop appears in both rows and they are
  // different pictures. A key of the style alone would show gold in the silver row.
  const earringPreview = useMemo(() => {
    const cache = new Map<string, string>()
    const base = { ...cfg, expression: null, eyes: null, mouth: null, facialHair: null,
      glasses: null, earrings: null, garment: null, mark: false, background: HEAD_GROUND }
    return (k: string | null, metal: string) =>
      cardFor(cache, `${k ?? '—'}|${metal}`,
        { ...base, hair: cfg.hair, earrings: k, metalColour: metal })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, cfg.base, cfg.skin, cfg.shirt, cfg.hairColour, cfg.hair])

  const facialHairPreview = useMemo(() => {
    const cache = new Map<string, string>()
    const base = { ...cfg, expression: null, eyes: null, mouth: null, facialHair: null,
      glasses: null, earrings: null, garment: null, mark: false, background: HEAD_GROUND }
    return (k: string | null) => cardFor(cache, k ?? '—', { ...base, ...{ hair: cfg.hair, facialHair: k } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, cfg.base, cfg.skin, cfg.hairColour, cfg.facialHairColour, cfg.hair])

  const [step, setStep] = useState<Step>('skin')

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
        {/* ⭐ A SCROLLING PILL STRIP, not a segmented control. Seven labels do not fit in
            equal-width segments at phone width — which is exactly why PoolDetail stopped using
            one. Same structure as `app/pools/[pool_id]/PoolDetail.tsx`.

            ⚠ The phone gutter (`pl-4`) is INSIDE the scroller. On the wrapper it sits outside
            the scroll box, so the strip stops short of the screen at both ends and reads as
            cropped rather than scrollable. */}
        <div className="flex items-stretch gap-2 overflow-x-auto scrollbar-hide -mx-6 px-6 pb-1 mb-6">
          {STEPS.map((s) => (
            <button
              key={s.key}
              type="button"
              data-tab-key={s.key}
              onClick={() => setStep(s.key)}
              aria-pressed={step === s.key}
              className={`shrink-0 w-[88px] px-2 py-3 rounded-control text-[11px] font-bold leading-tight text-center transition-colors ${
                // ⚠ NOT `sp-bg-mist`, which the admin sidebar uses for its active tab: mist is
                // #EEF1F8 and this strip sits on a WHITE card, so the active pill was all but
                // invisible — I had to read the computed style to tell which one was selected.
                // The panel's own active treatment (bg-gray-900) would be a second black strip
                // directly under the view switcher, so: the primary tint, which reads at a
                // glance and stays lighter than the switcher above it.
                // ⭐ THE SAME SELECTED TREATMENT AS A COLOUR TILE — SportPool blue on its tint.
                // Two controls on one panel that both mean "this one is chosen" should not say
                // it two different ways. `sp-bg-primary-light` is primary-50 (#F7F9FF), which
                // is white enough on a white card that I had to read the computed style to see
                // which tab was active.
                step === s.key
                  ? 'bg-primary-100 text-primary-600'
                  : 'sp-text-slate sp-hover-snow'
              }`}
            >
              {/* ⚠ NO strokeWidth ON A SOLID ICON. The Hugeicons wrapper spreads
                  stroke="currentColor" onto every path whenever strokeWidth is defined, which
                  lays an outline over the filled body and fattens the glyph — components/ui/
                  Icon.tsx records the same trap. Verified here: the rendered path carried both
                  fill and stroke until this was removed. */}
              <HugeiconsIcon icon={s.icon} size={34} className="mx-auto mb-1.5 block" />
              {s.label}
            </button>
          ))}
        </div>

        {step === 'skin' && (
          <Section title="Skin" hint="Fifteen tones, evenly spaced.">
            <ColourCard colours={PALETTE.skin} value={cfg.skin} onChange={(c) => set('skin', c)} />
          </Section>
        )}

        {step === 'eyes' && (
          <Section title="Eyes" hint="The colour shows in every expression that has its eyes open.">
            <div className="mb-5">
              <ColourCard colours={PALETTE.eye} value={cfg.eyeColour}
                onChange={(c) => set('eyeColour', c)} />
            </div>
            <div className="text-[11px] font-medium text-gray-500 mb-2">Expression</div>
            <AssetCards options={Object.keys(assets.expressions)} value={cfg.expression ?? null}
              onChange={(v) => set('expression', v)} render={expressionPreview} />
            {/* ⚠ Said rather than left to look broken: these two are drawn with the eyes
                CLOSED, so the colour above cannot show in them. */}
            <p className="text-[11px] text-gray-500 mt-3">
              Cheeky and Laughing are drawn with the eyes closed, so the eye colour does not
              show on them.
            </p>
          </Section>
        )}

        {step === 'hair' && (
          <Section title="Hair">
            <div className="mb-5">
              <ColourCard colours={PALETTE.hair} value={cfg.hairColour}
                onChange={(c) => set('hairColour', c)} />
            </div>
            <AssetCards options={[null, ...Object.keys(assets.hair)]} value={cfg.hair}
              onChange={(v) => set('hair', v)} render={headPreview} />
          </Section>
        )}

        {step === 'eyewear' && (
          <>
            <Section title="Glasses">
              <div className="mb-5">
                <ColourCard colours={PALETTE.frame} value={cfg.frameColour ?? PALETTE.frame[0]}
                  onChange={(c) => set('frameColour', c)} />
              </div>
              <AssetCards options={[null, ...Object.keys(assets.glasses ?? {})]}
                value={cfg.glasses ?? null} onChange={(v) => set('glasses', v)}
                render={glassesPreview} />
            </Section>

            {/* ⭐ Ryan, 2026-09-26: gold and silver as two rows, both shown. One click picks the
                earring AND its metal — a metal swatch plus a text list cannot show the member
                what they are choosing, which is the whole point of the pair. */}
            <Section title="Earrings">
              {METALS.map((m) => (
                <div key={m.colour} className="mb-4 last:mb-0">
                  <div className="text-[11px] font-medium text-gray-500 mb-2">{m.label}</div>
                  <AssetCards
                    options={Object.keys(assets.earrings ?? {})}
                    value={cfg.earrings && cfg.metalColour === m.colour ? cfg.earrings : null}
                    onChange={(v) => { set('earrings', v); if (v) set('metalColour', m.colour) }}
                    render={(k) => earringPreview(k, m.colour)}
                  />
                </div>
              ))}
              <button type="button" onClick={() => set('earrings', null)}
                className="text-[12px] text-gray-500 underline underline-offset-2 hover:text-gray-900">
                No earrings
              </button>
            </Section>
          </>
        )}

        {step === 'facialhair' && (
          <Section title="Facial hair">
            {/* ⚠ "Match hair" is UNSET, not a colour — it is the only path that LIFTS the
                beard away from the head hair, and it must never be stored as a copy of the hair
                colour. It sits above the grid rather than posing as a tile in it, because a
                tile in a colour grid promises to be a colour. */}
            <button type="button" onClick={() => set('facialHairColour', undefined)}
              aria-pressed={!cfg.facialHairColour}
              className={`mb-2.5 px-3 py-1.5 rounded-chip text-[12px] border transition ${
                !cfg.facialHairColour
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-gray-400'}`}>
              Match hair
            </button>
            <ColourCard colours={PALETTE.hair} value={cfg.facialHairColour}
              onChange={(c) => set('facialHairColour', c)} />
            {/* ⚠ Said plainly rather than shipping a control that looks broken: stubble is a
                SHADOW on the skin, so the whole palette compresses into a few units on it. */}
            <p className="text-[11px] text-gray-500 mb-5">
              Stubble is drawn as a shadow on the skin, so colour barely changes it.
            </p>
            <AssetCards options={[null, ...Object.keys(assets.facialhair)]}
              value={cfg.facialHair} onChange={(v) => set('facialHair', v)}
              render={facialHairPreview} />
          </Section>
        )}

        {step === 'wearables' && (
          <>
            <Section title="Headwear">
              <div className="rounded-card border border-dashed border-gray-200 px-4 py-8 text-center">
                <p className="text-[13px] font-semibold text-gray-500">Nothing here yet</p>
                <p className="text-[11px] text-gray-400 mt-1">
                  No headwear has been drawn. The slot is deliberately not wired into the
                  compositor until there is art for it.
                </p>
              </div>
            </Section>
            <Section title="Top">
              <Options options={Object.keys(assets.garments ?? {})} value={cfg.garment ?? null}
                onChange={(v) => set('garment', v)} />
            </Section>
          </>
        )}

        {step === 'colour' && (
          <Section title="Your colour" hint="This is you across the app — your avatar, and your side of a duel.">
            <ColourCard colours={AVATAR_BACKGROUNDS} names={AVATAR_COLOUR_NAMES}
              value={cfg.background} onChange={(c) => set('background', c)} />
            <p className="text-xs text-gray-500 mt-2">
              {AVATAR_COLOUR_NAMES[myIndex] ? TITLE(AVATAR_COLOUR_NAMES[myIndex]) : 'Custom'}
            </p>
          </Section>
        )}
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
    // ⚠⚠ no-store, and it is load-bearing. This is a STATIC file in public/, so the browser
    // caches it by URL — and the URL never changes when the assets are rebuilt. Ryan spent an
    // afternoon judging hair cards that had already been fixed, because the page kept serving
    // the copy it had. A stale asset bundle looks exactly like a change that did not work.
    fetch('/avatar-assets.json', { cache: 'no-store' })
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
