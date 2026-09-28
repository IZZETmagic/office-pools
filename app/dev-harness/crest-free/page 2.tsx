'use client'

// =============================================================
// Throwaway: what the app looks like without third-party marks
// =============================================================
// Built 2026-09-13 to answer one question — does dropping the league marks and
// the club crests actually make the app look less polished, or does it just
// make it look less like everybody else's pick'em?
//
// ⚠ THROWAWAY. Not linked from anywhere, not a product surface. Delete it once
// the call is made. It renders at the REAL geometry — the 46px rail and 36x66
// mark from SIZES in components/competitions/CompetitionRail.tsx, the 24px
// badge from TeamBadge in results/MatchCard.tsx — because a mockup at the wrong
// size answers the wrong question.
//
// The club colours and the clash rule are lifted verbatim from
// mobile/lib/design/clubColors.ts. That file is the argument: twenty curated
// values, every one checked at 4.5:1, and a measured threshold of 110 that
// sends 27% of pairings back to the app's own colours rather than ship two
// pills a viewer cannot tell apart.
// =============================================================

import { useEffect, useState, type CSSProperties } from 'react'
import { CompetitionRail } from '@/components/competitions/CompetitionRail'
import { getPoolStripe } from '@/lib/design/poolMode'
import { LEAGUE_ID } from '@/lib/design/competitionColor'

// ---------------------------------------------------------------------------
// Data: real competitions, real clubs, real abbreviations from league_clubs.
// ---------------------------------------------------------------------------

const COMPETITIONS = [
  { id: LEAGUE_ID.premierLeague, name: 'Premier League', wordmark: 'PREMIER LEAGUE', mono: 'PL' },
  { id: LEAGUE_ID.championsLeague, name: 'Champions League', wordmark: 'CHAMPIONS LEAGUE', mono: 'CL' },
  { id: LEAGUE_ID.laLiga, name: 'La Liga', wordmark: 'LA LIGA', mono: 'LL' },
  { id: LEAGUE_ID.serieA, name: 'Serie A', wordmark: 'SERIE A', mono: 'SA' },
  { id: LEAGUE_ID.bundesliga, name: 'Bundesliga', wordmark: 'BUNDESLIGA', mono: 'BL' },
  { id: LEAGUE_ID.ligue1, name: 'Ligue 1', wordmark: 'LIGUE 1', mono: 'L1' },
  { id: LEAGUE_ID.worldCup, name: 'World Cup', wordmark: 'WORLD CUP', mono: 'WC' },
]

type Club = { id: number; name: string; abb: string }

const CLUB: Record<string, Club> = {
  ars: { id: 42, name: 'Arsenal', abb: 'ARS' },
  che: { id: 49, name: 'Chelsea', abb: 'CHE' },
  mun: { id: 33, name: 'Manchester United', abb: 'MUN' },
  liv: { id: 40, name: 'Liverpool', abb: 'LIV' },
  mci: { id: 50, name: 'Manchester City', abb: 'MCI' },
  tot: { id: 47, name: 'Tottenham', abb: 'TOT' },
  new: { id: 34, name: 'Newcastle', abb: 'NEW' },
  bri: { id: 51, name: 'Brighton', abb: 'BRI' },
  cry: { id: 52, name: 'Crystal Palace', abb: 'CRY' },
  eve: { id: 45, name: 'Everton', abb: 'EVE' },
  ful: { id: 36, name: 'Fulham', abb: 'FUL' },
  avl: { id: 66, name: 'Aston Villa', abb: 'AST' },
}

const crest = (c: Club) => `https://media.api-sports.io/football/teams/${c.id}.png`

/** Verbatim from mobile/lib/design/clubColors.ts. */
const CLUB_COLOR: Record<number, string> = {
  42: '#DB0007', 66: '#670E36', 35: '#B50E12', 55: '#E30613', 51: '#0057B8',
  49: '#034694', 1346: '#1D5BA4', 52: '#1B458F', 45: '#003399', 36: '#1B1B1B',
  64: '#8F5100', 57: '#3A64A3', 63: '#1D428A', 40: '#C8102E', 50: '#1C6FB5',
  33: '#DA291C', 34: '#241F20', 65: '#C40000', 746: '#C81428', 47: '#132257',
}

const FALLBACK = { home: '#3B6EFF', away: '#64748B' }
const CLASH_THRESHOLD = 110

function distance(a: string, b: string): number {
  const rgb = (h: string) => {
    const s = h.replace('#', '')
    return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16))
  }
  const [r1, g1, b1] = rgb(a)
  const [r2, g2, b2] = rgb(b)
  return Math.sqrt(2 * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + 3 * (b1 - b2) ** 2)
}

