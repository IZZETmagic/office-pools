'use client'

// =============================================================
// Throwaway: the Match Centre without third-party marks
// =============================================================
// The Results tab is the densest crest surface in the product — two competition
// logos and eighteen club crests on one screen — so it is the real test of
// whether a crest-free identity holds up.
//
// ⚠ THROWAWAY. Not linked, not a product surface. Delete once the call is made.
//
// Column A hot-links the real crests so the comparison is honest. Everything to
// its right uses only names, three-letter codes from `league_clubs.abbreviation`,
// and club colours.
//
// ⚠⚠ THE COLOUR MAP IS THE REAL WORK, AND IT DOES NOT EXIST YET.
// `mobile/lib/design/clubColors.ts` is PREMIER LEAGUE ONLY, on purpose — twenty
// clubs, every value measured at 4.5:1 against white. Serie A and La Liga have
// no entries at all, so variants B and C below are running on values written for
// this mockup and NOT contrast-checked to that standard. Several are already
// adjusted off-brand for the same reason Arsenal and Hull were: Lecce's yellow,
// Napoli's and Lazio's azure and Celta's sky all fail as a filled chip.
// Variant D exists precisely because it needs no club colour at all.
// =============================================================

import { useEffect, useState, type CSSProperties } from 'react'
import { getPoolStripe, } from '@/lib/design/poolMode'
import { COMPETITION_COLOR, LEAGUE_ID } from '@/lib/design/competitionColor'
import { getCompetitionMark } from '@/lib/design/competitionMark'

type Club = { name: string; abb: string; id: number; color: string; adjusted?: boolean }

const C = (name: string, abb: string, id: number, color: string, adjusted = false): Club =>
  ({ name, abb, id, color, adjusted })

// ⚠ Colours are the club's own, darkened where a filled chip needs it.
const TOR = C('Torino', 'TOR', 503, '#7A1E1E')
const ROM = C('AS Roma', 'ROM', 497, '#8E1F2F')
const COM = C('Como', 'COM', 895, '#0B2E6F')
const PAR = C('Parma', 'PAR', 523, '#1B3A6B')
const LEC = C('Lecce', 'LEC', 867, '#8A6D00', true)   // official #FFD100 ≈ 1.6:1
const MON = C('Monza', 'MON', 1579, '#C8102E')
const NAP = C('Napoli', 'NAP', 492, '#0B6FA4', true)  // official azure ≈ 2.6:1
const BOL = C('Bologna', 'BOL', 500, '#8F1B2C')
const SAS = C('Sassuolo', 'SAS', 488, '#007A3D')
const JUV = C('Juventus', 'JUV', 496, '#1B1B1B')      // black-and-white; black is the usable half
const LAZ = C('Lazio', 'LAZ', 487, '#1E6F8F', true)   // official sky ≈ 1.9:1
const MIL = C('AC Milan', 'MIL', 489, '#C4141A', true)
const CEL = C('Celta Vigo', 'CEL', 538, '#1E7BB8', true)
const MAL = C('Malaga', 'MAL', 535, '#0067B1')
const LEV = C('Levante', 'LEV', 539, '#8E1B3A')
const BAR = C('Barcelona', 'BAR', 529, '#A50044')
const BIL = C('Athletic Club', 'BIL', 531, '#D6161C', true)
const ELC = C('Elche', 'ELC', 797, '#00713A')

const crest = (c: Club) => `https://media.api-sports.io/football/teams/${c.id}.png`

type Fixture = { home: Club; away: Club; status: string | null; middle: string; sub?: string; note?: string }

const SERIE_A: Fixture[] = [
  { home: TOR, away: ROM, status: null, middle: '7:30', sub: 'AM' },
  { home: COM, away: PAR, status: null, middle: '10:00', sub: 'AM' },
  { home: LEC, away: MON, status: 'FT', middle: '3 – 2' },
  { home: NAP, away: BOL, status: 'FT', middle: '1 – 0' },
  { home: SAS, away: JUV, status: null, middle: '3:45', sub: 'PM', note: 'DELAYED' },
  { home: LAZ, away: MIL, status: null, middle: '3:45', sub: 'PM' },
]

const LA_LIGA: Fixture[] = [
  { home: CEL, away: MAL, status: 'FT', middle: '1 – 1' },
  { home: LEV, away: BAR, status: 'FT', middle: '2 – 4' },
  { home: BIL, away: ELC, status: null, middle: '12:00', sub: 'PM' },
]

