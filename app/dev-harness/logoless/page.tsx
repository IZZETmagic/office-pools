'use client'

// =============================================================
// Throwaway: logoless
// =============================================================
// No plate, no chip, no badge — nothing sits where the crest sat. The space it
// occupied goes back to the club's NAME, which is the fastest identifier a
// person has anyway: you read "Man United" quicker than you decode a 24px crest.
//
// Three directions, in increasing use of colour:
//   A. Broadsheet — type only. No club colour at all, so it works for every
//      club in every competition on day one, with no colour map.
//   B. Underline  — the club's colour as a rule UNDER the name. Colour attached
//      to the word rather than floating in a box.
//   C. Field      — the colour is the SPACE, not an object: a wash behind each
//      side with a hairline edge.
// =============================================================

import { useEffect, useState } from 'react'
import { CLUBS, crestUrl, type Club } from '../_identity/clubs'
import { T, BLACK } from '../_identity/plates'

type Dir = 'broadsheet' | 'underline' | 'field'
const DIRS: { key: Dir; name: string; note: string }[] = [
  { key: 'broadsheet', name: 'A · Broadsheet', note: 'Type only. No club colour anywhere — ships for every league with no colour map at all.' },
  { key: 'underline', name: 'B · Underline', note: 'The club’s colour as a rule under the name. Attached to the word, never a container.' },
  { key: 'field', name: 'C · Field', note: 'Colour as space rather than object: a soft wash behind each side, hairline edge at the margin.' },
]

const ink = (d: boolean) => (d ? T.inkD : T.ink)
const slate = (d: boolean) => (d ? T.slateD : T.slate)
const surf = (d: boolean) => (d ? T.surfaceD : T.surface)
const snow = (d: boolean) => (d ? T.snowD : T.snow)
const line = (d: boolean) => (d ? T.silverD : T.silver)

/** A club colour at low alpha — the wash in direction C. */
function tint(hex: string, a: number) {
  const s = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

function Phone({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ width: 390 }}>
      {title && <p style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 12, letterSpacing: 1.4, color: T.slate, marginBottom: 8 }}>{title}</p>}
      <div style={{ borderRadius: 24, overflow: 'hidden', border: `1px solid ${T.silver}` }}>{children}</div>
    </div>
  )
}
function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <div>
        <h2 style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 22, color: T.ink }}>{title}</h2>
        <p style={{ color: T.slate, fontWeight: 500, maxWidth: 940 }}>{note}</p>
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>{children}</div>
    </section>
  )
}

// ------------------------------------------------------------------ results
type Fx = { h: Club; a: Club; hs?: number; as?: number; time?: string; live?: boolean }
const FX: Fx[] = [
  { h: CLUBS.mun, a: CLUBS.mci, hs: 0, as: 1 },
  { h: CLUBS.ars, a: CLUBS.che, hs: 2, as: 1 },
  { h: CLUBS.liv, a: CLUBS.nfo, hs: 1, as: 1 },
  { h: CLUBS.tot, a: CLUBS.new, time: '17:30' },
  { h: CLUBS.bha, a: CLUBS.eve, time: '20:00' },
]

