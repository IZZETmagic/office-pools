/**
 * Initials for an avatar.
 *
 * Deliberately hand-mirrored from `getInitials` in
 * mobile/components/pool-detail/BanterSheet.tsx — `mobile/**` is in
 * .vercelignore, so web code cannot import from it and still build on Vercel.
 * Same pattern, and the same reason, as lib/design/avatarGradient.ts beside it.
 *
 * ⚠ A SINGLE-WORD NAME TAKES TWO LETTERS, not one. The first web copy took only
 * the first letter, so a one-word display name like "OdieBug" showed "O" in a
 * 36px circle where the app shows "OD".
 *
 * Lived in app/pools/[pool_id]/community/helpers.tsx until the pool card needed
 * it too; a route folder is the wrong home for something two features paint.
 */
export function getInitials(
  fullName: string | null | undefined,
  username: string | null | undefined,
): string {
  const source = fullName?.trim() || username?.trim()
  if (!source) return '??'
  const parts = source.split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
