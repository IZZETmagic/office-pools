// =============================================================
// shortClubName — the label, not the identity
// =============================================================
// The point of these is the LAST block: a name the rules do not know must come
// back untouched. A shortener that mangles unknown input is worse than no
// shortener, because it would quietly rename clubs in a competition nobody
// tested — which is the failure migration 089 already paid for once, when
// England's qualification bands were hardcoded for every league.
// =============================================================

import { describe, it, expect } from 'vitest'
import { shortClubName } from '@/lib/league/clubName'

describe('shortClubName', () => {
  it('shortens the two Manchester clubs with one rule', () => {
    expect(shortClubName('Manchester United')).toBe('Man United')
    expect(shortClubName('Manchester City')).toBe('Man City')
  })

  it('uses the form the competition writes itself', () => {
    // premierleague.com renders this fixture as "Nott'm Forest".
    expect(shortClubName('Nottingham Forest')).toBe("Nott'm Forest")
  })

  it('handles names whose short form is not a substring of the long one', () => {
    expect(shortClubName('Wolverhampton Wanderers')).toBe('Wolves')
    expect(shortClubName('Brighton & Hove Albion')).toBe('Brighton')
    expect(shortClubName('West Bromwich Albion')).toBe('West Brom')
    expect(shortClubName('Tottenham Hotspur')).toBe('Tottenham')
  })

  it('shortens the two La Liga names the table cannot fit', () => {
    // Measured, not guessed: the Premier League's longest rendered name is
    // "Nott'm Forest" (13). These arrived at 19 and 16.
    expect(shortClubName('Deportivo La Coruna')).toBe('Deportivo')
    expect(shortClubName('Racing Santander')).toBe('Racing')
  })

  it('still matches La Coruna if the feed ever grows its tilde', () => {
    // The provider ships this unaccented today. If that changes, the rule must
    // not silently stop firing — the failure would be a name three characters
    // too long, which nothing would report.
    expect(shortClubName('Deportivo La Coruña')).toBe('Deportivo')
  })

  it('leaves the merely-longish Spanish names alone', () => {
    // The restraint IS the rule. A row per mildly-long name turns this back
    // into the club table it exists not to be.
    for (const name of ['Atletico Madrid', 'Rayo Vallecano', 'Athletic Club', 'Celta Vigo']) {
      expect(shortClubName(name)).toBe(name)
    }
  })

  it('does not shorten Racing de Ferrol, which keeps the two distinguishable', () => {
    // The accepted cost of the Racing rule, pinned so it cannot widen by
    // accident into a bare /\bRacing\b/ that collapses both to one label.
    expect(shortClubName('Racing Ferrol')).toBe('Racing Ferrol')
  })

  it('applies word rules to clubs it has never seen', () => {
    // The reason this is a word table and not a club table: nobody added a row
    // for either of these.
    expect(shortClubName('Sheffield Wednesday')).toBe('Sheff Wednesday')
    expect(shortClubName('Manchester Corinthians')).toBe('Man Corinthians')
  })

  it('leaves a name it does not recognise completely alone', () => {
    for (const name of [
      'Arsenal', 'Everton', 'Leeds', 'Liverpool', 'Chelsea',
      'Aston Villa', 'Crystal Palace', 'Hull City', 'Ipswich',
      'Bayer Leverkusen', 'Real Sociedad',
    ]) {
      expect(shortClubName(name)).toBe(name)
    }
  })

  it('is stable when applied twice', () => {
    // The table renders per row on every re-render; a rule that re-fired on its
    // own output would erode a name a character at a time.
    for (const name of [
      'Manchester United', 'Nottingham Forest', 'Wolverhampton Wanderers',
      'Deportivo La Coruna', 'Racing Santander',
    ]) {
      const once = shortClubName(name)
      expect(shortClubName(once)).toBe(once)
    }
  })
})
