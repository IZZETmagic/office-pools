# Rollout emails — FOR REVIEW (do not send until approved)

Status when sending: fix deployed, adjustment reversed, full recalc applied.
Targeting note: send the **admin** email to admins of **affected pools only** (~78 of 239),
not all pools — unaffected-pool admins would be confused. I can produce the exact list.

---

## Email 1 — to Eliel (the reporter)

**Subject:** Closing the loop on your Mexico–England pick

Hi {{first_name}},

Following up on the scoring issue you flagged — you were exactly right, and it turned out to be a real engine bug, not a one-off.

When your predicted group finished in a tight tie, the standings the app *showed* didn't match how the scoring engine broke that tie behind the scenes, so your correct Round of 16 pick (Mexico–England) was scored as a miss. We'd given you a temporary manual credit to make you whole while we fixed the root cause.

That fix is now live. Your pick scores correctly on its own, and we've removed the temporary credit — so your total is unchanged, but it's now **earned properly** and won't slip again. The standings you see and the way picks are scored now use one and the same logic, aligned to the official FIFA World Cup tiebreakers.

Nothing you need to do. Thanks for taking the time to report it — it made the game fairer for everyone.

— {{sender}}

---

## Email 2 — to pool admins (affected pools only)

**Subject:** Heads-up: a scoring correction has been applied to your pool

Hi {{first_name}},

A quick heads-up before your members ask: we've fixed a scoring bug and recalculated the completed rounds in {{pool_name}}. Wanted you to hear it from us first.

**What was wrong.** In pools where members predict every match up front, a tied predicted group could be ranked one way on screen but scored a different way underneath — so a correct knockout pick could be scored as a miss. We also corrected the group tiebreakers to the official FIFA World Cup order (overall goal difference before head-to-head).

**What changed.** We re-scored the completed rounds with the corrected logic. **Predictions themselves were not touched — only how they're scored.** This is a genuine correction, so some members' points and ranks shift **in both directions**: many move up, and some move down where the old logic had credited a pick it shouldn't have. Rounds still to come are unaffected in how they'll be scored.

**What you don't need to do.** Nothing — it's already applied. If a member asks, you're welcome to forward the note below.

Thanks for running your pool.

— {{sender}}

---
*For members, if asked:* "We fixed a bug where some knockout picks were scored incorrectly when a predicted group finished tied, and aligned the group tiebreakers to official FIFA rules. Scores for the completed rounds have been recalculated. Your predictions weren't changed — only the scoring was corrected, so a few standings have shifted."
