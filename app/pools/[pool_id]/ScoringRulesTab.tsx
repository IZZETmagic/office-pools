'use client'

import { Card } from '@/components/ui/Card'
import { Alert } from '@/components/ui/Alert'
import { formatNumber } from '@/lib/format'

// =============================================
// TYPES
// =============================================

type PoolSettings = {
  group_exact_score: number
  group_correct_difference: number
  group_correct_result: number
  knockout_exact_score: number
  knockout_correct_difference: number
  knockout_correct_result: number
  round_32_multiplier: number
  round_16_multiplier: number
  quarter_final_multiplier: number
  semi_final_multiplier: number
  third_place_multiplier: number
  final_multiplier: number
  pso_enabled: boolean
  pso_exact_score: number | null
  pso_correct_difference: number | null
  pso_correct_result: number | null
  bonus_group_winner_and_runnerup: number | null
  bonus_group_winner_only: number | null
  bonus_group_runnerup_only: number | null
  bonus_both_qualify_swapped: number | null
  bonus_one_qualifies_wrong_position: number | null
  bonus_all_16_qualified: number | null
  bonus_12_15_qualified: number | null
  bonus_8_11_qualified: number | null
  bonus_correct_bracket_pairing: number | null
  bonus_champion_correct: number | null
  bonus_second_place_correct: number | null
  bonus_third_place_correct: number | null
  bonus_best_player_correct: number | null
  bonus_top_scorer_correct: number | null
  bonus_match_winner_correct: number | null
}

type BPSettings = {
  bp_group_correct_1st: number
  bp_group_correct_2nd: number
  bp_group_correct_3rd: number
  bp_group_correct_4th: number
  bp_third_correct_qualifier: number
  bp_third_correct_eliminated: number
  bp_third_all_correct_bonus: number
  bp_r32_correct: number
  bp_r16_correct: number
  bp_qf_correct: number
  bp_sf_correct: number
  bp_third_place_match_correct: number
  bp_final_correct: number
  bp_champion_bonus: number
  bp_penalty_correct: number
}

// =============================================
// DEFAULTS
// =============================================

const DEFAULTS: PoolSettings = {
  group_exact_score: 100,
  group_correct_difference: 75,
  group_correct_result: 50,
  knockout_exact_score: 200,
  knockout_correct_difference: 150,
  knockout_correct_result: 100,
  round_32_multiplier: 1,
  round_16_multiplier: 2,
  quarter_final_multiplier: 3,
  semi_final_multiplier: 4,
  third_place_multiplier: 4,
  final_multiplier: 8,
  pso_enabled: true,
  pso_exact_score: 100,
  pso_correct_difference: 75,
  pso_correct_result: 50,
  bonus_group_winner_and_runnerup: 150,
  bonus_group_winner_only: 100,
  bonus_group_runnerup_only: 50,
  bonus_both_qualify_swapped: 75,
  bonus_one_qualifies_wrong_position: 25,
  bonus_all_16_qualified: 75,
  bonus_12_15_qualified: 50,
  bonus_8_11_qualified: 25,
  bonus_correct_bracket_pairing: 25,
  bonus_champion_correct: 1000,
  bonus_second_place_correct: 25,
  bonus_third_place_correct: 25,
  bonus_best_player_correct: 100,
  bonus_top_scorer_correct: 100,
  bonus_match_winner_correct: 50,
}

const BP_DEFAULTS: BPSettings = {
  bp_group_correct_1st: 4,
  bp_group_correct_2nd: 3,
  bp_group_correct_3rd: 2,
  bp_group_correct_4th: 1,
  bp_third_correct_qualifier: 2,
  bp_third_correct_eliminated: 1,
  bp_third_all_correct_bonus: 10,
  bp_r32_correct: 1,
  bp_r16_correct: 2,
  bp_qf_correct: 4,
  bp_sf_correct: 8,
  bp_third_place_match_correct: 10,
  bp_final_correct: 20,
  bp_champion_bonus: 50,
  bp_penalty_correct: 1,
}

/* ── Card shapes mirrored from the RN scoring screen ─────────────────────────
   A card is a t-section-header over a rule, then label/value rows: the label
   in muted body text on the left, the amount bold on the right. Sub-groups
   inside a card get a t-caption. Same three pieces the app uses. */

function RuleCard({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={className ?? 'mb-4'}>
      <h3 className="t-section-header text-ink pb-3 mb-1 border-b border-border-subtle">{title}</h3>
      {children}
    </Card>
  )
}

/** Uppercase micro-label for a group of rows inside a card. */
function SubCaption({ children }: { children: React.ReactNode }) {
  return <p className="t-caption text-muted mt-4 mb-1">{children}</p>
}

