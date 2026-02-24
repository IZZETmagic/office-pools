'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { Input } from '@/components/ui/Input'
import { FormField } from '@/components/ui/FormField'

type CreatePoolModalProps = {
  onClose: () => void
  onSuccess?: () => void
}

type Tournament = {
  tournament_id: string
  name: string
  short_name: string
  tournament_type: string
  year: number
  host_countries: string | null
  start_date: string
  end_date: string
  status: string
  description: string | null
}

const SCORING_DEFAULTS = {
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
  bonus_correct_bracket_pairing: 50,
  bonus_match_winner_correct: 50,
  bonus_champion_correct: 1000,
  bonus_second_place_correct: 25,
  bonus_third_place_correct: 25,
  bonus_best_player_correct: 100,
  bonus_top_scorer_correct: 100,
}

const STEPS = [
  { key: 'tournament', label: 'Tournament' },
  { key: 'details', label: 'Details' },
  { key: 'settings', label: 'Settings' },
] as const

type Step = typeof STEPS[number]['key']

export function CreatePoolModal({ onClose, onSuccess }: CreatePoolModalProps) {
  const supabase = createClient()
  const router = useRouter()

  // Step state
  const [currentStep, setCurrentStep] = useState<Step>('tournament')

  // Step 1: Tournament
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [tournamentsLoading, setTournamentsLoading] = useState(true)
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null)

  // Step 2: Pool Details
  const [poolName, setPoolName] = useState('')
  const [description, setDescription] = useState('')

  // Step 3: Pool Settings
  const [isPrivate, setIsPrivate] = useState(false)
  const [maxParticipants, setMaxParticipants] = useState('0')
  const [deadlineDate, setDeadlineDate] = useState('2026-06-11')
  const [deadlineTime, setDeadlineTime] = useState('13:00')

  // UI state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [createdPoolCode, setCreatedPoolCode] = useState<string | null>(null)

  // Fetch tournaments on mount
  useEffect(() => {
    async function fetchTournaments() {
      const { data } = await supabase
        .from('tournaments')
        .select('tournament_id, name, short_name, tournament_type, year, host_countries, start_date, end_date, status, description')
        .order('start_date', { ascending: false })

      const list = (data ?? []) as Tournament[]
      setTournaments(list)
      if (list.length === 1) {
        setSelectedTournamentId(list[0].tournament_id)
      }
      setTournamentsLoading(false)
    }
    fetchTournaments()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const selectedTournament = tournaments.find((t) => t.tournament_id === selectedTournamentId)

  const currentStepIndex = STEPS.findIndex((s) => s.key === currentStep)

  function goNext() {
    if (currentStepIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentStepIndex + 1].key)
    }
  }

  function goBack() {
    if (currentStepIndex > 0) {
      setCurrentStep(STEPS[currentStepIndex - 1].key)
    }
  }

  function setQuickDeadline(option: string) {
    if (!selectedTournament) return
    const start = new Date(selectedTournament.start_date)
    switch (option) {
      case 'tournament_start': {
        setDeadlineDate(selectedTournament.start_date)
        setDeadlineTime('13:00')
        break
      }
      case 'one_day_before': {
        const d = new Date(start)
        d.setDate(d.getDate() - 1)
        setDeadlineDate(d.toISOString().split('T')[0])
        setDeadlineTime('13:00')
        break
      }
      case 'one_week_before': {
        const d = new Date(start)
        d.setDate(d.getDate() - 7)
        setDeadlineDate(d.toISOString().split('T')[0])
        setDeadlineTime('13:00')
        break
      }
    }
  }

  // When tournament changes, update deadline to tournament start date
  useEffect(() => {
    if (selectedTournament) {
      setDeadlineDate(selectedTournament.start_date)
      setDeadlineTime('13:00')
    }
  }, [selectedTournamentId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreatePool = async () => {
    setLoading(true)
    setError(null)
    setSuccess(null)

    if (!selectedTournamentId) {
      setError('Please select a tournament.')
      setLoading(false)
      return
    }

    const { data: { user: authUser } } = await supabase.auth.getUser()

    const { data: userData } = await supabase
      .from('users')
      .select('user_id')
      .eq('auth_user_id', authUser?.id)
      .single()

    if (!userData) {
      setError('Could not find your account.')
      setLoading(false)
      return
    }

    const maxP = parseInt(maxParticipants) || 0
    const deadline = new Date(`${deadlineDate}T${deadlineTime}:00`)

    // 1. Create pool
    const { data: newPool, error: poolError } = await supabase
      .from('pools')
      .insert({
        pool_name: poolName.trim(),
        description: description.trim() || null,
        tournament_id: selectedTournamentId,
        admin_user_id: userData.user_id,
        prediction_deadline: deadline.toISOString(),
        status: 'open',
        is_private: isPrivate,
        max_participants: maxP > 0 ? maxP : null,
      })
      .select()
      .single()

    if (poolError) {
      if (poolError.code === '23505') {
        setError('Please try again.')
      } else {
        setError(poolError.message)
      }
      setLoading(false)
      return
    }

    // 2. Add creator as admin
    const { error: memberError } = await supabase
      .from('pool_members')
      .insert({
        pool_id: newPool.pool_id,
        user_id: userData.user_id,
        role: 'admin',
      })

    if (memberError) {
      setError('Pool created but could not add you as admin: ' + memberError.message)
      setLoading(false)
      return
    }

    // 3. Update pool_settings with default scoring values (trigger auto-creates the row)
    const { error: settingsError } = await supabase
      .from('pool_settings')
      .update(SCORING_DEFAULTS)
      .eq('pool_id', newPool.pool_id)

    if (settingsError) {
      setError('Pool created but could not save scoring settings: ' + settingsError.message)
      setLoading(false)
      return
    }

    setCreatedPoolCode(newPool.pool_code)
    setSuccess(`Pool "${poolName.trim()}" created!`)
    setLoading(false)
    router.refresh()
  }

  const canProceedFromTournament = !!selectedTournamentId
  const canProceedFromDetails = poolName.trim().length > 0

  function canProceed() {
    if (currentStep === 'tournament') return canProceedFromTournament
    if (currentStep === 'details') return canProceedFromDetails
    return true
  }

  // Format date for display
  function formatDate(dateStr: string) {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  // Quick deadline button label with formatted date
  function quickDeadlineLabel(option: string) {
    if (!selectedTournament) return ''
    const start = new Date(selectedTournament.start_date)
    switch (option) {
      case 'tournament_start': {
        const formatted = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        return `Tournament Start (${formatted})`
      }
      case 'one_day_before': {
        const d = new Date(start)
        d.setDate(d.getDate() - 1)
        const formatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        return `1 Day Before (${formatted})`
      }
      case 'one_week_before': {
        const d = new Date(start)
        d.setDate(d.getDate() - 7)
        const formatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        return `1 Week Before (${formatted})`
      }
      default:
        return ''
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-pool-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose()
      }}
    >
      <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl sm:max-w-lg w-full sm:mx-4 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-neutral-100 shrink-0">
          <h2 id="create-pool-title" className="text-lg font-bold text-neutral-900">Create a Pool</h2>
          <button
            onClick={() => !loading && onClose()}
            className="p-1.5 text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Step indicator */}
        {!success && (
          <div className="flex items-center justify-center gap-3 px-4 sm:px-6 pt-3 pb-2 shrink-0">
            {STEPS.map((step, idx) => (
              <React.Fragment key={step.key}>
                <button
                  onClick={() => {
                    if (idx <= currentStepIndex) {
                      setCurrentStep(step.key)
                    } else if (idx === 1 && canProceedFromTournament) {
                      setCurrentStep(step.key)
                    } else if (idx === 2 && canProceedFromTournament && canProceedFromDetails) {
                      setCurrentStep(step.key)
                    }
                  }}
                  className={`flex items-center gap-2 text-xs font-medium transition-colors ${
                    step.key === currentStep
                      ? 'text-success-600'
                      : idx < currentStepIndex
                        ? 'text-neutral-700'
                        : 'text-neutral-400'
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      step.key === currentStep
                        ? 'bg-success-600 text-white'
                        : idx < currentStepIndex
                          ? 'bg-neutral-200 text-neutral-700'
                          : 'bg-neutral-100 text-neutral-400'
                    }`}
                  >
                    {idx < currentStepIndex ? (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      idx + 1
                    )}
                  </span>
                  <span>{step.label}</span>
                </button>
                {idx < STEPS.length - 1 && (
                  <div className={`w-6 sm:w-12 h-0.5 rounded ${idx < currentStepIndex ? 'bg-neutral-300' : 'bg-neutral-100'}`} />
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-4 sm:px-6 py-4">
          {error && <Alert variant="error" className="mb-4">{error}</Alert>}

          {success ? (
            <Alert variant="success">
              <p>{success}</p>
              {createdPoolCode && (
                <p className="mt-1">
                  Pool code: <strong className="font-mono text-lg">{createdPoolCode}</strong>
                </p>
              )}
            </Alert>
          ) : (
            <>
              {/* STEP 1: Tournament */}
              {currentStep === 'tournament' && (
                <div className="space-y-4">
                  <p className="text-sm text-neutral-600">Choose the tournament for your prediction pool.</p>

                  {tournamentsLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="w-6 h-6 border-2 border-success-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : tournaments.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm text-neutral-500">No tournaments available at this time.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {tournaments.map((t) => (
                        <button
                          key={t.tournament_id}
                          onClick={() => setSelectedTournamentId(t.tournament_id)}
                          className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                            selectedTournamentId === t.tournament_id
                              ? 'border-success-500 bg-success-50 ring-1 ring-success-200'
                              : 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3 className="text-sm font-semibold text-neutral-900">{t.name}</h3>
                              {t.host_countries && (
                                <p className="text-xs text-neutral-500 mt-0.5">{t.host_countries}</p>
                              )}
                              <p className="text-xs text-neutral-500 mt-1">
                                {formatDate(t.start_date)} &ndash; {formatDate(t.end_date)}
                              </p>
                              {t.description && (
                                <p className="text-xs text-neutral-400 mt-1">{t.description}</p>
                              )}
                            </div>
                            <div className="shrink-0 mt-0.5">
                              {selectedTournamentId === t.tournament_id ? (
                                <div className="w-5 h-5 rounded-full bg-success-600 flex items-center justify-center">
                                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              ) : (
                                <div className="w-5 h-5 rounded-full border-2 border-neutral-300" />
                              )}
                            </div>
                          </div>
                        </button>
                      ))}

                      {/* Coming soon placeholders */}
                      <div className="w-full text-left p-4 rounded-xl border-2 border-dashed border-neutral-200 opacity-50">
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-sm font-semibold text-neutral-400">More tournaments coming soon</h3>
                            <p className="text-xs text-neutral-400 mt-0.5">UEFA EURO, Super Bowl Squares, and more</p>
                          </div>
                          <span className="text-xs bg-neutral-100 text-neutral-400 px-2 py-0.5 rounded-full font-medium">Coming Soon</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 2: Details */}
              {currentStep === 'details' && (
                <div className="space-y-4">
                  <p className="text-sm text-neutral-600">Give your pool a name and optional description.</p>

                  <FormField label="Pool Name *">
                    <Input
                      type="text"
                      value={poolName}
                      onChange={(e) => setPoolName(e.target.value)}
                      placeholder={selectedTournament ? `e.g. Office ${selectedTournament.name}` : 'e.g. Office World Cup 2026'}
                      focusColor="green"
                    />
                  </FormField>

                  <FormField label="Description (optional)">
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Tell people about your pool..."
                      rows={2}
                      className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-success-500 focus:border-transparent text-neutral-900"
                    />
                  </FormField>
                </div>
              )}

              {/* STEP 3: Settings */}
              {currentStep === 'settings' && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-900 mb-3">Prediction Deadline</h3>
                    <div className="flex gap-3 mb-3 flex-wrap">
                      <div>
                        <label className="block text-xs font-medium text-neutral-600 mb-1">Date</label>
                        <input
                          type="date"
                          value={deadlineDate}
                          onChange={(e) => setDeadlineDate(e.target.value)}
                          className="px-3 py-2 border border-neutral-300 rounded-lg text-sm text-neutral-900 focus:ring-2 focus:ring-success-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-neutral-600 mb-1">Time</label>
                        <input
                          type="time"
                          value={deadlineTime}
                          onChange={(e) => setDeadlineTime(e.target.value)}
                          className="px-3 py-2 border border-neutral-300 rounded-lg text-sm text-neutral-900 focus:ring-2 focus:ring-success-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setQuickDeadline('tournament_start')}
                        className="text-xs px-3 py-1.5 rounded bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition"
                      >
                        {quickDeadlineLabel('tournament_start')}
                      </button>
                      <button
                        onClick={() => setQuickDeadline('one_day_before')}
                        className="text-xs px-3 py-1.5 rounded bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition"
                      >
                        {quickDeadlineLabel('one_day_before')}
                      </button>
                      <button
                        onClick={() => setQuickDeadline('one_week_before')}
                        className="text-xs px-3 py-1.5 rounded bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition"
                      >
                        {quickDeadlineLabel('one_week_before')}
                      </button>
                    </div>
                  </div>

                  <hr className="border-neutral-100" />

                  <div>
                    <h3 className="text-sm font-semibold text-neutral-900 mb-3">Privacy</h3>
                    <div className="space-y-2 mb-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="privacy"
                          checked={!isPrivate}
                          onChange={() => setIsPrivate(false)}
                          className="text-success-600"
                        />
                        <span className="text-sm text-neutral-700">Public (anyone with code can join)</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="privacy"
                          checked={isPrivate}
                          onChange={() => setIsPrivate(true)}
                          className="text-success-600"
                        />
                        <span className="text-sm text-neutral-700">Private (requires admin approval)</span>
                      </label>
                    </div>

                    <FormField label="Maximum Members" helperText="Set to 0 for unlimited">
                      <Input
                        type="number"
                        min="0"
                        value={maxParticipants}
                        onChange={(e) => setMaxParticipants(e.target.value)}
                        className="max-w-[200px]"
                        focusColor="green"
                      />
                    </FormField>
                  </div>

                  <hr className="border-neutral-100" />

                  {/* Scoring info note */}
                  <div className="flex gap-3 p-3 bg-primary-50 border border-primary-200 rounded-lg">
                    <svg className="w-5 h-5 text-primary-800 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-primary-800">Scoring & Bonus Points</p>
                      <p className="text-xs text-primary-800 mt-0.5">
                        Your pool will be created with default scoring settings. You can customize all scoring rules, multipliers, and bonus points from the pool admin settings after creation.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-4 sm:px-6 py-4 border-t border-neutral-100 shrink-0">
          {success ? (
            <Button
              variant="green"
              fullWidth
              onClick={() => { onSuccess?.(); onClose() }}
            >
              Done
            </Button>
          ) : (
            <>
              {currentStepIndex > 0 ? (
                <Button variant="gray" onClick={goBack} disabled={loading} className="flex-1">
                  Back
                </Button>
              ) : (
                <Button variant="gray" onClick={onClose} disabled={loading} className="flex-1">
                  Cancel
                </Button>
              )}

              {currentStepIndex < STEPS.length - 1 ? (
                <Button
                  variant="green"
                  onClick={goNext}
                  disabled={!canProceed()}
                  className="flex-1"
                >
                  Next
                </Button>
              ) : (
                <Button
                  variant="green"
                  onClick={handleCreatePool}
                  disabled={loading || !poolName.trim() || !selectedTournamentId}
                  loading={loading}
                  loadingText="Creating..."
                  className="flex-1"
                >
                  Create Pool
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
