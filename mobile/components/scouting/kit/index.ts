// =============================================================
// The scout kit
// =============================================================
// Every scout card on every surface is composed from these and nothing else —
// the presentation half of the design note's "one owner per derivation" rule.
//
// ⚠ THE RULE THE GUARD TEST ENFORCES: no file in `components/scouting/` outside
// this folder may read `theme.colors.green|red|accent|amber`, and no file may
// define a second component with a kit name. See
// `lib/__tests__/scoutKit.guard.test.ts`.
//
// ⚠ COMPONENTS TAKE A `ScoutTone`, NEVER A COLOUR. The vocabulary lives in
// `mobile/lib/scoutTone.ts` where a test can reach it; the mapping lives in
// `./tone.ts`, which is the only file here that knows a hex.
// =============================================================

export { Caveat } from './Caveat';
export { Comparison } from './Comparison';
export { Crest } from './Crest';
export { Finding } from './Finding';
export { FormStrip } from './FormStrip';
export { Lean } from './Lean';
export { PeopleCard } from './PeopleCard';
export { ScoreChip } from './ScoreChip';
export { ScoutBlurb, ScoutCard, ScoutCardBody } from './ScoutCard';
export { ScoutFootnote } from './ScoutFootnote';
export { FixtureSubject, MemberSubject, ScoutHeader } from './ScoutHeader';
export { ScoutRow, ScoutRows } from './ScoutRow';
export { SplitBar, type SplitCounts } from './SplitBar';
export { StatTiles, type StatTile } from './StatTiles';
export { useScoutPalette, type ToneColors } from './tone';
export { VenueSplit, type VenueSide } from './VenueSplit';