function PointsRow({ label, value, suffix }: { label: string; value: number | null; suffix?: string }) {
  const n = value ?? 0
  // Bracket-picker values are small enough to hit 1, and "1 pts" reads badly.
  // BracketResultsTab already singularises the same way.
  const unit = suffix ?? (n === 1 ? 'pt' : 'pts')
  return (
    <div className="flex justify-between items-center gap-3 py-2.5">
      <span className="t-body text-muted">{label}</span>
      <span className="t-num text-sm text-ink whitespace-nowrap">
        {formatNumber(n)} {unit}
      </span>
    </div>
  )
}

function MultiplierRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between items-center gap-3 py-2.5">
      <span className="t-body text-muted">{label}</span>
      {/* RN writes the multiplier as ×N, not Nx. */}
      <span className="t-num text-sm text-ink whitespace-nowrap">&times;{value}</span>
    </div>
  )
}

/** Numbered step, shared by How Points Work and the tie-breaker card. */
function Step({ n, children }: { n: number | string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span className="shrink-0 w-6 h-6 rounded-pill bg-primary-600/12 text-primary-800 flex items-center justify-center t-num text-[11px]">
        {n}
      </span>
      <p className="t-body text-ink">{children}</p>
    </div>
  )
}

/**
 * How the leaderboard breaks a tie.
 *
 * These five steps are not editorial — they mirror the comparator in
 * lib/scoring/recalculate.ts and the ORDER BY in
 * lib/migrations/035_shadow_wire_bracket_picker.sql, which agree exactly:
 *
 *   ORDER BY total_points DESC, exact_count DESC, correct_count DESC,
 *            bonus_points DESC, predictions_submitted_at ASC NULLS LAST
 *
 * NULLS LAST is why an unsubmitted entry loses the last step to a submitted
 * one. If that ordering ever changes, this card has to change with it.
 */
function TieBreakerCard() {
  return (
    <RuleCard title="Leaderboard Tie-Breakers" className="mb-4">
      <p className="t-body text-muted mt-3 mb-4">
        When two entries are level, these are applied in order until one comes out ahead.
      </p>
      <div className="space-y-3">
        <Step n={1}>
          <strong>Total points.</strong> The highest total is placed first. Everything below only
          applies while totals are level.
        </Step>
        <Step n={2}>
          <strong>Most exact scores.</strong> The entry that called more scorelines exactly goes
          ahead.
        </Step>
        <Step n={3}>
          <strong>Most correct results.</strong> Then the entry that got more results right —
          the winner or the draw, whatever the scoreline.
        </Step>
        <Step n={4}>
          <strong>Most bonus points.</strong> Group standings, bracket and tournament bonuses,
          counted on their own.
        </Step>
        <Step n={5}>
          <strong>Earliest submission.</strong> Whoever locked their predictions in first. An
          entry that was never submitted always places behind one that was.
        </Step>
      </div>
      <Alert variant="info" className="mt-4">
        Entries that are still level after all five genuinely share a rank — the leaderboard shows
        them on the same number rather than picking a winner arbitrarily.
      </Alert>
    </RuleCard>
  )
}

type ScoringRulesTabProps = {
  settings: Record<string, any> | null
  predictionMode?: 'full_tournament' | 'progressive' | 'bracket_picker'
}

// =============================================
// BRACKET PICKER SCORING RULES
// =============================================

