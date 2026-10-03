// =============================================================
// verify-banter-photo-exif — did the re-encode really drop EXIF/GPS?
// =============================================================
// Picture sharing step 3 relies on the app re-encoding every photo
// (expo-image-manipulator → JPEG) to strip the camera's EXIF block,
// which can carry the GPS location the photo was taken at. Expo's docs
// do not promise this, so it is checked on a REAL upload, not assumed.
//
// Downloads the newest file(s) in banter-media with the service role and
// walks the JPEG segments: any APP1 "Exif" segment fails, and a GPS IFD
// (tag 0x8825) inside it is called out separately. Read-only.
//
//   npx tsx scripts/verify-banter-photo-exif.ts        # newest 3 uploads
// =============================================================

import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'

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

type Segment = { marker: number; data: Buffer }

function jpegSegments(buf: Buffer): Segment[] {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) throw new Error('not a JPEG')
  const out: Segment[] = []
  let i = 2
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) break
    const marker = buf[i + 1]
    if (marker === 0xda || marker === 0xd9) break // start of scan / end — no more metadata
    const len = buf.readUInt16BE(i + 2)
    out.push({ marker, data: buf.subarray(i + 4, i + 2 + len) })
    i += 2 + len
  }
  return out
}

function hasGpsIfd(exif: Buffer): boolean {
  // exif = "Exif\0\0" + TIFF header; look for tag 0x8825 in IFD0 either byte order.
  const tiff = exif.subarray(6)
  const le = tiff[0] === 0x49
  const read16 = (o: number) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o))
  const read32 = (o: number) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o))
  const ifd0 = read32(4)
  const count = read16(ifd0)
  for (let n = 0; n < count; n++) if (read16(ifd0 + 2 + n * 12) === 0x8825) return true
  return false
}

async function main() {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
  // storage.objects is not exposed over PostgREST — walk the bucket through the Storage API.
  // Paths are {pool}/{sender}/{file}, so three levels.
  const files: { name: string; created_at: string }[] = []
  const list = async (prefix: string, depth: number) => {
    const { data, error } = await admin.storage.from('banter-media').list(prefix, { limit: 1000 })
    if (error) throw error
    for (const entry of data ?? []) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.id && depth === 2) files.push({ name: path, created_at: entry.created_at ?? '' })
      else if (!entry.id && depth < 2) await list(path, depth + 1)
    }
  }
  await list('', 0)
  const rows = files.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 3)
  if (rows.length === 0) {
    console.log('No photos uploaded yet.')
    return
  }
  let bad = 0
  for (const row of rows) {
    const { data, error: dlErr } = await admin.storage.from('banter-media').download(row.name)
    if (dlErr || !data) throw dlErr
    const buf = Buffer.from(await data.arrayBuffer())
    const exif = jpegSegments(buf).find(s => s.marker === 0xe1 && s.data.subarray(0, 4).toString('latin1') === 'Exif')
    const verdict = !exif ? 'CLEAN — no EXIF block' : hasGpsIfd(exif.data) ? 'EXIF WITH GPS ⚠⚠' : 'EXIF present (no GPS) ⚠'
    if (exif) bad++
    console.log(`${row.created_at}  ${(buf.length / 1024).toFixed(0)} KB  ${verdict}  ${row.name}`)
  }
  process.exit(bad ? 1 : 0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
