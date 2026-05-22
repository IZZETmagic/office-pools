// Audit: simulate full bracket cascade against multiple Annex C options
// to verify resolveAllR32Matches places 3rd-place teams per FIFA's spec
// across the full lookup table — not just option 1.

import { resolveAllR32Matches, getAnnexCInfo, type GroupStanding } from '../lib/tournament'

function team(name: string, group: string, points: number, gd: number, gf: number): GroupStanding {
  return {
    team_id: `${group}-${name}`,
    country_name: name,
    country_code: name.slice(0, 3).toUpperCase(),
    flag_url: '',
    group_letter: group,
    fifa_ranking_points: 1000,
    played: 3, wins: 0, draws: 0, losses: 0,
    goalsFor: gf, goalsAgainst: gf - gd, goalDifference: gd,
    points,
  }
}

const GROUPS = ['A','B','C','D','E','F','G','H','I','J','K','L']

const COL_TO_MATCH: Record<string, number> = {
  '1A': 79, '1B': 85, '1D': 81, '1E': 74, '1G': 82, '1I': 77, '1K': 87, '1L': 80,
}

function buildStandings(strongGroups: Set<string>): Map<string, GroupStanding[]> {
  const s = new Map<string, GroupStanding[]>()
  for (const g of GROUPS) {
    const thirdPts = strongGroups.has(g) ? 6 : 3
    const thirdGD = strongGroups.has(g) ? 2 : 0
    s.set(g, [
      team(`1${g}`, g, 9, 5, 6),
      team(`2${g}`, g, 6, 2, 4),
      team(`3${g}`, g, thirdPts, thirdGD, 3),
      team(`4${g}`, g, 0, -5, 0),
    ])
  }
  return s
}

function runCase(label: string, qualGroups: string[], expectedAssignment: Record<string, string>): boolean {
  const standings = buildStandings(new Set(qualGroups))
  const info = getAnnexCInfo(standings)
  const resolutions = resolveAllR32Matches(standings)

  console.log(`\n${label}:`)
  console.log(`  Qualifying: ${qualGroups.slice().sort().join(',')}`)
  console.log(`  Annex C option: ${info?.optionNumber}`)

  let pass = true
  for (const [col, expGrp] of Object.entries(expectedAssignment)) {
    const m = COL_TO_MATCH[col]
    const r = resolutions.get(m)
    const got = r?.away?.group_letter
    const ok = got === expGrp
    if (!ok) {
      console.log(`    M${m} (col ${col}): expected ${expGrp}, got ${got} ✗ FAIL`)
      pass = false
    }
  }
  console.log(`  ${pass ? '✅ PASS' : '❌ FAIL'}`)
  return pass
}

// Test cases drawn from FIFA Annex C published table:
// Option 1:   E F G H I J K L  →  1A=E 1B=J 1D=I 1E=F 1G=H 1I=G 1K=L 1L=K
// Option 22:  C D F G H I K L  →  1A=C 1B=G 1D=I 1E=D 1G=H 1I=F 1K=L 1L=K  (no 1L=I)
//             actually FIFA row 22: 3C 3G 3I 3D 3H 3F 3L 3K
// Option 100: known if we extract from regs — skipping
// Option 495: H G B C A F D E  →  1A=H 1B=G 1D=B 1E=C 1G=A 1I=F 1K=D 1L=E
//             FIFA row 495: 3H 3G 3B 3C 3A 3F 3D 3E

let allPass = true

allPass = runCase(
  'Option 1: third-placers from E,F,G,H,I,J,K,L',
  ['E','F','G','H','I','J','K','L'],
  { '1A':'E', '1B':'J', '1D':'I', '1E':'F', '1G':'H', '1I':'G', '1K':'L', '1L':'K' },
) && allPass

allPass = runCase(
  'Option 22: third-placers from C,D,F,G,H,I,K,L',
  ['C','D','F','G','H','I','K','L'],
  { '1A':'C', '1B':'G', '1D':'I', '1E':'D', '1G':'H', '1I':'F', '1K':'L', '1L':'K' },
) && allPass

allPass = runCase(
  'Option 495: third-placers from A,B,C,D,E,F,G,H',
  ['A','B','C','D','E','F','G','H'],
  { '1A':'H', '1B':'G', '1D':'B', '1E':'C', '1G':'A', '1I':'F', '1K':'D', '1L':'E' },
) && allPass

console.log(allPass ? '\n\n✅ ALL OPTIONS PASSED' : '\n\n❌ FAILURES — investigate above')
process.exit(allPass ? 0 : 1)