function BracketPickerScoringRules({ settings }: { settings: Record<string, any> | null }) {
  const s: BPSettings = settings
    ? { ...BP_DEFAULTS, ...settings }
    : BP_DEFAULTS

  // Calculate a sample total for the "How Points Work" example
  const groupMaxPerTeam = s.bp_group_correct_1st // best single-team score
  const totalKnockoutExample = s.bp_r32_correct + s.bp_r16_correct + s.bp_qf_correct + s.bp_sf_correct + s.bp_final_correct

  return (
    <div>
      {/* Group Stage Rankings */}
      <RuleCard title="Group Stage Rankings">
        <PointsRow label="Correct 1st Place" value={s.bp_group_correct_1st} />
        <PointsRow label="Correct 2nd Place" value={s.bp_group_correct_2nd} />
        <PointsRow label="Correct 3rd Place" value={s.bp_group_correct_3rd} />
        <PointsRow label="Correct 4th Place" value={s.bp_group_correct_4th} />
        <Alert variant="info" className="mt-4">
          <strong>How it works:</strong> Rank all 4 teams in each group from 1st to 4th. You earn points for each team that finishes in the exact position you predicted. With 12 groups of 4 teams, there are up to {12 * 4} individual team positions to predict.
        </Alert>
      </RuleCard>

      {/* Third-Place Rankings */}
      <RuleCard title="Third-Place Rankings">
        <PointsRow label="Correct Qualifier" value={s.bp_third_correct_qualifier} />
        <PointsRow label="Correct Eliminated Team" value={s.bp_third_correct_eliminated} />
        <Alert variant="info" className="mt-4">
          <strong>How it works:</strong> The 8 best 3rd-place teams advance to the Round of 32, while 4 are eliminated. Rank all 12 third-place teams to predict which 8 qualify and which 4 go home.
        </Alert>
      </RuleCard>

      {/* Knockout Stage */}
      <RuleCard title="Knockout Stage">
        <PointsRow label="Round of 32" value={s.bp_r32_correct} />
        <PointsRow label="Round of 16" value={s.bp_r16_correct} />
        <PointsRow label="Quarter Final" value={s.bp_qf_correct} />
        <PointsRow label="Semi Final" value={s.bp_sf_correct} />
        <PointsRow label="3rd Place" value={s.bp_third_place_match_correct} />
        <PointsRow label="Final" value={s.bp_final_correct} />
        <Alert variant="info" className="mt-4">
          <strong>Example:</strong> Correctly predicting a team to win the Final earns <strong>{formatNumber(s.bp_final_correct)} pts</strong>. If you also predicted them winning all the way from R32, that single team could earn you {formatNumber(totalKnockoutExample)} pts across the bracket.
        </Alert>
      </RuleCard>

      {/* Bonus Points */}
      <RuleCard title="Bonus Points">
        <PointsRow label="Champion Correct" value={s.bp_champion_bonus} />
        <PointsRow label="All 8 Third-Place Qualifiers" value={s.bp_third_all_correct_bonus} />
        <PointsRow label="Penalty Shootout Correct" value={s.bp_penalty_correct} />
      </RuleCard>

      {/* How Points Work */}
      <RuleCard title="How Points Work">
        <div className="space-y-3 mt-3">
          <Step n={1}>
            <strong>Group Rankings:</strong> Predict the finishing order (1st to 4th) for all 12 groups. You earn points for each team in the correct position.
          </Step>
          <Step n={2}>
            <strong>Third-Place Picks:</strong> Rank the 12 third-place teams to predict which 8 qualify and which 4 are eliminated.
          </Step>
          <Step n={3}>
            <strong>Knockout Bracket:</strong> Pick the winner of every knockout match from the Round of 32 through the Final. Points increase for later rounds.
          </Step>
          <Step n={4}>
            <strong>Bonus Points:</strong> Earn a bonus for correctly predicting the champion ({formatNumber(s.bp_champion_bonus)} pts), perfectly ranking all third-place qualifiers ({formatNumber(s.bp_third_all_correct_bonus)} pts), and predicting penalty shootout outcomes.
          </Step>
        </div>
      </RuleCard>

      <TieBreakerCard />
    </div>
  )
}

