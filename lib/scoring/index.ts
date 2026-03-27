// =============================================================
// SCORING ENGINE — PUBLIC API
// =============================================================
// Import from '@/lib/scoring' to access the scoring engine.
// =============================================================

// Orchestrator (main entry point)
export { recalculatePool } from './recalculate'
export type { RecalculateOptions, RecalculateResult } from './recalculate'

// Core primitives (for direct use in API routes if needed)
export { scoreMatch, computeMatchScore, checkKnockoutTeamsMatch, getStageMultiplier } from './core'
export type { ScoreResult, PsoResult } from './core'

// Mode calculators
export { calculateFullTournament } from './full'
export { calculateProgressive } from './progressive'
export { calculateBracketPicker } from './bracket'

// Types
export type {
  ScoringInput,
  ScoringResult,
  MatchScoreRow,
  BonusScoreRow,
  EntryTotals,
  MatchWithResult,
  TeamData,
  ConductData,
  TournamentAwards,
  EntryWithPredictions,
  EntryPrediction,
  BPEntryWithPicks,
  BPGroupRanking,
  BPThirdPlaceRanking,
  BPKnockoutPick,
  PoolSettings,
} from './types'
