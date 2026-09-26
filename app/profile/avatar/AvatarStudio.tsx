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
  const [saved, setSaved] = useState(false)
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
    setSaved(false)
    setBuild({ ...current, [k]: v } as StoredAvatarBuild)
  }

  async function handleSave() {
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
    setSaved(true)
    setBuild(null)
    router.refresh()
  }

  if (assetsError) {
    return (
      <div className="max-w-5xl mx-auto p-6">
        <p className="text-sm text-danger-600">{assetsError}</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <Link href="/profile?tab=account" className="text-[13px] text-muted hover:text-ink">
            ← Back to profile
          </Link>
          <h1 className="text-2xl font-bold text-ink mt-1">Your avatar</h1>
        </div>
        <div className="flex items-center gap-3">
          {saved && !dirty && <span className="text-[13px] text-green-600">Saved</span>}
          <Button onClick={handleSave} disabled={!assets || !dirty || saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {saveError && (
        <p className="text-[13px] text-danger-600 mb-4">{saveError}</p>
      )}

      {!assets ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
          <div className="lg:sticky lg:top-4 space-y-4">
            <div className="bg-surface border border-silver/50 rounded-card p-5">
              <div
                className="w-full aspect-square rounded-control overflow-hidden [&>svg]:w-full [&>svg]:h-auto [&>svg]:block"
                dangerouslySetInnerHTML={{ __html: preview }}
              />
              <p className="text-center text-sm font-semibold text-ink mt-3">
                {fullName || username || 'You'}
              </p>
              {username && <p className="text-center text-xs text-muted">@{username}</p>}
            </div>
          </div>

          <AvatarBuilder assets={assets} cfg={cfg} set={set} />
        </div>
      )}
    </div>
  )
}