function fixturePalette(home: Club, away: Club) {
  const h = CLUB_COLOR[home.id] ?? null
  const a = CLUB_COLOR[away.id] ?? null
  if (!h || !a) return { ...FALLBACK, usingClubColors: false, gap: null as number | null }
  const gap = distance(h, a)
  if (gap < CLASH_THRESHOLD) return { ...FALLBACK, usingClubColors: false, gap }
  return { home: h, away: a, usingClubColors: true, gap }
}

// ---------------------------------------------------------------------------
// Rail variants — all four at the real 46px width.
// ---------------------------------------------------------------------------

function stripe(id: number): CSSProperties {
  const [from, to] = getPoolStripe({ externalLeagueId: id })
  return { '--stripe-from': from, '--stripe-to': to } as CSSProperties
}

/** B — the competition's NAME, set in our own type, running up the rail. */
function WordmarkRail({ id, wordmark }: { id: number; wordmark: string }) {
  return (
    <span
      aria-hidden="true"
      className="shrink-0 competition-rail"
      style={{ ...stripe(id), width: 46 }}
    >
      <span
        className="text-white/95 font-black uppercase whitespace-nowrap"
        style={{
          writingMode: 'vertical-rl',
          transform: 'rotate(180deg)',
          fontSize: 11,
          letterSpacing: '0.18em',
        }}
      >
        {wordmark}
      </span>
    </span>
  )
}

/** C — a two-letter monogram in a knocked-out tile. */
function MonogramRail({ id, mono }: { id: number; mono: string }) {
  return (
    <span
      aria-hidden="true"
      className="shrink-0 competition-rail"
      style={{ ...stripe(id), width: 46 }}
    >
      <span
        className="grid place-items-center font-black text-white"
        style={{
          width: 34,
          height: 34,
          fontSize: 15,
          letterSpacing: '0.02em',
          borderRadius: 10,
          border: '2px solid rgba(255,255,255,0.9)',
        }}
      >
        {mono}
      </span>
    </span>
  )
}

/** D — the 5px colour bar the code already falls back to today. */
function BarRail({ id }: { id: number }) {
  return <span aria-hidden="true" className="w-[5px] shrink-0 pool-stripe" style={stripe(id)} />
}

