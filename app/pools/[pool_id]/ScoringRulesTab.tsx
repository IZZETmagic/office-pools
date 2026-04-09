'use client'

import { Card } from '@/components/ui/Card'

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

function PointsRow({ label, value, suffix = 'pts' }: { label: string; value: number | null; suffix?: string }) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-sm text-neutral-600">{label}</span>
      <span className="text-sm font-bold text-neutral-900">{value ?? 0} {suffix}</span>
    </div>
  )
}

function MultiplierRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-sm text-neutral-600">{label}</span>
      <span className="text-sm font-bold text-neutral-900">{value}x</span>
    </div>
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
      <Card className="mb-6">
        <h4 className="text-lg font-semibold text-neutral-900 mb-1">Group Stage Rankings</h4>
        <p className="text-xs text-neutral-500 mb-4">Points for correctly predicting the finishing position of each team within their group.</p>
        <div className="divide-y divide-neutral-100">
          <PointsRow label="Correct 1st Place" value={s.bp_group_correct_1st} />
          <PointsRow label="Correct 2nd Place" value={s.bp_group_correct_2nd} />
          <PointsRow label="Correct 3rd Place" value={s.bp_group_correct_3rd} />
          <PointsRow label="Correct 4th Place" value={s.bp_group_correct_4th} />
        </div>
        <div className="mt-4 flex items-start gap-3 bg-primary-50 border border-primary-200 rounded-xl px-4 py-3 dark:bg-primary-900/20 dark:border-primary-800">
          <svg className="w-5 h-5 text-primary-800 dark:text-primary-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <p className="text-xs text-primary-800 dark:text-primary-600 leading-5">
            <strong>How it works:</strong> Rank all 4 teams in each group from 1st to 4th. You earn points for each team that finishes in the exact position you predicted. With 12 groups of 4 teams, there are up to {12 * 4} individual team positions to predict.
          </p>
        </div>
      </Card>

      {/* Third-Place Rankings */}
      <Card className="mb-6">
        <h4 className="text-lg font-semibold text-neutral-900 mb-1">Third-Place Rankings</h4>
        <p className="text-xs text-neutral-500 mb-4">Points for correctly predicting which 3rd-place teams qualify for the Round of 32 and which are eliminated.</p>
        <div className="divide-y divide-neutral-100">
          <PointsRow label="Correctly identified qualifier" value={s.bp_third_correct_qualifier} />
          <PointsRow label="Correctly identified eliminated team" value={s.bp_third_correct_eliminated} />
        </div>
        <div className="mt-4 flex items-start gap-3 bg-primary-50 border border-primary-200 rounded-xl px-4 py-3 dark:bg-primary-900/20 dark:border-primary-800">
          <svg className="w-5 h-5 text-primary-800 dark:text-primary-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <p className="text-xs text-primary-800 dark:text-primary-600 leading-5">
            <strong>How it works:</strong> The 8 best 3rd-place teams advance to the Round of 32, while 4 are eliminated. Rank all 12 third-place teams to predict which 8 qualify and which 4 go home.
          </p>
        </div>
      </Card>

      {/* Knockout Stage */}
      <Card className="mb-6">
        <h4 className="text-lg font-semibold text-neutral-900 mb-1">Knockout Stage</h4>
        <p className="text-xs text-neutral-500 mb-4">Points for correctly predicting the winner of each knockout match. Later rounds are worth more.</p>
        <div className="divide-y divide-neutral-100">
          <PointsRow label="Round of 32" value={s.bp_r32_correct} />
          <PointsRow label="Round of 16" value={s.bp_r16_correct} />
          <PointsRow label="Quarter Finals" value={s.bp_qf_correct} />
          <PointsRow label="Semi Finals" value={s.bp_sf_correct} />
          <PointsRow label="3rd Place Match" value={s.bp_third_place_match_correct} />
          <PointsRow label="Final" value={s.bp_final_correct} />
        </div>
        <div className="mt-4 flex items-start gap-3 bg-primary-50 border border-primary-200 rounded-xl px-4 py-3 dark:bg-primary-900/20 dark:border-primary-800">
          <svg className="w-5 h-5 text-primary-800 dark:text-primary-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <p className="text-xs text-primary-800 dark:text-primary-600 leading-5">
            <strong>Example:</strong> Correctly predicting a team to win the Final earns <strong>{s.bp_final_correct} pts</strong>. If you also predicted them winning all the way from R32, that single team could earn you {totalKnockoutExample} pts across the bracket.
          </p>
        </div>
      </Card>

      {/* Bonus Points */}
      <Card className="mb-6">
        <h4 className="text-lg font-semibold text-neutral-900 mb-1">Bonus Points</h4>
        <p className="text-xs text-neutral-500 mb-4">Additional points for exceptional predictions.</p>
        <div className="divide-y divide-neutral-100">
          <PointsRow label="Champion correct" value={s.bp_champion_bonus} />
          <PointsRow label="All 8 third-place qualifiers correct" value={s.bp_third_all_correct_bonus} />
          <PointsRow label="Correct penalty shootout prediction" value={s.bp_penalty_correct} />
        </div>
      </Card>

      {/* How Points Work */}
      <Card>
        <h4 className="text-lg font-semibold text-neutral-900 mb-3">How Points Work</h4>
        <div className="space-y-3 text-sm text-neutral-700">
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-success-100 text-success-700 flex items-center justify-center text-xs font-bold">1</span>
            <p><strong>Group Rankings:</strong> Predict the finishing order (1st to 4th) for all 12 groups. You earn points for each team in the correct position.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-success-100 text-success-700 flex items-center justify-center text-xs font-bold">2</span>
            <p><strong>Third-Place Picks:</strong> Rank the 12 third-place teams to predict which 8 qualify and which 4 are eliminated.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-success-100 text-success-700 flex items-center justify-center text-xs font-bold">3</span>
            <p><strong>Knockout Bracket:</strong> Pick the winner of every knockout match from the Round of 32 through the Final. Points increase for later rounds.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-success-100 text-success-700 flex items-center justify-center text-xs font-bold">4</span>
            <p><strong>Bonus Points:</strong> Earn a big bonus for correctly predicting the champion ({s.bp_champion_bonus} pts), perfectly ranking all third-place qualifiers ({s.bp_third_all_correct_bonus} pts), and predicting penalty shootout outcomes.</p>
          </div>
        </div>
      </Card>
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
      <Card className="mb-6">
        <h4 className="text-lg font-semibold text-neutral-900 mb-1">Group Stage Scoring</h4>
        <p className="text-xs text-neutral-500 mb-4">Points awarded for each group stage match prediction.</p>
        <div className="divide-y divide-neutral-100">
          <PointsRow label="Exact Score Match" value={s.group_exact_score} />
          <PointsRow label="Correct Winner + Goal Difference" value={s.group_correct_difference} />
          <PointsRow label="Correct Result Only (Win/Draw/Loss)" value={s.group_correct_result} />
        </div>
        <div className="mt-4 flex items-start gap-3 bg-primary-50 border border-primary-200 rounded-xl px-4 py-3 dark:bg-primary-900/20 dark:border-primary-800">
          <svg className="w-5 h-5 text-primary-800 dark:text-primary-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <p className="text-xs text-primary-800 dark:text-primary-600 leading-5">
            <strong>How it works:</strong> If the actual score is 2-1, predicting 2-1 earns {s.group_exact_score} pts (exact). Predicting 3-2 earns {s.group_correct_difference} pts (correct winner + goal difference of 1). Predicting 2-0 earns {s.group_correct_result} pts (correct winner only). Only the highest tier applies.
          </p>
        </div>
      </Card>

      {/* Knockout Stage */}
      <Card className="mb-6">
        <h4 className="text-lg font-semibold text-neutral-900 mb-1">Knockout Stage Scoring</h4>
        <p className="text-xs text-neutral-500 mb-4">Base points for knockout matches, multiplied by the round multiplier below.</p>
        <div className="divide-y divide-neutral-100">
          <PointsRow label="Exact Score Match" value={s.knockout_exact_score} />
          <PointsRow label="Correct Winner + Goal Difference" value={s.knockout_correct_difference} />
          <PointsRow label="Correct Result Only" value={s.knockout_correct_result} />
        </div>
      </Card>

      {/* Round Multipliers */}
      <Card className="mb-6">
        <h4 className="text-lg font-semibold text-neutral-900 mb-1">Round Multipliers</h4>
        <p className="text-xs text-neutral-500 mb-4">Knockout base points are multiplied by these values depending on the round.</p>
        <div className="divide-y divide-neutral-100">
          <MultiplierRow label="Round of 32" value={s.round_32_multiplier} />
          <MultiplierRow label="Round of 16" value={s.round_16_multiplier} />
          <MultiplierRow label="Quarter Finals" value={s.quarter_final_multiplier} />
          <MultiplierRow label="Semi Finals" value={s.semi_final_multiplier} />
          <MultiplierRow label="Third Place Match" value={s.third_place_multiplier} />
          <MultiplierRow label="Final" value={s.final_multiplier} />
        </div>
        <div className="mt-4 flex items-start gap-3 bg-primary-50 border border-primary-200 rounded-xl px-4 py-3 dark:bg-primary-900/20 dark:border-primary-800">
          <svg className="w-5 h-5 text-primary-800 dark:text-primary-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          <p className="text-xs text-primary-800 dark:text-primary-600 leading-5">
            <strong>Example:</strong> An exact score prediction in the Final earns {s.knockout_exact_score} x {s.final_multiplier} = <strong>{finalExactExample} pts</strong>.
          </p>
        </div>
      </Card>

      {/* Penalty Shootout */}
      <Card className="mb-6">
        <h4 className="text-lg font-semibold text-neutral-900 mb-1">Penalty Shootout Scoring</h4>
        {s.pso_enabled ? (
          <>
            <p className="text-xs text-neutral-500 mb-4">Bonus points for predicting penalty shootout scores in knockout matches that go to penalties. These are additional to the full-time score points.</p>
            <div className="divide-y divide-neutral-100">
              <PointsRow label="Exact PSO Score" value={s.pso_exact_score} />
              <PointsRow label="Correct PSO Winner + Goal Difference" value={s.pso_correct_difference} />
              <PointsRow label="Correct PSO Winner Only" value={s.pso_correct_result} />
            </div>
          </>
        ) : (
          <p className="text-sm text-neutral-500 mt-2 italic">Penalty shootout scoring is disabled for this pool.</p>
        )}
      </Card>

      {/* Group Standings Bonus */}
      <Card className="mb-6">
        <h4 className="text-lg font-semibold text-neutral-900 mb-1">Group Standings Bonus</h4>
        <p className="text-xs text-neutral-500 mb-4">Bonus points for correctly predicting which teams finish 1st and 2nd in each group.</p>

        <p className="text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-2">Per-Group Bonuses</p>
        <div className="divide-y divide-neutral-100 mb-4">
          <PointsRow label="Correct Winner AND Runner-up" value={s.bonus_group_winner_and_runnerup} />
          <PointsRow label="Correct Group Winner only" value={s.bonus_group_winner_only} />
          <PointsRow label="Correct Runner-up only" value={s.bonus_group_runnerup_only} />
          <PointsRow label="Both qualify but positions swapped" value={s.bonus_both_qualify_swapped} />
          <PointsRow label="One qualifies but wrong position" value={s.bonus_one_qualifies_wrong_position} />
        </div>

        <p className="text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-2">Overall Qualification Bonus</p>
        <p className="text-xs text-neutral-500 mb-2">Awarded once when all 48 group matches are completed, based on how many of the 32 qualifying teams were predicted correctly.</p>
        <div className="divide-y divide-neutral-100">
          <PointsRow label="All qualified teams correct" value={s.bonus_all_16_qualified} />
          <PointsRow label="75%+ qualified teams correct" value={s.bonus_12_15_qualified} />
          <PointsRow label="50%+ qualified teams correct" value={s.bonus_8_11_qualified} />
        </div>
      </Card>

      {/* Knockout & Tournament Bonus */}
      <Card className="mb-6">
        <h4 className="text-lg font-semibold text-neutral-900 mb-1">Knockout & Tournament Bonus</h4>
        <p className="text-xs text-neutral-500 mb-4">Bonus points for bracket and tournament-level predictions.</p>

        <p className="text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-2">Bracket Bonus</p>
        <div className="divide-y divide-neutral-100 mb-4">
          <PointsRow label="Correct bracket pairing" value={s.bonus_correct_bracket_pairing} />
          <PointsRow label="Correct match winner" value={s.bonus_match_winner_correct} />
        </div>

        <p className="text-xs font-semibold text-neutral-700 uppercase tracking-wide mb-2">Tournament Predictions</p>
        <div className="divide-y divide-neutral-100">
          <PointsRow label="Champion correct" value={s.bonus_champion_correct} />
          <PointsRow label="Runner-up correct" value={s.bonus_second_place_correct} />
          <PointsRow label="Third place correct" value={s.bonus_third_place_correct} />
        </div>

        <div className="mt-4 opacity-40">
          <p className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">
            Coming Soon
          </p>
          <div className="divide-y divide-neutral-100">
            <div className="flex justify-between items-center py-1.5">
              <span className="text-sm text-neutral-400">Best player correct</span>
              <span className="text-sm font-bold text-neutral-400">{s.bonus_best_player_correct ?? 100} pts</span>
            </div>
            <div className="flex justify-between items-center py-1.5">
              <span className="text-sm text-neutral-400">Top scorer correct</span>
              <span className="text-sm font-bold text-neutral-400">{s.bonus_top_scorer_correct ?? 100} pts</span>
            </div>
          </div>
        </div>
      </Card>

      {/* How Points Work */}
      <Card>
        <h4 className="text-lg font-semibold text-neutral-900 mb-3">How Points Work</h4>
        <div className="space-y-3 text-sm text-neutral-700">
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-success-100 text-success-700 flex items-center justify-center text-xs font-bold">1</span>
            <p><strong>Match Predictions:</strong> Predict the full-time score of every match. The closer your prediction, the more points you earn.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-success-100 text-success-700 flex items-center justify-center text-xs font-bold">2</span>
            <p><strong>Tiered Scoring:</strong> Only the highest tier applies per match &mdash; exact score, correct winner + goal difference, or correct result.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-success-100 text-success-700 flex items-center justify-center text-xs font-bold">3</span>
            <p><strong>Knockout Multipliers:</strong> Later rounds are worth more. The Final has an {s.final_multiplier}x multiplier.</p>
          </div>
          {s.pso_enabled && (
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-success-100 text-success-700 flex items-center justify-center text-xs font-bold">4</span>
              <p><strong>Penalty Shootouts:</strong> If a knockout match goes to penalties, you can earn additional bonus points for predicting the PSO score.</p>
            </div>
          )}
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-success-100 text-success-700 flex items-center justify-center text-xs font-bold">{s.pso_enabled ? '5' : '4'}</span>
            <p><strong>Bonus Points:</strong> Extra points are available for group standings predictions, bracket accuracy, and tournament-level picks (champion, top scorer, etc.).</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
