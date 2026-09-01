# Banter on the one-page Showdown

**Date:** 2026-09-01 · **Status:** FOR APPROVAL — nothing built · **Scope:** web, Showdown only

Ryan: *"we will have to be more clever how we implement the banter into this, because the current
banter page is not suitable for what we are designing"* — and *"it's going to be on the React Native
app because it's very greatly built in there, but I'm not sure how to do it for the web."*

---

## The finding that decides this

Web banter is not merely a bad fit for the one-page layout. **It cannot coexist with it.**

`CommunityTab.tsx:478` takes over the document to become a chat screen:

```js
window.scrollTo(0, 0)
document.body.style.overflow  = 'hidden'
document.body.style.position  = 'fixed'
document.body.style.width     = '100%'
document.body.style.top       = '0'
```

The Showdown band's entire behaviour is driven by `window.scrollY`. With the body fixed, `scrollY`
never moves: **the band would freeze fully open, the collapse would never run, the rail would not
stick, and the chevron would sit under a chat that had eaten the page.** This is not a styling
mismatch to be tuned around — the two designs want opposite things from the same document.

So the question is not "how do we fit the banter page into the layout". It is "what replaces it".

---

## What each platform actually has

| | React Native | Web |
| --- | --- | --- |
| Surface | `BanterSheet.tsx` — **2,515 lines** | `CommunityTab.tsx` — **1,393 lines** |
| Shape | a bottom **sheet OVER** the pool | a **tab INSTEAD OF** the pool |
| Entry | `BanterFab` — floating, always reachable | a tab in the strip (which one-page removes) |
| Supporting | `BanterRichCard`, `ReactionsSheet`, `SharePredictionSheet` | `helpers.tsx`, `ReactorsModal`, `SharePredictionModal`, `StandingsDropCard` |
| The pool while you read | still there, behind | gone |

**RN already has the model this layout needs**, and it is not a coincidence: a sheet was the right
answer on a phone for the same reason it is the right answer here. The pool is the page; banter is
something you open on top of it and dismiss.

⚠ Note what is NOT a problem: **realtime is already shared.** Both surfaces subscribe to the private
`pool:{id}` topic from migration 022. No data work, no new subscription, no divergence risk.

---

## The proposal

> **Banter becomes a sheet over the Showdown page, the way it already is on the phone.**

### 1. The entry point

A floating button, bottom-right, mirroring `BanterFab`. It carries the unread count, which the tab
strip used to carry and which one-page currently drops on the floor.

⚠ It is **also** in the chevron menu, because that is where somebody who has not noticed a floating
button will look. Two doors to one room; the FAB is the one you use, the menu is the one you find.

### 2. The sheet

`Modal` — the app's own, already used by the pool menu and the duel recap. Bottom-anchored on a
phone, centred on desktop, and it already traps focus and closes on Escape.

⚠ **The body hijack must be OFF inside it.** `CommunityTab`'s `mobileChat` branch exists to make the
chat fill a phone viewport; inside a sheet the sheet already does that. This is a prop
(`chrome={false}` or `embedded`), the same shape as the one that removed the round header from the
picks surface — not a rewrite.

### 3. What gets reused, and what does not

**Reused whole:** the message list, the composer, reactions, the rich cards (`helpers.tsx`,
`ReactorsModal`, `SharePredictionModal`, `StandingsDropCard`, `SystemEventCard`, `TypingIndicator`).
That is the great majority of those 1,393 lines and none of it is the problem.

**Not reused:** the viewport takeover, the `mobileHeight` measurement loop, and the `-mx-4`
full-bleed. Those exist to turn a tab into a screen, and the sheet has already done that job.

### 4. Desktop

The sheet is the same on both, but from `md` there is room for more, and the rail already exists.
**A banter card in the rail** showing the last two or three messages, tapping through to the sheet —
the same shape the mockup drew. It costs one small card and it means the thing that "drives the
banter" is visible without opening anything.

---

## ⚠ The one genuinely hard part

**The keyboard on mobile web.**

RN solved this with `keyboard-controller` and a Reanimated translate — a documented, hard-won fix
(`mobile_keyboard_gorhom_sheet_android`). Web has no equivalent: `CommunityTab` currently measures
`window.innerHeight` in a `requestAnimationFrame` loop and sizes itself to what is left, which is
*why* it needs the body fixed.

Inside a sheet that measurement has to target the sheet rather than the document. The tool for it is
`window.visualViewport` — `resize` and `scroll` events give the real usable area with the keyboard
up, without touching `document.body` at all.

⚠ **This is the part to prototype first**, before any of the rest is built. If a sheet with a text
input cannot behave with the keyboard up on iOS Safari, the whole plan changes, and it is much
cheaper to learn that from a throwaway page than from a half-migrated component.

---

## The work

| # | Slice | Size |
| --- | --- | --- |
| 0 | **Prototype**: sheet + input + `visualViewport` on real iOS Safari | 0.5 d |
| 1 | `embedded` prop on `CommunityTab` — skip the body takeover and the viewport loop | 1 d |
| 2 | The sheet, opened from the chevron menu | 0.5 d |
| 3 | The FAB, with the unread count | 0.5 d |
| 4 | Rail card on desktop — last messages, taps through | 0.5 d |

**~3 days**, and slice 0 can invalidate the rest, which is why it is slice 0.

---

## Decisions this asks Ryan for

1. **A FAB on the web.** RN has one and it works; web has never had one. It is a new pattern for the
   web app, on one mode.
2. **Does banter stay a TAB for every other mode?** This plan changes Showdown only. Table, LMS,
   Pick'em and the World Cup keep `CommunityTab` exactly as it is — which means two banter shapes
   live side by side for a while.
3. **Unread state.** The tab strip carried it; one-page has nowhere to put it but the FAB. If the
   FAB is rejected, unread needs another home.

---

## Disclosure gate

> *"Banter opens on top of your pool and closes again; the pool never goes away."*

Passes. It removes a navigation step and hides nothing. No badge, count or prompt here is engineered
to pull anyone back — the unread count reports what is already true, and a member who never opens
the sheet misses nothing that is scored.
