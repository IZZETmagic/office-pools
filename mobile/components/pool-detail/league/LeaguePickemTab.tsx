// =============================================================
// PICK'EM ON A PHONE — the first league screen in the app
// =============================================================
// Reads `GET /api/pools/:id/league` (Decision 12) through React Query. It does
// NOT read a table, and that is the whole reason the contract exists: migration
// 050 closed four league tables to clients, and RLS with no policy returns `[]`
// with `error: null` — so a direct read here would render a confident zero and
// nothing would say otherwise.
//
// ## What this screen is, and what it is not
//
// It is the PICKING surface for the matchweek that is open. It is not the
// leaderboard, not the fixture list, and not a live-score view:
//
//   * ⚠ **OPEN, not IN PLAY.** All weekend the open matchweek is the one AFTER
//     the one being played. A screen that picks for `inPlayMatchweekNumber`
//     would be offering picks on games in progress. The payload carries both
//     numbers precisely so this cannot be guessed wrong.
//   * ⚠ **It does not poll.** The payload is the season — 165.7 kB on the
//     Premier League. Live numbers ride the `pool:{id}:leaderboard` broadcast,
//     and a `refetchInterval` here would be the most expensive line in the app.
//
// ## ⚠ THERE IS NO SUBMIT BUTTON, DELIBERATELY
//
// The league already derives submission from the picks rather than from a flag,
// and *Submitting an entry is a step that shouldn't exist* generalises that:
// picks stay editable until their matchweek locks, and the deadline decides what
// counts. So this saves as you tap. The World Cup's "press once, locked out"
// model is the thing being replaced, not the thing being copied.
// =============================================================

import { useCallback, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, ScrollView, View } from 'react-native'

import { OutcomePicker, type Outcome } from './OutcomePicker'
import { TapScoreField } from '../TapScoreField'
import { Text } from '@/components/ui'
import { apiFetch } from '@/lib/api'
import { useLeaguePool } from '@/lib/useLeaguePool'
import { fontFamilies, useTheme, withOpacity } from '@/theme'

type Props = { poolId: string }

type Fixture = {
  match_id: string
  match_number: number
  round_number: number | null
  match_date: string
  home_team: { country_name: string; country_code: string | null } | null
  away_team: { country_name: string; country_code: string | null } | null
}

/** What the row currently shows — the saved pick, plus anything typed since. */
type Draft = { outcome?: Outcome; homeScore?: number; awayScore?: number }

