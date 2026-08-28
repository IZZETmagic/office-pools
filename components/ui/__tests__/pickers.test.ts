// =============================================================
// The date and time pickers
// =============================================================
// These replace `<input type="date">` and `<input type="time">`, which were the
// last two controls in the create-pool wizard drawn entirely by the browser —
// its greys, its type, and a panel that ignores dark mode.
//
// Two invariants are worth guarding, and neither is about how they look.
//
//   1. NEITHER PICKER MAY PARSE ITS VALUE WITH `new Date(value)`. A plain
//      'YYYY-MM-DD' is parsed as UTC, so `new Date('2026-08-21')` is the 20th
//      west of Greenwich — a calendar built from it highlights the wrong day,
//      and at a month boundary the wrong month. That defect was fixed THREE
//      times in this codebase in one day (formatMonthYear, quickDeadlineLabel,
//      SettingsTab's deadline fields) before these components existed. A
//      picker that reintroduced it would be the fourth, and the worst placed.
//
//   2. THE PANEL MUST BE PORTALLED. `position: fixed` is viewport-relative only
//      while no ancestor has a transform — and the create-pool modal leaves
//      `transform: matrix(1, 0, 0, 1, 0, 0)` on two ancestors from its
//      scale-in and step-slide animations. An identity matrix is still a
//      transform. Measured before the portal: computed left 346px (correct),
//      rendered at 675px.
//
// Behaviour was verified in the browser rather than here: selecting Sep 18
// updates the trigger and closes the panel; 1:00 PM -> minute 45 -> AM gives
// 1:45 AM; the panel sits 6px under its trigger with 0px horizontal drift.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), 'utf8')
const datePicker = read('components/ui/DatePicker.tsx')
const timePicker = read('components/ui/TimePicker.tsx')

/** Source with whole-line comments removed — the files QUOTE the bugs they fix. */
const codeOnly = (src: string) =>
  src.split('\n').filter((l) => {
    const t = l.trim()
    return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'))
  }).join('\n')

describe('the pickers never parse their value as a Date', () => {
  it('DatePicker splits the string instead', () => {
    // The regex split is the whole defence.
    expect(datePicker).toMatch(/\/\^\(\\d\{4\}\)-\(\\d\{2\}\)-\(\\d\{2\}\)\$\//)
    // The forbidden constructions. `new Date(y, m, d)` IS allowed — it is local
    // by definition — so the assertion is specific about which shapes are not.
    expect(codeOnly(datePicker)).not.toMatch(/new Date\(value\)/)
    expect(codeOnly(datePicker)).not.toMatch(/new Date\(\s*[a-zA-Z]+\.value/)
  })

  it('DatePicker reads today from the local clock, not toISOString', () => {
    // `toISOString().split('T')[0]` is UTC and would make "today" the wrong day
    // for half the world for part of every day.
    expect(codeOnly(datePicker)).not.toMatch(/toISOString/)
    expect(datePicker).toMatch(/getFullYear\(\)/)
    expect(datePicker).toMatch(/getMonth\(\)/)
    expect(datePicker).toMatch(/getDate\(\)/)
  })

  it('TimePicker splits HH:MM too', () => {
    expect(timePicker).toMatch(/\/\^\(\\d\{1,2\}\):\(\\d\{2\}\)\$\//)
    expect(codeOnly(timePicker)).not.toMatch(/new Date\(/)
  })
})

describe('the panels escape the modal', () => {
  it('both portal to document.body', () => {
    for (const src of [datePicker, timePicker]) {
      expect(src).toMatch(/import \{ createPortal \} from 'react-dom'/)
      expect(src).toMatch(/createPortal\(/)
      expect(src).toMatch(/document\.body,/)
    }
  })

  it('both measure from clientWidth, not innerWidth', () => {
    // innerWidth includes the scrollbar and overshoots — the bug ActionMenu
    // records, and the reason its menus sat 15px off their trigger.
    for (const src of [datePicker, timePicker]) {
      expect(src).toMatch(/document\.documentElement\.clientWidth/)
      expect(codeOnly(src)).not.toMatch(/window\.innerWidth/)
    }
  })

  it('both close on scroll and resize rather than chase the trigger', () => {
    // The panel is anchored to a rect captured at open time, so staying open
    // through a scroll would detach it from the control it belongs to.
    for (const src of [datePicker, timePicker]) {
      expect(src).toMatch(/window\.addEventListener\('scroll', onReflow, true\)/)
      expect(src).toMatch(/window\.addEventListener\('resize', onReflow\)/)
    }
  })
})

describe('scrolling the options does not scroll the page', () => {
  // Reported from the running app: "the page in the background scrolls instead
  // of the time options". Three separate causes, all real.

  it('the option columns contain their own overscroll', () => {
    // Cause 1. Without `overscroll-contain` a column chains its scroll to the
    // document the moment it reaches either end, so the list stops moving and
    // the page behind the modal starts. Measured before: `overscroll: auto`.
    const cols = timePicker.match(/max-h-52 overflow-y-auto[^"]*/g) ?? []
    expect(cols.length).toBe(2)
    for (const c of cols) expect(c).toMatch(/overscroll-contain/)
  })

  it('a scroll inside the panel does not close the panel', () => {
    // Cause 2, and self-inflicted: the close-on-scroll listener is capture-phase
    // on `window`, so it also saw scrolls INSIDE the panel — spinning the wheel
    // over the hour column closed the control being used. A scroll originating
    // in the panel moves nothing the panel is anchored to.
    for (const src of [datePicker, timePicker]) {
      expect(src).toMatch(/const onReflow = \(e: Event\) => \{/)
      expect(src).toMatch(/if \(panelRef\.current\?\.contains\(e\.target as Node\)\) return/)
    }
  })
})

describe('the pickers use the design system, not raw colours', () => {
  it('are built from semantic tokens', () => {
    // globals.css: "new work should use the semantic names" — the stock
    // Tailwind scales are a compatibility shim for 4,100 inherited utilities.
    for (const src of [datePicker, timePicker]) {
      expect(src).toMatch(/bg-surface/)
      expect(src).toMatch(/text-ink/)
      expect(src).toMatch(/text-muted/)
      expect(src).toMatch(/border-border-default/)
      expect(src).toMatch(/rounded-control/)
      expect(src).toMatch(/rounded-card/)
    }
  })

  it('set numerals in the app’s monospace face', () => {
    // globals.css calls t-num "the single most recognisable part of the type
    // system". A calendar is nothing but numerals.
    expect(datePicker).toMatch(/t-num/)
    expect(timePicker).toMatch(/t-num/)
  })
})

describe('the time picker does not edit data it was only asked to show', () => {
  it('keeps a minute that is off the five-minute grid', () => {
    // A 13:07 deadline can arrive from an older row or a script. Rounding it to
    // 13:05 when somebody opens the picker to change the DATE would be a silent
    // edit of a value nobody touched.
    expect(timePicker).toMatch(/minutes\.includes\(m\) \? minutes : \[\.\.\.minutes, m\]/)
  })
})
