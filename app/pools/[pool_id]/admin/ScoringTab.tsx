'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PoolData, SettingsData, MatchData, MemberData } from '../types'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'

type ScoringTabProps = {
  pool: PoolData
  settings: SettingsData | null
  setSettings: (settings: SettingsData | null) => void
  matches: MatchData[]
  members: MemberData[]
  setMembers: (members: MemberData[]) => void
}

const DEFAULTS = {
  group_exact_score: 5,
  group_correct_difference: 3,
  group_correct_result: 1,
  knockout_exact_score: 5,
  knockout_correct_difference: 3,
  knockout_correct_result: 1,
  round_16_multiplier: 1,
  quarter_final_multiplier: 1.5,
  semi_final_multiplier: 2,
  third_place_multiplier: 1.5,
  final_multiplier: 3,
  pso_enabled: true,
  pso_exact_score: 100,
  pso_correct_difference: 75,
  pso_correct_result: 50,
  // Bonus: Group Standings
  bonus_group_winner_and_runnerup: 150,
  bonus_group_winner_only: 100,
  bonus_group_runnerup_only: 50,
  bonus_both_qualify_swapped: 75,
  bonus_one_qualifies_wrong_position: 25,
  // Bonus: Overall Qualification
  bonus_all_16_qualified: 75,
  bonus_12_15_qualified: 50,
  bonus_8_11_qualified: 25,
  // Bonus: Bracket & Tournament
  bonus_correct_bracket_pairing: 25,
  bonus_match_winner_correct: 50,
  bonus_champion_correct: 1000,
  bonus_second_place_correct: 25,
  bonus_third_place_correct: 25,
  bonus_best_player_correct: 100,
  bonus_top_scorer_correct: 100,
}