const COMPS = [
  { id: LEAGUE_ID.serieA, name: 'SERIE A', mono: 'SA', fixtures: SERIE_A },
  { id: LEAGUE_ID.laLiga, name: 'LA LIGA', mono: 'LL', fixtures: LA_LIGA },
]

type Variant = 'crest' | 'chip' | 'edge' | 'neutral'

// ---------------------------------------------------------------------------

/** A. The competition's own mark, knocked out of its colour — as it ships. */
function CompMarkChip({ id }: { id: number }) {
  const mark = getCompetitionMark(id)
  const [from, to] = getPoolStripe({ externalLeagueId: id })
  return (
    <span
      className="grid place-items-center shrink-0"
      style={{ width: 26, height: 26, borderRadius: 8, background: `linear-gradient(to bottom, ${from}, ${to})` }}
    >
      {mark && (
        <span
          aria-hidden="true"
          className="competition-mark"
          style={{ width: 16, height: 16, backgroundColor: '#fff', '--mark': `url(${mark})` } as CSSProperties}
        />
      )}
    </span>
  )
}

/** B–D. A two-letter monogram in the competition's colour. No mark. */
function CompMonoChip({ id, mono }: { id: number; mono: string }) {
  return (
    <span
      className="grid place-items-center shrink-0 font-black text-white"
      style={{ width: 26, height: 26, borderRadius: 8, background: COMPETITION_COLOR[id], fontSize: 11 }}
    >
      {mono}
    </span>
  )
}

function ClubMark({ club, variant, compId }: { club: Club; variant: Variant; compId: number }) {
  if (variant === 'crest') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={crest(club)} alt="" className="w-8 h-8 object-contain shrink-0" />
  }
  if (variant === 'edge') {
    return <span className="shrink-0" style={{ width: 4, height: 26, borderRadius: 2, background: club.color }} />
  }
  const bg = variant === 'neutral' ? COMPETITION_COLOR[compId] : club.color
  return (
    <span
      className="grid place-items-center shrink-0 text-white font-black"
      style={{ width: 32, height: 32, borderRadius: 9, background: bg, fontSize: 11, letterSpacing: '0.01em' }}
    >
      {club.abb}
    </span>
  )
}

function Row({ fx, variant, compId }: { fx: Fixture; variant: Variant; compId: number }) {
  return (
    <div className="flex items-center gap-2 py-3">
      <span className="w-6 text-[11px] font-bold text-neutral-400 shrink-0">{fx.status ?? ''}</span>
      <div className="flex items-center justify-end gap-2 flex-1 min-w-0">
        <span className="truncate text-[15px] text-neutral-900 text-right">{fx.home.name}</span>
        <ClubMark club={fx.home} variant={variant} compId={compId} />
      </div>
      <div className="w-[72px] text-center shrink-0">
        {fx.note && <div className="text-[10px] font-black text-warning-500 tracking-wide">{fx.note}</div>}
        <div className={fx.status === 'FT' ? 'text-[17px] font-black text-neutral-900' : 'text-[15px] font-bold text-primary-600'}>
          {fx.middle}
        </div>
        {fx.sub && <div className="text-[11px] text-primary-600 -mt-0.5">{fx.sub}</div>}
      </div>
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <ClubMark club={fx.away} variant={variant} compId={compId} />
        <span className="truncate text-[15px] text-neutral-900">{fx.away.name}</span>
      </div>
    </div>
  )
}

