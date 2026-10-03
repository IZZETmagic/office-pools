// =============================================================
// photoMessageParity — the web and the phone read a photo the same way
// =============================================================
// A photo sent from the app is drawn by the web and the other way round, and
// both must build the one path shape migration 159 accepts. Each side has its
// own copy of the pure module (Metro can't reach lib/, Next can't reach
// mobile/), so this feeds both the same inputs and requires the same answers.
// =============================================================

import { describe, it, expect } from 'vitest'

import * as web from '../banter/photoMessage'
import * as phone from '../../mobile/lib/photoMessage'

describe('photo message parity between web and RN', () => {
  it('shares the constants', () => {
    expect(phone.BANTER_MEDIA_BUCKET).toBe(web.BANTER_MEDIA_BUCKET)
    expect(phone.PHOTO_MESSAGE_CONTENT).toBe(web.PHOTO_MESSAGE_CONTENT)
    expect(phone.PHOTO_MAX_EDGE).toBe(web.PHOTO_MAX_EDGE)
    expect(phone.PHOTO_JPEG_QUALITY).toBe(web.PHOTO_JPEG_QUALITY)
  })

  it('builds and validates paths identically', () => {
    const seq = () => { let i = 0; return () => ((i++ * 0.37) % 1) }
    expect(phone.photoFileId(seq())).toBe(web.photoFileId(seq()))
    for (const path of ['p/u/11111111-2222-4333-8444-555555555555.jpg', 'p/u/x.jpg', 'q/u/11111111-2222-4333-8444-555555555555.jpg']) {
      expect(phone.isPhotoPathFor(path, 'p', 'u')).toBe(web.isPhotoPathFor(path, 'p', 'u'))
    }
    expect(phone.photoPath('p', 'u', 'f')).toBe(web.photoPath('p', 'u', 'f'))
  })

  it('reads metadata and sizes identically', () => {
    for (const m of [{ path: 'a', width: 10, height: 5 }, { path: '', width: 1, height: 1 }, {}, null]) {
      expect(phone.readPhotoMetadata(m)).toEqual(web.readPhotoMetadata(m))
    }
    for (const [w, h] of [[4032, 3024], [3024, 4032], [800, 600]]) {
      expect(phone.resizeTarget(w, h)).toEqual(web.resizeTarget(w, h))
      expect(phone.fitPhoto(w, h, 240, 320)).toEqual(web.fitPhoto(w, h, 240, 320))
    }
  })
})
