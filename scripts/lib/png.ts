// =============================================================
// Just enough PNG to read and write an 8-bit RGBA image
// =============================================================
// Used by scripts/build-competition-silhouettes.ts, which turns the fixtures
// provider's league logos into one-colour marks for the pool card's rail.
//
// Hand-rolled rather than pulled from a package for the same reason
// lib/design/oklch.ts carries its own OKLab matrices: it is a hundred lines with
// no versioning risk, it runs at build time on seven files, and a native image
// dependency (sharp, canvas) is a compile step and a lockfile entry for work
// that `zlib` already does.
//
// ⚠ 8-BIT RGBA ONLY (bit depth 8, colour type 6). Every asset the provider
// serves is that, and `decodePng` throws rather than guessing if one is not —
// a wrong guess here would silently produce a mangled mark rather than fail.
// =============================================================

import { readFileSync, writeFileSync } from 'fs'
import zlib from 'zlib'

export type Png = { w: number; h: number; data: Buffer }

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

export function decodePng(path: string): Png {
  const buf = readFileSync(path)
  let p = 8
  let w = 0
  let h = 0
  let bitDepth = 0
  let colorType = 0
  const idat: Buffer[] = []

  while (p < buf.length) {
    const len = buf.readUInt32BE(p)
    const type = buf.toString('ascii', p + 4, p + 8)
    const data = buf.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') {
      w = data.readUInt32BE(0)
      h = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    p += 12 + len
  }

  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(`${path}: expected 8-bit RGBA (depth 8, type 6), got depth ${bitDepth} type ${colorType}`)
  }

  const raw = zlib.inflateSync(Buffer.concat(idat))
  const bpp = 4
  const stride = w * bpp
  const out = Buffer.alloc(h * stride)
  let pos = 0

  // Undo the per-scanline filters (PNG spec §9). Each row names its own filter
  // and refers to the row above, so this has to run in order.
  for (let y = 0; y < h; y++) {
    const filter = raw[pos++]
    const line = raw.subarray(pos, pos + stride)
    pos += stride
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0
      const b = y > 0 ? out[(y - 1) * stride + x] : 0
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0
      let v = line[x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const pa = Math.abs(b - c)
        const pb = Math.abs(a - c)
        const pc = Math.abs(a + b - 2 * c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      out[y * stride + x] = v & 255
    }
  }

  return { w, h, data: out }
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 255] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const typed = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(typed))
  return Buffer.concat([len, typed, crc])
}

/** Writes filter-type-0 scanlines. Marks are flat colour, so filtering buys nothing. */
export function encodePng(path: string, w: number, h: number, rgba: Buffer): void {
  const stride = w * 4
  const raw = Buffer.alloc(h * (stride + 1))
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from(SIGNATURE),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  )
}