export function ScoringTab({
  pool,
  settings,
  setSettings,
  matches,
  members,
  setMembers,
}: ScoringTabProps) {
  const supabase = createClient()

  // Form state
  const [groupExact, setGroupExact] = useState(
    settings?.group_exact_score ?? DEFAULTS.group_exact_score
  )
  const [groupDiff, setGroupDiff] = useState(
    settings?.group_correct_difference ?? DEFAULTS.group_correct_difference
  )
  const [groupResult, setGroupResult] = useState(
    settings?.group_correct_result ?? DEFAULTS.group_correct_result
  )
  const [koExact, setKoExact] = useState(
    settings?.knockout_exact_score ?? DEFAULTS.knockout_exact_score
  )
  const [koDiff, setKoDiff] = useState(
    settings?.knockout_correct_difference ?? DEFAULTS.knockout_correct_difference
  )
  const [koResult, setKoResult] = useState(
    settings?.knockout_correct_result ?? DEFAULTS.knockout_correct_result
  )
  const [r16Mult, setR16Mult] = useState(
    settings?.round_16_multiplier ?? DEFAULTS.round_16_multiplier
  )
  const [qfMult, setQfMult] = useState(
    settings?.quarter_final_multiplier ?? DEFAULTS.quarter_final_multiplier
  )
  const [sfMult, setSfMult] = useState(
    settings?.semi_final_multiplier ?? DEFAULTS.semi_final_multiplier
  )
  const [tpMult, setTpMult] = useState(
    settings?.third_place_multiplier ?? DEFAULTS.third_place_multiplier
  )
  const [finalMult, setFinalMult] = useState(
    settings?.final_multiplier ?? DEFAULTS.final_multiplier
  )

  // PSO state
  const [psoEnabled, setPsoEnabled] = useState(
    settings?.pso_enabled ?? DEFAULTS.pso_enabled
  )
  const [psoExact, setPsoExact] = useState(
    settings?.pso_exact_score ?? DEFAULTS.pso_exact_score
  )
  const [psoDiff, setPsoDiff] = useState(
    settings?.pso_correct_difference ?? DEFAULTS.pso_correct_difference
  )
  const [psoResult, setPsoResult] = useState(
    settings?.pso_correct_result ?? DEFAULTS.pso_correct_result
  )

  // Bonus: Group Standings state
  const [bonusGroupWinnerAndRunnerup, setBonusGroupWinnerAndRunnerup] = useState(
    settings?.bonus_group_winner_and_runnerup ?? DEFAULTS.bonus_group_winner_and_runnerup
  )
  const [bonusGroupWinnerOnly, setBonusGroupWinnerOnly] = useState(
    settings?.bonus_group_winner_only ?? DEFAULTS.bonus_group_winner_only
  )
  const [bonusGroupRunnerupOnly, setBonusGroupRunnerupOnly] = useState(
    settings?.bonus_group_runnerup_only ?? DEFAULTS.bonus_group_runnerup_only
  )
  const [bonusBothQualifySwapped, setBonusBothQualifySwapped] = useState(
    settings?.bonus_both_qualify_swapped ?? DEFAULTS.bonus_both_qualify_swapped
  )
  const [bonusOneQualifiesWrongPos, setBonusOneQualifiesWrongPos] = useState(
    settings?.bonus_one_qualifies_wrong_position ?? DEFAULTS.bonus_one_qualifies_wrong_position
  )

  // Bonus: Overall Qualification state
  const [bonusAllQualified, setBonusAllQualified] = useState(
    settings?.bonus_all_16_qualified ?? DEFAULTS.bonus_all_16_qualified
  )
  const [bonus75PctQualified, setBonus75PctQualified] = useState(
    settings?.bonus_12_15_qualified ?? DEFAULTS.bonus_12_15_qualified
  )
  const [bonus50PctQualified, setBonus50PctQualified] = useState(
    settings?.bonus_8_11_qualified ?? DEFAULTS.bonus_8_11_qualified
  )

  // Bonus: Bracket & Tournament state
  const [bonusBracketPairing, setBonusBracketPairing] = useState(
    settings?.bonus_correct_bracket_pairing ?? DEFAULTS.bonus_correct_bracket_pairing
  )
  const [bonusMatchWinner, setBonusMatchWinner] = useState(
    settings?.bonus_match_winner_correct ?? DEFAULTS.bonus_match_winner_correct
  )
  const [bonusChampion, setBonusChampion] = useState(
    settings?.bonus_champion_correct ?? DEFAULTS.bonus_champion_correct
  )
  const [bonusSecondPlace, setBonusSecondPlace] = useState(
    settings?.bonus_second_place_correct ?? DEFAULTS.bonus_second_place_correct
  )
  const [bonusThirdPlace, setBonusThirdPlace] = useState(
    settings?.bonus_third_place_correct ?? DEFAULTS.bonus_third_place_correct
  )

  // UI state
  const [saving, setSaving] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [recalculatingBonus, setRecalculatingBonus] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [expandGroup, setExpandGroup] = useState(true)
  const [expandKnockout, setExpandKnockout] = useState(true)
  const [expandMultipliers, setExpandMultipliers] = useState(true)
  const [expandPso, setExpandPso] = useState(true)
  const [expandBonusGroup, setExpandBonusGroup] = useState(true)
  const [expandBonusQualification, setExpandBonusQualification] = useState(true)
  const [expandBonusKnockout, setExpandBonusKnockout] = useState(true)

  const completedMatchCount = matches.filter((m) => m.is_completed).length
  const memberCount = members.length

  // Validation
  const groupWarning =
    groupExact < groupDiff || groupDiff < groupResult
      ? 'Exact Score should be >= Winner+GD >= Winner Only'
      : null
  const koWarning =
    koExact < koDiff || koDiff < koResult
      ? 'Exact Score should be >= Winner+GD >= Winner Only'
      : null
  const multiplierWarning =
    r16Mult <= 0 || qfMult <= 0 || sfMult <= 0 || tpMult <= 0 || finalMult <= 0
      ? 'Multipliers must be positive'
      : null
  const psoWarning =
    psoEnabled && (psoExact < psoDiff || psoDiff < psoResult)
      ? 'Exact Score should be >= Winner+GD >= Winner Only'
      : null

  function resetDefaults() {
    setGroupExact(DEFAULTS.group_exact_score)
    setGroupDiff(DEFAULTS.group_correct_difference)
    setGroupResult(DEFAULTS.group_correct_result)
    setKoExact(DEFAULTS.knockout_exact_score)
    setKoDiff(DEFAULTS.knockout_correct_difference)
    setKoResult(DEFAULTS.knockout_correct_result)
    setR16Mult(DEFAULTS.round_16_multiplier)
    setQfMult(DEFAULTS.quarter_final_multiplier)
    setSfMult(DEFAULTS.semi_final_multiplier)
    setTpMult(DEFAULTS.third_place_multiplier)
    setFinalMult(DEFAULTS.final_multiplier)
    setPsoEnabled(DEFAULTS.pso_enabled)
    setPsoExact(DEFAULTS.pso_exact_score)
    setPsoDiff(DEFAULTS.pso_correct_difference)
    setPsoResult(DEFAULTS.pso_correct_result)
    // Bonus
    setBonusGroupWinnerAndRunnerup(DEFAULTS.bonus_group_winner_and_runnerup)
    setBonusGroupWinnerOnly(DEFAULTS.bonus_group_winner_only)
    setBonusGroupRunnerupOnly(DEFAULTS.bonus_group_runnerup_only)
    setBonusBothQualifySwapped(DEFAULTS.bonus_both_qualify_swapped)
    setBonusOneQualifiesWrongPos(DEFAULTS.bonus_one_qualifies_wrong_position)
    setBonusAllQualified(DEFAULTS.bonus_all_16_qualified)
    setBonus75PctQualified(DEFAULTS.bonus_12_15_qualified)
    setBonus50PctQualified(DEFAULTS.bonus_8_11_qualified)
    setBonusBracketPairing(DEFAULTS.bonus_correct_bracket_pairing)
    setBonusMatchWinner(DEFAULTS.bonus_match_winner_correct)
    setBonusChampion(DEFAULTS.bonus_champion_correct)
    setBonusSecondPlace(DEFAULTS.bonus_second_place_correct)
    setBonusThirdPlace(DEFAULTS.bonus_third_place_correct)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSuccess(null)

    const updateData = {
      group_exact_score: groupExact,
      group_correct_difference: groupDiff,
      group_correct_result: groupResult,
      knockout_exact_score: koExact,
      knockout_correct_difference: koDiff,
      knockout_correct_result: koResult,
      round_16_multiplier: r16Mult,
      quarter_final_multiplier: qfMult,
      semi_final_multiplier: sfMult,
      third_place_multiplier: tpMult,
      final_multiplier: finalMult,
      pso_enabled: psoEnabled,
      pso_exact_score: psoExact,
      pso_correct_difference: psoDiff,
      pso_correct_result: psoResult,
      // Bonus fields
      bonus_group_winner_and_runnerup: bonusGroupWinnerAndRunnerup,
      bonus_group_winner_only: bonusGroupWinnerOnly,
      bonus_group_runnerup_only: bonusGroupRunnerupOnly,
      bonus_both_qualify_swapped: bonusBothQualifySwapped,
      bonus_one_qualifies_wrong_position: bonusOneQualifiesWrongPos,
      bonus_all_16_qualified: bonusAllQualified,
      bonus_12_15_qualified: bonus75PctQualified,
      bonus_8_11_qualified: bonus50PctQualified,
      bonus_correct_bracket_pairing: bonusBracketPairing,
      bonus_match_winner_correct: bonusMatchWinner,
      bonus_champion_correct: bonusChampion,
      bonus_second_place_correct: bonusSecondPlace,
      bonus_third_place_correct: bonusThirdPlace,
      updated_at: new Date().toISOString(),
    }

    const { error: updateError } = await supabase
      .from('pool_settings')
      .update(updateData)
      .eq('pool_id', pool.pool_id)

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      setShowConfirm(false)
      return
    }

    // Call recalculate function
    const { error: rpcError } = await supabase.rpc(
      'recalculate_all_pool_points',
      { pool_id_param: pool.pool_id }
    )

    if (rpcError) {
      setError('Settings saved but recalculation failed: ' + rpcError.message)
      setSaving(false)
      setShowConfirm(false)
      return
    }

    // Refresh settings
    const { data: newSettings } = await supabase
      .from('pool_settings')
      .select('*')
      .eq('pool_id', pool.pool_id)
      .single()

    if (newSettings) setSettings(newSettings as SettingsData)

    // Refresh members for updated points
    const { data: refreshedMembers } = await supabase
      .from('pool_members')
      .select('*, users!inner(user_id, username, full_name, email)')
      .eq('pool_id', pool.pool_id)
      .order('current_rank', { ascending: true, nullsFirst: false })

    if (refreshedMembers) setMembers(refreshedMembers as MemberData[])

    setSuccess('Scoring updated. Points recalculated for all members.')
    setSaving(false)
    setShowConfirm(false)
  }

  async function handleManualRecalculate() {
    setRecalculating(true)
    setError(null)
    setSuccess(null)

    const { error: rpcError } = await supabase.rpc(
      'recalculate_all_pool_points',
      { pool_id_param: pool.pool_id }
    )

    if (rpcError) {
      setError('Recalculation failed: ' + rpcError.message)
      setRecalculating(false)
      return
    }

    // Refresh members
    const { data: refreshedMembers } = await supabase
      .from('pool_members')
      .select('*, users!inner(user_id, username, full_name, email)')
      .eq('pool_id', pool.pool_id)
      .order('current_rank', { ascending: true, nullsFirst: false })

    if (refreshedMembers) setMembers(refreshedMembers as MemberData[])

    setSuccess('Points recalculated successfully.')
    setRecalculating(false)
  }

  async function handleRecalculateBonus() {
    setRecalculatingBonus(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch(`/api/pools/${pool.pool_id}/bonus/calculate`, {
        method: 'POST',
      })

      if (!res.ok) {
        const data = await res.json()
        setError('Bonus recalculation failed: ' + (data.error || res.statusText))
        setRecalculatingBonus(false)
        return
      }

      const data = await res.json()

      // Refresh members
      const { data: refreshedMembers } = await supabase
        .from('pool_members')
        .select('*, users!inner(user_id, username, full_name, email)')
        .eq('pool_id', pool.pool_id)
        .order('current_rank', { ascending: true, nullsFirst: false })

      if (refreshedMembers) setMembers(refreshedMembers as MemberData[])

      setSuccess(
        `Bonus points recalculated: ${data.membersProcessed} members, ${data.totalBonusEntries} bonuses (${data.totalBonusPoints} total bonus points).`
      )
    } catch (err: any) {
      setError('Bonus recalculation failed: ' + (err.message || 'Network error'))
    }

    setRecalculatingBonus(false)
  }

  function SliderInput({
    label,
    value,
    onChange,
    min = 0,
    max = 10,
    step = 1,
    suffix = 'points',
  }: {
    label: string
    value: number
    onChange: (v: number) => void
    min?: number
    max?: number
    step?: number
    suffix?: string
  }) {
    return (
      <div>
        <label className="text-sm text-neutral-700 block mb-1.5 sm:hidden">{label}</label>
        <div className="flex items-center gap-3 sm:gap-4">
          <label className="text-sm text-neutral-700 w-52 shrink-0 hidden sm:block">{label}</label>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="flex-1 h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-primary-600 min-w-0"
          />
          <div className="flex items-center gap-1.5 shrink-0">
            <input
              type="number"
              min={min}
              max={max}
              step={step}
              inputMode="decimal"
              value={value}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v)))
              }}
              className="w-14 sm:w-16 h-8 text-center text-sm font-bold border border-neutral-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent text-neutral-900"
            />
            <span className="text-xs text-neutral-600 w-10">{suffix}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-neutral-900 mb-6">
        Scoring Configuration
      </h2>

      {error && <Alert variant="error" className="mb-4">{error}</Alert>}
      {success && <Alert variant="success" className="mb-4">{success}</Alert>}

      {/* Current scoring display */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card>
          <h3 className="font-semibold text-neutral-900 mb-3">
            Group Stage Scoring
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-600">🎯 Exact Score</span>
              <span className="font-bold text-neutral-900">{groupExact} points</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-600">✓ Correct Winner + GD</span>
              <span className="font-bold text-neutral-900">{groupDiff} points</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-600">✓ Correct Winner Only</span>
              <span className="font-bold text-neutral-900">{groupResult} point{groupResult !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold text-neutral-900 mb-3">
            Knockout Stage Scoring
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-600">🎯 Exact Score</span>
              <span className="font-bold text-neutral-900">{koExact} points</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-600">✓ Correct Winner + GD</span>
              <span className="font-bold text-neutral-900">{koDiff} points</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-600">✓ Correct Winner Only</span>
              <span className="font-bold text-neutral-900">{koResult} point{koResult !== 1 ? 's' : ''}</span>
            </div>
            <hr className="my-2" />
            <p className="text-xs text-neutral-600 font-medium mb-1">Stage Multipliers:</p>
            <div className="flex justify-between">
              <span className="text-neutral-600">Round of 16</span>
              <span className="font-bold text-neutral-900">{r16Mult}x</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-600">Quarter Final</span>
              <span className="font-bold text-neutral-900">{qfMult}x</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-600">Semi Final</span>
              <span className="font-bold text-neutral-900">{sfMult}x</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-600">Third Place</span>
              <span className="font-bold text-neutral-900">{tpMult}x</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-600">Final</span>
              <span className="font-bold text-neutral-900">{finalMult}x</span>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold text-neutral-900 mb-3">
            Penalty Shootout
          </h3>
          {psoEnabled ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-600">🎯 Exact PSO Score</span>
                <span className="font-bold text-neutral-900">{psoExact} points</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">✓ Correct Winner + GD</span>
                <span className="font-bold text-neutral-900">{psoDiff} points</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-600">✓ Correct Winner Only</span>
                <span className="font-bold text-neutral-900">{psoResult} point{psoResult !== 1 ? 's' : ''}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-neutral-500 italic">Disabled</p>
          )}
        </Card>
      </div>

      {/* Edit Scoring Form */}
      <Card className="mb-6">
        <h3 className="text-lg font-semibold text-neutral-900 mb-4">
          Edit Scoring Rules
        </h3>

        {/* Group Stage */}
        <div className="mb-6">
          <button
            onClick={() => setExpandGroup(!expandGroup)}
            className="flex items-center gap-2 text-sm font-semibold text-neutral-800 mb-3 hover:text-primary-600"
          >
            <span>{expandGroup ? '▼' : '▶'}</span>
            Group Stage Points
          </button>
          {expandGroup && (
            <div className="space-y-4 pl-4">
              <SliderInput
                label="Exact Score Match:"
                value={groupExact}
                onChange={setGroupExact}
                min={5}
                max={100}
                step={5}
              />
              <SliderInput
                label="Correct Winner + Goal Difference:"
                value={groupDiff}
                onChange={setGroupDiff}
                min={5}
                max={100}
                step={5}
              />
              <SliderInput
                label="Correct Winner Only:"
                value={groupResult}
                onChange={setGroupResult}
                min={5}
                max={100}
                step={5}
              />
              {groupWarning && (
                <p className="text-sm text-warning-500">{groupWarning}</p>
              )}
            </div>
          )}
        </div>

        {/* Knockout Stage */}
        <div className="mb-6">
          <button
            onClick={() => setExpandKnockout(!expandKnockout)}
            className="flex items-center gap-2 text-sm font-semibold text-neutral-800 mb-3 hover:text-primary-600"
          >
            <span>{expandKnockout ? '▼' : '▶'}</span>
            Knockout Stage Points (Base Values)
          </button>
          {expandKnockout && (
            <div className="space-y-4 pl-4">
              <SliderInput
                label="Exact Score Match:"
                value={koExact}
                onChange={setKoExact}
                min={5}
                max={200}
                step={5}
              />
              <SliderInput
                label="Correct Winner + Goal Difference:"
                value={koDiff}
                onChange={setKoDiff}
                min={5}
                max={200}
                step={5}
              />
              <SliderInput
                label="Correct Winner Only:"
                value={koResult}
                onChange={setKoResult}
                min={5}
                max={200}
                step={5}
              />
              {koWarning && (
                <p className="text-sm text-warning-500">{koWarning}</p>
              )}
            </div>
          )}
        </div>

        {/* Multipliers */}
        <div className="mb-6">
          <button
            onClick={() => setExpandMultipliers(!expandMultipliers)}
            className="flex items-center gap-2 text-sm font-semibold text-neutral-800 mb-3 hover:text-primary-600"
          >
            <span>{expandMultipliers ? '▼' : '▶'}</span>
            Knockout Stage Multipliers
          </button>
          {expandMultipliers && (
            <div className="space-y-4 pl-4">
              <SliderInput
                label="Round of 16:"
                value={r16Mult}
                onChange={setR16Mult}
                min={0.5}
                max={5}
                step={0.5}
                suffix="x"
              />
              <SliderInput
                label="Quarter Final:"
                value={qfMult}
                onChange={setQfMult}
                min={0.5}
                max={5}
                step={0.5}
                suffix="x"
              />
              <SliderInput
                label="Semi Final:"
                value={sfMult}
                onChange={setSfMult}
                min={0.5}
                max={5}
                step={0.5}
                suffix="x"
              />
              <SliderInput
                label="Third Place:"
                value={tpMult}
                onChange={setTpMult}
                min={0.5}
                max={5}
                step={0.5}
                suffix="x"
              />
              <SliderInput
                label="Final:"
                value={finalMult}
                onChange={setFinalMult}
                min={0.5}
                max={5}
                step={0.5}
                suffix="x"
              />
              <p className="text-xs text-neutral-600">
                Example: {koExact} points (exact) x {finalMult} (final) ={' '}
                {koExact * finalMult} points
              </p>
              {multiplierWarning && (
                <p className="text-sm text-danger-500">{multiplierWarning}</p>
              )}
            </div>
          )}
        </div>

        {/* Penalty Shootout Scoring */}
        <div className="mb-6">
          <button
            onClick={() => setExpandPso(!expandPso)}
            className="flex items-center gap-2 text-sm font-semibold text-neutral-800 mb-3 hover:text-primary-600"
          >
            <span>{expandPso ? '▼' : '▶'}</span>
            Penalty Shootout Scoring
          </button>
          {expandPso && (
            <div className="space-y-4 pl-4">
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={psoEnabled}
                    onChange={(e) => setPsoEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-neutral-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary-600"></div>
                </label>
                <span className="text-sm text-neutral-700">
                  Enable penalty shootout scoring
                </span>
              </div>
              <p className="text-xs text-neutral-600">
                When enabled, bonus points are awarded for predicting the penalty shootout score in knockout matches that go to penalties.
              </p>
              <div className={psoEnabled ? '' : 'opacity-40 pointer-events-none'}>
                <SliderInput
                  label="Exact PSO Score:"
                  value={psoExact}
                  onChange={setPsoExact}
                  min={5}
                  max={200}
                  step={5}
                />
                <div className="mt-4">
                  <SliderInput
                    label="Correct Winner + GD:"
                    value={psoDiff}
                    onChange={setPsoDiff}
                    min={5}
                    max={200}
                    step={5}
                  />
                </div>
                <div className="mt-4">
                  <SliderInput
                    label="Correct Winner Only:"
                    value={psoResult}
                    onChange={setPsoResult}
                    min={5}
                    max={200}
                    step={5}
                  />
                </div>
              </div>
              {psoWarning && (
                <p className="text-sm text-warning-500">{psoWarning}</p>
              )}
            </div>
          )}
        </div>

        {/* Bonus: Group Standings */}
        <div className="mb-6">
          <button
            onClick={() => setExpandBonusGroup(!expandBonusGroup)}
            className="flex items-center gap-2 text-sm font-semibold text-neutral-800 mb-3 hover:text-primary-600"
          >
            <span>{expandBonusGroup ? '▼' : '▶'}</span>
            Bonus: Group Standings
          </button>
          {expandBonusGroup && (
            <div className="space-y-4 pl-4">
              <p className="text-xs text-neutral-600">
                Awarded per group when all group matches are completed. Compares predicted group standings (derived from match predictions) against actual results.
              </p>
              <SliderInput
                label="Winner AND Runner-up correct:"
                value={bonusGroupWinnerAndRunnerup}
                onChange={setBonusGroupWinnerAndRunnerup}
                min={0}
                max={500}
                step={25}
              />
              <SliderInput
                label="Winner only correct:"
                value={bonusGroupWinnerOnly}
                onChange={setBonusGroupWinnerOnly}
                min={0}
                max={500}
                step={25}
              />
              <SliderInput
                label="Both qualify, positions swapped:"
                value={bonusBothQualifySwapped}
                onChange={setBonusBothQualifySwapped}
                min={0}
                max={500}
                step={25}
              />
              <SliderInput
                label="Runner-up only correct:"
                value={bonusGroupRunnerupOnly}
                onChange={setBonusGroupRunnerupOnly}
                min={0}
                max={500}
                step={25}
              />
              <SliderInput
                label="One qualifies, wrong position:"
                value={bonusOneQualifiesWrongPos}
                onChange={setBonusOneQualifiesWrongPos}
                min={0}
                max={500}
                step={25}
              />
            </div>
          )}
        </div>

        {/* Bonus: Overall Qualification */}
        <div className="mb-6">
          <button
            onClick={() => setExpandBonusQualification(!expandBonusQualification)}
            className="flex items-center gap-2 text-sm font-semibold text-neutral-800 mb-3 hover:text-primary-600"
          >
            <span>{expandBonusQualification ? '▼' : '▶'}</span>
            Bonus: Overall Qualification
          </button>
          {expandBonusQualification && (
            <div className="space-y-4 pl-4">
              <p className="text-xs text-neutral-600">
                Awarded once when all 48 group matches are completed. Based on how many of the 32 qualifying teams were predicted correctly.
              </p>
              <SliderInput
                label="All qualified teams correct:"
                value={bonusAllQualified}
                onChange={setBonusAllQualified}
                min={0}
                max={500}
                step={25}
              />
              <SliderInput
                label="75%+ qualified correct:"
                value={bonus75PctQualified}
                onChange={setBonus75PctQualified}
                min={0}
                max={500}
                step={25}
              />
              <SliderInput
                label="50%+ qualified correct:"
                value={bonus50PctQualified}
                onChange={setBonus50PctQualified}
                min={0}
                max={500}
                step={25}
              />
            </div>
          )}
        </div>

        {/* Bonus: Knockout & Tournament */}
        <div className="mb-6">
          <button
            onClick={() => setExpandBonusKnockout(!expandBonusKnockout)}
            className="flex items-center gap-2 text-sm font-semibold text-neutral-800 mb-3 hover:text-primary-600"
          >
            <span>{expandBonusKnockout ? '▼' : '▶'}</span>
            Bonus: Knockout &amp; Tournament
          </button>
          {expandBonusKnockout && (
            <div className="space-y-4 pl-4">
              <p className="text-xs text-neutral-600">
                Bracket pairing and match winner bonuses are awarded as knockout matches are played. Podium bonuses are awarded when the tournament champion, runner-up, and third place are confirmed.
              </p>
              <SliderInput
                label="Correct R32 bracket pairing:"
                value={bonusBracketPairing}
                onChange={setBonusBracketPairing}
                min={0}
                max={500}
                step={25}
              />
              <SliderInput
                label="Correct knockout match winner:"
                value={bonusMatchWinner}
                onChange={setBonusMatchWinner}
                min={0}
                max={500}
                step={25}
              />
              <SliderInput
                label="Champion correct:"
                value={bonusChampion}
                onChange={setBonusChampion}
                min={0}
                max={2000}
                step={50}
              />
              <SliderInput
                label="Runner-up correct:"
                value={bonusSecondPlace}
                onChange={setBonusSecondPlace}
                min={0}
                max={500}
                step={25}
              />
              <SliderInput
                label="Third place correct:"
                value={bonusThirdPlace}
                onChange={setBonusThirdPlace}
                min={0}
                max={500}
                step={25}
              />
            </div>
          )}
        </div>

        {/* Coming Soon — Best Player & Top Scorer */}
        <div className="mb-6 border border-neutral-200 rounded-lg px-4 py-3 bg-neutral-50">
          <p className="text-sm font-semibold text-neutral-400">
            Bonus: Best Player &amp; Top Scorer
            <span className="ml-2 inline-block px-2 py-0.5 text-xs bg-neutral-200 text-neutral-500 rounded-full">
              Coming Soon
            </span>
          </p>
          <div className="mt-2 space-y-2 opacity-40 pointer-events-none">
            <div className="flex items-center gap-3">
              <span className="text-sm text-neutral-500 w-52 shrink-0">Best Player correct:</span>
              <span className="text-sm font-bold text-neutral-400">100 points</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-neutral-500 w-52 shrink-0">Top Scorer correct:</span>
              <span className="text-sm font-bold text-neutral-400">100 points</span>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
          <Button variant="gray" onClick={resetDefaults}>
            Reset to Defaults
          </Button>
          <Button variant="green" onClick={() => setShowConfirm(true)}>
            Save Changes
          </Button>
        </div>
      </Card>

      {/* Manual Recalculation */}
      <Card>
        <h3 className="text-lg font-semibold text-neutral-900 mb-2">
          Manual Recalculation
        </h3>
        <p className="text-sm text-neutral-600 mb-4">
          If points seem incorrect, you can manually recalculate all points
          using current rules.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="outline"
            onClick={handleManualRecalculate}
            loading={recalculating}
            loadingText="Recalculating..."
          >
            Recalculate Match Points
          </Button>
          <Button
            variant="outline"
            onClick={handleRecalculateBonus}
            loading={recalculatingBonus}
            loadingText="Recalculating Bonus..."
          >
            Recalculate Bonus Points
          </Button>
        </div>
      </Card>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
          <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl sm:max-w-md w-full sm:mx-4 p-4 sm:p-6">
            <h3 className="text-lg font-bold text-neutral-900 mb-3">
              Confirm Scoring Changes
            </h3>
            <p className="text-sm text-neutral-600 mb-4">
              You are about to change the scoring system. This will:
            </p>
            <ul className="text-sm text-neutral-600 space-y-1 mb-4 list-disc pl-5">
              <li>Update scoring and bonus point values</li>
              <li>Recalculate match points for ALL members</li>
              <li>Update leaderboard rankings</li>
            </ul>
            <p className="text-xs text-neutral-500 mb-4">
              Note: Use "Recalculate Bonus Points" separately to update bonus scores with new values.
            </p>
            <p className="text-sm text-neutral-600 mb-2">
              Affected matches: {completedMatchCount} completed matches
            </p>
            <p className="text-sm text-neutral-600 mb-4">
              Affected members: {memberCount} members
            </p>
            <p className="text-sm text-warning-500 font-medium mb-4">
              This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                variant="gray"
                onClick={() => setShowConfirm(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button
                variant="green"
                onClick={handleSave}
                loading={saving}
                loadingText="Saving..."
              >
                Confirm &amp; Recalculate
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
