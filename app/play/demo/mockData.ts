// ── Shared mock data for bar demo pages ──

export type Player = {
  rank: number
  name: string
  exact: number
  correct: number
  bonus: number
  points: number
  move: number
  form?: ('exact' | 'correct' | 'gd' | 'miss')[]
  awards?: string[]
}

export type MockMatch = {
  matchNumber: number
  stage: string
  homeTeam: string
  homeFlag: string
  awayTeam: string
  awayFlag: string
  homeScore: number
  awayScore: number
  predictedHome: number
  predictedAway: number
  result: 'exact' | 'gd' | 'correct' | 'miss'
  pointsEarned: number
}

export const POOL_INFO = {
  name: "The Anchor's World Cup Pool",
  barName: 'The Anchor',
  status: 'active' as const,
  memberCount: 28,
  mode: 'Full Tournament',
  address: '12 Front Street, Hamilton, Bermuda',
  // Branding
  logoEmoji: '⚓',
  tagline: "Bermuda's Home for Football",
  primaryColor: '#0c1f3d',
  primaryGradient: 'linear-gradient(135deg, #0c1f3d 0%, #1a3654 40%, #0d2847 100%)',
  accentColor: '#14b8a6',
  accentColorLight: '#99f6e4',
  prizes: [
    { place: '1st Place', prize: '$150 Bar Tab', icon: '🏆', color: 'from-amber-500 to-amber-600', border: 'border-amber-200' },
    { place: '2nd Place', prize: '$75 Bar Tab', icon: '🥈', color: 'from-neutral-400 to-neutral-500', border: 'border-neutral-200' },
    { place: '3rd Place', prize: 'Free Fish Sandwich Platter', icon: '🥉', color: 'from-amber-700 to-amber-800', border: 'border-amber-200/50' },
  ],
}

export const PODIUM: Player[] = [
  { rank: 1, name: 'SkipperDan',  exact: 12, correct: 18, bonus: 150, points: 312, move: 0,  form: ['exact', 'correct', 'miss', 'exact', 'gd'], awards: ['MVP'] },
  { rank: 2, name: 'JohnnyB',     exact: 10, correct: 17, bonus: 100, points: 247, move: 1,  form: ['correct', 'exact', 'gd', 'correct', 'exact'] },
  { rank: 3, name: 'BermudaBri',  exact: 9,  correct: 16, bonus: 100, points: 231, move: -1, form: ['miss', 'exact', 'correct', 'gd', 'exact'] },
]

