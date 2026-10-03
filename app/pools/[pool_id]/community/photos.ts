'use client'

import { useEffect, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

import {
  BANTER_MEDIA_BUCKET,
  PHOTO_JPEG_QUALITY,
  photoFileId,
  photoPath,
  resizeTarget,
  type PhotoMetadata,
} from '@/lib/banter/photoMessage'

/**
 * Browser half of Banter photos (the phone's twin is mobile/lib/photos.ts).
 *
 * The browser does what expo-image-manipulator does on the phone: decode the chosen file,
 * redraw it on a canvas no larger than 1600px on its longest edge, and re-encode it as JPEG.
 * Drawing pixels onto a canvas carries NO metadata across, so EXIF — and the GPS location in
 * it — is gone before anything leaves the device. `imageOrientation: 'from-image'` applies the
 * EXIF rotation while decoding, so a portrait phone photo isn't saved sideways once that tag
 * is dropped.
 */

export type PreparedPhoto = { blob: Blob; width: number; height: number }

export async function preparePhotoFile(file: File): Promise<PreparedPhoto> {
  if (!file.type.startsWith('image/')) throw new Error('That file is not an image.')
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    // e.g. a HEIC photo in a browser that can't decode it.
    throw new Error('This browser can’t open that photo. Try a JPEG or PNG.')
  }
  const target = resizeTarget(bitmap.width, bitmap.height)
  const scale = !target
    ? 1
    : 'width' in target
      ? target.width / bitmap.width
      : target.height / bitmap.height
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not prepare the photo.')
  // A transparent PNG would turn black as JPEG — paint white underneath.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', PHOTO_JPEG_QUALITY))
  if (!blob) throw new Error('Could not prepare the photo.')
  return { blob, width, height }
}

/** Upload into `{pool}/{me}/{uuid}.jpg` — the only shape 159 accepts. */
export async function uploadPhoto(
  supabase: SupabaseClient,
  poolId: string,
  senderId: string,
  photo: PreparedPhoto,
): Promise<PhotoMetadata> {
  const path = photoPath(poolId, senderId, photoFileId())
  const { error } = await supabase.storage
    .from(BANTER_MEDIA_BUCKET)
    .upload(path, photo.blob, { contentType: 'image/jpeg', upsert: false })
  if (error) throw error
  return { path, width: photo.width, height: photo.height }
}

/** Remove an upload whose message never got sent (only the uploader may — 159). */
export async function removePhoto(supabase: SupabaseClient, path: string): Promise<void> {
  const { error } = await supabase.storage.from(BANTER_MEDIA_BUCKET).remove([path])
  if (error) console.warn('[photos] cleanup failed:', error)
}

const SIGNED_URL_SECONDS = 60 * 60
const REFRESH_EARLY_MS = 10 * 60 * 1000

/**
 * Signed URLs for every photo on screen, signed in ONE request and re-signed before the hour
 * is up. The bucket is private; RLS lets pool members (and super admins) sign.
 */
export function usePhotoUrls(supabase: SupabaseClient, paths: string[]): Map<string, string> {
  const [urls, setUrls] = useState<Map<string, string>>(() => new Map())
  const signedAtRef = useRef<Map<string, number>>(new Map())
  const [tick, setTick] = useState(0)
  const key = Array.from(new Set(paths)).sort().join('|')

  useEffect(() => {
    const t = window.setInterval(() => setTick(n => n + 1), REFRESH_EARLY_MS)
    return () => window.clearInterval(t)
  }, [])

  useEffect(() => {
    if (!key) return
    let active = true
    const now = Date.now()
    const stale = key.split('|').filter(p => {
      const at = signedAtRef.current.get(p)
      return at == null || now - at > SIGNED_URL_SECONDS * 1000 - REFRESH_EARLY_MS
    })
    if (stale.length === 0) return
    supabase.storage
      .from(BANTER_MEDIA_BUCKET)
      .createSignedUrls(stale, SIGNED_URL_SECONDS)
      .then(({ data, error }) => {
        if (error) { console.warn('[usePhotoUrls] signing failed:', error); return }
        if (!active) return
        const at = Date.now()
        setUrls(prev => {
          const next = new Map(prev)
          for (const row of data ?? []) {
            if (row.path && row.signedUrl && !row.error) {
              next.set(row.path, row.signedUrl)
              signedAtRef.current.set(row.path, at)
            }
          }
          return next
        })
      })
    return () => { active = false }
  }, [supabase, key, tick])

  return urls
}
