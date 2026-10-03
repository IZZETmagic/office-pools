import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';

import { describe, it, expect } from 'vitest';

import {
  base64ToBytes,
  fitPhoto,
  isPhotoPathFor,
  photoFileId,
  photoPath,
  readPhotoMetadata,
  resizeTarget,
} from '../photoMessage';

const POOL = '87257cb0-1aef-4fbc-a320-b3b74f1b584d';
const ME = '11111111-2222-4333-8444-555555555555';

describe('photoFileId / photoPath', () => {
  it('makes ids in the exact shape migration 159 accepts', () => {
    for (let i = 0; i < 200; i++) {
      const path = photoPath(POOL, ME, photoFileId());
      expect(isPhotoPathFor(path, POOL, ME)).toBe(true);
    }
  });

  it('is deterministic for a fixed random source (and still well-formed at the extremes)', () => {
    expect(photoFileId(() => 0)).toBe('00000000-0000-4000-8000-000000000000');
    expect(isPhotoPathFor(photoPath(POOL, ME, photoFileId(() => 0.9999)), POOL, ME)).toBe(true);
  });
});

describe('isPhotoPathFor', () => {
  it('refuses another pool, another sender, extra folders and other extensions', () => {
    const id = photoFileId();
    expect(isPhotoPathFor(`${POOL}/${ME}/${id}.jpg`, POOL, ME)).toBe(true);
    expect(isPhotoPathFor(`${POOL}/${ME}/${id}.webp`, POOL, ME)).toBe(true);
    expect(isPhotoPathFor(`${POOL}/someone-else/${id}.jpg`, POOL, ME)).toBe(false);
    expect(isPhotoPathFor(`other-pool/${ME}/${id}.jpg`, POOL, ME)).toBe(false);
    expect(isPhotoPathFor(`${POOL}/${ME}/x/${id}.jpg`, POOL, ME)).toBe(false);
    expect(isPhotoPathFor(`${POOL}/${ME}/${id}.png`, POOL, ME)).toBe(false);
    expect(isPhotoPathFor(`${POOL}/${ME}/not-a-uuid.jpg`, POOL, ME)).toBe(false);
  });
});

describe('readPhotoMetadata', () => {
  it('reads what 159 stores and refuses anything malformed', () => {
    expect(readPhotoMetadata({ path: 'a/b/c.jpg', width: 1600, height: 1200 })).toEqual({
      path: 'a/b/c.jpg',
      width: 1600,
      height: 1200,
    });
    expect(readPhotoMetadata({ path: '', width: 1, height: 1 })).toBeNull();
    expect(readPhotoMetadata({ path: 'a', width: 0, height: 1 })).toBeNull();
    expect(readPhotoMetadata({})).toBeNull();
    expect(readPhotoMetadata(null)).toBeNull();
  });
});

describe('resizeTarget', () => {
  it('shrinks the longest edge to 1600 and never enlarges', () => {
    expect(resizeTarget(4032, 3024)).toEqual({ width: 1600 });
    expect(resizeTarget(3024, 4032)).toEqual({ height: 1600 });
    expect(resizeTarget(1200, 900)).toBeNull();
    expect(resizeTarget(1600, 1600)).toBeNull();
  });
});

describe('fitPhoto', () => {
  it('fits the bubble and never scales up', () => {
    expect(fitPhoto(1600, 1200, 240, 320)).toEqual({ width: 240, height: 180 });
    expect(fitPhoto(1200, 1600, 240, 320)).toEqual({ width: 240, height: 320 });
    expect(fitPhoto(100, 50, 240, 320)).toEqual({ width: 100, height: 50 });
  });
});

describe('base64ToBytes', () => {
  it('decodes exactly', () => {
    expect(Array.from(base64ToBytes('/9j/'))).toEqual([0xff, 0xd8, 0xff]);
  });
});

// ⚠⚠ THE GUARD. expo-image-picker / expo-image-manipulator only exist in
// binaries from 1.3.0. A top-level import anywhere would be evaluated at
// launch by every 1.2.0 phone that receives an OTA, and crash it. They may
// only be `require`d lazily inside lib/photos.ts.
describe('native photo modules are never imported at the top level', () => {
  const root = resolve(__dirname, '../..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name.startsWith('.') || name === 'dist' || name === 'ios' || name === 'android') continue;
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name) && !p.includes('__tests__')) files.push(p);
    }
  };
  walk(join(root, 'app'));
  walk(join(root, 'components'));
  walk(join(root, 'lib'));

  it('finds no static import of either package', () => {
    const offenders = files.filter((f) =>
      /^\s*import\s[^;]*from\s+['"]expo-image-(picker|manipulator)['"]/m.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('only lib/photos.ts requires them', () => {
    const requirers = files
      .filter((f) => /require\(['"]expo-image-(picker|manipulator)['"]\)/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(root.length + 1));
    expect(requirers).toEqual(['lib/photos.ts']);
  });
});