export function LeaguePickemTab({ poolId }: Props) {
  const theme = useTheme()
  const { data, isLoading, error, refetch } = useLeaguePool(poolId)

  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // ⚠ `=== 'results'`, NEVER `=== 'scores'`. A pool created before migration 077
  // has NULL depth and the engine reads NULL as **Scores**, byte for byte (066).
  // Three web copy sites once derived the wrong half of this pair and told
  // members they were playing one game while being scored at another.
  const isResults = data?.pool.league_depth === 'results'

  const openMw = data?.season.openMatchweekNumber ?? null
  const entry = data?.you.entries[0] ?? null

  const fixtures = useMemo(() => {
    if (!data || openMw === null) return []
    return (data.season.matches as unknown as Fixture[])
      .filter((m) => m.round_number === openMw)
      .sort((a, b) => a.match_number - b.match_number)
  }, [data, openMw])

  /** The saved pick for a fixture, from the payload rather than from memory. */
  const savedFor = useCallback(
    (matchId: string): Draft => {
      if (!entry) return {}
      if (isResults) {
        const o = entry.outcomes[matchId]
        return o ? { outcome: o } : {}
      }
      const p = (entry.predictions as unknown as Array<{
        match_id: string; predicted_home_score: number; predicted_away_score: number
      }>).find((x) => x.match_id === matchId)
      return p ? { homeScore: p.predicted_home_score, awayScore: p.predicted_away_score } : {}
    },
    [entry, isResults],
  )

  const valueFor = useCallback(
    (matchId: string): Draft => ({ ...savedFor(matchId), ...(drafts[matchId] ?? {}) }),
    [savedFor, drafts],
  )

  /**
   * Save one row, debounced.
   *
   * ⚠ THE `rejected` FIELD IS NOT OPTIONAL TO READ. A league matchweek locks via
   * a silent-skip database trigger (migration 058) — a refused pick is not an
   * error, the row simply is not written. The route reads back and reports what
   * did not land, and a client that ignores that shows a member a pick the
   * database does not have. That is the exact failure this codebase keeps
   * paying for, so it surfaces rather than resolving quietly.
   */
  const save = useCallback(
    (matchId: string, next: Draft) => {
      if (!entry) return
      const merged = { ...savedFor(matchId), ...next }
      if (timers.current[matchId]) clearTimeout(timers.current[matchId])
      timers.current[matchId] = setTimeout(async () => {
        setSaving(true)
        setSaveError(null)
        try {
          const pick = isResults
            ? { matchId, outcome: merged.outcome }
            : { matchId, homeScore: merged.homeScore, awayScore: merged.awayScore }
          const res = await apiFetch<{ rejected?: unknown[] }>(
            `/api/pools/${poolId}/predictions`,
            { method: 'POST', body: { entryId: entry.entry_id, predictions: [pick] } },
          )
          if (res.rejected?.length) {
            setSaveError('That matchweek has locked — this pick was not saved.')
            // Drop the local draft so the row falls back to what is actually
            // stored, rather than showing a pick that does not exist.
            setDrafts((d) => {
              const rest = { ...d }
              delete rest[matchId]
              return rest
            })
          }
          await refetch()
        } catch (e) {
          setSaveError((e as Error).message)
        } finally {
          setSaving(false)
        }
      }, 600)
    },
    [entry, isResults, poolId, refetch, savedFor],
  )

  const set = useCallback(
    (matchId: string, patch: Draft) => {
      setDrafts((d) => ({ ...d, [matchId]: { ...(d[matchId] ?? {}), ...patch } }))
      save(matchId, patch)
    },
    [save],
  )

  if (isLoading) {
    return (
      <View style={{ padding: 32, alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    )
  }

  // ⚠ Loud. An empty league screen is the silent-empty failure, and it must not
  // be indistinguishable from "nothing to pick".
  if (error || !data) {
    return (
      <View style={{ padding: 24 }}>
        <Text style={{ fontFamily: fontFamilies.semibold, color: theme.colors.red }}>
          Could not load this pool
        </Text>
        <Text variant="caption" style={{ color: theme.colors.slate, marginTop: 4 }}>
          {(error as Error | null)?.message ?? 'No data returned.'}
        </Text>
      </View>
    )
  }

  if (openMw === null) {
    return (
      <View style={{ padding: 24 }}>
        <Text style={{ fontFamily: fontFamilies.semibold }}>No matchweek is open</Text>
        <Text variant="caption" style={{ color: theme.colors.slate, marginTop: 4 }}>
          The next one opens after the current matchweek locks.
        </Text>
      </View>
    )
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
      <View style={{ marginBottom: 12 }}>
        <Text variant="sectionHeader">Matchweek {openMw}</Text>
        <Text variant="caption" style={{ color: theme.colors.slate, marginTop: 2 }}>
          {isResults
            ? 'Tap the team you think wins, or Draw. Your picks save as you make them.'
            : 'Call the score. Your picks save as you make them.'}
        </Text>
      </View>

      {saveError ? (
        <View
          style={{
            padding: 12,
            borderRadius: 10,
            marginBottom: 12,
            backgroundColor: withOpacity(theme.colors.red, 0.12),
          }}
        >
          <Text variant="caption" style={{ color: theme.colors.red }}>{saveError}</Text>
        </View>
      ) : null}

      {fixtures.map((f) => {
        const v = valueFor(f.match_id)
        const home = f.home_team?.country_name ?? 'Home'
        const away = f.away_team?.country_name ?? 'Away'
        return (
          <View
            key={f.match_id}
            style={{
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.mist,
            }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text numberOfLines={1} style={{ fontFamily: fontFamilies.medium, flex: 1 }}>
                {home} v {away}
              </Text>
            </View>

            {isResults ? (
              <OutcomePicker
                value={v.outcome ?? null}
                onChange={(o) => set(f.match_id, { outcome: o })}
                homeLabel={f.home_team?.country_code ?? home}
                awayLabel={f.away_team?.country_code ?? away}
              />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <TapScoreField
                  value={v.homeScore ?? null}
                  onChange={(n) => set(f.match_id, { homeScore: n })}
                />
                <Text variant="caption" style={{ color: theme.colors.slate }}>v</Text>
                <TapScoreField
                  value={v.awayScore ?? null}
                  onChange={(n) => set(f.match_id, { awayScore: n })}
                />
              </View>
            )}
          </View>
        )
      })}

      <Text
        variant="caption"
        style={{ color: theme.colors.slate, marginTop: 16, textAlign: 'center' }}
      >
        {saving ? 'Saving…' : 'Saved automatically — there is nothing to submit.'}
      </Text>
    </ScrollView>
  )
}
