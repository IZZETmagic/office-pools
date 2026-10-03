/**
 * Photo messages — the pure half. ⚠ A COPY of the phone's `mobile/lib/photoMessage.ts`.
 *
 * Metro cannot reach the web's lib/, and the web cannot reach the phone's, so each carries one.
 * `lib/__tests__/photoMessageParity.guard.test.ts` feeds both the same inputs and fails if they
 * disagree — a photo sent from one is drawn by the other. Change both files together.
 *
 * A photo is a `pool_messages` row (159): message_type 'photo', content '📷 sent a photo',
 * metadata { path, width, height }. The file is in the private `banter-media` bucket at
 * `{pool_id}/{sender user_id}/{uuid}.jpg`; 159 refuses any other shape, any other folder, and a
 * path whose file has not been uploaded — so the upload always comes first.
 */

export const BANTER_MEDIA_BUCKET = 'banter-media'
export const PHOTO_MESSAGE_CONTENT = '📷 sent a photo'

/** Longest edge after resizing. Big enough to read a screenshot of a table, small enough to send on 4G. */
export const PHOTO_MAX_EDGE = 1600
/** JPEG quality for the re-encode — the re-encode is ALSO what drops EXIF/GPS. */
export const PHOTO_JPEG_QUALITY = 0.8

export type PhotoMetadata = { path: string; width: number; height: number }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * A v4-shaped id for the file name. Not security-sensitive — it only has to
 * be unique within one sender's folder — and Hermes has no crypto.randomUUID.
 */
export function photoFileId(random: () => number = Math.random): string {
  const hex = (n: number) =>
    Array.from({ length: n }, () => Math.floor(random() * 16).toString(16)).join('')
  const variant = ((Math.floor(random() * 4) + 8) as number).toString(16) // 8, 9, a or b
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${variant}${hex(3)}-${hex(12)}`
}

export function photoPath(poolId: string, senderId: string, fileId: string): string {
  return `${poolId}/${senderId}/${fileId}.jpg`
}

/** Does `path` have the one shape 159 accepts for this pool and sender? */
export function isPhotoPathFor(path: string, poolId: string, senderId: string): boolean {
  const parts = path.split('/')
  if (parts.length !== 3 || parts[0] !== poolId || parts[1] !== senderId) return false
  const m = /^(.+)\.(jpg|webp)$/.exec(parts[2])
  return !!m && UUID.test(m[1])
}

/** Read a stored row's metadata back; null for anything malformed (render the text instead). */
export function readPhotoMetadata(metadata: unknown): PhotoMetadata | null {
  const m = metadata as Partial<PhotoMetadata> | null
  if (!m || typeof m.path !== 'string' || !m.path) return null
  const width = Number(m.width)
  const height = Number(m.height)
  if (!(width > 0 && height > 0)) return null
  return { path: m.path, width, height }
}

/** The resize target: shrink so the longest edge is at most `maxEdge`, never enlarge. */
export function resizeTarget(
  width: number,
  height: number,
  maxEdge: number = PHOTO_MAX_EDGE,
): { width: number } | { height: number } | null {
  if (width <= maxEdge && height <= maxEdge) return null
  return width >= height ? { width: maxEdge } : { height: maxEdge }
}

/** Fit a photo inside a chat bubble, never past its own pixels. */
export function fitPhoto(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxWidth / width, maxHeight / height)
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/** base64 → bytes for the Storage upload, without a dependency (Hermes has atob). */
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}
