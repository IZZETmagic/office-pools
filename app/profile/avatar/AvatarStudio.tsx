'use client'

// =============================================================
// The member's side of the avatar builder
// =============================================================
// The seven steps come from <AvatarBuilder>, which the admin tab uses too. What lives HERE is
// everything the admin's version deliberately does not have: a real save, dirty tracking, and a
// preview of the member rather than a hardcoded "Alex Mercer".
//
// ⭐⭐ TWO COLUMNS ARE WRITTEN, NOT ONE. Six steps go to `users.avatar_build`; the seventh — the
// colour — goes to `users.avatar_colour`, because the avatar's ground IS the member's colour and
// that is what a Showdown duel glows with. Migration 147 explains why keeping them in one column
// would be the same fact stored twice.
//
// ⚠ The save is its OWN update, not folded into `handleProfileSave` on the profile page. That
// one carries username and email and is gated on username validity — so a member with a taken
// username could not save their face, and worse, its `emailChanged` branch calls
// `supabase.auth.updateUser`, which would fire a verification email on an avatar save.
// =============================================================

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { AvatarBuilder } from '@/components/avatar/AvatarBuilder'
import { useAvatarAssets } from '@/components/avatar/useAvatarAssets'
import { composeAvatar, type AvatarConfig } from '@/lib/avatar/compose'
import {
  isStoredAvatarBuild,
  readStoredAvatarBuild,
  toStoredAvatarBuild,
  type StoredAvatarBuild,
} from '@/lib/avatar/storedConfig'
import {
  AVATAR_COLOUR_NAMES,
  avatarBackgroundFor,
  avatarIndexFor,
  isAvatarColourName,
} from '@/lib/design/avatarGradient'

/**
 * ⚠ A STARTING FACE, NOT THE ADMIN'S DEFAULT. The admin tab's `DEFAULT` turns on the SP chest
 * mark and the beard fade for recorded DEBUG reasons — "this is the one surface where the fade
 * has actually been looked at". Neither belongs on a member's first avatar, and `mark` is not
 * even in the stored type.
 */
const STARTING_BUILD: StoredAvatarBuild = {
  base: 'base-neck-100',
  skin: '#F5C9A6',
  hair: 'm03-quiff',
  hairColour: '#4A3B32',
  facialHair: null,
  glasses: null,
  earrings: null,
  garment: null,
  expression: 'x-happy',
  eyes: null,
  mouth: null,
  eyeColour: '#5B3A1E',
  mouthColour: '#B67A70',
  shirt: '#3B6EFF',
}

