// =============================================================
// klipyParity — the web and the phone read KLIPY the same way
// =============================================================
// Metro cannot import the web's lib/, so `mobile/lib/klipy.ts` is a copy of
// `lib/banter/klipy.ts`. A GIF sent from one surface is rendered by the other, so if the two
// ever disagree about a URL, a size or what counts as a KLIPY host, one side shows a GIF the
// other refuses. This feeds both the same inputs and requires the same answers.
// =============================================================

import { describe, it, expect } from 'vitest'

import * as web from '../banter/klipy'
import * as phone from '../../mobile/lib/klipy'

const file = (base: string, w: number, h: number) => ({
  gif: { url: `https://static1.klipy.com/ii/${base}.gif`, width: w, height: h },
  jpg: { url: `https://static.klipy.com/ii/${base}.jpg`, width: w, height: h },
  mp4: { url: `https://static2.klipy.com/ii/${base}.mp4?t=9`, width: w + 10, height: h + 10 },
})
const RESPONSE = {
  result: true,
  data: {
    has_next: true,
    data: [
      { slug: 'a', title: 'A', type: 'gif', file: { sm: file('a', 220, 206), md: file('am', 360, 336) } },
      { slug: 'b', title: 'B', type: 'gif', file: { md: file('b', 360, 200) } },
      { slug: 'ad', type: 'ad', file: { sm: file('ad', 1, 1) } },
      { slug: 'c', type: 'gif', file: { sm: { gif: { url: 'https://evil.com/c.gif', width: 1, height: 1 } } } },
    ],
  },
}

describe('KLIPY parity between web and RN', () => {
  it('parses a page identically', () => {
    expect(phone.parseKlipyPage(RESPONSE)).toEqual(web.parseKlipyPage(RESPONSE))
  })

  it('stores and reads metadata identically', () => {
    const [first] = web.parseKlipyPage(RESPONSE).items
    const meta = web.toGifMetadata(first)
    expect(phone.toGifMetadata(first)).toEqual(meta)
    expect(phone.readGifMetadata(meta)).toEqual(web.readGifMetadata(meta))
  })

  it('agrees on hosts, request URLs, the customer id and the copy', () => {
    for (const url of ['https://static.klipy.com/x', 'https://static.klipy.com.evil.com/x', 'http://static1.klipy.com/x']) {
      expect(phone.isKlipyMediaUrl(url)).toBe(web.isKlipyMediaUrl(url))
    }
    const q = { apiKey: 'K', customerId: 'sp-x', q: 'goal', perPage: 3, formats: ['gif', 'jpg'] as ('gif' | 'jpg')[] }
    expect(phone.klipyGifsUrl(q)).toBe(web.klipyGifsUrl(q))
    expect(phone.klipyShareUrl('K', 's')).toBe(web.klipyShareUrl('K', 's'))
    expect(phone.klipyCustomerId('user-1')).toBe(web.klipyCustomerId('user-1'))
    expect(phone.fitGif(480, 448, 240, 240)).toEqual(web.fitGif(480, 448, 240, 240))
    expect(phone.GIF_MESSAGE_CONTENT).toBe(web.GIF_MESSAGE_CONTENT)
    expect(phone.KLIPY_SEARCH_PLACEHOLDER).toBe(web.KLIPY_SEARCH_PLACEHOLDER)
  })
})
