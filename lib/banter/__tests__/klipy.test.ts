import { describe, it, expect } from 'vitest'

import {
  fitGif,
  isKlipyMediaUrl,
  klipyCustomerId,
  klipyGifsUrl,
  klipyShareUrl,
  parseKlipyItem,
  parseKlipyPage,
  readGifMetadata,
  toGifMetadata,
} from '../klipy'

// Trimmed from a real `gifs/search?format_filter=mp4,gif,jpg` response (2026-09-28).
const file = (base: string, w: number, h: number) => ({
  gif: { url: `https://static.klipy.com/ii/${base}.gif`, width: w, height: h, size: 1 },
  jpg: { url: `https://static.klipy.com/ii/${base}.jpg`, width: w, height: h, size: 1 },
  mp4: { url: `https://static.klipy.com/ii/${base}.mp4?x=1`, width: w + 100, height: h + 94, size: 1 },
})
const ITEM = {
  id: 1,
  slug: 'goal-sports--k5d5XrVk6',
  title: 'Goal',
  type: 'gif',
  file: { hd: file('hd', 480, 448), md: file('md', 360, 336), sm: file('sm', 220, 206), xs: file('xs', 90, 84) },
}

describe('klipyGifsUrl', () => {
  const base = { apiKey: 'KEY', customerId: 'sp-1', formats: ['mp4', 'jpg'] as ('mp4' | 'jpg')[] }

  it('asks for trending when there is no search term', () => {
    const url = new URL(klipyGifsUrl(base))
    expect(url.pathname).toBe('/api/v1/KEY/gifs/trending')
    expect(url.searchParams.has('q')).toBe(false)
  })

  it('searches for a trimmed term', () => {
    const url = new URL(klipyGifsUrl({ ...base, q: '  goal  ' }))
    expect(url.pathname).toBe('/api/v1/KEY/gifs/search')
    expect(url.searchParams.get('q')).toBe('goal')
  })

  it('always sends the strictest content filter and only the formats asked for', () => {
    const url = new URL(klipyGifsUrl(base))
    expect(url.searchParams.get('content_filter')).toBe('high')
    expect(url.searchParams.get('format_filter')).toBe('mp4,jpg')
    expect(url.searchParams.get('customer_id')).toBe('sp-1')
  })

  it('keeps per_page inside what search accepts (8..50)', () => {
    expect(new URL(klipyGifsUrl({ ...base, perPage: 2 })).searchParams.get('per_page')).toBe('8')
    expect(new URL(klipyGifsUrl({ ...base, perPage: 500 })).searchParams.get('per_page')).toBe('50')
  })

  it('builds the share trigger URL', () => {
    expect(klipyShareUrl('KEY', 'a b')).toBe('https://api.klipy.com/api/v1/KEY/gifs/share/a%20b')
  })
})

describe('klipyCustomerId', () => {
  it('is stable, opaque and never the raw id', () => {
    const id = '5eed0001-0000-4000-8000-000000000001'
    expect(klipyCustomerId(id)).toBe(klipyCustomerId(id))
    expect(klipyCustomerId(id)).toMatch(/^sp-[0-9a-f]{16}$/)
    expect(klipyCustomerId(id)).not.toContain(id)
    expect(klipyCustomerId(id)).not.toBe(klipyCustomerId(id.replace(/1$/, '2')))
  })
})

describe('isKlipyMediaUrl', () => {
  it.each([
    ['https://static.klipy.com/a.gif', true],
    ['https://static1.klipy.com/a.gif', true],
    ['https://static2.klipy.com/a.gif', true],
    ['http://static.klipy.com/a.gif', false],
    ['https://static.klipy.com.evil.com/a.gif', false],
    ['https://static.klipy.com@evil.com/a.gif', false],
    ['https://static3.klipy.com/a.gif', false],
    ['https://evil.com/a.gif', false],
    [null, false],
  ])('%s → %s', (url, ok) => {
    expect(isKlipyMediaUrl(url)).toBe(ok)
  })
})

describe('parseKlipyItem', () => {
  it('takes the sm tier and keeps URLs exactly as returned', () => {
    expect(parseKlipyItem(ITEM)).toEqual({
      slug: 'goal-sports--k5d5XrVk6',
      title: 'Goal',
      width: 220,
      height: 206,
      mp4Url: 'https://static.klipy.com/ii/sm.mp4?x=1',
      gifUrl: 'https://static.klipy.com/ii/sm.gif',
      stillUrl: 'https://static.klipy.com/ii/sm.jpg',
    })
  })

  it('works with only the formats the web asks for (no gif)', () => {
    const gif = parseKlipyItem({ ...ITEM, file: { sm: { ...ITEM.file.sm, gif: undefined } } })
    expect(gif?.gifUrl).toBeNull()
    expect(gif?.mp4Url).toBe('https://static.klipy.com/ii/sm.mp4?x=1')
    expect(gif?.width).toBe(320) // falls back to the mp4's own size
  })

  it('refuses an ad, a missing slug, and media off KLIPY hosts', () => {
    expect(parseKlipyItem({ ...ITEM, type: 'ad' })).toBeNull()
    expect(parseKlipyItem({ ...ITEM, slug: '' })).toBeNull()
    const offHost = { gif: { url: 'https://evil.com/a.gif', width: 1, height: 1 } }
    expect(parseKlipyItem({ ...ITEM, file: { sm: offHost, md: offHost } })).toBeNull()
  })
})

describe('parseKlipyPage', () => {
  it('keeps KLIPY order and reports has_next', () => {
    const second = { ...ITEM, slug: 'second' }
    const page = parseKlipyPage({ result: true, data: { data: [ITEM, second], has_next: true } })
    expect(page.items.map(i => i.slug)).toEqual(['goal-sports--k5d5XrVk6', 'second'])
    expect(page.hasNext).toBe(true)
  })

  it('throws on an error body (e.g. an invalid key)', () => {
    expect(() => parseKlipyPage({ result: false, errors: { message: ['The provided API key is invalid.'] } })).toThrow()
  })
})

describe('toGifMetadata / readGifMetadata', () => {
  it('round-trips with the exact keys migration 150 accepts', () => {
    const meta = toGifMetadata(parseKlipyItem(ITEM)!)
    expect(Object.keys(meta).sort()).toEqual(['gif_url', 'height', 'mp4_url', 'provider', 'slug', 'still_url', 'title', 'width'])
    expect(readGifMetadata(meta)).toEqual(meta)
  })

  it('drops a URL that is not KLIPY’s, and refuses a row with no playable media', () => {
    const meta = { provider: 'klipy', slug: 's', width: 1, height: 1, gif_url: 'https://evil.com/a.gif', mp4_url: 'https://static.klipy.com/a.mp4' }
    expect(readGifMetadata(meta)).toEqual({ provider: 'klipy', slug: 's', width: 1, height: 1, mp4_url: 'https://static.klipy.com/a.mp4' })
    expect(readGifMetadata({ provider: 'klipy', slug: 's', width: 1, height: 1 })).toBeNull()
    expect(readGifMetadata({})).toBeNull()
  })
})

describe('fitGif', () => {
  it('shrinks to the box and never blows past 1.25×', () => {
    expect(fitGif(480, 448, 240, 240)).toEqual({ width: 240, height: 224 })
    expect(fitGif(100, 100, 240, 240)).toEqual({ width: 125, height: 125 })
    expect(fitGif(200, 600, 240, 240)).toEqual({ width: 80, height: 240 })
  })
})
