// =============================================================
// THE REMOTION ROOT — every composition this repo can render
// =============================================================
// Remotion bundles from here, entirely outside Next. Nothing in `app/` imports
// this, which is why `remotion` and `@remotion/cli` sit in devDependencies —
// see the note in remotion/README.md before moving them.
// =============================================================

import React from 'react'
import { Composition } from 'remotion'

import { DuelRecap, DUEL_RECAP_DURATION, DUEL_RECAP_SIZE, type DuelRecapProps } from './DuelRecap'
import { DuelReveal, DUEL_REVEAL_DURATION, DUEL_REVEAL_SIZE, type DuelRevealProps } from './DuelReveal'
import duelFixture from './fixtures/duel.json'
import revealFixture from './fixtures/reveal.json'

// ⚠ A FIXTURE, NOT A DATA PATH. Studio needs something true to draw while the
// design is being worked out; a real render takes its props from the request.
// Refresh it with `npx tsx scripts/dump-duel-fixture.ts`.
//
// ⚠ NO `as unknown as`. Remotion's interactivity guidance is explicit that a
// type assertion on `defaultProps` breaks the Props editor's ability to save
// visual edits back to the code — "type the component correctly instead". The
// JSON's inferred shape is assignable to both prop types as written, so the
// assertion was only ever hiding that fact.
const duelDefaults: DuelRecapProps = duelFixture
const revealDefaults: DuelRevealProps = revealFixture

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="DuelRecap"
        component={DuelRecap}
        durationInFrames={DUEL_RECAP_DURATION}
        fps={30}
        width={DUEL_RECAP_SIZE.width}
        height={DUEL_RECAP_SIZE.height}
        defaultProps={duelDefaults}
      />
      {/* The bye is a different card, not a missing opponent, so it gets its
          own entry — otherwise nobody looks at it until it ships wrong. */}
      <Composition
        id="DuelRecapBye"
        component={DuelRecap}
        durationInFrames={DUEL_RECAP_DURATION}
        fps={30}
        width={DUEL_RECAP_SIZE.width}
        height={DUEL_RECAP_SIZE.height}
        defaultProps={{ ...duelDefaults, them: null, points: 250 }}
      />

      {/* The other end of the same week: the seal comes off, before anything is
          played. See the header of DuelReveal.tsx for why this earns a ceremony
          and what the caller must prove before rendering one. */}
      <Composition
        id="DuelReveal"
        component={DuelReveal}
        durationInFrames={DUEL_REVEAL_DURATION}
        fps={30}
        width={DUEL_REVEAL_SIZE.width}
        height={DUEL_REVEAL_SIZE.height}
        defaultProps={revealDefaults}
      />
      <Composition
        id="DuelRevealBye"
        component={DuelReveal}
        durationInFrames={DUEL_REVEAL_DURATION}
        fps={30}
        width={DUEL_REVEAL_SIZE.width}
        height={DUEL_REVEAL_SIZE.height}
        defaultProps={{ ...revealDefaults, them: null }}
      />
    </>
  )
}
