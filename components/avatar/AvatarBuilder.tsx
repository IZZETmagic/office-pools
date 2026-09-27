'use client'

// =============================================================
// The avatar builder — the seven steps a member actually chooses
// =============================================================
// Lifted VERBATIM out of app/admin/super/AvatarsTab.tsx, where it was the "Member selector" view
// and the only place this UI has ever run. It moved because the customer-facing profile page
// needs the same control, and two copies of a seven-step picker would drift within a week.
//
// ⭐⭐ CONTROLLED, AND IT RENDERS NO SAVE BUTTON. The admin tab's Save is inert by design
// ("Mock — saves nothing"); the profile's is a real write with dirty tracking. A component that
// owned a Save would have to know which. It owns the CHOICES and nothing else — the host owns
// the state, the persona preview beside it, and what Save means.
//
// ⚠⚠ SIX STEPS WRITE ONE COLUMN AND THE SEVENTH WRITES ANOTHER. `background` is not stored in
// `users.avatar_build`: the avatar's ground IS the member's colour, which lives in
// `users.avatar_colour` and is what a Showdown duel glows with. The host is what knows that —
// see lib/avatar/storedConfig.ts and migration 147.
//
// ⚠ THE PREVIEW MEMO DEPENDENCY LISTS ARE LOAD-BEARING — two separate staleness bugs came from
// keying a card cache on the whole config, and the notes on each one are the record of that. Do
// not "tidy" them.
// =============================================================

import { useMemo, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  BackgroundIcon, ContrastIcon, HatIcon, RectangleGogglesIcon, Relieved02Icon, ScissorIcon,
} from '@hugeicons-pro/core-solid-rounded'
import { MoustacheIcon } from './stepIcons'
import { composeAvatar, headOnly, PALETTE, type AvatarAssets, type AvatarConfig } from '@/lib/avatar/compose'
import { AVATAR_BACKGROUNDS, AVATAR_COLOUR_NAMES } from '@/lib/design/avatarGradient'

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
const COLOUR_TILE = 72

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
      style={{ gridTemplateColumns: `repeat(auto-fill, ${COLOUR_TILE}px)`, justifyContent: 'center' }}
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
              : 'border-gray-200 bg-surface hover:border-gray-300'
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

// ⚠ NO `hint` PROP. Every section carried a line of explanation under its title and Ryan,
// 2026-09-26, wanted them gone — the titles are the navigation, and a paragraph under each one
// is noise in a panel that is already seven steps deep. The prop is REMOVED rather than left unused
// so a future section cannot quietly reintroduce them one at a time.
//
// ⚠ This is not the same as the notes that remain inside two steps — that stubble reads as a
// shadow, and that Cheeky and Laughing are drawn eyes-closed. Those sit under the CONTROL they
// qualify, not under the title, and Ryan asked for them explicitly.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h3 className="text-lg font-bold text-gray-900 mb-3">{title}</h3>
      {children}
    </section>
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
 * ⭐⭐ A SHIRT CANNOT USE THE HEAD CARD. `headOnly` finds the body and DELETES it — that is its
 * whole job — so the one preview helper in this file is the one thing that cannot show a
 * garment. A shirt card is the avatar composed whole and cropped to the shoulders instead.
 *
 * ⚠⚠ THE TILE STAYS SQUARE AND THE CONTENT ZOOMS OUT — Ryan, after a 2:1 tile: "it should be
 * the same size as the other asset squares. I guess maybe we just need to shrink down what's
 * inside the square." He is right, and a measurement settles where "out" lands.
 *
 * Rasterising all 25 styles and taking the extent of every non-background pixel, the visible
 * content spans x61..1987 by y0..2038. So the tightest square that clips NOTHING is, to within
 * a few units, the canvas itself. There is no clever tighter crop to find — the hair reaches
 * the edges, and any square small enough to make the garment bigger cuts a style somewhere.
 *
 * ⚠ THE EARLIER CROPS ALL FAILED FOR ONE REASON: a square big enough to show the garment was
 * NARROWER THAN THE HEAD (the shirt is x343..1698, hair goes wider still), so the cheeks ran
 * into the tile edges. Making the tile 2:1 fixed the clipping and broke the grid instead. The
 * fix was never the frame; it was the zoom.
 */