function PoolCard({
  rail,
  competitionName,
  showName,
}: {
  rail: React.ReactNode
  competitionName: string
  showName: boolean
}) {
  return (
    <div className="flex overflow-hidden rounded-card border border-border-default bg-surface shadow-sm w-[358px]">
      {rail}
      <div className="flex-1 p-4 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-black text-neutral-900 truncate">The Sargasso Sea</h3>
          <span className="text-xs text-neutral-500 shrink-0">2nd / 14</span>
        </div>
        <p className="text-xs text-neutral-500 mt-0.5">
          {showName ? `${competitionName} · ` : ''}Matchweek 4 · 14 members
        </p>
        <div className="grid grid-cols-4 gap-2 mt-3">
          {[
            ['POINTS', '348'],
            ['EXACT', '14'],
            ['FORM', 'W W L'],
            ['MOVE', '+2'],
          ].map(([k, v]) => (
            <div key={k} className="rounded-chip bg-surface-secondary px-2 py-1.5">
              <div className="text-[9px] font-bold tracking-wider text-neutral-500">{k}</div>
              <div className="text-sm font-black text-neutral-900">{v}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Match row variants — at the real 24px badge size.
// ---------------------------------------------------------------------------

function MatchRowCrest({ home, away, score }: { home: Club; away: Club; score: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-chip bg-surface border border-border-default">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={crest(home)} alt="" className="w-6 h-6 object-contain shrink-0" />
        <span className="truncate text-sm text-neutral-900">{home.name}</span>
      </div>
      <span className="font-black text-sm text-neutral-900 tabular-nums">{score}</span>
      <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
        <span className="truncate text-sm text-neutral-900">{away.name}</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={crest(away)} alt="" className="w-6 h-6 object-contain shrink-0" />
      </div>
    </div>
  )
}

function ClubChip({ club, color }: { club: Club; color: string }) {
  return (
    <span
      className="grid place-items-center shrink-0 text-white font-black"
      style={{ width: 24, height: 24, borderRadius: 7, background: color, fontSize: 9, letterSpacing: '0.02em' }}
    >
      {club.abb}
    </span>
  )
}

function MatchRowChip({ home, away, score }: { home: Club; away: Club; score: string }) {
  const pal = fixturePalette(home, away)
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-chip bg-surface border border-border-default">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <ClubChip club={home} color={pal.home} />
        <span className="truncate text-sm text-neutral-900">{home.name}</span>
      </div>
      <span className="font-black text-sm text-neutral-900 tabular-nums">{score}</span>
      <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
        <span className="truncate text-sm text-neutral-900">{away.name}</span>
        <ClubChip club={away} color={pal.away} />
      </div>
    </div>
  )
}

function MatchRowEdge({ home, away, score }: { home: Club; away: Club; score: string }) {
  const pal = fixturePalette(home, away)
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 rounded-chip bg-surface border border-border-default">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="shrink-0" style={{ width: 4, height: 24, borderRadius: 2, background: pal.home }} />
        <span className="truncate text-sm text-neutral-900">{home.name}</span>
      </div>
      <span className="font-black text-sm text-neutral-900 tabular-nums">{score}</span>
      <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
        <span className="truncate text-sm text-neutral-900">{away.name}</span>
        <span className="shrink-0" style={{ width: 4, height: 24, borderRadius: 2, background: pal.away }} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// League table — where density actually bites.
// ---------------------------------------------------------------------------

const TABLE: Array<{ club: Club; pl: number; gd: string; pts: number }> = [
  { club: CLUB.liv, pl: 4, gd: '+8', pts: 12 },
  { club: CLUB.ars, pl: 4, gd: '+6', pts: 10 },
  { club: CLUB.mci, pl: 4, gd: '+5', pts: 9 },
  { club: CLUB.che, pl: 4, gd: '+2', pts: 8 },
  { club: CLUB.tot, pl: 4, gd: '+1', pts: 7 },
  { club: CLUB.new, pl: 4, gd: '0', pts: 5 },
  { club: CLUB.bri, pl: 4, gd: '-1', pts: 5 },
  { club: CLUB.mun, pl: 4, gd: '-3', pts: 4 },
]

function TableRows({ variant }: { variant: 'crest' | 'chip' }) {
  return (
    <div className="rounded-card border border-border-default overflow-hidden bg-surface w-[358px]">
      {TABLE.map((row, i) => (
        <div
          key={row.club.id}
          className="flex items-center gap-3 px-3 py-2 border-b border-border-default last:border-b-0"
        >
          <span className="w-4 text-xs text-neutral-500 tabular-nums">{i + 1}</span>
          {variant === 'crest' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={crest(row.club)} alt="" className="w-6 h-6 object-contain shrink-0" />
          ) : (
            <ClubChip club={row.club} color={CLUB_COLOR[row.club.id] ?? FALLBACK.away} />
          )}
          <span className="flex-1 truncate text-sm text-neutral-900">{row.club.name}</span>
          <span className="w-6 text-xs text-neutral-500 tabular-nums text-right">{row.pl}</span>
          <span className="w-8 text-xs text-neutral-500 tabular-nums text-right">{row.gd}</span>
          <span className="w-6 text-sm font-black text-neutral-900 tabular-nums text-right">{row.pts}</span>
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------

function Column({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-black text-neutral-900">{title}</h3>
        <p className="text-xs text-neutral-500 max-w-[358px]">{note}</p>
      </div>
      {children}
    </div>
  )
}

export default function CrestFreeHarness() {
  const [dark, setDark] = useState(false)

  // `?dark=1` so a headless screenshot can capture the dark surface too — the
  // toggle below is the same state, just clicked by a human.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('dark')) setDark(true)
  }, [])

  // ⚠ THE CLASS HAS TO GO ON <html>. The app's surface tokens are defined under
  // `html.dark` in globals.css, so a `dark` class on a nested div does nothing —
  // which is exactly what the first dark screenshot showed.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  return (
    <div>
      <div className="min-h-screen bg-surface px-6 py-10">
        <div className="max-w-[1600px] mx-auto space-y-12">
          <header className="space-y-2">
            <h1 className="text-3xl font-black text-neutral-900">Crest-free mockup</h1>
            <p className="text-neutral-700 max-w-3xl">
              Left column is what ships today. Everything to its right uses no third-party mark —
              only competition and club <strong>names</strong>, brand <strong>colours</strong>, and our own type.
              Real geometry throughout: the 46px rail and 36&times;66 mark from{' '}
              <code className="text-sm">CompetitionRail</code>, the 24px badge from{' '}
              <code className="text-sm">MatchCard</code>.
            </p>
            <button
              onClick={() => setDark((d) => !d)}
              className="rounded-chip border border-border-default px-3 py-1.5 text-sm font-medium text-neutral-900"
            >
              {dark ? 'Light' : 'Dark'} mode
            </button>
          </header>

          {/* ---- Pool card rail ---- */}
          <section className="space-y-5">
            <h2 className="text-xl font-black text-neutral-900">1. The pool card rail</h2>
            <p className="text-sm text-neutral-700 max-w-3xl">
              The rail exists because the card never names its competition. Two of the three
              alternatives fix that by naming it — which is also the strongest legal position, since
              a competition&apos;s <em>name</em> is free to use referentially and its <em>logo</em> is not.
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-8">
              <Column title="A. Today" note="The league's own mark, recoloured and committed to the repo. The thing under review.">
                <div className="space-y-3">
                  {COMPETITIONS.map((c) => (
                    <PoolCard key={c.id} competitionName={c.name} showName={false}
                      rail={<CompetitionRail externalLeagueId={c.id} />} />
                  ))}
                </div>
              </Column>

              <Column title="B. Wordmark rail" note="The competition's name in Nunito, running up the rail. Fills the same 46px, says more than the mark did.">
                <div className="space-y-3">
                  {COMPETITIONS.map((c) => (
                    <PoolCard key={c.id} competitionName={c.name} showName={false}
                      rail={<WordmarkRail id={c.id} wordmark={c.wordmark} />} />
                  ))}
                </div>
              </Column>

              <Column title="C. Monogram" note="Two letters in a knocked-out tile. Closest to the current silhouette; reads at compact size where wordmarks fail.">
                <div className="space-y-3">
                  {COMPETITIONS.map((c) => (
                    <PoolCard key={c.id} competitionName={c.name} showName={false}
                      rail={<MonogramRail id={c.id} mono={c.mono} />} />
                  ))}
                </div>
              </Column>

              <Column title="D. Bar + name" note="The 5px fallback the code already ships for unthemed leagues, with the competition named in the meta line.">
                <div className="space-y-3">
                  {COMPETITIONS.map((c) => (
                    <PoolCard key={c.id} competitionName={c.name} showName
                      rail={<BarRail id={c.id} />} />
                  ))}
                </div>
              </Column>
            </div>
          </section>

          {/* ---- Match rows ---- */}
          <section className="space-y-5">
            <h2 className="text-xl font-black text-neutral-900">2. The match row</h2>
            <p className="text-sm text-neutral-700 max-w-3xl">
              Third fixture is the honest one: Arsenal v Manchester United measures 89.7 apart, under
              the 110 threshold, so <strong>both</strong> sides revert to the app&apos;s own pair rather than
              shipping two reds a viewer cannot tell apart. That rule already exists in{' '}
              <code className="text-sm">clubColors.ts</code>.
            </p>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <Column title="A. Today — crests" note="24px. This is the real size, not a hero shot.">
                <div className="space-y-2 w-[358px]">
                  <MatchRowCrest home={CLUB.ars} away={CLUB.che} score="2 – 1" />
                  <MatchRowCrest home={CLUB.bri} away={CLUB.avl} score="0 – 0" />
                  <MatchRowCrest home={CLUB.ars} away={CLUB.mun} score="3 – 1" />
                </div>
              </Column>
              <Column title="B. Colour chip + code" note="Club colour, three letters, our type. Same footprint.">
                <div className="space-y-2 w-[358px]">
                  <MatchRowChip home={CLUB.ars} away={CLUB.che} score="2 – 1" />
                  <MatchRowChip home={CLUB.bri} away={CLUB.avl} score="0 – 0" />
                  <MatchRowChip home={CLUB.ars} away={CLUB.mun} score="3 – 1" />
                </div>
              </Column>
              <Column title="C. Colour edge" note="Quietest option. The name does the identifying; colour only confirms it.">
                <div className="space-y-2 w-[358px]">
                  <MatchRowEdge home={CLUB.ars} away={CLUB.che} score="2 – 1" />
                  <MatchRowEdge home={CLUB.bri} away={CLUB.avl} score="0 – 0" />
                  <MatchRowEdge home={CLUB.ars} away={CLUB.mun} score="3 – 1" />
                </div>
              </Column>
            </div>
          </section>

          {/* ---- Table ---- */}
          <section className="space-y-5">
            <h2 className="text-xl font-black text-neutral-900">3. The league table</h2>
            <p className="text-sm text-neutral-700 max-w-3xl">
              Eight rows of crests is where borrowed identity looks most generic — and where a
              missing crest (<code className="text-sm">crest_url</code> is nullable) looks most broken.
            </p>
            <div className="flex flex-wrap gap-8">
              <Column title="A. Today — crests" note="Eight provider PNGs, eight network requests.">
                <TableRows variant="crest" />
              </Column>
              <Column title="B. Colour + code" note="No network, no nullable field, no licence.">
                <TableRows variant="chip" />
              </Column>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
