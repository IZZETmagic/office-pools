'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PoolData, SettingsData, MatchData, MemberData } from '../types'
import { Icon } from '@/components/ui/Icon'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { useToast } from '@/components/ui/Toast'

/**
 * One scoring section as its own card. Each section used to be a collapsible
 * block inside a single "Edit Scoring Rules" card, which made the whole tab one
 * long undifferentiated form; on the Settings tab each concern gets its own
 * card, and these are the same kind of thing.
 *
 * The caption doubles as the toggle, so the header rule only appears when the
 * body is open — collapsed, the card is just its title.
 */
function SectionCard({
  title, expanded, onToggle, children,
}: { title: string; expanded: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <Card padding="sm" className="mb-4">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className={`w-full flex items-center gap-2 text-left ${expanded ? 'pb-3 mb-4 border-b border-border-subtle' : ''}`}
      >
        <h3 className="t-section-header text-ink">{title}</h3>
        <Icon
          name="chevron.down"
          size={18}
          className={`ml-auto shrink-0 text-muted transition-transform ${expanded ? '' : '-rotate-90'}`}
        />
      </button>
      {children}
    </Card>
  )
}

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
  round_32_multiplier: 1,
  round_16_multiplier: 2,
  quarter_final_multiplier: 3,
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

const BP_DEFAULTS = {
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

export function ScoringTab({
  pool,
  settings,
  setSettings,
  matches,
  members,
  setMembers,
}: ScoringTabProps) {
  const supabase = createClient()
  const { showToast } = useToast()


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
  const [r32Mult, setR32Mult] = useState(
    settings?.round_32_multiplier ?? DEFAULTS.round_32_multiplier
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

  // Bracket Picker state
  const isBracketPicker = pool.prediction_mode === 'bracket_picker'

  const [bpGroup1st, setBpGroup1st] = useState(
    settings?.bp_group_correct_1st ?? BP_DEFAULTS.bp_group_correct_1st
  )
  const [bpGroup2nd, setBpGroup2nd] = useState(
    settings?.bp_group_correct_2nd ?? BP_DEFAULTS.bp_group_correct_2nd
  )
  const [bpGroup3rd, setBpGroup3rd] = useState(
    settings?.bp_group_correct_3rd ?? BP_DEFAULTS.bp_group_correct_3rd
  )
  const [bpGroup4th, setBpGroup4th] = useState(
    settings?.bp_group_correct_4th ?? BP_DEFAULTS.bp_group_correct_4th
  )
  const [bpThirdQualifier, setBpThirdQualifier] = useState(
    settings?.bp_third_correct_qualifier ?? BP_DEFAULTS.bp_third_correct_qualifier
  )
  const [bpThirdEliminated, setBpThirdEliminated] = useState(
    settings?.bp_third_correct_eliminated ?? BP_DEFAULTS.bp_third_correct_eliminated
  )
  const [bpThirdAllBonus, setBpThirdAllBonus] = useState(
    settings?.bp_third_all_correct_bonus ?? BP_DEFAULTS.bp_third_all_correct_bonus
  )
  const [bpR32, setBpR32] = useState(
    settings?.bp_r32_correct ?? BP_DEFAULTS.bp_r32_correct
  )
  const [bpR16, setBpR16] = useState(
    settings?.bp_r16_correct ?? BP_DEFAULTS.bp_r16_correct
  )
  const [bpQf, setBpQf] = useState(
    settings?.bp_qf_correct ?? BP_DEFAULTS.bp_qf_correct
  )
  const [bpSf, setBpSf] = useState(
    settings?.bp_sf_correct ?? BP_DEFAULTS.bp_sf_correct
  )
  const [bpThirdPlaceMatch, setBpThirdPlaceMatch] = useState(
    settings?.bp_third_place_match_correct ?? BP_DEFAULTS.bp_third_place_match_correct
  )
  const [bpFinal, setBpFinal] = useState(
    settings?.bp_final_correct ?? BP_DEFAULTS.bp_final_correct
  )
  const [bpChampionBonus, setBpChampionBonus] = useState(
    settings?.bp_champion_bonus ?? BP_DEFAULTS.bp_champion_bonus
  )
  const [bpPenaltyCorrect, setBpPenaltyCorrect] = useState(
    settings?.bp_penalty_correct ?? BP_DEFAULTS.bp_penalty_correct
  )

  // Bracket Picker expand states
  const [expandBpGroup, setExpandBpGroup] = useState(true)
  const [expandBpThird, setExpandBpThird] = useState(true)
  const [expandBpKnockout, setExpandBpKnockout] = useState(true)
  const [expandBpBonus, setExpandBpBonus] = useState(true)

  // UI state
  const [saving, setSaving] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [recalculatingBonus, setRecalculatingBonus] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
    if (isBracketPicker) {
      setBpGroup1st(BP_DEFAULTS.bp_group_correct_1st)
      setBpGroup2nd(BP_DEFAULTS.bp_group_correct_2nd)
      setBpGroup3rd(BP_DEFAULTS.bp_group_correct_3rd)
      setBpGroup4th(BP_DEFAULTS.bp_group_correct_4th)
      setBpThirdQualifier(BP_DEFAULTS.bp_third_correct_qualifier)
      setBpThirdEliminated(BP_DEFAULTS.bp_third_correct_eliminated)
      setBpThirdAllBonus(BP_DEFAULTS.bp_third_all_correct_bonus)
      setBpR32(BP_DEFAULTS.bp_r32_correct)
      setBpR16(BP_DEFAULTS.bp_r16_correct)
      setBpQf(BP_DEFAULTS.bp_qf_correct)
      setBpSf(BP_DEFAULTS.bp_sf_correct)
      setBpThirdPlaceMatch(BP_DEFAULTS.bp_third_place_match_correct)
      setBpFinal(BP_DEFAULTS.bp_final_correct)
      setBpChampionBonus(BP_DEFAULTS.bp_champion_bonus)
      setBpPenaltyCorrect(BP_DEFAULTS.bp_penalty_correct)
    } else {
      setGroupExact(DEFAULTS.group_exact_score)
      setGroupDiff(DEFAULTS.group_correct_difference)
      setGroupResult(DEFAULTS.group_correct_result)
      setKoExact(DEFAULTS.knockout_exact_score)
      setKoDiff(DEFAULTS.knockout_correct_difference)
      setKoResult(DEFAULTS.knockout_correct_result)
      setR32Mult(DEFAULTS.round_32_multiplier)
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
  }

  async function handleSave() {
    setSaving(true)
    setError(null)

    const updateData = isBracketPicker
      ? {
          bp_group_correct_1st: bpGroup1st,
          bp_group_correct_2nd: bpGroup2nd,
          bp_group_correct_3rd: bpGroup3rd,
          bp_group_correct_4th: bpGroup4th,
          bp_third_correct_qualifier: bpThirdQualifier,
          bp_third_correct_eliminated: bpThirdEliminated,
          bp_third_all_correct_bonus: bpThirdAllBonus,
          bp_r32_correct: bpR32,
          bp_r16_correct: bpR16,
          bp_qf_correct: bpQf,
          bp_sf_correct: bpSf,
          bp_third_place_match_correct: bpThirdPlaceMatch,
          bp_final_correct: bpFinal,
          bp_champion_bonus: bpChampionBonus,
          bp_penalty_correct: bpPenaltyCorrect,
          updated_at: new Date().toISOString(),
        }
      : {
          group_exact_score: groupExact,
          group_correct_difference: groupDiff,
          group_correct_result: groupResult,
          knockout_exact_score: koExact,
          knockout_correct_difference: koDiff,
          knockout_correct_result: koResult,
          round_32_multiplier: r32Mult,
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

    // Recalculate points
    if (isBracketPicker) {
      // For bracket picker pools, call the BP calculate endpoint
      try {
        const res = await fetch(`/api/pools/${pool.pool_id}/bracket-picks/calculate`, { method: 'POST' })
        if (!res.ok) {
          let errMsg = res.statusText
          try { const data = await res.json(); errMsg = data.error || errMsg } catch {}
          setError('Settings saved but recalculation failed: ' + errMsg)
          setSaving(false)
          setShowConfirm(false)
          return
        }
      } catch (err: any) {
        setError('Settings saved but recalculation failed: ' + (err.message || 'Network error'))
        setSaving(false)
        setShowConfirm(false)
        return
      }
    } else {
      // For other modes, call the match points RPC
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

    showToast('Scoring updated. Points recalculated for all members.', 'success')
    setSaving(false)
    setShowConfirm(false)
  }

  async function handleManualRecalculate() {
    setRecalculating(true)
    setError(null)

    if (isBracketPicker) {
      // For bracket picker pools, call the BP calculate endpoint
      try {
        const res = await fetch(`/api/pools/${pool.pool_id}/bracket-picks/calculate`, { method: 'POST' })
        if (!res.ok) {
          let errMsg = res.statusText
          try { const data = await res.json(); errMsg = data.error || errMsg } catch {}
          setError('Recalculation failed: ' + errMsg)
          setRecalculating(false)
          return
        }
        const data = await res.json()
        showToast(
          `Bracket picker points recalculated: ${data.entriesProcessed} entries, ${data.totalBonusEntries} score items (${data.totalBonusPoints} total pts).`,
          'success'
        )
      } catch (err: any) {
        setError('Recalculation failed: ' + (err.message || 'Network error'))
        setRecalculating(false)
        return
      }
    } else {
      const { error: rpcError } = await supabase.rpc(
        'recalculate_all_pool_points',
        { pool_id_param: pool.pool_id }
      )

      if (rpcError) {
        setError('Recalculation failed: ' + rpcError.message)
        setRecalculating(false)
        return
      }
      showToast('Points recalculated successfully.', 'success')
    }

    // Refresh members
    const { data: refreshedMembers } = await supabase
      .from('pool_members')
      .select('*, users!inner(user_id, username, full_name, email)')
      .eq('pool_id', pool.pool_id)
      .order('current_rank', { ascending: true, nullsFirst: false })

    if (refreshedMembers) setMembers(refreshedMembers as MemberData[])

    setRecalculating(false)
  }

  async function handleRecalculateBonus() {
    setRecalculatingBonus(true)
    setError(null)

    const endpoint = isBracketPicker
      ? `/api/pools/${pool.pool_id}/bracket-picks/calculate`
      : `/api/pools/${pool.pool_id}/bonus/calculate`

    try {
      const res = await fetch(endpoint, { method: 'POST' })

      if (!res.ok) {
        let errMsg = res.statusText
        try { const data = await res.json(); errMsg = data.error || errMsg } catch {}
        setError('Bonus recalculation failed: ' + errMsg)
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

      if (isBracketPicker) {
        showToast(
          `Bracket picker points recalculated: ${data.entriesProcessed} entries, ${data.totalBonusEntries} score items (${data.totalBonusPoints} total pts).`,
          'success'
        )
      } else {
        showToast(
          `Bonus points recalculated: ${data.membersProcessed ?? data.entriesProcessed} members, ${data.totalBonusEntries} bonuses (${data.totalBonusPoints} total bonus points).`,
          'success'
        )
      }
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
            className="flex-1 h-2 bg-neutral-200 rounded-xl appearance-none cursor-pointer accent-primary-600 min-w-0"
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
              className="w-14 sm:w-16 h-8 text-center text-sm font-bold border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-neutral-900"
            />
            <span className="text-xs text-neutral-600 w-10">{suffix}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      {error && <Alert variant="error" className="mb-4">{error}</Alert>}

      {isBracketPicker ? (
        <>
            {/* Group Stage Points */}
            <SectionCard
              title="Group Stage Points"
              expanded={expandBpGroup}
              onToggle={() => setExpandBpGroup(!expandBpGroup)}
            >
              {expandBpGroup && (
                <div className="space-y-4 pl-4">
                  <p className="text-xs text-neutral-600">
                    Points awarded for correctly predicting a team's finishing position within their group.
                  </p>
                  <SliderInput
                    label="Correct 1st Place:"
                    value={bpGroup1st}
                    onChange={setBpGroup1st}
                    min={0}
                    max={20}
                    step={1}
                  />
                  <SliderInput
                    label="Correct 2nd Place:"
                    value={bpGroup2nd}
                    onChange={setBpGroup2nd}
                    min={0}
                    max={20}
                    step={1}
                  />
                  <SliderInput
                    label="Correct 3rd Place:"
                    value={bpGroup3rd}
                    onChange={setBpGroup3rd}
                    min={0}
                    max={20}
                    step={1}
                  />
                  <SliderInput
                    label="Correct 4th Place:"
                    value={bpGroup4th}
                    onChange={setBpGroup4th}
                    min={0}
                    max={20}
                    step={1}
                  />
                </div>
              )}
            </SectionCard>

            {/* Third-Place Points */}
            <SectionCard
              title="Third-Place Points"
              expanded={expandBpThird}
              onToggle={() => setExpandBpThird(!expandBpThird)}
            >
              {expandBpThird && (
                <div className="space-y-4 pl-4">
                  <p className="text-xs text-neutral-600">
                    Points for correctly predicting which 3rd-place teams qualify for the knockout stage and which are eliminated.
                  </p>
                  <SliderInput
                    label="Correct Qualifier:"
                    value={bpThirdQualifier}
                    onChange={setBpThirdQualifier}
                    min={0}
                    max={20}
                    step={1}
                  />
                  <SliderInput
                    label="Correct Eliminated:"
                    value={bpThirdEliminated}
                    onChange={setBpThirdEliminated}
                    min={0}
                    max={20}
                    step={1}
                  />
                  <SliderInput
                    label="All 8 Correct Bonus:"
                    value={bpThirdAllBonus}
                    onChange={setBpThirdAllBonus}
                    min={0}
                    max={50}
                    step={1}
                  />
                </div>
              )}
            </SectionCard>

            {/* Knockout Points */}
            <SectionCard
              title="Knockout Points"
              expanded={expandBpKnockout}
              onToggle={() => setExpandBpKnockout(!expandBpKnockout)}
            >
              {expandBpKnockout && (
                <div className="space-y-4 pl-4">
                  <p className="text-xs text-neutral-600">
                    Points for correctly predicting the winner of each knockout match. Higher rounds are worth more.
                  </p>
                  <SliderInput
                    label="Round of 32:"
                    value={bpR32}
                    onChange={setBpR32}
                    min={0}
                    max={50}
                    step={1}
                  />
                  <SliderInput
                    label="Round of 16:"
                    value={bpR16}
                    onChange={setBpR16}
                    min={0}
                    max={50}
                    step={1}
                  />
                  <SliderInput
                    label="Quarter Finals:"
                    value={bpQf}
                    onChange={setBpQf}
                    min={0}
                    max={50}
                    step={1}
                  />
                  <SliderInput
                    label="Semi Finals:"
                    value={bpSf}
                    onChange={setBpSf}
                    min={0}
                    max={50}
                    step={1}
                  />
                  <SliderInput
                    label="3rd Place Match:"
                    value={bpThirdPlaceMatch}
                    onChange={setBpThirdPlaceMatch}
                    min={0}
                    max={50}
                    step={1}
                  />
                  <SliderInput
                    label="Final:"
                    value={bpFinal}
                    onChange={setBpFinal}
                    min={0}
                    max={100}
                    step={1}
                  />
                </div>
              )}
            </SectionCard>

            {/* Bonus Points */}
            <SectionCard
              title="Bonus Points"
              expanded={expandBpBonus}
              onToggle={() => setExpandBpBonus(!expandBpBonus)}
            >
              {expandBpBonus && (
                <div className="space-y-4 pl-4">
                  <SliderInput
                    label="Champion Bonus:"
                    value={bpChampionBonus}
                    onChange={setBpChampionBonus}
                    min={0}
                    max={200}
                    step={5}
                  />
                  <SliderInput
                    label="Correct Penalty Prediction:"
                    value={bpPenaltyCorrect}
                    onChange={setBpPenaltyCorrect}
                    min={0}
                    max={10}
                    step={1}
                  />
                </div>
              )}
            </SectionCard>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3 sm:justify-end mb-6">
              <Button variant="gray" onClick={resetDefaults}>
                Reset to Defaults
              </Button>
              <Button variant="green" onClick={() => setShowConfirm(true)}>
                Save Changes
              </Button>
            </div>
        </>
      ) : (
        <>
            {/* Group Stage */}
            <SectionCard
              title="Group Stage Points"
              expanded={expandGroup}
              onToggle={() => setExpandGroup(!expandGroup)}
            >
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
            </SectionCard>

            {/* Knockout Stage */}
            <SectionCard
              title="Knockout Stage Points (Base Values)"
              expanded={expandKnockout}
              onToggle={() => setExpandKnockout(!expandKnockout)}
            >
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
            </SectionCard>

            {/* Multipliers */}
            <SectionCard
              title="Knockout Stage Multipliers"
              expanded={expandMultipliers}
              onToggle={() => setExpandMultipliers(!expandMultipliers)}
            >
              {expandMultipliers && (
                <div className="space-y-4 pl-4">
                  <SliderInput
                    label="Round of 32:"
                    value={r32Mult}
                    onChange={setR32Mult}
                    min={0.5}
                    max={5}
                    step={0.5}
                    suffix="x"
                  />
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
            </SectionCard>

            {/* Penalty Shootout Scoring */}
            <SectionCard
              title="Penalty Shootout Scoring"
              expanded={expandPso}
              onToggle={() => setExpandPso(!expandPso)}
            >
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
            </SectionCard>

            {/* Bonus: Group Standings */}
            <SectionCard
              title="Bonus: Group Standings"
              expanded={expandBonusGroup}
              onToggle={() => setExpandBonusGroup(!expandBonusGroup)}
            >
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
            </SectionCard>

            {/* Bonus: Overall Qualification */}
            <SectionCard
              title="Bonus: Overall Qualification"
              expanded={expandBonusQualification}
              onToggle={() => setExpandBonusQualification(!expandBonusQualification)}
            >
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
            </SectionCard>

            {/* Bonus: Knockout & Tournament */}
            <SectionCard
              title="Bonus: Knockout &amp; Tournament"
              expanded={expandBonusKnockout}
              onToggle={() => setExpandBonusKnockout(!expandBonusKnockout)}
            >
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
            </SectionCard>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-3 sm:justify-end mb-6">
              <Button variant="gray" onClick={resetDefaults}>
                Reset to Defaults
              </Button>
              <Button variant="green" onClick={() => setShowConfirm(true)}>
                Save Changes
              </Button>
            </div>
        </>
      )}

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
          {isBracketPicker ? (
            <Button
              variant="outline"
              onClick={handleManualRecalculate}
              loading={recalculating}
              loadingText="Recalculating..."
            >
              Recalculate Bracket Picker Points
            </Button>
          ) : (
            <>
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
            </>
          )}
        </div>
      </Card>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
          <div className="bg-surface rounded-t-2xl sm:rounded-2xl shadow-xl sm:max-w-md w-full sm:mx-4 p-4 sm:p-6 dark:shadow-none dark:border dark:border-border-default">
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
