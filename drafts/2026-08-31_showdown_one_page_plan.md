# Showdown, one page

**Date:** 2026-08-31 · **Status:** FOR APPROVAL — nothing built · **Scope:** Showdown only

Mockup: *Showdown, One Page* artifact (interactive; both breakpoints scroll for real).

---

## The change in one line

Showdown stops being a pool page with a Duel tab on it and becomes a page that **is** the duel.

Ryan, 2026-08-31: *"there are too many tabs for this pool and I want it to be easy and
straightforward... this is the flagship pool mode so I want it to be flashy AND simple."*

---

## What is actually true today (read, not assumed)

| Claim | Evidence |
| --- | --- |
| A Showdown member sees **8 tabs** | `withShowdownFirst` + `USER_TABS_DEFAULT` minus `analytics`, plus `standings` — Duel, Banter, Leaderboard, Predictions, Results, Table, Scoring Rules, Pool Info |
| An admin sees **11** | `ADMIN_TABS` adds Members, Scoring Config, Settings |
| `Table` is inherited, not chosen | It arrives from the `isLeaguePool` branch (`PoolDetail.tsx:1527`), shared with Table mode and Pick'em. Showdown scores on pick accuracy; the real PL table changes nothing about a duel |
| The hamburger is **app-wide navigation** | `AppHeader.tsx:43` — Dashboard, Pools, Profile, (Admin). Identical on every page |
| There is **no pool-scoped menu today** | `brandedNavOpen` in `PoolDetail` is not one — its own comment calls it *"a copy of AppHeader's list frozen at the time it was written"*. The tabs were the pool's menu |
| Mobile is **not affected** | `mobile/` has no league surface at all: zero `matchweek` / `league_mode` references outside one onboarding string. This is a web-only change |
| Picks cannot be lost | Every flow already auto-saves — 500 ms debounce, 60 s interval, `beforeunload` flush (`drafts/2026-08-29_autosave_no_submit.md`) |
| **7 places deep-link into a tab** | `lib/auto-submit.ts` ×2, `lib/league/notify.ts` ×2, `lib/email/templates.ts` ×3 — `?tab=predictions`, `?tab=leaderboard`, `?tab=results` |

That last row is the one with teeth. See §5.

---

## 1. The design

### The band

The duel becomes a **sticky band at the head of the page**, edge to edge, running to the very top
of the screen. No pool chips, no tab strip. Over it: the SP mark and the pool name on the left, the
existing hamburger on the right.

It carries four states — sealed (countdown), in play (live score), result (decided), and the
between-weeks state (§7, undecided).

### ⚠ The collapse means two different things, and that is the point

> **On a phone the collapse SHEDS. On desktop it only SHRINKS.**

A 375px bar has nowhere to put two names, two ranks and a label, so they go: avatars rise and tuck
in beside the clock, matchweek and score scale down, names and points fade out. It settles at 116px.

A 1440px bar has room for all of it, so nothing is removed — the same band just gets shorter, and
both members stay named and ranked the whole way down.

Same component, same scroll-progress variable, different budget. Not two designs.

### ⚠ Full-bleed background, capped contents

The band's gradient runs the full width; its contents cap at **940px** and centre. This is what
stops a 1920px monitor stretching two avatars to opposite ends of an empty room. Body caps at
1000px.

### Desktop body: a column and a rail