function ResultRow({ fx, dir, dark, crest }: { fx: Fx; dir: Dir; dark: boolean; crest?: boolean }) {
  const done = fx.hs !== undefined
  const hWin = done && (fx.hs ?? 0) > (fx.as ?? 0)
  const aWin = done && (fx.as ?? 0) > (fx.hs ?? 0)
  const nameStyle = (win: boolean, other: boolean) => ({
    fontFamily: BLACK,
    fontWeight: (done && !win && other ? 700 : 900) as 700 | 900,
    fontSize: 16,
    color: done && !win && other ? slate(dark) : ink(dark),
    letterSpacing: '-0.01em',
  })

  if (crest) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px', borderTop: `1px solid ${line(dark)}` }}>
        <img src={crestUrl(fx.h)} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
        <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: ink(dark) }}>{fx.h.short}</span>
        <span style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 15, color: ink(dark) }}>{done ? `${fx.hs} – ${fx.as}` : fx.time}</span>
        <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: ink(dark), textAlign: 'right' }}>{fx.a.short}</span>
        <img src={crestUrl(fx.a)} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
      </div>
    )
  }

  const row = (
    <div style={{ display: 'flex', alignItems: 'center', padding: '14px 18px', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={nameStyle(hWin, aWin)}>{fx.h.short}</div>
        {dir === 'underline' && <div style={{ width: 26, height: 3, borderRadius: 2, background: fx.h.primary, marginTop: 5 }} />}
      </div>
      <div style={{ flexShrink: 0, textAlign: 'center', minWidth: 58 }}>
        {done ? (
          <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 19, color: ink(dark), fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em' }}>
            {fx.hs}<span style={{ color: dark ? '#3A4260' : T.silver, margin: '0 5px' }}>–</span>{fx.as}
          </div>
        ) : (
          <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 15, color: T.primary, fontVariantNumeric: 'tabular-nums' }}>{fx.time}</div>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'grid', justifyItems: 'end' }}>
        <div style={{ ...nameStyle(aWin, hWin), textAlign: 'right' }}>{fx.a.short}</div>
        {dir === 'underline' && <div style={{ width: 26, height: 3, borderRadius: 2, background: fx.a.primary, marginTop: 5 }} />}
      </div>
    </div>
  )

  if (dir !== 'field') return <div style={{ borderTop: `1px solid ${line(dark)}` }}>{row}</div>

  return (
    <div style={{ position: 'relative', borderTop: `1px solid ${line(dark)}` }}>
      <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
        <span style={{ flex: 1, background: `linear-gradient(90deg, ${tint(fx.h.primary, dark ? 0.3 : 0.13)}, transparent 78%)`, borderLeft: `2px solid ${fx.h.primary}` }} />
        <span style={{ flex: 1, background: `linear-gradient(270deg, ${tint(fx.a.primary, dark ? 0.3 : 0.13)}, transparent 78%)`, borderRight: `2px solid ${fx.a.primary}` }} />
      </div>
      <div style={{ position: 'relative' }}>{row}</div>
    </div>
  )
}

function Results({ dir, dark, crest }: { dir: Dir; dark: boolean; crest?: boolean }) {
  return (
    <div style={{ background: snow(dark), padding: 12 }}>
      <div style={{ background: surf(dark), borderRadius: 18, overflow: 'hidden' }}>
        <div style={{ padding: '16px 18px 12px' }}>
          <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 18, color: ink(dark) }}>Today</div>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.6, color: slate(dark), marginTop: 6 }}>PREMIER LEAGUE · MATCHWEEK 4</div>
        </div>
        {FX.map((f, i) => <ResultRow key={i} fx={f} dir={dir} dark={dark} crest={crest} />)}
      </div>
    </div>
  )
}