const BODY_CROP = '0 0 2048 2048'
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
 * ⚠⚠ ONE FIXED SIZE, AND THE ROW IS CENTRED. Three rules have been tried here and this is the
 * one that holds:
 *
 *   repeat(N, 1fr)          divides the width — the same card was 104px on desktop and 49 at
 *                           375px, and a head at 49px is a smudge
 *   repeat(auto-fill, Npx)  fixed, but the remainder piles up at the END of every row as a
 *                           dead band
 *   minmax(MIN, 1fr)        fits as many as possible then shares the slack back as GROWTH —
 *                           which means the tile size changes with the width, and Ryan:
 *                           "the ones in some scenarios where they're squeezed do not look
 *                           right... make the squares all the same size, no matter what"
 *
 * ⭐ So: a fixed tile, and `justify-content: center` puts the leftover HALF ON EACH SIDE
 * instead of all of it trailing. The gap problem and the resize problem have different
 * answers — growth solves the first and creates the second; centring solves the first and
 * leaves the tile alone.
 */
const ASSET_TILE = 120

function AssetCards({
  options, value, onChange, render, label,
}: {
  options: (string | null)[]
  value: string | null
  onChange: (v: string | null) => void
  render: (key: string | null) => string
  /** For a composite key that cannot name itself — see the earrings grid. */
  label?: (key: string | null) => string
}) {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(auto-fill, ${ASSET_TILE}px)`, justifyContent: 'center' }}
    >
      {options.map((o) => {
        const selected = o === value
        return (
          /* ⚠ THE NAME MOVES TO THE BUTTON, it is not lost. The caption under each tile is
             gone — Ryan, 2026-09-26 — but a picker whose options carry no accessible name is
             unusable with a screen reader, and "Bushybeard" vs "Fullbeard" is worth a hover
             even when the picture carries the choice. */
          <button
            key={o ?? 'none'}
            type="button"
            onClick={() => onChange(o)}
            aria-pressed={selected}
            aria-label={label ? label(o) : o === null ? 'None' : TITLE(o)}
            title={label ? label(o) : o === null ? 'None' : TITLE(o)}
            className="group text-left"
          >
            {/* ⚠⚠ `h-auto` ON THE SVG, NOT `h-full`, AND IT IS NOT COSMETIC. With `h-full` the
                tile is square ONLY IF the browser honours `aspect-ratio`: Chrome does, so the
                box measured 120x120 for me on both localhost and the deployed site, at 375px
                and at 430px. On Ryan's phone it did not — the SVG took 100% of a height that
                was never constrained, and padding (12) plus border (4) pushed the tile to
                120x136. Measured off his own screenshot: 359x407 device px at 3x.

                `h-auto` makes the SVG's height follow its own square viewBox, so the tile is
                square whether or not `aspect-ratio` applies — the two paths agree instead of
                one silently winning. A layout that depends on ONE property being honoured is a
                layout that is broken on some device you do not own.

                ⚠ I asserted twice that these were square on the strength of
                getBoundingClientRect in MY browser. The device that disagreed was the only
                evidence that mattered, and it was in the screenshots all along. */}
            {/* ⭐ THE SAME TILE AS A COLOUR SWATCH — a bordered card with its subject inset,
                SportPool blue on its tint when chosen. An asset and a colour are the same kind
                of choice, so they should not be two different controls. ⚠ `border-2` on BOTH
                states, not a border that becomes a ring: a 1px border swapping for a 2px ring
                shifts the tile by a pixel on selection and the whole grid twitches. */}
            <div
              className={`aspect-square rounded-control border-2 p-1.5 transition ${
                selected
                  ? 'border-primary-600 bg-primary-100'
                  : 'border-gray-200 bg-surface group-hover:border-gray-300'
              } [&>svg]:w-full [&>svg]:h-auto [&>svg]:block`}
              dangerouslySetInnerHTML={{ __html: render(o) }}
            />
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
  { key: 'skin', label: 'Skin tone', icon: ContrastIcon },
  // ⭐ A FACE, NOT AN EYE — Ryan picked `Relieved02Icon` for this one. The step is really the
  // EXPRESSION step (eye colour, then twelve expressions), and `ViewIcon` is the app's "show /
  // preview" glyph, which promised a different thing entirely. It is also the first of these
  // seven to be drawn from the same subject as its own content, which is the direction the note
  // above wants the rest to go.
  { key: 'eyes', label: 'Eyes', icon: Relieved02Icon },
  { key: 'hair', label: 'Hair', icon: ScissorIcon },
  // ⚠ `RectangleGogglesIcon` DID NOT EXIST IN THE INSTALLED PACK. It arrived in
  // @hugeicons-pro/core-solid-rounded 4.3.4, one of 630 icons added over the 4.2.3 that was
  // pinned here (5,442 -> 6,072). The declared range was already `^4.2.3`, so only the lockfile
  // was holding it back; the bump changes the pin, not the contract.
  { key: 'eyewear', label: 'Glasses & earrings', icon: RectangleGogglesIcon },
  // ⭐ OUR OWN MOUSTACHE, traced from the avatar art rather than borrowed from the icon pack.
  // `ChairBarberIcon` was a barber's chair — furniture, standing in for a beard.
  { key: 'facialhair', label: 'Facial hair', icon: MoustacheIcon },
  { key: 'wearables', label: 'Headwear & shirt', icon: HatIcon },
  // ⭐ `BackgroundIcon`, and the name is the honest one: this step sets the avatar's GROUND,
  // which is also the glow on your side of a Showdown duel. `ColorsIcon` was three paint blobs —
  // it said "pick a colour" next to six other steps that all pick colours too.
  { key: 'colour', label: 'Your colour', icon: BackgroundIcon },
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

export function AvatarBuilder({ assets, cfg, set }: {
  assets: AvatarAssets
  /** ⚠ Carries `background`, because the CARDS need a ground to draw on. It is not what the
   *  host stores — see the header. */
  cfg: AvatarConfig
  set: <K extends keyof AvatarConfig>(k: K, v: AvatarConfig[K]) => void
}) {

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

  /**
   * ⚠ NO `headOnly` AND NO `cardFor` — both exist to remove the body, which is the thing a
   * shirt IS. This composes the whole avatar and crops. It still strips the sentinel canvas so
   * the tile's own background shows through, exactly as the head cards do.
   *
   * ⚠ `mark: false` on purpose: the SP chest mark sits ON the garment, and these cards are for
   * choosing the garment. Left in, every tile would carry the same badge.
   */
  const garmentPreview = useMemo(() => {
    const cache = new Map<string, string>()
    const base = {
      ...cfg, expression: null, eyes: null, mouth: null, facialHair: null,
      glasses: null, earrings: null, mark: false, background: HEAD_GROUND,
    } as const
    return (k: string | null) => {
      const key = k ?? '—'
      const hit = cache.get(key)
      if (hit) return hit
      const svg = composeAvatar({ ...base, garment: k }, assets)
        .replace(/viewBox="[^"]*"/, `viewBox="${BODY_CROP}"`)
        .replace(HEAD_CANVAS, '')
      cache.set(key, svg)
      return svg
    }
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

  // ⚠ A hex→index reverse lookup, and the ONLY place one is still legitimate: inside the builder
  // the live config carries a background because the preview needs one. Nothing PERSISTED does
  // this — a stored row holds the colour name and the background is derived from it.
  const myIndex = AVATAR_BACKGROUNDS.indexOf(cfg.background)

  // ⚠⚠ NO CARD CHROME HERE — the CALLER supplies it. The profile editor puts the preview and
  // these controls inside ONE bordered container (the preview full-bleed on the left), and a
  // card of its own here would draw a second border inside the first. The admin tab wraps it in
  // the card this used to render itself.
  //
  // ⚠⚠ `bg-surface`, NEVER `bg-white`, wherever chrome IS drawn — on every tile below, and in
  // both callers. globals.css remaps the whole Tailwind gray ramp onto the app's neutral ramp,
  // so each `text-gray-*` and `border-gray-*` in this file INVERTS in dark mode — but
  // `bg-white` is stock Tailwind and does not. Written the obvious way, the card stayed white
  // while its own titles went light: measured at 1.20:1, which is invisible. It never showed
  // while the builder lived only on the admin tab, because that surface was only ever looked at
  // in light mode. `--surface` is #FFFFFF in light, so it is a no-op there and a fix in dark.
  return (
      <div>
        {/* ⭐⭐ ICONS ONLY, UNDERLINED — Ryan, with a reference: "Can we have our web avatar
            editor simple like this?" Seven labelled pills could not fit at phone width, which
            is why this used to be a horizontally SCROLLING strip with an off-screen half. Drop
            the labels and all seven fit as equal shares of the width at 375px, so the scroller
            goes and with it the question of whether anyone ever found step seven.

            ⚠⚠ THE GLYPHS NOW CARRY THE WHOLE MEANING, and Ryan has already said of them: "I'm
            still not sold on them but we will go with them for now." They were provisional when
            a label sat under each one explaining them; without the labels they are the only
            thing a member has. Hence `aria-label` AND `title` on every tab — a screen reader
            gets the name, a hover recovers it, and the section heading below names the step
            again as soon as it is open. If a glyph has to be guessed at, that is the one to
            replace rather than re-adding the labels.

            ⚠ `role="tablist"` with `aria-selected`, not `aria-pressed`: these are views of one
            panel, not seven independent toggles. */}
        <div role="tablist" aria-label="Avatar steps" className="flex items-stretch border-b border-gray-200 mb-6">
          {STEPS.map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              data-tab-key={s.key}
              onClick={() => setStep(s.key)}
              aria-selected={step === s.key}
              aria-label={s.label}
              title={s.label}
              // ⚠ `-mb-px` pulls the 2px underline over the container's own 1px border so the
              // active tab sits ON the rule rather than above it, leaving a seam.
              className={`flex-1 min-w-0 flex items-center justify-center py-3 border-b-2 -mb-px transition-colors ${
                step === s.key
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent sp-text-slate hover:text-ink'
              }`}
            >
              {/* ⚠ NO strokeWidth ON A SOLID ICON. The Hugeicons wrapper spreads
                  stroke="currentColor" onto every path whenever strokeWidth is defined, which
                  lays an outline over the filled body and fattens the glyph — components/ui/
                  Icon.tsx records the same trap. Verified here: the rendered path carried both
                  fill and stroke until this was removed. */}
              <HugeiconsIcon icon={s.icon} size={26} />
            </button>
          ))}
        </div>

        {step === 'skin' && (
          <Section title="Skin tone">
            <ColourCard colours={PALETTE.skin} value={cfg.skin} onChange={(c) => set('skin', c)} />
          </Section>
        )}

        {/* ⚠ TWO SECTIONS, not one with a small grey sub-label. The step holds two separate
            choices, so each gets a real heading — Ryan, 2026-09-26. The same shape as Glasses
            and Earrings in the eyewear step. */}
        {step === 'eyes' && (
          <>
            <Section title="Eye colour">
              <ColourCard colours={PALETTE.eye} value={cfg.eyeColour}
                onChange={(c) => set('eyeColour', c)} />
            </Section>
            <Section title="Expression">
              <AssetCards options={Object.keys(assets.expressions)} value={cfg.expression ?? null}
                onChange={(v) => set('expression', v)} render={expressionPreview} />
              {/* ⚠ Said rather than left to look broken: these two are drawn with the eyes
                  CLOSED, so the colour above cannot show in them. */}
              <p className="text-[11px] text-gray-500 mt-3">
                Cheeky and Laughing are drawn with the eyes closed, so the eye colour does not
                show on them.
              </p>
            </Section>
          </>
        )}

        {step === 'hair' && (
          <>
            <Section title="Hair colour">
              <ColourCard colours={PALETTE.hair} value={cfg.hairColour}
                onChange={(c) => set('hairColour', c)} />
            </Section>
            <Section title="Hair">
              <AssetCards options={[null, ...Object.keys(assets.hair)]} value={cfg.hair}
                onChange={(v) => set('hair', v)} render={headPreview} />
            </Section>
          </>
        )}

        {step === 'eyewear' && (
          <>
            <Section title="Glasses colour">
              <ColourCard colours={PALETTE.frame} value={cfg.frameColour ?? PALETTE.frame[0]}
                onChange={(c) => set('frameColour', c)} />
            </Section>
            <Section title="Glasses">
              <AssetCards options={[null, ...Object.keys(assets.glasses ?? {})]}
                value={cfg.glasses ?? null} onChange={(v) => set('glasses', v)}
                render={glassesPreview} />
            </Section>

            {/* ⭐ Ryan, 2026-09-26: gold and silver as two rows, both shown. One click picks the
                earring AND its metal — a metal swatch plus a text list cannot show the member
                what they are choosing, which is the whole point of the pair. */}
            {/* ⭐ ONE GRID, EACH STYLE'S METALS SIDE BY SIDE — Ryan, 2026-09-26. Two labelled
                rows made the metal look like a section and the style like a choice within it,
                when the real choice is the PAIR. Now stud-gold sits next to stud-silver and you
                pick along the row.
                ⚠ "None" is a TILE, not a text link underneath. It was there before as the
                words "No earrings" and Ryan could not find it — an option that looks nothing
                like the options is not an option. */}
            <Section title="Earrings">
              <AssetCards
                options={[null, ...Object.keys(assets.earrings ?? {})
                  .flatMap((e) => METALS.map((m) => `${e}|${m.colour}`))]}
                value={cfg.earrings ? `${cfg.earrings}|${cfg.metalColour ?? METALS[0].colour}` : null}
                onChange={(v) => {
                  if (!v) return set('earrings', null)
                  const [style, metal] = v.split('|')
                  set('earrings', style)
                  set('metalColour', metal)
                }}
                render={(k) => {
                  if (!k) return earringPreview(null, METALS[0].colour)
                  const [style, metal] = k.split('|')
                  return earringPreview(style, metal)
                }}
                label={(k) => {
                  if (!k) return 'None'
                  const [style, metal] = k.split('|')
                  return `${TITLE(style)} — ${METALS.find((m) => m.colour === metal)?.label ?? metal}`
                }}
              />
            </Section>
          </>
        )}

        {step === 'facialhair' && (
          <>
            <Section title="Facial hair colour">
              {/* ⚠ "Match hair" is UNSET, not a colour — it is the only path that LIFTS the
                  beard away from the head hair, and it must never be stored as a copy of the
                  hair colour. It sits above the grid rather than posing as a tile in it,
                  because a tile in a colour grid promises to be a colour. */}
              <button type="button" onClick={() => set('facialHairColour', undefined)}
                aria-pressed={!cfg.facialHairColour}
                className={`mb-2.5 px-3 py-1.5 rounded-chip text-[12px] border transition ${
                  !cfg.facialHairColour
                    ? 'bg-ink text-surface border-ink'
                    : 'bg-surface text-gray-700 border-gray-200 hover:border-gray-400'}`}>
                Match hair
              </button>
              <ColourCard colours={PALETTE.hair} value={cfg.facialHairColour}
                onChange={(c) => set('facialHairColour', c)} />
              {/* ⚠ Said plainly rather than shipping a control that looks broken: stubble is a
                  SHADOW on the skin, so the whole palette compresses into a few units on it.
                  ⚠ It stays with the COLOUR, not the styles — it is the colour control it
                  qualifies, and splitting the section is what made that distinction visible. */}
              <p className="text-[11px] text-gray-500 mt-3">
                Stubble is drawn as a shadow on the skin, so colour barely changes it.
              </p>
            </Section>
            <Section title="Facial hair">
              <AssetCards options={[null, ...Object.keys(assets.facialhair)]}
                value={cfg.facialHair} onChange={(v) => set('facialHair', v)}
                render={facialHairPreview} />
            </Section>
          </>
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
            {/* ⭐⭐ ONE COLOUR DRIVES ALL SEVEN. Ryan asked for either a shirt colour or the
                same shirt in standard colours — and the first is strictly better here, because
                every garment asset carries the SHIRT TOKEN (checked all six), so `cfg.shirt`
                recolours the base shirt AND every pattern. The alternative would be 7 garments
                x 8 colours = 56 cards to say what one row of swatches says.

                ⚠ It was already wired end to end and simply never offered: `PALETTE.shirt` has
                eight colours and composeAvatar has always swapped them — the member selector
                was the only surface that did not expose it. The Builder has had it all along. */}
            <Section title="Shirt colour">
              <ColourCard colours={PALETTE.shirt} value={cfg.shirt}
                onChange={(c) => set('shirt', c)} />
            </Section>

            {/* ⚠ "None" is the BASE SHIRT, not the absence of clothing — the avatar always
                wears something — so the first tile is a real choice and shows what it gives. */}
            <Section title="Shirt">
              <AssetCards options={[null, ...Object.keys(assets.garments ?? {})]}
                value={cfg.garment ?? null} onChange={(v) => set('garment', v)}
                render={garmentPreview} />
            </Section>
          </>
        )}

        {step === 'colour' && (
          <Section title="Your colour">
            <ColourCard colours={AVATAR_BACKGROUNDS} names={AVATAR_COLOUR_NAMES}
              value={cfg.background} onChange={(c) => set('background', c)} />
            <p className="text-xs text-gray-500 mt-2">
              {AVATAR_COLOUR_NAMES[myIndex] ? TITLE(AVATAR_COLOUR_NAMES[myIndex]) : 'Custom'}
            </p>
          </Section>
        )}
      </div>
  )
}
