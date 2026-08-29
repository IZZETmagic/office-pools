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

  it('⚠ OVERTURNED — Atletico and Rayo now shorten', () => {
    // This assertion used to hold the opposite, on the reasoning that the 375px
    // TABLE held 15 characters so restraint was cheaper than a rule. That was
    // true of the table. The dashboard's live card gives a name 98px, where
    // "Atletico Madrid" does not fit, so the premise changed rather than the
    // principle. Ryan's call, 2026-08-29.
    expect(shortClubName('Atletico Madrid')).toBe('Atletico')
    expect(shortClubName('Rayo Vallecano')).toBe('Rayo')
  })

  it('still leaves the names that genuinely fit alone', () => {
    // The restraint IS the rule, and it still applies to everything that has
    // not been measured as overrunning. A row per mildly-long name turns this
    // back into the club table it exists not to be.
    for (const name of ['Athletic Club', 'Celta Vigo', 'Real Betis', 'Girona']) {
      expect(shortClubName(name)).toBe(name)
    }
  })

  it('does not shorten Racing de Ferrol, which keeps the two distinguishable', () => {
    // The accepted cost of the Racing rule, pinned so it cannot widen by
    // accident into a bare /\bRacing\b/ that collapses both to one label.
    expect(shortClubName('Racing Ferrol')).toBe('Racing Ferrol')
  })

  it('shortens the two Ligue 1 names that overran', () => {
    expect(shortClubName('Paris Saint Germain')).toBe('PSG')
    expect(shortClubName('Paris Saint-Germain')).toBe('PSG')
    expect(shortClubName('Stade Brestois 29')).toBe('Brest')
  })

  it('⚠ keeps Paris FC distinct from PSG', () => {
    // The whole reason PSG is not shortened to "Paris": both clubs are in Ligue
    // 1 2026/27, and "Paris" beside "Paris FC" reads as two spellings of one
    // club. Pinned so the rule cannot be "simplified" into a collision later —
    // the same hazard the Racing Ferrol test above guards.
    expect(shortClubName('Paris FC')).toBe('Paris FC')
    expect(shortClubName('Paris Saint Germain')).not.toBe('Paris')
  })

  it('leaves other Stade clubs alone', () => {
    // "Stade" prefixes several unrelated French clubs, so the rule is
    // whole-name and must not generalise to the word.
    expect(shortClubName('Stade Rennais')).toBe('Stade Rennais')
    expect(shortClubName('Stade de Reims')).toBe('Stade de Reims')
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
      'Real Sociedad', 'Union Berlin', 'Werder Bremen',
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
      'Borussia Mönchengladbach', 'Bayern München', 'Atletico Madrid',
      'Bayer Leverkusen', 'SC Paderborn 07',
      'Paris Saint Germain', 'Stade Brestois 29',
    ]) {
      const once = shortClubName(name)
      expect(shortClubName(once)).toBe(once)
    }
  })
})

describe('the German and Spanish names (added 2026-08-29)', () => {
  it('shortens every Bundesliga club that overran', () => {
    // The seven measured as over 13 characters after the English rules ran.
    expect(shortClubName('Borussia Mönchengladbach')).toBe('Gladbach')
    expect(shortClubName('Borussia Dortmund')).toBe('Dortmund')
    expect(shortClubName('Eintracht Frankfurt')).toBe('Frankfurt')
    expect(shortClubName('Bayer Leverkusen')).toBe('Leverkusen')
    expect(shortClubName('Bayern München')).toBe('Bayern')
    expect(shortClubName('1899 Hoffenheim')).toBe('Hoffenheim')
    expect(shortClubName('SC Paderborn 07')).toBe('Paderborn')
  })

  it('shortens the two La Liga names that overran', () => {
    expect(shortClubName('Atletico Madrid')).toBe('Atletico')
    expect(shortClubName('Rayo Vallecano')).toBe('Rayo')
  })

  it('⚠ matches the German names with OR without their umlauts', () => {
    // The feed ships Bundesliga names accented and La Liga names bare, so the
    // encoding is a property of the provider rather than of the club. A rule
    // that stopped matching when that changed would fail the way this file is
    // least able to notice — by rendering a name three times the width the
    // layout holds, silently.
    expect(shortClubName('Borussia Monchengladbach')).toBe('Gladbach')
    expect(shortClubName('Bayern Munchen')).toBe('Bayern')
    expect(shortClubName('Atlético Madrid')).toBe('Atletico')
  })

  it('⚠ does NOT shorten on the shared prefix words', () => {
    // "Borussia" is Dortmund and Mönchengladbach both; "Eintracht" is Frankfurt
    // and Braunschweig. A word rule on either would collide the moment the
    // second is promoted, so all seven are whole-name forms.
    expect(shortClubName('Borussia Neunkirchen')).toBe('Borussia Neunkirchen')
    expect(shortClubName('Eintracht Braunschweig')).toBe('Eintracht Braunschweig')
  })

  it('leaves "Bayern" and "Bayer" as distinct clubs', () => {
    // One is a prefix of the other. Getting this wrong would rename Leverkusen
    // to Bayern, which is a different club in a different city.
    expect(shortClubName('Bayern München')).toBe('Bayern')
    expect(shortClubName('Bayer Leverkusen')).toBe('Leverkusen')
  })

  it('brings every club in the four leagues within the layout', () => {
    // The measured ceiling: a name gets 98px in the live card's stacked
    // layout, which holds about 16 characters at text-xs. Crystal Palace (14)
    // is the longest that remains and is deliberately left alone — the English
    // calibration in the header stands.
    const longest = [
      'Borussia Mönchengladbach', 'Eintracht Frankfurt', 'Bayer Leverkusen',
      'Atletico Madrid', 'Rayo Vallecano', '1899 Hoffenheim', 'SC Paderborn 07',
      'Nottingham Forest', 'Deportivo La Coruna',
      // Ligue 1, added 2026-08-28 with the league itself.
      'Paris Saint Germain', 'Stade Brestois 29', 'Estac Troyes', 'Strasbourg',
    ]
    for (const name of longest) {
      expect(shortClubName(name).length).toBeLessThanOrEqual(13)
    }
  })
})
