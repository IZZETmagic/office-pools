// One shared tournament-matches fetch for the whole app. Mounted high in
// the tree (inside HomeDataProvider in app/_layout.tsx) so the fetch kicks
// off as soon as home data resolves the user's pool list — well before
// the user navigates to the Results tab. Combined with the splash gate
// waiting on its loading state, Results renders fully on first paint
// instead of flashing a brief loading spinner.

import { createContext, useContext, type ReactNode } from 'react';

import {
  useTournamentMatchesInternal,
  type ResultsMatch,
} from './useTournamentMatches';

type TournamentMatchesValue = {
  matches: ResultsMatch[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
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
