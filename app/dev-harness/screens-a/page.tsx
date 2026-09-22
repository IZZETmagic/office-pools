'use client'

// Throwaway. The WATCHING surfaces: results, match header, league table, LMS.
// Three systems per screen, phone width, SportPool tokens throughout.

import { useEffect, useState } from 'react'
import { CLUBS, crestUrl, clash, type Club } from '../_identity/clubs'
import { Plate, ClubRule, T, BLACK, type System } from '../_identity/plates'

const SYS: { key: System; name: string }[] = [
  { key: 'solid', name: '1 · Solid' },
  { key: 'duotone', name: '2 · Duotone' },
  { key: 'outline', name: '3 · Outline' },
]

const COMP = { name: 'PREMIER LEAGUE', code: 'PL', color: '#3D195B', second: '#00FF85' }

type Ctx = { sys: System; dark: boolean }
const ink = (d: boolean) => (d ? T.inkD : T.ink)
const slate = (d: boolean) => (d ? T.slateD : T.slate)
const surf = (d: boolean) => (d ? T.surfaceD : T.surface)
const snow = (d: boolean) => (d ? T.snowD : T.snow)
const line = (d: boolean) => (d ? T.silverD : T.silver)

function CompPlate({ sys, size = 26 }: { sys: System; size?: number }) {
  const base = {
    width: size, height: size, borderRadius: size * 0.3, display: 'grid', placeItems: 'center',
    fontFamily: BLACK, fontWeight: 900, fontSize: size * 0.38, flexShrink: 0,
  } as const
  if (sys === 'solid') return <span style={{ ...base, background: COMP.color, color: '#fff' }}>{COMP.code}</span>
  if (sys === 'duotone')
    return <span style={{ ...base, background: COMP.color, color: '#fff', boxShadow: `inset 0 0 0 2px ${COMP.second}` }}>{COMP.code}</span>
  return <span style={{ ...base, background: 'transparent', color: COMP.color, border: `2px solid ${COMP.color}` }}>{COMP.code}</span>
}

function Phone({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ width: 390 }}>
      {title && <p style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 13, color: T.slate, marginBottom: 8 }}>{title}</p>}
      <div style={{ borderRadius: 24, overflow: 'hidden', border: `1px solid ${T.silver}` }}>{children}</div>
    </div>
  )
}

function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <div>
        <h2 style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 22, color: T.ink }}>{title}</h2>
        <p style={{ color: T.slate, fontWeight: 500, maxWidth: 900 }}>{note}</p>
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>{children}</div>
    </section>
  )
}

// ---------------------------------------------------------------- results row
type Fx = { h: Club; a: Club; status: string | null; mid: string; sub?: string }
const FIXTURES: Fx[] = [
  { h: CLUBS.mun, a: CLUBS.mci, status: 'FT', mid: '0 – 1' },
  { h: CLUBS.ars, a: CLUBS.che, status: 'FT', mid: '2 – 1' },
  { h: CLUBS.liv, a: CLUBS.nfo, status: null, mid: '3:00', sub: 'PM' },
  { h: CLUBS.tot, a: CLUBS.new, status: null, mid: '5:30', sub: 'PM' },
]

function ResultsRow({ fx, sys, dark, crest }: { fx: Fx; sys: System; dark: boolean; crest?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 0' }}>
      <span style={{ width: 22, fontSize: 10, fontWeight: 800, color: slate(dark) }}>{fx.status ?? ''}</span>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, minWidth: 0 }}>
        <span style={{ fontSize: 15, fontWeight: 600, color: ink(dark), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fx.h.short}</span>
        {crest ? <img src={crestUrl(fx.h)} alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} /> : <Plate club={fx.h} system={sys} size={36} onDark={dark} />}
      </div>
      <div style={{ width: 70, textAlign: 'center', flexShrink: 0 }}>
        <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: fx.status ? 17 : 15, color: fx.status ? ink(dark) : T.primary }}>{fx.mid}</div>
        {fx.sub && <div style={{ fontSize: 11, color: T.primary, marginTop: -2 }}>{fx.sub}</div>}
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        {crest ? <img src={crestUrl(fx.a)} alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} /> : <Plate club={fx.a} system={sys} size={36} onDark={dark} />}
        <span style={{ fontSize: 15, fontWeight: 600, color: ink(dark), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fx.a.short}</span>
      </div>
    </div>
  )
}

function ResultsScreen({ sys, dark, crest }: Ctx & { crest?: boolean }) {
  return (
    <div style={{ background: snow(dark), padding: 12 }}>
      <div style={{ background: surf(dark), borderRadius: 18, padding: '16px 16px 4px' }}>
        <h3 style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 17, color: ink(dark), marginBottom: 8 }}>Today</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, borderTop: `1px solid ${line(dark)}`, paddingTop: 12 }}>
          {crest ? <span style={{ width: 26, height: 26, borderRadius: 8, background: COMP.color }} /> : <CompPlate sys={sys} />}
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.5, color: slate(dark) }}>{COMP.name}</span>
        </div>
        {FIXTURES.map((f, i) => <ResultsRow key={i} fx={f} sys={sys} dark={dark} crest={crest} />)}
      </div>
    </div>
  )
}