// ------------------------------------------------------------- match header
function Header({ dir, dark, crest }: { dir: Dir; dark: boolean; crest?: boolean }) {
  const h = CLUBS.mun, a = CLUBS.mci
  const purple = '#3D195B'
  return (
    <div>
      <div style={{ position: 'relative', background: T.midnight }}>
        {crest && <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(160deg, #5B2C82, ${purple})` }} />}
        {!crest && dir === 'field' && (
          <>
            <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
              <span style={{ flex: 1, background: `linear-gradient(180deg, ${tint(h.primary, 0.9)}, ${tint(h.primary, 0.25)})` }} />
              <span style={{ flex: 1, background: `linear-gradient(180deg, ${tint(a.primary, 0.9)}, ${tint(a.primary, 0.25)})` }} />
            </div>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(11,15,26,0.28), rgba(11,15,26,0.9))' }} />
          </>
        )}
        {!crest && dir !== 'field' && <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, #151C30, ${T.midnight})` }} />}

        <div style={{ position: 'relative', padding: '46px 22px 18px' }}>
          <p style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 800, letterSpacing: 2.4, color: 'rgba(255,255,255,0.62)' }}>
            PREMIER LEAGUE · MATCHWEEK 4
          </p>

          {crest ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 22 }}>
              <div style={{ flex: 1, display: 'grid', justifyItems: 'center', gap: 10 }}>
                <img src={crestUrl(h)} alt="" style={{ width: 76, height: 76, objectFit: 'contain' }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{h.short}</span>
              </div>
              <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 46, color: '#fff' }}>0<span style={{ opacity: 0.5, margin: '0 8px' }}>–</span>1</div>
              <div style={{ flex: 1, display: 'grid', justifyItems: 'center', gap: 10 }}>
                <img src={crestUrl(a)} alt="" style={{ width: 76, height: 76, objectFit: 'contain' }} />
                <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{a.short}</span>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: 26, display: 'grid', gap: 14 }}>
              {[h, a].map((c, i) => {
                const score = i === 0 ? 0 : 1
                const won = i === 1
                return (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontFamily: BLACK, fontWeight: 900, fontSize: 27, lineHeight: 1.05,
                        color: won ? '#fff' : 'rgba(255,255,255,0.62)', letterSpacing: '-0.02em',
                      }}>{c.name}</div>
                      {dir === 'underline' && <div style={{ width: 52, height: 4, borderRadius: 2, background: c.primary, marginTop: 8 }} />}
                    </div>
                    <div style={{
                      fontFamily: BLACK, fontWeight: 900, fontSize: 40, lineHeight: 1,
                      color: won ? '#fff' : 'rgba(255,255,255,0.62)', fontVariantNumeric: 'tabular-nums',
                    }}>{score}</div>
                  </div>
                )
              })}
            </div>
          )}

          <p style={{ textAlign: 'center', fontSize: 11, fontWeight: 800, letterSpacing: 1.8, color: 'rgba(255,255,255,0.55)', marginTop: 20 }}>FULL TIME</p>
          <p style={{ textAlign: 'center', fontSize: 13, color: 'rgba(255,255,255,0.82)', marginTop: 8 }}>Haaland 60&apos;</p>

          <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
            {['Facts', 'Line-ups', 'Stats', 'Scouting'].map((t, i) => (
              <span key={t} style={{
                borderRadius: 999, padding: '9px 14px', fontSize: 13, fontWeight: 700,
                background: i === 0 ? '#fff' : 'rgba(255,255,255,0.14)', color: i === 0 ? T.ink : 'rgba(255,255,255,0.92)',
              }}>{t}</span>
            ))}
          </div>
        </div>
      </div>
      <div style={{ background: snow(dark), padding: 12 }}>
        <div style={{ background: surf(dark), borderRadius: 18, padding: 16 }}>
          <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 16, color: ink(dark) }}>Match Facts</div>
          <div style={{ fontSize: 12, color: slate(dark), marginTop: 6 }}>Old Trafford, Manchester</div>
        </div>
      </div>
    </div>
  )
}

// -------------------------------------------------------------- league table
const TABLE: Array<{ c: Club; pl: number; gd: string; pts: number }> = [
  { c: CLUBS.liv, pl: 4, gd: '+8', pts: 12 }, { c: CLUBS.ars, pl: 4, gd: '+6', pts: 10 },
  { c: CLUBS.mci, pl: 4, gd: '+5', pts: 9 }, { c: CLUBS.che, pl: 4, gd: '+2', pts: 8 },
  { c: CLUBS.tot, pl: 4, gd: '+1', pts: 7 }, { c: CLUBS.new, pl: 4, gd: '0', pts: 5 },
  { c: CLUBS.bha, pl: 4, gd: '-1', pts: 5 }, { c: CLUBS.mun, pl: 4, gd: '-3', pts: 4 },
]

