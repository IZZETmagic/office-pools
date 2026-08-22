'use client'

import { useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { PoolData, SettingsData, MatchData, MemberData } from '../types'
import { Icon } from '@/components/ui/Icon'
import { Card } from '@/components/ui/Card'
import { InfoPopover } from '@/components/ui/InfoPopover'
import { fieldHelp } from '@/lib/scoring/fieldHelp'
import { formatNumber } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { useToast } from '@/components/ui/Toast'

/** The pill switch used in section headers. */
function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <span
      role="switch"
      aria-checked={checked}
      aria-label={label}
      tabIndex={0}
      onClick={(e) => { e.stopPropagation(); onChange(!checked) }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onChange(!checked) }
      }}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-pill transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600/40 ${
        checked ? 'bg-primary-600' : 'bg-silver'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-pill bg-white shadow-card transition-transform ${
          checked ? 'translate-x-4' : ''
        }`}
      />
    </span>
  )
}

/**
 * Whether a scoring section is on, and how to turn it off.
 *
 * There is no enabled column for any of these — but the bonus engine already
 * skips anything worth zero (`if (points > 0)` in all five functions in
 * lib/bonusCalculation.ts, and the comment on the bracket-pairing bonus says
 * progressive pools disable it exactly this way). So "off" is a value the
 * engine already understands, and this needs no schema or engine change.
 *
 * Off stashes the current numbers so flicking the switch back restores what was
 * there rather than the defaults. The stash is per-session; a section that
 * loads already zeroed simply reads as off, which is what an admin who turned
 * it off last week should see.
 *
 * `offValue` is 1 for multipliers — zero there would wipe out knockout scoring
 * rather than disable a bonus.
 */
function useToggleGroup(
  fields: [number, (n: number) => void][],
  defaults: number[],
  offValue = 0,
) {
  const stash = useRef<number[] | null>(null)
  const enabled = fields.some(([v]) => v !== offValue)
  const setEnabled = (on: boolean) => {
    if (on) {
      const restore = stash.current
      fields.forEach(([, set], i) => set(restore?.[i] ?? defaults[i]))
    } else {
      stash.current = fields.map(([v]) => v)
      fields.forEach(([, set]) => set(offValue))
    }
  }
  return [enabled, setEnabled] as const
}

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
  title, subtitle, expanded, onToggle, enabled, onEnabledChange, children,
}: {
  title: string
  subtitle?: string
  expanded: boolean
  onToggle: () => void
  /** Omit for a section that is always part of scoring. */
  enabled?: boolean
  onEnabledChange?: (v: boolean) => void
  children: React.ReactNode
}) {
  const optional = enabled !== undefined && onEnabledChange !== undefined
  const open = optional ? expanded && enabled : expanded

  return (
    <Card padding="sm" className="mb-4">
      <div className={`flex items-center gap-3 ${open ? 'pb-3 mb-4 border-b border-border-subtle' : ''}`}>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          disabled={optional && !enabled}
          className="flex-1 min-w-0 flex flex-col text-left disabled:cursor-default"
        >
          <h3 className={`t-section-header ${optional && !enabled ? 'text-muted' : 'text-ink'}`}>{title}</h3>
          {subtitle && <span className="t-body text-muted">{subtitle}</span>}
        </button>

        {optional && (
          <Switch
            checked={enabled}
            label={`${enabled ? 'Disable' : 'Enable'} ${title}`}
            onChange={(on) => {
              onEnabledChange(on)
              // Turning a section on opens it, since the point of turning it on
              // is to set its numbers.
              if (on && !expanded) onToggle()
            }}
          />
        )}

        <button
          type="button"
          onClick={onToggle}
          aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
          disabled={optional && !enabled}
          className="shrink-0 disabled:opacity-30 disabled:cursor-default"
        >
          <Icon
            name="chevron.down"
            size={18}
            className={`text-muted transition-transform ${open ? '' : '-rotate-90'}`}
          />
        </button>
      </div>
      {open && children}
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
  const [error, setError] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [expandGroup, setExpandGroup] = useState(true)
  const [expandMultipliers, setExpandMultipliers] = useState(true)
  const [expandPso, setExpandPso] = useState(true)
  const [expandBonusGroup, setExpandBonusGroup] = useState(true)
  const [expandBonusQualification, setExpandBonusQualification] = useState(true)
  const [expandBonusKnockout, setExpandBonusKnockout] = useState(true)

  // ── Optional-section switches ────────────────────────────────────────────
  // Each maps to the fields it governs; "off" writes the value the scoring
  // engine already treats as "do not award". Nothing is persisted until Save.
  const [multipliersOn, setMultipliersOn] = useToggleGroup(
    [[r32Mult, setR32Mult], [r16Mult, setR16Mult], [qfMult, setQfMult],
     [sfMult, setSfMult], [tpMult, setTpMult], [finalMult, setFinalMult]],
    [DEFAULTS.round_32_multiplier, DEFAULTS.round_16_multiplier, DEFAULTS.quarter_final_multiplier,
     DEFAULTS.semi_final_multiplier, DEFAULTS.third_place_multiplier, DEFAULTS.final_multiplier],
    1, // off = every stage scores at face value, not zero
  )
  const [groupStandingsOn, setGroupStandingsOn] = useToggleGroup(
    [[bonusGroupWinnerAndRunnerup, setBonusGroupWinnerAndRunnerup],
     [bonusGroupWinnerOnly, setBonusGroupWinnerOnly],
     [bonusGroupRunnerupOnly, setBonusGroupRunnerupOnly],
     [bonusBothQualifySwapped, setBonusBothQualifySwapped],
     [bonusOneQualifiesWrongPos, setBonusOneQualifiesWrongPos]],
    [DEFAULTS.bonus_group_winner_and_runnerup, DEFAULTS.bonus_group_winner_only,
     DEFAULTS.bonus_group_runnerup_only, DEFAULTS.bonus_both_qualify_swapped,
     DEFAULTS.bonus_one_qualifies_wrong_position],
  )
  const [qualificationOn, setQualificationOn] = useToggleGroup(
    [[bonusAllQualified, setBonusAllQualified], [bonus75PctQualified, setBonus75PctQualified],
     [bonus50PctQualified, setBonus50PctQualified]],
    [DEFAULTS.bonus_all_16_qualified, DEFAULTS.bonus_12_15_qualified, DEFAULTS.bonus_8_11_qualified],
  )
  const [knockoutBonusOn, setKnockoutBonusOn] = useToggleGroup(
    [[bonusBracketPairing, setBonusBracketPairing], [bonusMatchWinner, setBonusMatchWinner],
     [bonusChampion, setBonusChampion], [bonusSecondPlace, setBonusSecondPlace],
     [bonusThirdPlace, setBonusThirdPlace]],
    [DEFAULTS.bonus_correct_bracket_pairing, DEFAULTS.bonus_match_winner_correct,
     DEFAULTS.bonus_champion_correct, DEFAULTS.bonus_second_place_correct,
     DEFAULTS.bonus_third_place_correct],
  )
  const [bpThirdOn, setBpThirdOn] = useToggleGroup(
    [[bpThirdQualifier, setBpThirdQualifier], [bpThirdEliminated, setBpThirdEliminated],
     [bpThirdAllBonus, setBpThirdAllBonus]],
    [BP_DEFAULTS.bp_third_correct_qualifier, BP_DEFAULTS.bp_third_correct_eliminated,
     BP_DEFAULTS.bp_third_all_correct_bonus],
  )
  const [bpBonusOn, setBpBonusOn] = useToggleGroup(
    [[bpChampionBonus, setBpChampionBonus], [bpPenaltyCorrect, setBpPenaltyCorrect]],
    [BP_DEFAULTS.bp_champion_bonus, BP_DEFAULTS.bp_penalty_correct],
  )

  const completedMatchCount = matches.filter((m) => m.is_completed).length
  const memberCount = members.length

  // Validation
  const groupWarning =
    groupExact < groupDiff || groupDiff < groupResult
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

  /**
   * The scoring fields as they stand in the form. One source for three things:
   * what Save writes, whether anything has changed, and whether the pool is
   * still on the defaults. Built without `updated_at` so it can be compared.
   */
  const formValues: Record<string, number | boolean> = isBracketPicker
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
      }

  const baseline = isBracketPicker ? BP_DEFAULTS : DEFAULTS

  /** Unsaved edits. Compared against what is stored, falling back to the
   *  defaults for a pool whose settings row has not been written yet. */
  const hasChanges = Object.entries(formValues).some(
    ([k, v]) => v !== ((settings as Record<string, unknown> | null)?.[k] ??
                       (baseline as Record<string, unknown>)[k]),
  )

  /**
   * What is actually about to change, for the confirmation dialog.
   *
   * A generic "this will update scoring" tells an admin nothing about the one
   * thing worth pausing over: a value dropping to zero means those points stop
   * being awarded, and on a recalculation they come off every entry that had
   * them. Those are listed first and by name; everything else is a count.
   */
  const pendingChanges = Object.entries(formValues)
    .map(([key, next]) => {
      const prev = (settings as Record<string, unknown> | null)?.[key] ??
                   (baseline as Record<string, unknown>)[key]
      return { key, prev, next, help: fieldHelp(key) }
    })
    .filter(c => c.next !== c.prev)

  const turnedOff = pendingChanges.filter(
    c => typeof c.next === 'number' && c.next === 0 && typeof c.prev === 'number' && c.prev > 0,
  )
  const otherChanges = pendingChanges.length - turnedOff.length

  /** Still exactly as the pool was created. Reset has nothing to do here. */
  const isAtDefaults = Object.entries(formValues).every(
    ([k, v]) => v === (baseline as Record<string, unknown>)[k],
  )

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

    // .select() for the same reason as SettingsTab: an RLS-filtered UPDATE is a
    // 200 with zero rows and no error, so without this an archived pool would
    // report its scoring saved and change nothing.
    const { data: updatedSettings, error: updateError } = await supabase
      .from('pool_settings')
      .update(updateData)
      .eq('pool_id', pool.pool_id)
      .select('pool_id')

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
      setShowConfirm(false)
      return
    }

    if (!updatedSettings || updatedSettings.length === 0) {
      setError(
        'Scoring could not be updated. Archived pools are read-only — restore the pool from your profile to make changes.'
      )
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
      // For other modes, run the scoring engine through the same endpoint the
      // rest of the app uses.
      //
      // This used to call the `recalculate_all_pool_points` RPC. That function
      // is a fossil — it writes match_scores columns (prediction_id,
      // points_earned, is_exact_score, …) that the table has not had since the
      // shadow-engine widening, so every call failed with
      //   column "prediction_id" of relation "match_scores" does not exist
      // and a save left the pool on new rules with old points. The engine of
      // record is lib/scoring; nothing else in the codebase called the RPC.
      try {
        const res = await fetch(`/api/pools/${pool.pool_id}/recalculate`, { method: 'POST' })
        if (!res.ok) {
          let errMsg = res.statusText
          try { const data = await res.json(); errMsg = data.error || errMsg } catch {}
          setError('Settings saved but recalculation failed: ' + errMsg)
          setSaving(false)
          setShowConfirm(false)
          return
        }
      } catch (err: unknown) {
        setError('Settings saved but recalculation failed: ' + (err instanceof Error ? err.message : 'Network error'))
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

    // Refresh members for updated points.
    //
    // This used to `.order('current_rank')`. That column is on `pool_entries`,
    // not `pool_members`, so PostgREST answered 42703, the discarded error left
    // `refreshedMembers` null, and the guard below silently skipped the update —
    // the admin saw "Points recalculated for all members" over an unchanged
    // table. The select is `*` on `pool_members`, which never carried
    // `current_rank`, so the ordering could not have worked at any point.
    const { data: refreshedMembers, error: refreshErr } = await supabase
      .from('pool_members')
      .select('*, users!inner(user_id, username, full_name, email)')
      .eq('pool_id', pool.pool_id)

    if (refreshErr) {
      showToast('Scoring updated, but the member list could not be refreshed.', 'error')
      setSaving(false)
      setShowConfirm(false)
      return
    }
    if (refreshedMembers) setMembers(refreshedMembers as MemberData[])

    showToast('Scoring updated. Points recalculated for all members.', 'success')
    setSaving(false)
    setShowConfirm(false)
  }

  function SliderInput({
    label,
    value,
    onChange,
    min = 0,
    max = 10,
    step = 1,
    suffix = 'points',
    field,
  }: {
    label: string
    value: number
    onChange: (v: number) => void
    min?: number
    max?: number
    step?: number
    suffix?: string
    /** pool_settings column this edits; supplies the (i) explanation. */
    field?: string
  }) {
    const help = field ? fieldHelp(field) : null
    const info = help ? <InfoPopover title={help.title} body={help.body} /> : null
    return (
      /* One row at every width. The slider is desktop-only — on a phone it is a
         fiddly target for a value that gets typed anyway, and dropping it frees
         the row so the label and the number box can share it. That is why there
         is a single label here rather than the stacked-on-mobile / inline-on-
         desktop pair this used to carry. */
      <div className="flex items-center gap-3 sm:gap-4">
        <span className="text-sm text-ink flex-1 min-w-0 sm:flex-none sm:w-52 sm:shrink-0 flex items-center gap-1.5">
          {label}{info}
        </span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          aria-label={label}
          className="hidden sm:block flex-1 h-2 bg-neutral-200 rounded-xl appearance-none cursor-pointer accent-primary-600 min-w-0"
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
            aria-label={label}
            className="w-14 sm:w-16 h-8 text-center text-sm font-bold border border-neutral-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent text-neutral-900"
          />
          <span className="text-xs text-neutral-600 w-10">{suffix}</span>
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
                   field="bp_group_correct_1st"/>
                  <SliderInput
                    label="Correct 2nd Place:"
                    value={bpGroup2nd}
                    onChange={setBpGroup2nd}
                    min={0}
                    max={20}
                    step={1}
                   field="bp_group_correct_2nd"/>
                  <SliderInput
                    label="Correct 3rd Place:"
                    value={bpGroup3rd}
                    onChange={setBpGroup3rd}
                    min={0}
                    max={20}
                    step={1}
                   field="bp_group_correct_3rd"/>
                  <SliderInput
                    label="Correct 4th Place:"
                    value={bpGroup4th}
                    onChange={setBpGroup4th}
                    min={0}
                    max={20}
                    step={1}
                   field="bp_group_correct_4th"/>
                </div>
            </SectionCard>

            {/* Knockout Points */}
            <SectionCard
              title="Knockout Points"
              expanded={expandBpKnockout}
              onToggle={() => setExpandBpKnockout(!expandBpKnockout)}
            >
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
                   field="bp_r32_correct"/>
                  <SliderInput
                    label="Round of 16:"
                    value={bpR16}
                    onChange={setBpR16}
                    min={0}
                    max={50}
                    step={1}
                   field="bp_r16_correct"/>
                  <SliderInput
                    label="Quarter Finals:"
                    value={bpQf}
                    onChange={setBpQf}
                    min={0}
                    max={50}
                    step={1}
                   field="bp_qf_correct"/>
                  <SliderInput
                    label="Semi Finals:"
                    value={bpSf}
                    onChange={setBpSf}
                    min={0}
                    max={50}
                    step={1}
                   field="bp_sf_correct"/>
                  <SliderInput
                    label="3rd Place Match:"
                    value={bpThirdPlaceMatch}
                    onChange={setBpThirdPlaceMatch}
                    min={0}
                    max={50}
                    step={1}
                   field="bp_third_place_match_correct"/>
                  <SliderInput
                    label="Final:"
                    value={bpFinal}
                    onChange={setBpFinal}
                    min={0}
                    max={100}
                    step={1}
                   field="bp_final_correct"/>
                </div>
            </SectionCard>

            {/* Third-Place Points */}
            <SectionCard
              title="Third-Place Picks"
              subtitle="For calling which third places go through"
              enabled={bpThirdOn}
              onEnabledChange={setBpThirdOn}
              expanded={expandBpThird}
              onToggle={() => setExpandBpThird(!expandBpThird)}
            >
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
                   field="bp_third_correct_qualifier"/>
                  <SliderInput
                    label="Correct Eliminated:"
                    value={bpThirdEliminated}
                    onChange={setBpThirdEliminated}
                    min={0}
                    max={20}
                    step={1}
                   field="bp_third_correct_eliminated"/>
                  <SliderInput
                    label="All 8 Correct Bonus:"
                    value={bpThirdAllBonus}
                    onChange={setBpThirdAllBonus}
                    min={0}
                    max={50}
                    step={1}
                   field="bp_third_all_correct_bonus"/>
                </div>
            </SectionCard>

            {/* Bonus Points */}
            <SectionCard
              title="Bonuses"
              subtitle="Champion and penalty calls"
              enabled={bpBonusOn}
              onEnabledChange={setBpBonusOn}
              expanded={expandBpBonus}
              onToggle={() => setExpandBpBonus(!expandBpBonus)}
            >
                <div className="space-y-4 pl-4">
                  <SliderInput
                    label="Champion Bonus:"
                    value={bpChampionBonus}
                    onChange={setBpChampionBonus}
                    min={0}
                    max={200}
                    step={5}
                   field="bp_champion_bonus"/>
                  <SliderInput
                    label="Correct Penalty Prediction:"
                    value={bpPenaltyCorrect}
                    onChange={setBpPenaltyCorrect}
                    min={0}
                    max={10}
                    step={1}
                   field="bp_penalty_correct"/>
                </div>
            </SectionCard>

            {/* Reset lives in a danger zone and only appears when there is
                something to undo — on a pool still using the defaults the
                button does nothing but invite a misclick. Save moved to the
                sticky bar, as on the Settings tab. */}
            {!isAtDefaults && (
              <Card padding="sm" className="border border-danger-200 mb-6">
                <div className="flex items-center gap-2 pb-3 mb-4 border-b border-border-subtle">
                  <h3 className="t-section-header text-danger-700">Danger Zone</h3>
                </div>
                <button
                  type="button"
                  onClick={resetDefaults}
                  className="w-full flex items-center gap-3 py-2 text-left transition-opacity hover:opacity-70"
                >
                  <Icon name="arrow.uturn.left" size={16} weight="semibold" className="shrink-0 text-danger-600" />
                  <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span className="t-card-title text-danger-600">Reset to Defaults</span>
                    <span className="t-detail text-muted">
                      Put every scoring value back to how the pool was created. Takes effect when you save.
                    </span>
                  </span>
                  <Icon name="chevron.right" size={11} weight="semibold" className="shrink-0 text-muted" />
                </button>
              </Card>
            )}
        </>
      ) : (
        <>
            {/* Group Stage */}
            {/* Group Stage Points. Always on: without it nothing scores. */}
            <SectionCard
              title="Group Stage Points"
              subtitle="What a correct group-stage prediction is worth"
              expanded={expandGroup}
              onToggle={() => setExpandGroup(!expandGroup)}
            >
              <div className="space-y-4">
                <SliderInput label="Exact Score Match:" value={groupExact} onChange={setGroupExact} min={5} max={100} step={5} field="group_exact_score" />
                <SliderInput label="Correct Winner + Goal Difference:" value={groupDiff} onChange={setGroupDiff} min={5} max={100} step={5} field="group_correct_difference" />
                <SliderInput label="Correct Winner Only:" value={groupResult} onChange={setGroupResult} min={5} max={100} step={5} field="group_correct_result" />
                {groupWarning && <p className="text-sm text-warning-500">{groupWarning}</p>}
              </div>
            </SectionCard>

            {/* Knockout Multipliers. There is no separate knockout base any
                more — migration 042 folded the ratio between the two bases into
                these, so a knockout match is the group base scaled by its
                round. Range goes to 25 because that fold-in pushed real pools
                as high as 16x. */}
            <SectionCard
              title="Knockout Multipliers"
              subtitle="How much a knockout round is worth against a group match"
              enabled={multipliersOn}
              onEnabledChange={setMultipliersOn}
              expanded={expandMultipliers}
              onToggle={() => setExpandMultipliers(!expandMultipliers)}
            >
              <div className="space-y-6">
                <div>
                  <div className="space-y-4">
                      <SliderInput label="Round of 32:" value={r32Mult} onChange={setR32Mult} min={0.5} max={25} step={0.5} suffix="x" field="round_32_multiplier" />
                      <SliderInput label="Round of 16:" value={r16Mult} onChange={setR16Mult} min={0.5} max={25} step={0.5} suffix="x" field="round_16_multiplier" />
                      <SliderInput label="Quarter Final:" value={qfMult} onChange={setQfMult} min={0.5} max={25} step={0.5} suffix="x" field="quarter_final_multiplier" />
                      <SliderInput label="Semi Final:" value={sfMult} onChange={setSfMult} min={0.5} max={25} step={0.5} suffix="x" field="semi_final_multiplier" />
                      <SliderInput label="Third Place:" value={tpMult} onChange={setTpMult} min={0.5} max={25} step={0.5} suffix="x" field="third_place_multiplier" />
                      <SliderInput label="Final:" value={finalMult} onChange={setFinalMult} min={0.5} max={25} step={0.5} suffix="x" field="final_multiplier" />
                      <p className="t-detail text-muted">
                        A Final called exactly is worth {groupExact} x {finalMult} = {groupExact * finalMult} points.
                      </p>
                      {multiplierWarning && <p className="text-sm text-danger-500">{multiplierWarning}</p>}
                  </div>
                </div>
              </div>
            </SectionCard>

            {/* Penalty Shootout Scoring */}
            <SectionCard
              title="Penalty Shootout"
              subtitle="Points for calling the shootout score"
              enabled={psoEnabled}
              onEnabledChange={setPsoEnabled}
              expanded={expandPso}
              onToggle={() => setExpandPso(!expandPso)}
            >
                <div className="space-y-4 pl-4">
                  <p className="text-xs text-neutral-600">
                    When enabled, bonus points are awarded for predicting the penalty shootout score in knockout matches that go to penalties.
                  </p>
                  <div>
                    <SliderInput
                      label="Exact PSO Score:"
                      value={psoExact}
                      onChange={setPsoExact}
                      min={5}
                      max={200}
                      step={5}
                     field="pso_exact_score"/>
                    <div className="mt-4">
                      <SliderInput
                        label="Correct Winner + GD:"
                        value={psoDiff}
                        onChange={setPsoDiff}
                        min={5}
                        max={200}
                        step={5}
                       field="pso_correct_difference"/>
                    </div>
                    <div className="mt-4">
                      <SliderInput
                        label="Correct Winner Only:"
                        value={psoResult}
                        onChange={setPsoResult}
                        min={5}
                        max={200}
                        step={5}
                       field="pso_correct_result"/>
                    </div>
                  </div>
                  {psoWarning && (
                    <p className="text-sm text-warning-500">{psoWarning}</p>
                  )}
                </div>
            </SectionCard>

            {/* Bonus: Group Standings */}
            <SectionCard
              title="Group Standings"
              subtitle="For calling who tops each group"
              enabled={groupStandingsOn}
              onEnabledChange={setGroupStandingsOn}
              expanded={expandBonusGroup}
              onToggle={() => setExpandBonusGroup(!expandBonusGroup)}
            >
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
                   field="bonus_group_winner_and_runnerup"/>
                  <SliderInput
                    label="Winner only correct:"
                    value={bonusGroupWinnerOnly}
                    onChange={setBonusGroupWinnerOnly}
                    min={0}
                    max={500}
                    step={25}
                   field="bonus_group_winner_only"/>
                  <SliderInput
                    label="Both qualify, positions swapped:"
                    value={bonusBothQualifySwapped}
                    onChange={setBonusBothQualifySwapped}
                    min={0}
                    max={500}
                    step={25}
                   field="bonus_both_qualify_swapped"/>
                  <SliderInput
                    label="Runner-up only correct:"
                    value={bonusGroupRunnerupOnly}
                    onChange={setBonusGroupRunnerupOnly}
                    min={0}
                    max={500}
                    step={25}
                   field="bonus_group_runnerup_only"/>
                  <SliderInput
                    label="One qualifies, wrong position:"
                    value={bonusOneQualifiesWrongPos}
                    onChange={setBonusOneQualifiesWrongPos}
                    min={0}
                    max={500}
                    step={25}
                   field="bonus_one_qualifies_wrong_position"/>
                </div>
            </SectionCard>

            {/* Bonus: Overall Qualification */}
            <SectionCard
              title="Overall Qualification"
              subtitle="For calling the full set of qualifiers"
              enabled={qualificationOn}
              onEnabledChange={setQualificationOn}
              expanded={expandBonusQualification}
              onToggle={() => setExpandBonusQualification(!expandBonusQualification)}
            >
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
                   field="bonus_all_16_qualified"/>
                  <SliderInput
                    label="75%+ qualified correct:"
                    value={bonus75PctQualified}
                    onChange={setBonus75PctQualified}
                    min={0}
                    max={500}
                    step={25}
                   field="bonus_12_15_qualified"/>
                  <SliderInput
                    label="50%+ qualified correct:"
                    value={bonus50PctQualified}
                    onChange={setBonus50PctQualified}
                    min={0}
                    max={500}
                    step={25}
                   field="bonus_8_11_qualified"/>
                </div>
            </SectionCard>

            {/* Bonus: Knockout & Tournament */}
            <SectionCard
              title="Knockout &amp; Tournament"
              subtitle="For bracket pairings, winners and the podium"
              enabled={knockoutBonusOn}
              onEnabledChange={setKnockoutBonusOn}
              expanded={expandBonusKnockout}
              onToggle={() => setExpandBonusKnockout(!expandBonusKnockout)}
            >
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
                   field="bonus_correct_bracket_pairing"/>
                  <SliderInput
                    label="Correct knockout match winner:"
                    value={bonusMatchWinner}
                    onChange={setBonusMatchWinner}
                    min={0}
                    max={500}
                    step={25}
                   field="bonus_match_winner_correct"/>
                  <SliderInput
                    label="Champion correct:"
                    value={bonusChampion}
                    onChange={setBonusChampion}
                    min={0}
                    max={2000}
                    step={50}
                   field="bonus_champion_correct"/>
                  <SliderInput
                    label="Runner-up correct:"
                    value={bonusSecondPlace}
                    onChange={setBonusSecondPlace}
                    min={0}
                    max={500}
                    step={25}
                   field="bonus_second_place_correct"/>
                  <SliderInput
                    label="Third place correct:"
                    value={bonusThirdPlace}
                    onChange={setBonusThirdPlace}
                    min={0}
                    max={500}
                    step={25}
                   field="bonus_third_place_correct"/>
                </div>
            </SectionCard>

            {/* Reset lives in a danger zone and only appears when there is
                something to undo — on a pool still using the defaults the
                button does nothing but invite a misclick. Save moved to the
                sticky bar, as on the Settings tab. */}
            {!isAtDefaults && (
              <Card padding="sm" className="border border-danger-200 mb-6">
                <div className="flex items-center gap-2 pb-3 mb-4 border-b border-border-subtle">
                  <h3 className="t-section-header text-danger-700">Danger Zone</h3>
                </div>
                <button
                  type="button"
                  onClick={resetDefaults}
                  className="w-full flex items-center gap-3 py-2 text-left transition-opacity hover:opacity-70"
                >
                  <Icon name="arrow.uturn.left" size={16} weight="semibold" className="shrink-0 text-danger-600" />
                  <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span className="t-card-title text-danger-600">Reset to Defaults</span>
                    <span className="t-detail text-muted">
                      Put every scoring value back to how the pool was created. Takes effect when you save.
                    </span>
                  </span>
                  <Icon name="chevron.right" size={11} weight="semibold" className="shrink-0 text-muted" />
                </button>
              </Card>
            )}
        </>
      )}

      {/* Confirmation Modal. Says what is changing rather than that something
          is: an admin who just switched a bonus off is told, by name, that
          those points come off every entry. The old copy pointed at a
          "Recalculate Bonus Points" button that no longer exists. */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
          <div className="bg-surface rounded-t-sheet sm:rounded-card shadow-card-elevated sm:max-w-md w-full max-h-[85vh] overflow-y-auto p-5 sm:p-6 dark:shadow-none dark:border dark:border-border-default">
            <h3 className="t-section-header text-ink mb-2">
              Save scoring changes?
            </h3>
            <p className="t-body text-muted mb-5">
              Every completed match will be scored again with these rules, and the
              leaderboard will be rebuilt from the result.
            </p>

            {turnedOff.length > 0 && (
              <div className="rounded-chip bg-warning-500/10 border border-warning-500/20 p-3 mb-5">
                <p className="t-body font-bold text-warning-800 mb-1.5">
                  {turnedOff.length === 1
                    ? 'One award is being switched off'
                    : `${turnedOff.length} awards are being switched off`}
                </p>
                <ul className="space-y-0.5 mb-2">
                  {turnedOff.slice(0, 5).map(c => (
                    <li key={c.key} className="t-body text-muted">
                      {c.help?.title ?? c.key}
                      <span className="t-num t-num-medium text-[11px] ml-1.5">
                        {formatNumber(Number(c.prev))} &rarr; 0
                      </span>
                    </li>
                  ))}
                  {turnedOff.length > 5 && (
                    <li className="t-body text-muted">and {turnedOff.length - 5} more</li>
                  )}
                </ul>
                <p className="t-detail text-muted">
                  Anyone who earned these keeps nothing from them once the recalculation runs.
                </p>
              </div>
            )}

            <dl className="grid grid-cols-3 gap-3 mb-5">
              <div>
                <dt className="t-caption text-muted mb-0.5">Values changed</dt>
                <dd className="t-num t-num-extrabold text-lg text-ink">
                  {formatNumber(pendingChanges.length)}
                </dd>
              </div>
              <div>
                <dt className="t-caption text-muted mb-0.5">Matches</dt>
                <dd className="t-num t-num-extrabold text-lg text-ink">
                  {formatNumber(completedMatchCount)}
                </dd>
              </div>
              <div>
                <dt className="t-caption text-muted mb-0.5">Members</dt>
                <dd className="t-num t-num-extrabold text-lg text-ink">
                  {formatNumber(memberCount)}
                </dd>
              </div>
            </dl>

            {otherChanges > 0 && turnedOff.length > 0 && (
              <p className="t-detail text-muted mb-5">
                {otherChanges === 1
                  ? 'The other change adjusts a point value.'
                  : `The other ${formatNumber(otherChanges)} changes adjust point values.`}
              </p>
            )}

            <p className="t-body text-muted mb-5">
              Points already recorded will be replaced, and there is no undo.
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
                onClick={handleSave}
                loading={saving}
                loadingText="Saving..."
              >
                Save and recalculate
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sticky save bar ──
          Mirrors the Settings tab: nothing to press until something changes,
          and the same wording. Save still routes through the existing confirm
          dialog, which is what warns about the recalculation. */}
      {hasChanges && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border-default bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
          <div className="mx-auto max-w-3xl flex items-center justify-between px-4 py-3">
            <p className="t-body text-muted">You have unsaved changes</p>
            <Button onClick={() => setShowConfirm(true)} loading={saving} loadingText="Saving...">
              Save Changes
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
