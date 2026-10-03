// =============================================================
// Photo messages — the native half (picker, resize, upload, sign)
// =============================================================
// ⚠⚠ GUARDED NATIVE MODULES. expo-image-picker and expo-image-manipulator
// arrived with build 1.3.0. Phones on 1.2.0 still receive OTAs built from
// this same tree, and in a binary without those modules simply EVALUATING
// the packages throws ("Cannot find native module 'ExponentImagePicker'")
// — the whole app would crash on launch. So:
//
//   - PHOTOS_AVAILABLE asks the binary first (requireOptionalNativeModule
//     returns null instead of throwing), and the UI offers "Send a photo"
//     only when it is true.
//   - The packages are `require`d INSIDE the functions, never imported at
//     the top, so Metro bundles them but never evaluates them on 1.2.0.
//
// Never turn these into top-level imports.
// =============================================================

import { requireOptionalNativeModule } from 'expo';

import {
  BANTER_MEDIA_BUCKET,
  PHOTO_JPEG_QUALITY,
  base64ToBytes,
  photoFileId,
  photoPath,
  resizeTarget,
  type PhotoMetadata,
} from './photoMessage';
import { supabase } from './supabase';

export const PHOTOS_AVAILABLE =
  requireOptionalNativeModule('ExponentImagePicker') != null &&
  requireOptionalNativeModule('ExpoImageManipulator') != null;

type Picked = { uri: string; width: number; height: number };

/**
 * Open the library or the camera. Null if the member cancels or refuses the
 * camera. The library needs no permission prompt: iOS 14+ and Android 13+
 * use the system photo picker, which only hands back what was chosen.
 */
export async function pickPhoto(source: 'library' | 'camera'): Promise<Picked | 'denied' | null> {
  if (!PHOTOS_AVAILABLE) return null;
  const ImagePicker = require('expo-image-picker') as typeof import('expo-image-picker');
  const options = {
    mediaTypes: ['images'] as import('expo-image-picker').MediaType[],
    allowsEditing: false,
    quality: 1, // we compress once, in preparePhoto
    exif: false,
  };
  let result: import('expo-image-picker').ImagePickerResult;
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return 'denied';
    result = await ImagePicker.launchCameraAsync(options);
  } else {
    result = await ImagePicker.launchImageLibraryAsync(options);
  }
  if (result.canceled || !result.assets?.[0]) return null;
  const a = result.assets[0];
  return { uri: a.uri, width: a.width, height: a.height };
}

type Prepared = { bytes: Uint8Array; width: number; height: number };

/**
 * Resize (longest edge ≤ 1600) and re-encode as JPEG. The re-encode draws the
 * pixels into a fresh image, which leaves the camera's EXIF block — including
 * GPS — behind. ⚠ Verified on a real upload before release, not assumed.
 */
export async function preparePhoto(picked: Picked): Promise<Prepared> {
  const { ImageManipulator, SaveFormat } =
    require('expo-image-manipulator') as typeof import('expo-image-manipulator');
  const context = ImageManipulator.manipulate(picked.uri);
  const target = resizeTarget(picked.width, picked.height);
  if (target) context.resize(target);
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: PHOTO_JPEG_QUALITY, base64: true });
  if (!saved.base64) throw new Error('Could not encode the photo');
  return { bytes: base64ToBytes(saved.base64), width: saved.width, height: saved.height };
}

/** Upload into `{pool}/{me}/{uuid}.jpg` (159's only accepted shape). Returns the metadata to send. */
export async function uploadBanterPhoto(
  poolId: string,
  senderId: string,
  prepared: Prepared,
): Promise<PhotoMetadata> {
  const path = photoPath(poolId, senderId, photoFileId());
  const { error } = await supabase.storage
    .from(BANTER_MEDIA_BUCKET)
    .upload(path, prepared.bytes, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return { path, width: prepared.width, height: prepared.height };
}

/** Clean up an upload whose message never got sent (only the uploader may — 159). */
export async function removeBanterPhoto(path: string): Promise<void> {
  const { error } = await supabase.storage.from(BANTER_MEDIA_BUCKET).remove([path]);
  if (error) console.warn('[photos] cleanup failed', error);
}

/**
 * Signed URLs for many photos in ONE request. The bucket is private, so this
 * is the only way to show one; RLS lets members of the pool (and super admins)
 * sign. An hour is long enough for a chat session; the cache refreshes early.
 */
export const SIGNED_URL_SECONDS = 60 * 60;

export async function signBanterPhotos(paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (paths.length === 0) return out;
  const { data, error } = await supabase.storage
    .from(BANTER_MEDIA_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_SECONDS);
  if (error) throw error;
  for (const row of data ?? []) {
    if (row.path && row.signedUrl && !row.error) out.set(row.path, row.signedUrl);
  }
  return out;
}
