'use client'

import { Card } from '@/components/ui/Card'

type PoolSettings = {
  group_exact_score: number
  group_correct_difference: number
  group_correct_result: number
  knockout_exact_score: number
  knockout_correct_difference: number
  knockout_correct_result: number
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

const DEFAULTS: PoolSettings = {
  group_exact_score: 100,
  group_correct_difference: 75,
  group_correct_result: 50,
  knockout_exact_score: 200,
  knockout_correct_difference: 150,
  knockout_correct_result: 100,
  round_16_multiplier: 1,
  quarter_final_multiplier: 2,
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

function PointsRow({ label, value, suffix = 'pts' }: { label: string; value: number | null; suffix?: string }) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm font-bold text-gray-900">{value ?? 0} {suffix}</span>
    </div>
  )
}

function MultiplierRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm font-bold text-gray-900">{value}x</span>
    </div>
  )
}

type ScoringRulesTabProps = {
  settings: Record<string, any> | null
}

export function ScoringRulesTab({ settings }: ScoringRulesTabProps) {
  const s: PoolSettings = settings
    ? { ...DEFAULTS, ...settings }
    : DEFAULTS

  const finalExactExample = s.knockout_exact_score * s.final_multiplier

  return (
    <div>
      {/* Group Stage */}
      <Card className="mb-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-1">Group Stage Scoring</h4>
        <p className="text-xs text-gray-500 mb-4">Points awarded for each group stage match prediction.</p>
        <div className="divide-y divide-gray-100">
          <PointsRow label="Exact Score Match" value={s.group_exact_score} />
          <PointsRow label="Correct Winner + Goal Difference" value={s.group_correct_difference} />
          <PointsRow label="Correct Result Only (Win/Draw/Loss)" value={s.group_correct_result} />
        </div>
        <div className="mt-4 bg-blue-50 rounded-lg px-4 py-3">
          <p className="text-xs text-blue-800">
            <strong>How it works:</strong> If the actual score is 2-1, predicting 2-1 earns {s.group_exact_score} pts (exact). Predicting 3-2 earns {s.group_correct_difference} pts (correct winner + goal difference of 1). Predicting 2-0 earns {s.group_correct_result} pts (correct winner only). Only the highest tier applies.
          </p>
        </div>
      </Card>

      {/* Knockout Stage */}
      <Card className="mb-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-1">Knockout Stage Scoring</h4>
        <p className="text-xs text-gray-500 mb-4">Base points for knockout matches, multiplied by the round multiplier below.</p>
        <div className="divide-y divide-gray-100">
          <PointsRow label="Exact Score Match" value={s.knockout_exact_score} />
          <PointsRow label="Correct Winner + Goal Difference" value={s.knockout_correct_difference} />
          <PointsRow label="Correct Result Only" value={s.knockout_correct_result} />
        </div>
      </Card>

      {/* Round Multipliers */}
      <Card className="mb-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-1">Round Multipliers</h4>
        <p className="text-xs text-gray-500 mb-4">Knockout base points are multiplied by these values depending on the round.</p>
        <div className="divide-y divide-gray-100">
          <MultiplierRow label="Round of 16" value={s.round_16_multiplier} />
          <MultiplierRow label="Quarter Finals" value={s.quarter_final_multiplier} />
          <MultiplierRow label="Semi Finals" value={s.semi_final_multiplier} />
          <MultiplierRow label="Third Place Match" value={s.third_place_multiplier} />
          <MultiplierRow label="Final" value={s.final_multiplier} />
        </div>
        <div className="mt-4 bg-blue-50 rounded-lg px-4 py-3">
          <p className="text-xs text-blue-800">
            <strong>Example:</strong> An exact score prediction in the Final earns {s.knockout_exact_score} x {s.final_multiplier} = <strong>{finalExactExample} pts</strong>.
          </p>
        </div>
      </Card>

      {/* Penalty Shootout */}
      <Card className="mb-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-1">Penalty Shootout Scoring</h4>
        {s.pso_enabled ? (
          <>
            <p className="text-xs text-gray-500 mb-4">Bonus points for predicting penalty shootout scores in knockout matches that go to penalties. These are additional to the full-time score points.</p>
            <div className="divide-y divide-gray-100">
              <PointsRow label="Exact PSO Score" value={s.pso_exact_score} />
              <PointsRow label="Correct PSO Winner + Goal Difference" value={s.pso_correct_difference} />
              <PointsRow label="Correct PSO Winner Only" value={s.pso_correct_result} />
            </div>
          </>
        ) : (
          <p className="text-sm text-gray-500 mt-2 italic">Penalty shootout scoring is disabled for this pool.</p>
        )}
      </Card>

      {/* Group Standings Bonus */}
      <Card className="mb-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-1">Group Standings Bonus</h4>
        <p className="text-xs text-gray-500 mb-4">Bonus points for correctly predicting which teams finish 1st and 2nd in each group.</p>

        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Per-Group Bonuses</p>
        <div className="divide-y divide-gray-100 mb-4">
          <PointsRow label="Correct Winner AND Runner-up" value={s.bonus_group_winner_and_runnerup} />
          <PointsRow label="Correct Group Winner only" value={s.bonus_group_winner_only} />
          <PointsRow label="Correct Runner-up only" value={s.bonus_group_runnerup_only} />
          <PointsRow label="Both qualify but positions swapped" value={s.bonus_both_qualify_swapped} />
          <PointsRow label="One qualifies but wrong position" value={s.bonus_one_qualifies_wrong_position} />
        </div>

        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Overall Qualification Bonus</p>
        <p className="text-xs text-gray-500 mb-2">Awarded once when all 48 group matches are completed, based on how many of the 32 qualifying teams were predicted correctly.</p>
        <div className="divide-y divide-gray-100">
          <PointsRow label="All qualified teams correct" value={s.bonus_all_16_qualified} />
          <PointsRow label="75%+ qualified teams correct" value={s.bonus_12_15_qualified} />
          <PointsRow label="50%+ qualified teams correct" value={s.bonus_8_11_qualified} />
        </div>
      </Card>

      {/* Knockout & Tournament Bonus */}
      <Card className="mb-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-1">Knockout & Tournament Bonus</h4>
        <p className="text-xs text-gray-500 mb-4">Bonus points for bracket and tournament-level predictions.</p>

        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Bracket Bonus</p>
        <div className="divide-y divide-gray-100 mb-4">
          <PointsRow label="Correct bracket pairing" value={s.bonus_correct_bracket_pairing} />
          <PointsRow label="Correct match winner" value={s.bonus_match_winner_correct} />
        </div>

        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">Tournament Predictions</p>
        <div className="divide-y divide-gray-100">
          <PointsRow label="Champion correct" value={s.bonus_champion_correct} />
          <PointsRow label="Runner-up correct" value={s.bonus_second_place_correct} />
          <PointsRow label="Third place correct" value={s.bonus_third_place_correct} />
        </div>

        <div className="mt-4 opacity-40">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            Coming Soon
          </p>
          <div className="divide-y divide-gray-100">
            <div className="flex justify-between items-center py-1.5">
              <span className="text-sm text-gray-400">Best player correct</span>
              <span className="text-sm font-bold text-gray-400">{s.bonus_best_player_correct ?? 100} pts</span>
            </div>
            <div className="flex justify-between items-center py-1.5">
              <span className="text-sm text-gray-400">Top scorer correct</span>
              <span className="text-sm font-bold text-gray-400">{s.bonus_top_scorer_correct ?? 100} pts</span>
            </div>
          </div>
        </div>
      </Card>

      {/* How Points Work */}
      <Card>
        <h4 className="text-lg font-semibold text-gray-900 mb-3">How Points Work</h4>
        <div className="space-y-3 text-sm text-gray-700">
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">1</span>
            <p><strong>Match Predictions:</strong> Predict the full-time score of every match. The closer your prediction, the more points you earn.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">2</span>
            <p><strong>Tiered Scoring:</strong> Only the highest tier applies per match &mdash; exact score, correct winner + goal difference, or correct result.</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">3</span>
            <p><strong>Knockout Multipliers:</strong> Later rounds are worth more. The Final has an {s.final_multiplier}x multiplier.</p>
          </div>
          {s.pso_enabled && (
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">4</span>
              <p><strong>Penalty Shootouts:</strong> If a knockout match goes to penalties, you can earn additional bonus points for predicting the PSO score.</p>
            </div>
          )}
          <div className="flex items-start gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">{s.pso_enabled ? '5' : '4'}</span>
            <p><strong>Bonus Points:</strong> Extra points are available for group standings predictions, bracket accuracy, and tournament-level picks (champion, top scorer, etc.).</p>
          </div>
        </div>
      </Card>
    </div>
  )
}