function Table({ dir, dark, crest }: { dir: Dir; dark: boolean; crest?: boolean }) {
  return (
    <div style={{ background: snow(dark), padding: 12 }}>
      <div style={{ background: surf(dark), borderRadius: 18, padding: '14px 0 6px' }}>
        <div style={{ display: 'flex', padding: '0 18px 10px', gap: 10 }}>
          <span style={{ width: 20 }} /><span style={{ flex: 1 }} />
          {['PL', 'GD', 'PTS'].map((x) => (
            <span key={x} style={{ width: x === 'PTS' ? 32 : 26, textAlign: 'center', fontSize: 10, fontWeight: 800, letterSpacing: 1, color: slate(dark) }}>{x}</span>
          ))}
        </div>
        {TABLE.map((r, i) => (
          <div key={r.c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderTop: `1px solid ${line(dark)}`, position: 'relative' }}>
            {dir === 'field' && !crest && (
              <span style={{ position: 'absolute', inset: 0, background: `linear-gradient(90deg, ${tint(r.c.primary, dark ? 0.26 : 0.11)}, transparent 42%)` }} />
            )}
            <span style={{ position: 'relative', width: 20, fontFamily: BLACK, fontWeight: 900, fontSize: 13, color: slate(dark), fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
            {crest && <img src={crestUrl(r.c)} alt="" style={{ width: 24, height: 24, objectFit: 'contain', position: 'relative' }} />}
            {dir === 'underline' && !crest && (
              <span style={{ position: 'relative', width: 3, height: 20, borderRadius: 2, background: r.c.primary }} />
            )}
            <span style={{ position: 'relative', flex: 1, fontFamily: BLACK, fontWeight: 900, fontSize: 15, color: ink(dark), letterSpacing: '-0.01em' }}>{r.c.short}</span>
            <span style={{ position: 'relative', width: 26, textAlign: 'center', fontSize: 13, color: slate(dark), fontVariantNumeric: 'tabular-nums' }}>{r.pl}</span>
            <span style={{ position: 'relative', width: 26, textAlign: 'center', fontSize: 13, color: slate(dark), fontVariantNumeric: 'tabular-nums' }}>{r.gd}</span>
            <span style={{ position: 'relative', width: 32, textAlign: 'center', fontFamily: BLACK, fontWeight: 900, fontSize: 15, color: ink(dark), fontVariantNumeric: 'tabular-nums' }}>{r.pts}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Logoless() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('dark')) setDark(true)
  }, [])

  const screens = [
    { title: 'Results — Match Centre', note: 'The 36px the crest occupied goes to the name: 15px semibold becomes 16px black, and the winner stays in ink while the loser drops to slate — the oldest results-page convention there is.', render: (d: Dir, c?: boolean) => <Results dir={d} dark={dark} crest={c} /> },
    { title: 'Match detail — header', note: 'Stacked rather than mirrored. Two club names at 27px with the score beside each, which is how a broadcast lower-third does it — and it removes the “two objects floating on purple” problem entirely.', render: (d: Dir, c?: boolean) => <Header dir={d} dark={dark} crest={c} /> },
    { title: 'League table', note: 'Names at 15px black instead of 14px regular beside a 26px crest. The rank column and the points column do the structural work.', render: (d: Dir, c?: boolean) => <Table dir={d} dark={dark} crest={c} /> },
  ]

  return (
    <div style={{ minHeight: '100vh', background: T.snow, padding: 40, fontFamily: BLACK }}>
      <div style={{ maxWidth: 1800, margin: '0 auto', display: 'grid', gap: 44 }}>
        <header>
          <h1 style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 32, color: T.ink }}>Logoless</h1>
          <p style={{ color: T.slate, fontWeight: 500, maxWidth: 900, marginTop: 8 }}>
            Nothing replaces the crest. The space goes back to the club’s name, which is the faster identifier anyway.
            Three directions, increasing in colour — A needs no club colour data at all.
          </p>
          <div style={{ display: 'flex', gap: 22, marginTop: 14, flexWrap: 'wrap' }}>
            {DIRS.map((d) => (
              <div key={d.key} style={{ maxWidth: 300 }}>
                <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 14, color: T.ink }}>{d.name}</div>
                <div style={{ fontSize: 12, color: T.slate, fontWeight: 500 }}>{d.note}</div>
              </div>
            ))}
          </div>
          <button onClick={() => setDark((x) => !x)} style={{ marginTop: 16, borderRadius: 999, border: `1px solid ${T.silver}`, padding: '8px 14px', color: T.ink, background: 'transparent', fontWeight: 700 }}>
            {dark ? 'Light' : 'Dark'} mode
          </button>
        </header>

        {screens.map((s) => (
          <Section key={s.title} title={s.title} note={s.note}>
            <Phone title="TODAY">{s.render('broadsheet', true)}</Phone>
            {DIRS.map((d) => <Phone key={d.key} title={d.name.toUpperCase()}>{s.render(d.key)}</Phone>)}
          </Section>
        ))}
      </div>
    </div>
  )
}
