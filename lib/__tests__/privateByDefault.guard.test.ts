// =============================================================
// A new pool is PRIVATE unless somebody says otherwise
// =============================================================
// Ryan's call, 2026-08-29. A pool code is required either way — the only thing
// `is_private` decides is whether the pool is ALSO listed in Discover.
// Defaulting to listed meant an admin had to notice a toggle to keep their
// office pool out of a public directory, which is the wrong way round for a
// product whose median pool is a handful of people who already know each other.
//
// There are THREE doors into pool creation and they have to agree: the web
// wizard, the Expo one, and the route both post to. This is a source-level
// guard rather than a behavioural test because two of the three are React state
// initialisers — there is no seam to assert against, and the failure mode is a
// silent flip back during an unrelated edit.
// =============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

const WEB_WIZARD = 'components/pools/CreatePoolModal.tsx'
const MOBILE_WIZARD = 'mobile/app/create-pool.tsx'
const CREATE_ROUTE = 'app/api/pools/create/route.ts'

describe('the web wizard', () => {
  it('starts on Private', () => {
    expect(read(WEB_WIZARD)).toMatch(/const \[isPrivate, setIsPrivate\] = useState\(true\)/)
  })

  it('sends the choice explicitly rather than relying on the route', () => {
    // If the wizard ever stopped sending the key, the route's default would
    // quietly become the product decision — and a reader of this file would
    // have no way to tell which one was in force.
    expect(read(WEB_WIZARD)).toMatch(/is_private: isPrivate/)
  })
})

describe('the Expo wizard', () => {
  it('starts on Private too', () => {
    // Two create surfaces disagreeing about a privacy default is the kind of
    // drift nobody reports: each looks correct on its own.
    expect(read(MOBILE_WIZARD)).toMatch(/const \[isPrivate, setIsPrivate\] = useState\(true\)/)
  })
})

describe('the create route', () => {
  it('⚠ defaults to private when the caller omits the field', () => {
    // The route used to pass `is_private` straight through. An omitted key then
    // fell to the column default and published the pool to Discover — a
    // visibility decision made by a missing property.
    expect(read(CREATE_ROUTE)).toMatch(/is_private: is_private \?\? true/)
  })

  it('does not hard-code the value, so Public is still reachable', () => {
    // The point is a DEFAULT, not a ban. An admin who picks Public must get one.
    const src = read(CREATE_ROUTE)
    expect(src).not.toMatch(/is_private: true\b/)
    expect(src).not.toMatch(/is_private: false\b/)
  })
})

describe('the surfaces that are deliberately NOT private by default', () => {
  it('leaves branded pools alone', () => {
    // app/api/admin/branded-pools keeps `is_private ?? false`, and that is
    // correct rather than an oversight: a branded pool is a partner or
    // marketing pool whose whole purpose is being found. Pinned so the next
    // person to grep for `?? false` does not "fix" it.
    expect(read('app/api/admin/branded-pools/route.ts')).toMatch(/is_private: is_private \?\? false/)
  })
})