export default function AvatarStudio({
  userId, fullName, username, avatarColour, avatarBuild,
}: {
  userId: string
  fullName: string | null
  username: string | null
  avatarColour: string | null
  avatarBuild: unknown
}) {
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { assets, error: assetsError } = useAvatarAssets()

  const [colour, setColour] = useState<string | null>(avatarColour)
  const [build, setBuild] = useState<StoredAvatarBuild | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // ⚠ The stored row is only read ONCE THE ART IS HERE, because `readStoredAvatarBuild` needs
  // the bundle to know which assets this deploy can actually draw — see its header on why a row
  // may legitimately name a hairstyle that no longer exists.
  const stored = useMemo(
    () => (assets ? readStoredAvatarBuild(avatarBuild, assets) : null),
    [assets, avatarBuild],
  )
  const current = build ?? stored ?? STARTING_BUILD

  // The background is DERIVED, never stored — see migration 147.
  const background = avatarBackgroundFor(avatarIndexFor(userId, colour))

  // ⚠ Memoised, not built inline: a fresh object every render would re-key the preview memo
  // below on every keystroke, and composing is 0.8 ms of work to throw away each time.
  const cfg: AvatarConfig = useMemo(
    () => ({ ...current, background, mark: false }),
    [current, background],
  )

  const preview = useMemo(
    () => (assets ? composeAvatar(cfg, assets) : ''),
    [assets, cfg],
  )

  const dirty =
    (build !== null && JSON.stringify(build) !== JSON.stringify(stored ?? STARTING_BUILD)) ||
    colour !== avatarColour

  /**
   * ⭐ ONE `set` FOR TWO DESTINATIONS. The builder hands back whole-config keys because it also
   * drives the admin tab; here `background` is intercepted and turned back into a colour NAME,
   * which is what the other column holds. Everything else is part of the build.
   */
  const set = <K extends keyof AvatarConfig>(k: K, v: AvatarConfig[K]) => {
    if (k === 'background') {
      const i = AVATAR_COLOUR_NAMES.findIndex((_, n) => avatarBackgroundFor(n) === v)
      if (i >= 0) setColour(AVATAR_COLOUR_NAMES[i])
      return
    }
    setBuild({ ...current, [k]: v } as StoredAvatarBuild)
  }

  /**
   * ⭐ "DONE", NOT "SAVE" — the reference Ryan asked for puts a single primary action bottom
   * right, and Done is what an editor's exit means: keep this and take me back.
   *
   * ⚠ IT ONLY NAVIGATES ON SUCCESS. A save that fails leaves you on the editor with the error
   * and your work intact; bouncing to the profile and dropping an unsaved face would be the
   * worst possible reading of the word.
   *
   * ⚠ A CLEAN EDITOR JUST LEAVES. No dirty state means nothing to write, and firing an UPDATE
   * that changes nothing is a pointless round trip on the row a member's own profile renders
   * from. The back arrow is the same exit without the save.
   */
  async function handleDone() {
    if (!dirty) {
      router.push('/profile?tab=account')
      return
    }
    setSaving(true)
    setSaveError(null)
    const payload = toStoredAvatarBuild({ ...current, background, mark: false })

    // ⚠ Validated before it leaves. The column's CHECK is shape-only by design (147), so this
    // guard is the only thing standing between a malformed config and a member whose own
    // profile cannot render. Same posture as `isAvatarColourName` on the colour.
    if (!isStoredAvatarBuild(payload)) {
      setSaveError('That avatar could not be saved. Please try a different combination.')
      setSaving(false)
      return
    }

    const { error } = await supabase
      .from('users')
      .update({
        avatar_build: payload,
        avatar_colour: isAvatarColourName(colour) ? colour : null,
      })
      .eq('user_id', userId)

    setSaving(false)
    if (error) {
      setSaveError(error.message)
      return
    }
    setBuild(null)
    router.push('/profile?tab=account')
  }

  if (assetsError) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <p className="text-sm text-danger-600">{assetsError}</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 sm:py-6">
      {/* ⚠ A BACK ARROW AND A TITLE, nothing else. This header used to carry the Save button
          too; the primary action is now one button at the bottom right, so the top of the page
          is just "where am I and how do I leave". */}
      <div className="flex items-center gap-3 mb-5">
        <Link
          href="/profile?tab=account"
          aria-label="Back to profile"
          className="w-9 h-9 -ml-1 rounded-control flex items-center justify-center text-muted hover:text-ink hover:bg-surface-tertiary transition-colors"
        >
          <Icon name="chevron.left" size={20} weight="semibold" />
        </Link>
        <h1 className="text-xl sm:text-2xl font-bold text-ink">Edit avatar</h1>
      </div>

      {saveError && (
        <p className="text-[13px] text-danger-600 mb-4">{saveError}</p>
      )}

      {!assets ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <>
          {/* ⭐⭐ ONE CONTAINER, PREVIEW FULL-BLEED. Previously two separate cards with a gap;
              Ryan's reference is a single bordered box with the avatar running edge to edge on
              the left. `overflow-hidden` on the container is what lets the preview meet the
              rounded corners with no inset, and is also what crops the square when the controls
              are shorter than it.

              ⚠⚠ THE BOX IS A FIXED HEIGHT ON DESKTOP AND THE CONTROLS SCROLL INSIDE IT. Left to
              itself the preview panel takes its height from the controls, and those change
              height with the step — Skin tone is two rows, Hair is twenty-five tiles. The avatar
              would have sat at the top of a column of flat colour six hundred pixels tall. A
              fixed box with a scrolling option list is what the reference actually is, and it
              keeps the avatar in view while you change it, which was the point of the preview.

              ⚠ Phone keeps its natural height: there is no second column to scroll against, and
              a short scrolling box inside a scrolling page is the worst of both. */}
          <div className="rounded-card border border-silver/50 overflow-hidden bg-surface flex flex-col lg:flex-row lg:h-[480px]">
            <div
              className="relative lg:w-[42%] shrink-0 overflow-hidden"
              style={{ backgroundColor: background }}
            >
              {/* ⚠ Anchored TOP, sized to WIDTH. The square is 2048×2048 with its ground painted
                  edge to edge, so filling the width and letting the bottom fall outside gives
                  the head-and-torso framing in the reference. The panel already carries the
                  same colour, so nothing shows where the square does not reach. */}
              <div
                className="absolute inset-x-0 top-0 [&>svg]:w-full [&>svg]:h-auto [&>svg]:block"
                dangerouslySetInnerHTML={{ __html: preview }}
              />
              {/* Holds the panel open to a sensible height on a phone, where there is no
                  second column to take its height from. */}
              <div className="w-full aspect-square lg:hidden" />
            </div>

            <div className="flex-1 min-w-0 p-5 sm:p-6 lg:overflow-y-auto">
              <AvatarBuilder assets={assets} cfg={cfg} set={set} />
            </div>
          </div>

          {/* ⚠ The single primary action, bottom right, matching the reference. Never disabled:
              on a clean editor Done is simply the way out, so a member cannot be left staring
              at a greyed button wondering what it wants from them. */}
          <div className="flex justify-end mt-5">
            <Button onClick={handleDone} disabled={saving}>
              {saving ? 'Saving…' : 'Done'}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