What stacks on a phone becomes two columns: the week you are playing on the left (your picks, this
week's fixtures), the standing things pinned on the right (leaderboard, banter). The rail is
`position: sticky` under the collapsed band.

**Rejected: a pinned left sidebar holding the duel.** It keeps the duel visible without any collapse
at all, which is tempting — but a 420px column cannot hold the wide Anton countdown, and that
countdown *is* the flashy part. Demoting the flagship moment to furniture to save a scroll is the
wrong trade.

### ⚠ Navigation: left is this pool, right is the app

The hamburger **does not change**. Not its contents, not its position, not its behaviour. It is
`AppHeader` and it is the same on every page in the product.

The pool's own surfaces hang off the **pool's name**, which becomes a control:

```
Showdown Duels ⌄     →   How Showdown works
                          Scoring rules
                          Members · 10
                          ─────────────
                          Pool settings          (admin)
                          Scoring config         (admin)
                          ─────────────
                          Leave pool
```

Three reasons for the name rather than a second icon: it adds no new glyph, so there is exactly one
hamburger on screen and it still means what it means everywhere else; it sits on the thing it is
about; and the left/right rule extends to Table mode, LMS and Pick'em later without redesigning
anything.

⚠ **This is the part to test on someone before building.** Whether two menu-ish affordances in one
54px bar reads cleanly is a belief, not a finding.

---

## 2. What happens to eight tabs

| Tab | Becomes |
| --- | --- |
| Duel | the page |
| Predictions | a section, and the band's one button |
| Leaderboard | a section on mobile, the rail on desktop |
| Banter | a section, plus the existing sheet unchanged |
| Results | folded into fixtures — same rows, same picks, same component |
| **Table** | **removed.** Showdown never scores against the PL table |
| **Scoring Rules** | the pool menu |
| **Pool Info** | the pool menu, with Members, Scoring Config, Settings, Leave |

Eight to four sections and one menu.

---

## 3. What is NOT changing

- `AppHeader` — untouched, in every respect.
- Every other pool mode. Table, LMS, Pick'em, World Cup and bracket pools keep their tabs exactly.
  The rework is gated on `league_mode === 'showdown'`.
- The scoring engine, the reveal rule, the recap sheet, the duel decision page
  (`/pools/[id]/duel/[matchweek]`), and every migration from 115–127.
- Mobile. There is no league surface in `mobile/` to keep in step.

---

## 4. The build

Seven slices. Each ends green and shippable; none leaves Showdown half-converted, because the new
layout is only mounted once it is complete (§4.7).

| # | Slice | Size | Ends with |
| --- | --- | --- | --- |
| 1 | `ShowdownPage` shell — band + section stack, rendered behind a mode check and a flag | 1 d | Reachable at `?layout=onepage`, tabs still default |
| 2 | The band: sticky, scroll-progress collapse, four states | 2 d | Both breakpoints collapse correctly |
| 3 | The pool menu on the pool name | 1 d | Rules / members / settings / leave reachable without tabs |
| 4 | Sections: picks, fixtures, leaderboard, banter — **reusing the existing components** | 1 d | Nothing rendered by a tab that is not rendered by a section |
| 5 | Deep-link compatibility (§5) | 0.5 d | Every existing `?tab=` URL lands in the right place |
| 6 | Desktop: capped band, column + sticky rail | 1 d | Wide windows composed, not stretched |
| 7 | Flip the default; delete the Showdown tab list | 0.5 d | `withShowdownFirst` and the Showdown branch of `USER_TABS` gone |

**~7 days.** Slices 1–4 are the risk; 5–7 are mechanical.

### ⚠ Reuse, do not rewrite

`DuelsTab` is 2,135 lines and `PoolDetail` 2,820. This plan moves components; it does not rewrite
them. The fixtures table, the leaderboard, the banter sheet, the picks flow and the season chart are
all mounted as-is inside sections. If a slice starts rewriting one of those, it has gone wrong.

---

## 5. ⚠ Deep links are the migration risk

Seven live senders point at a tab, and four of them are **emails already in inboxes**:

```
lib/auto-submit.ts:322,578    ?tab=predictions
lib/league/notify.ts:119      ?tab=predictions
lib/league/notify.ts:321      ?tab=leaderboard
lib/email/templates.ts:187,271 ?tab=predictions
lib/email/templates.ts:309    ?tab=results
lib/email/templates.ts:344,381 ?tab=leaderboard
```

An email sent last week must still work next month. So `?tab=` does not become invalid on a Showdown
pool — it becomes a **scroll target**:

| Arrives as | Lands on |
| --- | --- |
| `?tab=predictions` | scrolls to the picks section |
| `?tab=leaderboard` | scrolls to the leaderboard section |
| `?tab=results` | scrolls to the fixtures section |
| `?tab=standings` / `?tab=scoring_rules` / `?tab=pool_info` | top of page, pool menu available |

⚠ **And it must survive a same-page push.** `PoolDetail` reads `?tab=` in a `useState` initialiser —
consulted once on mount — which is the bug fixed in `9d1c38f`. The new page must read the parameter
on **mount and on change**, or the same class of dead link comes straight back.

---

## 6. What could go wrong

**The tab machinery has non-tab jobs.** `activeTab` also drives the mobile swipe navigation, the
auto-refresh interval (`autoRefreshTabs`), the unsaved-changes guard and the pill-scroll effect.
Removing tabs for one mode means each of those needs a no-tabs path rather than an undefined one.
The unsaved-changes guard is the least worrying: everything already auto-saves.

**One long page loads what four tabs used to defer.** Today Banter and the full predictions sheet
only load when their tab is opened. As sections they are on the page from the start. Mitigation:
mount the below-fold sections lazily on intersection — and note this is exactly the read-cost
problem in `drafts/2026-08-31_league_read_path_and_cost_review.md` §3.1, which this could make worse
if ignored.

**Two menus in one bar.** §1's open question. Cheap to test, expensive to discover late.

**Scroll-linked animation on a low-end phone.** The collapse is a CSS custom property driven by a
passive scroll listener — no layout thrash — but it wants checking on a real device rather than a
simulator, and it must respect `prefers-reduced-motion`.

---

## 7. Open decisions

1. **The fourth state.** Week over, next one sealed, nothing in play. Today that is the countdown,
   and a clock ticking on an empty week may want something quieter of its own. Undecided.
2. **The pool menu on the pool name** — test before building (§1).
3. **Does `Table` come back for a member who wants it?** Removed here on the argument that Showdown
   never scores against it. If that is wrong, it becomes a pool-menu item, not a tab.
4. **Do the other league modes follow?** Out of scope deliberately. If this lands well, Table mode
   and LMS are the obvious next candidates — but each has a different centre of gravity and should
   be argued on its own.

---

## 8. Disclosure gate

> *"Everything about your duel is on one page, and the pool's rules and settings are under the
> pool's name."*

Passes. It removes navigation rather than hiding it; nothing is gated, timed, or withheld to
manufacture a return visit. Every surface that exists today still exists and is reachable in one tap.