function Phone({ variant, title, note }: { variant: Variant; title: string; note: string }) {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-black text-neutral-900">{title}</h3>
        <p className="text-xs text-neutral-500 w-[390px]">{note}</p>
      </div>
      <div className="w-[390px] rounded-card bg-surface-secondary border border-border-default overflow-hidden">
        <div className="px-5 pt-6 pb-4">
          <div className="flex items-start justify-between">
            <h1 className="text-[30px] font-black tracking-tight text-neutral-900 leading-none">
              Match<span className="text-primary-600">Centre</span>
            </h1>
            <span className="rounded-chip bg-surface px-3 py-2 text-sm font-semibold text-neutral-900 border border-border-default">
              Tables
            </span>
          </div>
          <p className="text-[15px] text-neutral-500 mt-2">Where predictions meet reality</p>
          <div className="flex gap-2 mt-5">
            {['Date', 'Competition', 'Matchweek', 'Team'].map((p, i) => (
              <span
                key={p}
                className={`rounded-chip px-3 py-1.5 text-[13px] font-medium ${
                  i === 0 ? 'bg-primary-50 text-primary-600' : 'bg-surface text-neutral-700'
                }`}
              >
                {p}
              </span>
            ))}
          </div>
        </div>

        <div className="mx-3 mb-3 rounded-card bg-surface px-4 pt-4 pb-2">
          <h2 className="text-[17px] font-black text-neutral-900 mb-1">Today</h2>
          {COMPS.map((comp) => (
            <div key={comp.id}>
              <div className="flex items-center gap-2 border-t border-border-default pt-3 pb-1">
                {variant === 'crest' ? <CompMarkChip id={comp.id} /> : <CompMonoChip id={comp.id} mono={comp.mono} />}
                <span className="text-[13px] font-bold tracking-wider text-neutral-500">{comp.name}</span>
              </div>
              {comp.fixtures.map((fx, i) => (
                <Row key={i} fx={fx} variant={variant} compId={comp.id} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function MatchCentreHarness() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('dark')) setDark(true)
  }, [])
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  return (
    <div className="min-h-screen bg-surface px-6 py-10">
      <div className="max-w-[1800px] mx-auto space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-black text-neutral-900">Match Centre — compliant rebuild</h1>
          <p className="text-neutral-700 max-w-3xl">
            The densest crest surface in the app: two competition marks and eighteen club crests on one
            screen. Column A is today, with the real hot-linked crests. B, C and D use only names,
            <code className="text-sm"> league_clubs.abbreviation</code>, and colour.
          </p>
          <button
            onClick={() => setDark((d) => !d)}
            className="rounded-chip border border-border-default px-3 py-1.5 text-sm font-medium text-neutral-900"
          >
            {dark ? 'Light' : 'Dark'} mode
          </button>
        </header>

        <div className="flex flex-wrap gap-8">
          <Phone
            variant="crest"
            title="A. Today"
            note="Provider crests, plus the two derived competition marks in the section headers. Eighteen network requests, eighteen shapes."
          />
          <Phone
            variant="chip"
            title="B. Club colour + code"
            note="The club's colour with its three-letter code. Same 32px footprint as the crest, so the row rhythm is unchanged. Needs a colour per club (see D)."
          />
          <Phone
            variant="edge"
            title="C. Colour edge"
            note="A 4px colour tick inboard of the name. Quietest, gives the most room to long names, weakest at a glance."
          />
          <Phone
            variant="neutral"
            title="D. Competition tint"
            note="Codes tinted by COMPETITION rather than club — needs no per-club colour data at all, so it ships today for every league. Loses club-level colour recognition."
          />
        </div>

        <section className="rounded-card border border-border-default bg-surface-secondary p-5 max-w-3xl space-y-2">
          <h2 className="font-black text-neutral-900">What this screen actually needs</h2>
          <ul className="list-disc pl-5 text-sm text-neutral-700 space-y-1.5">
            <li>
              <strong>The club names are already on the row.</strong> The crest is the second thing
              saying &quot;Torino&quot;. Removing it costs recognition speed, not information.
            </li>
            <li>
              <strong>The colour map is the real work.</strong> <code>clubColors.ts</code> covers the
              twenty Premier League clubs only. B and C need roughly 100 clubs across five
              competitions, each measured at 4.5:1 like the existing twenty — a day of careful work,
              not a refactor.
            </li>
            <li>
              <strong>D is the shortcut</strong> and needs no new data: tint by competition, not club.
              Worth shipping first if the crests have to come out before the colour map exists.
            </li>
            <li>
              <strong>Serie A and La Liga are the stress test.</strong> Lecce&apos;s yellow, Napoli&apos;s and
              Lazio&apos;s azure and Celta&apos;s sky all fail as a filled chip and are darkened here — exactly
              the calls Arsenal and Hull already forced in the Premier League map.
            </li>
            <li>
              <strong>Juventus is the honest edge case.</strong> Black and white stripes reduce to one
              usable colour, the same call <code>clubColors.ts</code> made for Fulham.
            </li>
          </ul>
        </section>
      </div>
    </div>
  )
}
