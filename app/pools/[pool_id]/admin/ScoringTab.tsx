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

  // UI state
  const [saving, setSaving] = useState(false)
  const [recalculating, setRecalculating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [expandGroup, setExpandGroup] = useState(true)
  const [expandKnockout, setExpandKnockout] = useState(true)
  const [expandMultipliers, setExpandMultipliers] = useState(true)
  const [expandPso, setExpandPso] = useState(true)

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
        <label className="text-sm text-gray-700 block mb-1.5 sm:hidden">{label}</label>
        <div className="flex items-center gap-3 sm:gap-4">
          <label className="text-sm text-gray-700 w-52 shrink-0 hidden sm:block">{label}</label>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600 min-w-0"
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
              className="w-14 sm:w-16 h-8 text-center text-sm font-bold border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
            />
            <span className="text-xs text-gray-600 w-10">{suffix}</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">
        Scoring Configuration
      </h2>

      {error && <Alert variant="error" className="mb-4">{error}</Alert>}
      {success && <Alert variant="success" className="mb-4">{success}</Alert>}

      {/* Current scoring display */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card>
          <h3 className="font-semibold text-gray-900 mb-3">
            Group Stage Scoring
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">🎯 Exact Score</span>
              <span className="font-bold text-gray-900">{groupExact} points</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">✓ Correct Winner + GD</span>
              <span className="font-bold text-gray-900">{groupDiff} points</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">✓ Correct Winner Only</span>
              <span className="font-bold text-gray-900">{groupResult} point{groupResult !== 1 ? 's' : ''}</span>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold text-gray-900 mb-3">
            Knockout Stage Scoring
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">🎯 Exact Score</span>
              <span className="font-bold text-gray-900">{koExact} points</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">✓ Correct Winner + GD</span>
              <span className="font-bold text-gray-900">{koDiff} points</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">✓ Correct Winner Only</span>
              <span className="font-bold text-gray-900">{koResult} point{koResult !== 1 ? 's' : ''}</span>
            </div>
            <hr className="my-2" />
            <p className="text-xs text-gray-600 font-medium mb-1">Stage Multipliers:</p>
            <div className="flex justify-between">
              <span className="text-gray-600">Round of 16</span>
              <span className="font-bold text-gray-900">{r16Mult}x</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Quarter Final</span>
              <span className="font-bold text-gray-900">{qfMult}x</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Semi Final</span>
              <span className="font-bold text-gray-900">{sfMult}x</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Third Place</span>
              <span className="font-bold text-gray-900">{tpMult}x</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Final</span>
              <span className="font-bold text-gray-900">{finalMult}x</span>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold text-gray-900 mb-3">
            Penalty Shootout
          </h3>
          {psoEnabled ? (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">🎯 Exact PSO Score</span>
                <span className="font-bold text-gray-900">{psoExact} points</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">✓ Correct Winner + GD</span>
                <span className="font-bold text-gray-900">{psoDiff} points</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">✓ Correct Winner Only</span>
                <span className="font-bold text-gray-900">{psoResult} point{psoResult !== 1 ? 's' : ''}</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic">Disabled</p>
          )}
        </Card>
      </div>

      {/* Edit Scoring Form */}
      <Card className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Edit Scoring Rules
        </h3>

        {/* Group Stage */}
        <div className="mb-6">
          <button
            onClick={() => setExpandGroup(!expandGroup)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-3 hover:text-blue-600"
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
                <p className="text-sm text-orange-500">{groupWarning}</p>
              )}
            </div>
          )}
        </div>

        {/* Knockout Stage */}
        <div className="mb-6">
          <button
            onClick={() => setExpandKnockout(!expandKnockout)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-3 hover:text-blue-600"
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
                <p className="text-sm text-orange-500">{koWarning}</p>
              )}
            </div>
          )}
        </div>

        {/* Multipliers */}
        <div className="mb-6">
          <button
            onClick={() => setExpandMultipliers(!expandMultipliers)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-3 hover:text-blue-600"
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
              <p className="text-xs text-gray-600">
                Example: {koExact} points (exact) x {finalMult} (final) ={' '}
                {koExact * finalMult} points
              </p>
              {multiplierWarning && (
                <p className="text-sm text-red-500">{multiplierWarning}</p>
              )}
            </div>
          )}
        </div>

        {/* Penalty Shootout Scoring */}
        <div className="mb-6">
          <button
            onClick={() => setExpandPso(!expandPso)}
            className="flex items-center gap-2 text-sm font-semibold text-gray-800 mb-3 hover:text-blue-600"
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
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
                <span className="text-sm text-gray-700">
                  Enable penalty shootout scoring
                </span>
              </div>
              <p className="text-xs text-gray-600">
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
                <p className="text-sm text-orange-500">{psoWarning}</p>
              )}
            </div>
          )}
        </div>

        {/* Bonus Points - Phase 2 */}
        <div className="mb-6 border border-gray-200 rounded-lg px-4 py-3 bg-gray-50">
          <p className="text-sm font-semibold text-gray-400">
            ▶ Bonus Points (Coming Soon - Phase 2)
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Group predictions, bracket accuracy, etc.
          </p>
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
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Manual Recalculation
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          If points seem incorrect, you can manually recalculate all points
          using current rules.
        </p>
        <Button
          variant="outline"
          onClick={handleManualRecalculate}
          loading={recalculating}
          loadingText="Recalculating..."
        >
          Recalculate All Points
        </Button>
      </Card>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
          <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl sm:max-w-md w-full sm:mx-4 p-4 sm:p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-3">
              Confirm Scoring Changes
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              You are about to change the scoring system. This will:
            </p>
            <ul className="text-sm text-gray-600 space-y-1 mb-4 list-disc pl-5">
              <li>Update point values in pool settings</li>
              <li>Recalculate points for ALL members</li>
              <li>Update leaderboard rankings</li>
            </ul>
            <p className="text-sm text-gray-600 mb-2">
              Affected matches: {completedMatchCount} completed matches
            </p>
            <p className="text-sm text-gray-600 mb-4">
              Affected members: {memberCount} members
            </p>
            <p className="text-sm text-orange-500 font-medium mb-4">
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
