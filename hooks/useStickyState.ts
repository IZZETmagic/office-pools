'use client'

// =============================================================
// State that survives its component being unmounted
// =============================================================
// ## The bug this exists to end
//
// Every tab panel in `PoolDetail` is conditionally rendered, so switching tabs
// UNMOUNTS the one you left. Every picking surface seeds its state from a
// server-rendered prop:
//
//   TablePredictionTab   useState(savedOrder.length ? savedOrder : seededOrder)
//   SurvivorTab          useState(myPicks)
//   ProgressivePredictionsFlow
//                        useState(() => …props.predictions…)
//
// That prop is a snapshot taken when the page was rendered. Come back to the
// tab and the initialiser runs again against the snapshot, so a member sees the
// table, the club or the picks they had BEFORE they touched anything — their
// save looking thrown away, while the database holds it perfectly.
//
// It was reported three times: Table on 25 Aug, then Survivor. Pick'em has the
// same shape and had not been reported yet. Three instances of one bug is the
// point at which patching each one separately stops being the cheaper option.
//
// ## Why a module-level cache and not context or lifted props
//
// Lifting into `PoolDetail` works — that is how Table was first fixed — but it
// costs a state field and an `onSaved` prop per surface, and every new picking
// tab has to remember to do it. Nothing fails if it forgets; it just quietly
// reintroduces the bug. This makes the fix one line at the point of use.
//
// The cache lives outside React on purpose. It has to outlive an unmount, which
// is exactly what React state cannot do, and a Context provider would still be
// re-created by a route change.
//
// ## ⚠ What it deliberately does NOT do
//
// It is not a data layer and it is not a cache of the truth. It remembers what
// THIS page saved, so the screen agrees with itself. It does not know about:
//
//   · a save from another device or tab — still needs a reload
//   · a `router.refresh()` bringing genuinely newer server data — the sticky
//     value wins until the page is reloaded
//
// Both are acceptable for the surfaces that use it: a table prediction is made
// once a season, a Survivor pick once a week. If a surface ever needs live
// cross-device agreement, it needs a subscription, not this.
//
// Entries are keyed by pool so switching pools client-side cannot show one
// pool's picks in another, and a full page load starts empty — which is also
// the moment the server prop becomes trustworthy again.

import { useState, useCallback } from 'react'

/** Survives unmount; does not survive a page load. That pairing is the design. */
const cache = new Map<string, unknown>()

/**
 * Has this key been written from a previous mount?
 *
 * For the one caller that needs to tell a REMOUNT from a first mount: an effect
 * that legitimately syncs from a prop must still run the first time (props can
 * arrive async), but must not clobber a sticky value on the way back to a tab.
 */
export function hasStickyState(key: string): boolean {
  return cache.has(key)
}

/** Exported for tests and for a surface that needs to drop its own entry. */
export function clearStickyState(key?: string) {
  if (key === undefined) cache.clear()
  else cache.delete(key)
}

/**
 * `useState`, except the value outlives the component.
 *
 * @param key    Must include the pool id — `lms:${poolId}` — so two pools
 *               cannot read each other's entry.
 * @param initial The server-rendered prop. Used only when nothing has been
 *               saved from this page yet.
 */
export function useStickyState<T>(
  key: string,
  initial: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  // Read the cache ONCE, in the initialiser. Reading it during render would
  // make the component's output depend on a mutable module, which React is
  // entitled to call twice.
  const [value, setValue] = useState<T>(() => (cache.has(key) ? (cache.get(key) as T) : initial))

  // `key` in the dependency list rather than held in a ref: writing a ref during
  // render is exactly what the React compiler forbids, and the dependency is
  // both simpler and correct if a key ever does change under a live component.
  const set = useCallback((next: T | ((prev: T) => T)) => {
    setValue((prev) => {
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
      cache.set(key, resolved)
      return resolved
    })
  }, [key])

  return [value, set]
}