// -------------------------------------------------------------- match header
function MatchHeader({ sys, dark, crest }: Ctx & { crest?: boolean }) {
  const h = CLUBS.mun
  const a = CLUBS.mci
  const split = !crest && !clash(h, a) && sys !== 'outline'
  return (
    <div>
      <div style={{ position: 'relative', background: T.midnight, paddingBottom: 4 }}>
        {split && (
          <>
            <div style={{ position: 'absolute', inset: 0, background: h.primary }} />
            <div style={{ position: 'absolute', inset: 0, background: a.primary, clipPath: 'polygon(53% 0, 100% 0, 100% 100%, 43% 100%)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(11,15,26,0.30) 0%, rgba(11,15,26,0.05) 32%, rgba(11,15,26,0.86) 100%)' }} />
          </>
        )}
        {!split && <div style={{ position: 'absolute', inset: 0, background: crest ? `linear-gradient(160deg, #5B2C82, ${COMP.color})` : `linear-gradient(180deg, #141A2B, ${T.midnight})` }} />}
        <div style={{ position: 'relative', padding: '44px 20px 16px' }}>
          <p style={{ textAlign: 'center', fontSize: 11, fontWeight: 800, letterSpacing: 2.2, color: 'rgba(255,255,255,0.72)' }}>
            {COMP.name} · MATCHWEEK 4
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 26 }}>
            <div style={{ flex: 1, display: 'grid', justifyItems: 'center', gap: 10 }}>
              {crest ? <img src={crestUrl(h)} alt="" style={{ width: 78, height: 78, objectFit: 'contain' }} /> : <Plate club={h} system={sys} size={88} onDark />}
            </div>
            <div style={{ flexShrink: 0, padding: '0 6px', textAlign: 'center' }}>
              <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 52, color: '#fff', lineHeight: 1, letterSpacing: '-0.02em' }}>
                0<span style={{ color: 'rgba(255,255,255,0.5)', margin: '0 8px' }}>–</span>1
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>Full Time</div>
            </div>
            <div style={{ flex: 1, display: 'grid', justifyItems: 'center', gap: 10 }}>
              {crest ? <img src={crestUrl(a)} alt="" style={{ width: 78, height: 78, objectFit: 'contain' }} /> : <Plate club={a} system={sys} size={88} onDark />}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
            <p style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{h.short}</p>
            <div style={{ width: 110 }} />
            <p style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{a.short}</p>
          </div>
          <p style={{ textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.82)', marginTop: 20 }}>⚽ Erling Haaland 60&apos;</p>
          <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
            {['Facts', 'Line-ups', 'Stats', 'Scouting'].map((t, i) => (
              <span key={t} style={{
                borderRadius: 999, padding: '9px 14px', fontSize: 13, fontWeight: 700,
                background: i === 0 ? '#fff' : 'rgba(255,255,255,0.15)', color: i === 0 ? T.ink : 'rgba(255,255,255,0.92)',
              }}>{t}</span>
            ))}
          </div>
        </div>
      </div>
      <div style={{ background: snow(dark), padding: 12 }}>
        <div style={{ background: surf(dark), borderRadius: 18, padding: 16 }}>
          <h3 style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 16, color: ink(dark) }}>Match Facts</h3>
          <p style={{ fontSize: 12, color: slate(dark), marginTop: 6 }}>Unchanged — names, minutes, a stadium and our own icons.</p>
        </div>
      </div>
    </div>
  )
}

// -------------------------------------------------------------- league table
const TABLE: Array<{ c: Club; pl: number; gd: string; pts: number }> = [
  { c: CLUBS.liv, pl: 4, gd: '+8', pts: 12 },
  { c: CLUBS.ars, pl: 4, gd: '+6', pts: 10 },
  { c: CLUBS.mci, pl: 4, gd: '+5', pts: 9 },
  { c: CLUBS.che, pl: 4, gd: '+2', pts: 8 },
  { c: CLUBS.tot, pl: 4, gd: '+1', pts: 7 },
  { c: CLUBS.new, pl: 4, gd: '0', pts: 5 },
  { c: CLUBS.bha, pl: 4, gd: '-1', pts: 5 },
  { c: CLUBS.mun, pl: 4, gd: '-3', pts: 4 },
]

