// =============================================================
// create-banter-media-bucket — the private bucket for Banter photos
// =============================================================
// Step 2 of picture sharing (migration 159 holds the access rules).
// Supabase treats storage tables as read-only from SQL — a bucket is
// created through the Storage API — so this lives here, not in the
// migration.
//
// Idempotent: creates the bucket if it is missing, otherwise brings an
// existing one back to this config. Dry run by default.
//
//   npx tsx scripts/create-banter-media-bucket.ts            # show what it would do
//   npx tsx scripts/create-banter-media-bucket.ts --apply
//
// CONFIG
//   public: false      — photos are only reachable through signed URLs
//   5 MB cap           — the clients resize to ~1600px JPEG first, which
//                        lands around 200–600 KB; 5 MB is headroom, not a target
//   jpeg + webp only   — what the clients re-encode to (that re-encode is
//                        also what strips EXIF/GPS)
// =============================================================

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

// Same .env.local reader the other scripts use — the repo has no dotenv dependency.
;(() => {
  const envContent = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of envContent.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i === -1) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[k]) process.env[k] = v
  }
})()

const BUCKET = 'banter-media'
const CONFIG = {
  public: false,
  fileSizeLimit: 5 * 1024 * 1024,
  allowedMimeTypes: ['image/jpeg', 'image/webp'],
}
const APPLY = process.argv.includes('--apply')

async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: existing, error: getErr } = await admin.storage.getBucket(BUCKET)
  if (getErr && !/not found/i.test(getErr.message)) throw getErr

  if (!existing) {
    console.log(`${BUCKET}: missing → ${APPLY ? 'creating' : 'would create'}`, CONFIG)
    if (APPLY) {
      const { error } = await admin.storage.createBucket(BUCKET, CONFIG)
      if (error) throw error
    }
  } else {
    console.log(`${BUCKET}: exists`, {
      public: existing.public,
      fileSizeLimit: existing.file_size_limit,
      allowedMimeTypes: existing.allowed_mime_types,
    })
    console.log(`${APPLY ? 'updating' : 'would update'} to`, CONFIG)
    if (APPLY) {
      const { error } = await admin.storage.updateBucket(BUCKET, CONFIG)
      if (error) throw error
    }
  }

  if (APPLY) {
    const { data, error } = await admin.storage.getBucket(BUCKET)
    if (error) throw error
    console.log('now:', { public: data.public, fileSizeLimit: data.file_size_limit, allowedMimeTypes: data.allowed_mime_types })
  } else {
    console.log('dry run — pass --apply to write')
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
