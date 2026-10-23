// =============================================================
// faceCache — one face per person, however many rows draw it
// =============================================================
// Two failure modes, opposite and both real:
//   - the same person made again per row → the cost this exists to remove
//   - a changed avatar (a refetch, a new bundle, a duel colour) served the OLD
//     face → a member stuck showing a picture they replaced (the dangerous one)
// =============================================================

import { describe, it, expect, vi } from 'vitest';

import { cachedFace } from '../avatar/faceCache';

describe('cachedFace', () => {
  it('makes a face once, however many rows ask for it', () => {
    const assets = {};
    const build = { base: 'b1' };
    const make = vi.fn(() => 'face');
    for (let i = 0; i < 20; i++) expect(cachedFace(assets, build, '#0ea5e9', make)).toBe('face');
    expect(make).toHaveBeenCalledTimes(1);
  });

  it('a refetched build (a new object) is made again — a changed avatar shows', () => {
    const assets = {};
    let n = 0;
    const make = vi.fn(() => `face${++n}`);
    expect(cachedFace(assets, { base: 'b1' }, '#0ea5e9', make)).toBe('face1');
    expect(cachedFace(assets, { base: 'b2' }, '#0ea5e9', make)).toBe('face2');
    expect(make).toHaveBeenCalledTimes(2);
  });

  it('a new asset bundle makes every face again', () => {
    const build = { base: 'b1' };
    const make = vi.fn(() => 'face');
    cachedFace({}, build, '#0ea5e9', make);
    cachedFace({}, build, '#0ea5e9', make);
    expect(make).toHaveBeenCalledTimes(2);
  });

  it('a different ground is a different picture (a duel moves a colour)', () => {
    const assets = {};
    const build = { base: 'b1' };
    const make = vi.fn(() => 'face');
    cachedFace(assets, build, '#0ea5e9', make);
    cachedFace(assets, build, '#f97316', make);
    cachedFace(assets, build, '#0ea5e9', make);
    expect(make).toHaveBeenCalledTimes(2);
  });

  it('keeps a null answer — a build this bundle cannot draw is not retried per row', () => {
    const assets = {};
    const build = { base: 'from-a-newer-bundle' };
    const make = vi.fn(() => null);
    expect(cachedFace(assets, build, '#0ea5e9', make)).toBeNull();
    expect(cachedFace(assets, build, '#0ea5e9', make)).toBeNull();
    expect(make).toHaveBeenCalledTimes(1);
  });

  it('does not cache a build that cannot key a WeakMap', () => {
    const make = vi.fn(() => null);
    cachedFace({}, null, '#0ea5e9', make);
    cachedFace({}, 'nonsense', '#0ea5e9', make);
    expect(make).toHaveBeenCalledTimes(2);
  });
});
