// =============================================================
// Club identity data — facts, not marks
// =============================================================
// A club's colours are facts about the club. Its crest is not. This map is the
// whole substitute: a PAIR per club, because one colour cannot separate seven
// red teams and two colours very nearly can.
//
// ⚠ PRIMARIES ARE THE MEASURED ONES from mobile/lib/design/clubColors.ts —
// every value there clears 4.5:1 against white, two of them deliberately off
// the official brand for exactly that reason (Arsenal, Hull). Secondaries are
// the club's second colour and only ever appear as a ring, never behind text.
// =============================================================

export type Club = {
  id: number
  name: string
  short: string
  code: string
  primary: string
  secondary: string
}

export const CLUBS: Record<string, Club> = {
  ars: { id: 42, name: 'Arsenal', short: 'Arsenal', code: 'ARS', primary: '#DB0007', secondary: '#FFFFFF' },
  avl: { id: 66, name: 'Aston Villa', short: 'Villa', code: 'AVL', primary: '#670E36', secondary: '#95BFE5' },
  bou: { id: 35, name: 'Bournemouth', short: 'Bournemouth', code: 'BOU', primary: '#B50E12', secondary: '#1B1B1B' },
  bre: { id: 55, name: 'Brentford', short: 'Brentford', code: 'BRE', primary: '#E30613', secondary: '#FFFFFF' },
  bha: { id: 51, name: 'Brighton', short: 'Brighton', code: 'BHA', primary: '#0057B8', secondary: '#FFFFFF' },
  che: { id: 49, name: 'Chelsea', short: 'Chelsea', code: 'CHE', primary: '#034694', secondary: '#DBA111' },
  cry: { id: 52, name: 'Crystal Palace', short: 'Palace', code: 'CRY', primary: '#1B458F', secondary: '#C4122E' },
  eve: { id: 45, name: 'Everton', short: 'Everton', code: 'EVE', primary: '#003399', secondary: '#FFFFFF' },
  ful: { id: 36, name: 'Fulham', short: 'Fulham', code: 'FUL', primary: '#1B1B1B', secondary: '#FFFFFF' },
  ips: { id: 57, name: 'Ipswich', short: 'Ipswich', code: 'IPS', primary: '#3A64A3', secondary: '#FFFFFF' },
  lee: { id: 63, name: 'Leeds', short: 'Leeds', code: 'LEE', primary: '#1D428A', secondary: '#FFE100' },
  liv: { id: 40, name: 'Liverpool', short: 'Liverpool', code: 'LIV', primary: '#C8102E', secondary: '#00B2A9' },
  mci: { id: 50, name: 'Manchester City', short: 'Man City', code: 'MCI', primary: '#1C6FB5', secondary: '#FFFFFF' },
  mun: { id: 33, name: 'Manchester United', short: 'Man United', code: 'MUN', primary: '#DA291C', secondary: '#1B1B1B' },
  new: { id: 34, name: 'Newcastle', short: 'Newcastle', code: 'NEW', primary: '#241F20', secondary: '#FFFFFF' },
  nfo: { id: 65, name: 'Nottingham Forest', short: "Nott'm Forest", code: 'NFO', primary: '#C40000', secondary: '#FFFFFF' },
  sun: { id: 746, name: 'Sunderland', short: 'Sunderland', code: 'SUN', primary: '#C81428', secondary: '#FFFFFF' },
  tot: { id: 47, name: 'Tottenham', short: 'Spurs', code: 'TOT', primary: '#132257', secondary: '#FFFFFF' },
  hul: { id: 64, name: 'Hull City', short: 'Hull', code: 'HUL', primary: '#8F5100', secondary: '#1B1B1B' },
  cov: { id: 1346, name: 'Coventry', short: 'Coventry', code: 'COV', primary: '#1D5BA4', secondary: '#FFFFFF' },
}

export const crestUrl = (c: Club) => `https://media.api-sports.io/football/teams/${c.id}.png`

/** Perceptual-ish distance — the rule from clubColors.ts, threshold and all. */
export function distance(a: string, b: string): number {
  const rgb = (h: string) => {
    const s = h.replace('#', '')
    return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16))
  }
  const [r1, g1, b1] = rgb(a)
  const [r2, g2, b2] = rgb(b)
  return Math.sqrt(2 * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + 3 * (b1 - b2) ** 2)
}
export const CLASH_THRESHOLD = 110
export const clash = (a: Club, b: Club) => distance(a.primary, b.primary) < CLASH_THRESHOLD
