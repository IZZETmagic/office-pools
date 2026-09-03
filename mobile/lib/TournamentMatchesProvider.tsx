// One shared tournament-matches fetch for the whole app. Mounted high in
// the tree (inside HomeDataProvider in app/_layout.tsx) so the fetch kicks
// off as soon as home data resolves the user's pool list — well before
// the user navigates to the Results tab. Combined with the splash gate
// waiting on its loading state, Results renders fully on first paint
// instead of flashing a brief loading spinner.

import { createContext, useContext, type ReactNode } from 'react';

import {
  useTournamentMatchesInternal,
  type LeagueSeasonTable,
  type ResultsMatch,
} from './useTournamentMatches';

type TournamentMatchesValue = {
  /** World Cup matches and league fixtures, merged. See the hook's header. */
  matches: ResultsMatch[];
  /**
   * The member's competitions and their tables — from the SAME fetch as the
   * fixtures, so Match Centre's Tables view costs no extra round trip.
   *
   * ⚠ Empty for a World Cup-only member and for a season whose first matches
   * have not been played. That emptiness is load-bearing: it is what hides the
   * Tables toggle rather than offering a control that leads to a blank screen.
   */
  leagueTables: LeagueSeasonTable[];
  /**
   * ⚠ THE WORLD CUP READ ONLY. The splash gate below waits on this, so the
   * league fetch is deliberately NOT folded in — that would put a network call
   * on the cold-start path.
   */
  loading: boolean;
  /** The league fetch, separately. A screen may show data before this lands. */
  leagueLoading: boolean;
  refreshing: boolean;
  error: string | null;
  leagueError: string | null;
  refresh: () => Promise<void> | void;
  refreshIfStale: () => void;
};

const TournamentMatchesContext = createContext<TournamentMatchesValue | null>(
  null,
);

export function TournamentMatchesProvider({ children }: { children: ReactNode }) {
  const value = useTournamentMatchesInternal();
  return (
    <TournamentMatchesContext.Provider value={value}>
      {children}
    </TournamentMatchesContext.Provider>
  );
}

/**
 * Shared accessor for the tournament matches feed. Returns the same data
 * shape as the old per-component hook so screens (Results, Match Detail)
 * don't need to change their consumption pattern.
 */
export function useTournamentMatches(): TournamentMatchesValue {
  const ctx = useContext(TournamentMatchesContext);
  if (!ctx) {
    throw new Error(
      'useTournamentMatches must be used inside a TournamentMatchesProvider',
    );
  }
  return ctx;
}