function LeagueTable({ sys, dark, crest }: Ctx & { crest?: boolean }) {
  return (
    <div style={{ background: snow(dark), padding: 12 }}>
      <div style={{ background: surf(dark), borderRadius: 18, padding: '12px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8 }}>
          <span style={{ width: 22 }} />
          <span style={{ flex: 1 }} />
          {['PL', 'GD', 'PTS'].map((h) => (
            <span key={h} style={{ width: h === 'PTS' ? 30 : 26, textAlign: 'center', fontSize: 10, fontWeight: 800, color: slate(dark) }}>{h}</span>
          ))}
        </div>
        {TABLE.map((r, i) => (
          <div key={r.c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderTop: `1px solid ${line(dark)}` }}>
            <span style={{ width: 22, fontSize: 12, fontWeight: 700, color: slate(dark) }}>{i + 1}</span>
            {crest ? <img src={crestUrl(r.c)} alt="" style={{ width: 26, height: 26, objectFit: 'contain' }} /> : <Plate club={r.c} system={sys} size={28} onDark={dark} />}
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: ink(dark), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.c.short}</span>
            <span style={{ width: 26, textAlign: 'center', fontSize: 12, color: slate(dark) }}>{r.pl}</span>
            <span style={{ width: 26, textAlign: 'center', fontSize: 12, color: slate(dark) }}>{r.gd}</span>
            <span style={{ width: 30, textAlign: 'center', fontSize: 14, fontWeight: 900, fontFamily: BLACK, color: ink(dark) }}>{r.pts}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ------------------------------------------------------------ LMS team sheet
const PICKED = ['liv', 'ars', 'mci', 'che'] as const
const USED = ['tot', 'new'] as const

function LmsSheet({ sys, dark, crest }: Ctx & { crest?: boolean }) {
  const all = [...PICKED, ...USED, 'bha', 'mun', 'eve', 'ful', 'nfo', 'avl'] as const
  return (
    <div style={{ background: snow(dark), padding: 12 }}>
      <div style={{ background: surf(dark), borderRadius: 18, padding: 16 }}>
        <h3 style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 17, color: ink(dark) }}>Pick your club</h3>
        <p style={{ fontSize: 12, color: slate(dark), marginTop: 2, marginBottom: 14 }}>Matchweek 5 · you may not repeat a club</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {all.map((k) => {
            const c = CLUBS[k]
            const used = (USED as readonly string[]).includes(k)
            return (
              <div key={c.id} style={{ width: 104, display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 12, background: dark ? T.mistD : T.mist, opacity: used ? 0.38 : 1 }}>
                {crest ? <img src={crestUrl(c)} alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} /> : <Plate club={c} system={sys} size={28} onDark={dark} />}
                <span style={{ fontSize: 11, fontWeight: 700, color: ink(dark), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.code}</span>
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ background: surf(dark), borderRadius: 18, padding: 16, marginTop: 12 }}>
        <h3 style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 17, color: ink(dark), marginBottom: 10 }}>Still standing</h3>
        {[['Ryan', 'liv'], ['Carson', 'ars'], ['Nadia', 'mci']].map(([who, k]) => (
          <div key={who} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderTop: `1px solid ${line(dark)}` }}>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: ink(dark) }}>{who}</span>
            <span style={{ fontSize: 11, color: slate(dark) }}>this week</span>
            {crest ? <img src={crestUrl(CLUBS[k])} alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} /> : <Plate club={CLUBS[k]} system={sys} size={28} onDark={dark} />}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
export default function ScreensA() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('dark')) setDark(true)
  }, [])

  const screens: { title: string; note: string; render: (c: Ctx & { crest?: boolean }) => React.ReactNode }[] = [
    { title: 'Results — Match Centre', note: 'Eighteen crests a screen today. The club name is already on the row, so the plate only has to accelerate recognition, not carry it.', render: (c) => <ResultsScreen {...c} /> },
    { title: 'Match detail — header', note: 'At 88px the plate is the biggest identity moment in the app. Solid and Duotone also split the ground into the two clubs’ colours; Outline keeps the ink ground, and is what a same-colour fixture falls back to.', render: (c) => <MatchHeader {...c} /> },
    { title: 'League table', note: 'Twenty rows at 28px. Density is the test: shapes that vary in weight make a table look ragged, and a uniform plate does not.', render: (c) => <LeagueTable {...c} /> },
    { title: 'Last Man Standing — pick and survivors', note: 'Twenty clubs in a grid, six already used. Greyed-out state has to stay legible, which is where a low-contrast crest fails today.', render: (c) => <LmsSheet {...c} /> },
  ]

  return (
    <div style={{ minHeight: '100vh', background: T.snow, padding: 40, fontFamily: BLACK }}>
      <div style={{ maxWidth: 1800, margin: '0 auto', display: 'grid', gap: 44 }}>
        <header>
          <h1 style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 32, color: T.ink }}>Screens A — watching</h1>
          <p style={{ color: T.slate, fontWeight: 500, maxWidth: 860, marginTop: 8 }}>
            Results, match detail, league table, Last Man Standing. Each screen rendered as it ships,
            then in all three identity systems. SportPool radii, palette and Nunito throughout.
          </p>
          <button onClick={() => setDark((d) => !d)} style={{ marginTop: 12, borderRadius: 999, border: `1px solid ${T.silver}`, padding: '8px 14px', color: T.ink, background: 'transparent', fontWeight: 700 }}>
            {dark ? 'Light' : 'Dark'} mode
          </button>
        </header>

        {screens.map((s) => (
          <Section key={s.title} title={s.title} note={s.note}>
            <Phone title="TODAY — CRESTS">{s.render({ sys: 'solid', dark, crest: true })}</Phone>
            {SYS.map((y) => (
              <Phone key={y.key} title={y.name.toUpperCase()}>{s.render({ sys: y.key, dark })}</Phone>
            ))}
          </Section>
        ))}
      </div>
    </div>
  )
}