export function ScoringRulesTab({ settings, predictionMode }: ScoringRulesTabProps) {
  if (predictionMode === 'bracket_picker') {
    return <BracketPickerScoringRules settings={settings} />
  }

  const s: PoolSettings = settings
    ? { ...DEFAULTS, ...settings }
    : DEFAULTS

  const finalExactExample = s.knockout_exact_score * s.final_multiplier

  return (
    <div>
      {/* Group Stage */}
      <RuleCard title="Group Stage">
        <PointsRow label="Exact Score" value={s.group_exact_score} />
        <PointsRow label="Correct Difference" value={s.group_correct_difference} />
        <PointsRow label="Correct Result" value={s.group_correct_result} />
        <Alert variant="info" className="mt-4">
          <strong>How it works:</strong> If the actual score is 2-1, predicting 2-1 earns {s.group_exact_score} pts (exact). Predicting 3-2 earns {s.group_correct_difference} pts (correct winner + goal difference of 1). Predicting 2-0 earns {s.group_correct_result} pts (correct winner only). Only the highest tier applies.
        </Alert>
      </RuleCard>

      {/* Knockout Stage. Multipliers sit inside this card, as they do in the
          app, because they are meaningless without the base points above. */}
      <RuleCard title="Knockout Stage">
        <PointsRow label="Exact Score" value={s.knockout_exact_score} />
        <PointsRow label="Correct Difference" value={s.knockout_correct_difference} />
        <PointsRow label="Correct Result" value={s.knockout_correct_result} />

        <div className="mt-1 pt-3 border-t border-border-subtle">
          <SubCaption>Round Multipliers</SubCaption>
          <MultiplierRow label="Round of 32" value={s.round_32_multiplier} />
          <MultiplierRow label="Round of 16" value={s.round_16_multiplier} />
          <MultiplierRow label="Quarter Final" value={s.quarter_final_multiplier} />
          <MultiplierRow label="Semi Final" value={s.semi_final_multiplier} />
          <MultiplierRow label="3rd Place" value={s.third_place_multiplier} />
          <MultiplierRow label="Final" value={s.final_multiplier} />
        </div>

        <Alert variant="info" className="mt-4">
          <strong>Example:</strong> An exact score prediction in the Final earns {s.knockout_exact_score} &times; {s.final_multiplier} = <strong>{formatNumber(finalExactExample)} pts</strong>.
        </Alert>
      </RuleCard>

      {/* Penalty Shootout */}
      <RuleCard title="Penalty Shootout">
        {s.pso_enabled ? (
          <>
            <PointsRow label="Exact Score" value={s.pso_exact_score} />
            <PointsRow label="Correct Difference" value={s.pso_correct_difference} />
            <PointsRow label="Correct Result" value={s.pso_correct_result} />
            <Alert variant="info" className="mt-4">
              These are additional to the full-time score points, and only apply to knockout
              matches that actually go to penalties.
            </Alert>
          </>
        ) : (
          <p className="t-body text-muted mt-3">Penalty shootout scoring is off for this pool.</p>
        )}
      </RuleCard>

      {/* Bonus Points. The app lists group, qualification, bracket and
          tournament bonuses in one card rather than three. */}
      <RuleCard title="Bonus Points">
        <SubCaption>Per Group</SubCaption>
        <PointsRow label="Winner &amp; Runner-up" value={s.bonus_group_winner_and_runnerup} />
        <PointsRow label="Winner Only" value={s.bonus_group_winner_only} />
        <PointsRow label="Runner-up Only" value={s.bonus_group_runnerup_only} />
        <PointsRow label="Both Qualify (Swapped)" value={s.bonus_both_qualify_swapped} />
        <PointsRow label="One Qualifies (Wrong Pos)" value={s.bonus_one_qualifies_wrong_position} />

        <SubCaption>Overall Qualification</SubCaption>
        <PointsRow label="All Qualified" value={s.bonus_all_16_qualified} />
        <PointsRow label="75%+ Qualified" value={s.bonus_12_15_qualified} />
        <PointsRow label="50%+ Qualified" value={s.bonus_8_11_qualified} />

        <SubCaption>Bracket</SubCaption>
        <PointsRow label="Correct Bracket Pairing" value={s.bonus_correct_bracket_pairing} />
        <PointsRow label="Match Winner Correct" value={s.bonus_match_winner_correct} />

        <SubCaption>Tournament</SubCaption>
        <PointsRow label="Champion Correct" value={s.bonus_champion_correct} />
        <PointsRow label="Runner-up Correct" value={s.bonus_second_place_correct} />
        <PointsRow label="Third Place Correct" value={s.bonus_third_place_correct} />

        <Alert variant="info" className="mt-4">
          The overall qualification bonus is awarded once, after all 48 group matches are
          complete, based on how many of the 32 qualifying teams you called.
        </Alert>

        <div className="mt-4 opacity-40">
          <SubCaption>Coming Soon</SubCaption>
          <PointsRow label="Best Player Correct" value={s.bonus_best_player_correct ?? 100} />
          <PointsRow label="Top Scorer Correct" value={s.bonus_top_scorer_correct ?? 100} />
        </div>
      </RuleCard>

      {/* How Points Work */}
      <RuleCard title="How Points Work">
        <div className="space-y-3 mt-3">
          <Step n={1}>
            <strong>Match Predictions:</strong> Predict the full-time score of every match. The closer your prediction, the more points you earn.
          </Step>
          <Step n={2}>
            <strong>Tiered Scoring:</strong> Only the highest tier applies per match &mdash; exact score, correct winner + goal difference, or correct result.
          </Step>
          <Step n={3}>
            <strong>Knockout Multipliers:</strong> Later rounds are worth more. The Final has a &times;{s.final_multiplier} multiplier.
          </Step>
          {s.pso_enabled && (
            <Step n={4}>
              <strong>Penalty Shootouts:</strong> If a knockout match goes to penalties, you can earn additional bonus points for predicting the PSO score.
            </Step>
          )}
          <Step n={s.pso_enabled ? 5 : 4}>
            <strong>Bonus Points:</strong> Extra points are available for group standings, bracket accuracy, and tournament-level picks (champion, top scorer, etc.).
          </Step>
        </div>
      </RuleCard>

      <TieBreakerCard />
    </div>
  )
}