export const TABLE_PLAYERS: Player[] = [
  { rank: 4,  name: 'CedricTheGreat', exact: 8,  correct: 14, bonus: 75,  points: 218, move: 2,  form: ['exact', 'gd', 'correct', 'exact', 'miss'] },
  { rank: 5,  name: 'DocksideDave',   exact: 7,  correct: 16, bonus: 50,  points: 205, move: 0,  form: ['correct', 'miss', 'exact', 'correct', 'gd'] },
  { rank: 6,  name: 'IslandKing441',  exact: 6,  correct: 18, bonus: 50,  points: 198, move: -1, form: ['miss', 'correct', 'gd', 'miss', 'correct'] },
  { rank: 7,  name: 'LisaFromFlat',   exact: 7,  correct: 13, bonus: 50,  points: 189, move: 0,  form: ['exact', 'miss', 'correct', 'exact', 'correct'] },
  { rank: 8,  name: 'GomboSmash',     exact: 5,  correct: 15, bonus: 75,  points: 183, move: 5,  form: ['exact', 'exact', 'gd', 'correct', 'exact'], awards: ['Hot Streak'] },
  { rank: 9,  name: 'DarkNStormy',    exact: 6,  correct: 12, bonus: 25,  points: 176, move: 0,  form: ['gd', 'correct', 'miss', 'exact', 'miss'] },
  { rank: 10, name: 'SwizzleSam',     exact: 5,  correct: 14, bonus: 25,  points: 171, move: -2, form: ['miss', 'correct', 'miss', 'gd', 'correct'] },
  { rank: 11, name: 'TuckersPoint',   exact: 5,  correct: 13, bonus: 25,  points: 164, move: 0,  form: ['correct', 'miss', 'exact', 'miss', 'gd'] },
  { rank: 12, name: 'HorseshoeKev',   exact: 4,  correct: 15, bonus: 50,  points: 158, move: 3,  form: ['exact', 'correct', 'correct', 'gd', 'exact'] },
  { rank: 13, name: 'FlattsVillage',  exact: 5,  correct: 11, bonus: 25,  points: 151, move: 0,  form: ['miss', 'miss', 'correct', 'exact', 'gd'] },
  { rank: 14, name: 'WahooWill',      exact: 4,  correct: 14, bonus: 25,  points: 147, move: -1, form: ['correct', 'gd', 'miss', 'correct', 'miss'] },
  { rank: 15, name: 'FrontStreetFin', exact: 4,  correct: 13, bonus: 25,  points: 142, move: 0,  form: ['gd', 'miss', 'correct', 'miss', 'exact'] },
  { rank: 16, name: 'HamiltonHaze',   exact: 3,  correct: 16, bonus: 25,  points: 138, move: 4,  form: ['correct', 'exact', 'gd', 'correct', 'correct'] },
  { rank: 17, name: 'SomersIsle99',   exact: 4,  correct: 12, bonus: 0,   points: 131, move: 0,  form: ['miss', 'correct', 'miss', 'gd', 'miss'] },
  { rank: 18, name: 'RumRunner',      exact: 3,  correct: 14, bonus: 25,  points: 127, move: -3, form: ['miss', 'miss', 'miss', 'correct', 'gd'], awards: ['Cold Streak'] },
  { rank: 19, name: 'BermudaTriangl', exact: 3,  correct: 13, bonus: 25,  points: 121, move: 0,  form: ['gd', 'miss', 'correct', 'miss', 'exact'] },
  { rank: 20, name: 'CoralCutCraig',  exact: 3,  correct: 12, bonus: 25,  points: 115, move: 0,  form: ['correct', 'miss', 'gd', 'miss', 'correct'] },
  { rank: 21, name: 'WestEndWes',     exact: 2,  correct: 15, bonus: 25,  points: 109, move: 0,  form: ['miss', 'correct', 'miss', 'correct', 'gd'] },
  { rank: 22, name: 'StGeorgesGary',  exact: 3,  correct: 11, bonus: 0,   points: 103, move: -2, form: ['miss', 'gd', 'miss', 'miss', 'correct'] },
  { rank: 23, name: 'PinkSandPete',   exact: 2,  correct: 13, bonus: 25,  points: 97,  move: 0,  form: ['correct', 'miss', 'miss', 'gd', 'miss'] },
  { rank: 24, name: 'DockYardDan',    exact: 2,  correct: 12, bonus: 0,   points: 88,  move: 0,  form: ['miss', 'miss', 'correct', 'miss', 'gd'] },
  { rank: 25, name: 'TabbyBayTom',    exact: 1,  correct: 14, bonus: 25,  points: 82,  move: 3,  form: ['correct', 'gd', 'correct', 'miss', 'correct'] },
  { rank: 26, name: 'ElbowBeachEd',   exact: 2,  correct: 10, bonus: 0,   points: 74,  move: 0,  form: ['miss', 'miss', 'miss', 'correct', 'miss'] },
  { rank: 27, name: 'GibbsHillGil',   exact: 1,  correct: 11, bonus: 0,   points: 61,  move: -4, form: ['miss', 'miss', 'miss', 'miss', 'gd'] },
  { rank: 28, name: 'WarwickWonder',  exact: 1,  correct: 9,  bonus: 0,   points: 48,  move: 0,  form: ['miss', 'miss', 'correct', 'miss', 'miss'] },
]

export const ALL_PLAYERS: Player[] = [...PODIUM, ...TABLE_PLAYERS]

export const MOCK_MATCHES: MockMatch[] = [
  { matchNumber: 1,  stage: 'Group A', homeTeam: 'USA',       homeFlag: '🇺🇸', awayTeam: 'Mexico',      awayFlag: '🇲🇽', homeScore: 2, awayScore: 1, predictedHome: 2, predictedAway: 1, result: 'exact',   pointsEarned: 5 },
  { matchNumber: 2,  stage: 'Group A', homeTeam: 'Canada',    homeFlag: '🇨🇦', awayTeam: 'Jamaica',     awayFlag: '🇯🇲', homeScore: 1, awayScore: 0, predictedHome: 2, predictedAway: 0, result: 'gd',      pointsEarned: 3 },
  { matchNumber: 5,  stage: 'Group B', homeTeam: 'Brazil',    homeFlag: '🇧🇷', awayTeam: 'Argentina',   awayFlag: '🇦🇷', homeScore: 3, awayScore: 2, predictedHome: 2, predictedAway: 1, result: 'correct', pointsEarned: 1 },
  { matchNumber: 6,  stage: 'Group B', homeTeam: 'Colombia',  homeFlag: '🇨🇴', awayTeam: 'Chile',       awayFlag: '🇨🇱', homeScore: 0, awayScore: 0, predictedHome: 1, predictedAway: 1, result: 'gd',      pointsEarned: 3 },
  { matchNumber: 9,  stage: 'Group C', homeTeam: 'England',   homeFlag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', awayTeam: 'France',      awayFlag: '🇫🇷', homeScore: 1, awayScore: 2, predictedHome: 0, predictedAway: 3, result: 'correct', pointsEarned: 1 },
  { matchNumber: 10, stage: 'Group C', homeTeam: 'Germany',   homeFlag: '🇩🇪', awayTeam: 'Spain',       awayFlag: '🇪🇸', homeScore: 2, awayScore: 2, predictedHome: 1, predictedAway: 0, result: 'miss',    pointsEarned: 0 },
  { matchNumber: 13, stage: 'Group D', homeTeam: 'Japan',     homeFlag: '🇯🇵', awayTeam: 'South Korea', awayFlag: '🇰🇷', homeScore: 1, awayScore: 1, predictedHome: 1, predictedAway: 1, result: 'exact',   pointsEarned: 5 },
  { matchNumber: 14, stage: 'Group D', homeTeam: 'Australia',  homeFlag: '🇦🇺', awayTeam: 'Saudi Arabia', awayFlag: '🇸🇦', homeScore: 3, awayScore: 0, predictedHome: 2, predictedAway: 1, result: 'correct', pointsEarned: 1 },
]

// Form dot color map
export const FORM_COLORS: Record<string, string> = {
  exact:   'bg-amber-400',      // gold — nailed it
  gd:      'bg-emerald-500',    // green — correct goal difference
  correct: 'bg-blue-500',       // blue — correct result
  miss:    'bg-red-400',        // red — missed
}

export const FORM_LABELS: Record<string, string> = {
  exact:   'Exact Score',
  gd:      'Correct GD',
  correct: 'Correct Result',
  miss:    'Miss',
}

export const RESULT_BORDER_COLORS: Record<string, string> = {
  exact:   'border-l-amber-400',
  gd:      'border-l-emerald-500',
  correct: 'border-l-blue-500',
  miss:    'border-l-red-400',
}

export const RESULT_POINT_COLORS: Record<string, string> = {
  exact:   'bg-amber-100 text-amber-800',
  gd:      'bg-emerald-100 text-emerald-800',
  correct: 'bg-blue-100 text-blue-800',
  miss:    'bg-red-100 text-red-800',
}
