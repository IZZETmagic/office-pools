'use client'

// Throwaway. The PLAYING surfaces: pool cards, pick'em, predict-the-table,
// line-ups, the scouting dossier, and the duel card.

import { useEffect, useState } from 'react'
import { CLUBS, crestUrl, type Club } from '../_identity/clubs'
import { Plate, ClubRule, T, BLACK, type System } from '../_identity/plates'

const SYS: { key: System; name: string }[] = [
  { key: 'solid', name: '1 · Solid' },
  { key: 'duotone', name: '2 · Duotone' },
  { key: 'outline', name: '3 · Outline' },
]
const COMP = { name: 'PREMIER LEAGUE', code: 'PL', color: '#3D195B', second: '#00FF85' }
type Ctx = { sys: System; dark: boolean; crest?: boolean }

const ink = (d: boolean) => (d ? T.inkD : T.ink)
const slate = (d: boolean) => (d ? T.slateD : T.slate)
const surf = (d: boolean) => (d ? T.surfaceD : T.surface)
const snow = (d: boolean) => (d ? T.snowD : T.snow)
const mist = (d: boolean) => (d ? T.mistD : T.mist)
const line = (d: boolean) => (d ? T.silverD : T.silver)

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
        <p style={{ color: T.slate, fontWeight: 500, maxWidth: 940 }}>{note}</p>
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>{children}</div>
    </section>
  )
}

// ------------------------------------------------------------- pool card rail
function Rail({ sys, crest }: { sys: System; crest?: boolean }) {
  const grad = `linear-gradient(to bottom, #5B2C82, ${COMP.color})`
  if (crest) {
    return (
      <span style={{ width: 30, background: grad, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <span style={{ width: 18, height: 18, background: '#fff', opacity: 0.9, borderRadius: 3 }} />
      </span>
    )
  }
  if (sys === 'solid')
    return (
      <span style={{ width: 30, background: grad, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <span style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 11, color: '#fff', writingMode: 'vertical-rl', transform: 'rotate(180deg)', letterSpacing: '0.16em' }}>
          {COMP.name}
        </span>
      </span>
    )
  if (sys === 'duotone')
    return (
      <span style={{ width: 30, background: grad, display: 'grid', placeItems: 'center', flexShrink: 0, boxShadow: `inset -3px 0 0 ${COMP.second}` }}>
        <span style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 12, color: '#fff' }}>{COMP.code}</span>
      </span>
    )
  return (
    <span style={{ width: 30, background: 'transparent', borderRight: `3px solid ${COMP.color}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
      <span style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 12, color: COMP.color }}>{COMP.code}</span>
    </span>
  )
}

function PoolCard({ sys, dark, crest }: Ctx) {
  return (
    <div style={{ background: snow(dark), padding: 12, display: 'grid', gap: 12 }}>
      {[
        { name: 'The Sargasso Sea', rank: '2nd', of: '14', mode: 'Pick’em' },
        { name: 'Office Legends', rank: '5th', of: '31', mode: 'Predict the Table' },
      ].map((p) => (
        <div key={p.name} style={{ display: 'flex', background: surf(dark), borderRadius: 18, overflow: 'hidden', border: `1px solid ${line(dark)}` }}>
          <Rail sys={sys} crest={crest} />
          <div style={{ flex: 1, padding: 12, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 16, color: ink(dark) }}>{p.name}</span>
              <span style={{ fontSize: 11, color: slate(dark) }}>{p.mode}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 22, color: ink(dark) }}>{p.rank}</span>
              <span style={{ fontSize: 13, color: slate(dark) }}>of {p.of}</span>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[['PTS', '348'], ['EXACT', '14'], ['MW', '4']].map(([k, v]) => (
                <div key={k} style={{ flex: 1, background: mist(dark), borderRadius: 12, padding: '6px 8px' }}>
                  <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, color: slate(dark) }}>{k}</div>
                  <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 14, color: ink(dark) }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ----------------------------------------------------------------- pick'em
function Pickem({ sys, dark, crest }: Ctx) {
  const rows: [Club, Club, number | null][] = [
    [CLUBS.mun, CLUBS.mci, 2],
    [CLUBS.ars, CLUBS.che, 0],
    [CLUBS.liv, CLUBS.nfo, null],
  ]
  return (
    <div style={{ background: snow(dark), padding: 12, display: 'grid', gap: 10 }}>
      {rows.map(([h, a, picked], i) => (
        <div key={i} style={{ background: surf(dark), borderRadius: 18, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {crest ? <img src={crestUrl(h)} alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} /> : <Plate club={h} system={sys} size={36} onDark={dark} />}
            <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: ink(dark) }}>{h.short}</span>
            <span style={{ fontSize: 11, color: slate(dark) }}>Sat 15:00</span>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: ink(dark), textAlign: 'right' }}>{a.short}</span>
            {crest ? <img src={crestUrl(a)} alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} /> : <Plate club={a} system={sys} size={36} onDark={dark} />}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            {['1', 'X', '2'].map((lbl, j) => {
              const on = picked === j
              return (
                <span key={lbl} style={{
                  flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: 12,
                  background: on ? T.primary : mist(dark), color: on ? '#fff' : ink(dark),
                  fontFamily: BLACK, fontWeight: 900, fontSize: 14,
                }}>{lbl}</span>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

// ------------------------------------------------------------ predict table
function TablePicker({ sys, dark, crest }: Ctx) {
  const order = ['mci', 'ars', 'liv', 'che', 'tot', 'mun', 'new', 'bha'] as const
  return (
    <div style={{ background: snow(dark), padding: 12 }}>
      <div style={{ background: surf(dark), borderRadius: 18, padding: 14 }}>
        <h3 style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 17, color: ink(dark) }}>Predict the table</h3>
        <p style={{ fontSize: 12, color: slate(dark), marginTop: 2, marginBottom: 12 }}>Drag to reorder · locks Fri 19:00</p>
        {order.map((k, i) => {
          const c = CLUBS[k]
          return (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12, background: mist(dark), marginBottom: 6 }}>
              <span style={{ width: 18, fontFamily: BLACK, fontWeight: 900, fontSize: 13, color: slate(dark) }}>{i + 1}</span>
              {crest ? <img src={crestUrl(c)} alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} /> : <Plate club={c} system={sys} size={28} onDark={dark} />}
              <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: ink(dark) }}>{c.short}</span>
              <span style={{ color: slate(dark), fontSize: 16, letterSpacing: 2 }}>≡</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- line-ups
const XI: { n: number; name: string; pos: string; row: number }[] = [
  { n: 1, name: 'Onana', pos: 'GK', row: 0 },
  { n: 2, name: 'Dalot', pos: 'DF', row: 1 }, { n: 19, name: 'Varane', pos: 'DF', row: 1 },
  { n: 6, name: 'Martínez', pos: 'DF', row: 1 }, { n: 23, name: 'Shaw', pos: 'DF', row: 1 },
  { n: 18, name: 'Casemiro', pos: 'MF', row: 2 }, { n: 37, name: 'Mainoo', pos: 'MF', row: 2 }, { n: 8, name: 'Bruno', pos: 'MF', row: 2 },
  { n: 10, name: 'Rashford', pos: 'FW', row: 3 }, { n: 11, name: 'Højlund', pos: 'FW', row: 3 }, { n: 17, name: 'Garnacho', pos: 'FW', row: 3 },
]

function Lineups({ sys, dark, crest }: Ctx) {
  const club = CLUBS.mun
  const rows = [0, 1, 2, 3].map((r) => XI.filter((p) => p.row === r))
  return (
    <div style={{ background: snow(dark), padding: 12 }}>
      <div style={{ background: surf(dark), borderRadius: 18, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          {crest ? <img src={crestUrl(club)} alt="" style={{ width: 28, height: 28, objectFit: 'contain' }} /> : <Plate club={club} system={sys} size={28} onDark={dark} />}
          <span style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 15, color: ink(dark) }}>{club.short}</span>
          <span style={{ fontSize: 12, color: slate(dark) }}>4–3–3</span>
        </div>
        <div style={{ background: dark ? '#16321F' : '#1B5E33', borderRadius: 14, padding: '16px 8px', display: 'grid', gap: 16 }}>
          {rows.map((row, ri) => (
            <div key={ri} style={{ display: 'flex', justifyContent: 'space-around' }}>
              {row.map((p) => (
                <div key={p.n} style={{ display: 'grid', justifyItems: 'center', gap: 4, width: 68 }}>
                  {crest ? (
                    <span style={{ width: 40, height: 40, borderRadius: 20, background: 'rgba(255,255,255,0.85)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                      <img src={crestUrl(club)} alt="" style={{ width: 34, height: 34, objectFit: 'contain' }} />
                    </span>
                  ) : (
                    <span style={{
                      width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center',
                      background: sys === 'outline' ? 'rgba(255,255,255,0.94)' : club.primary,
                      color: sys === 'outline' ? club.primary : '#fff',
                      boxShadow: sys === 'duotone' ? `inset 0 0 0 2.5px ${club.secondary}` : sys === 'outline' ? `inset 0 0 0 2px ${club.primary}` : 'none',
                      fontFamily: BLACK, fontWeight: 900, fontSize: 15,
                    }}>{p.n}</span>
                  )}
                  <span style={{ fontSize: 10, color: '#fff', fontWeight: 700, textAlign: 'center' }}>{p.name}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: slate(dark), marginTop: 10 }}>
          {crest ? 'Today: a photo per player, the crest behind it.' : 'Shirt number, club colour. Numbers and names are facts; no photograph.'}
        </p>
      </div>
    </div>
  )
}

// ----------------------------------------------------------------- dossier
function Dossier({ sys, dark, crest }: Ctx) {
  const h = CLUBS.mun, a = CLUBS.mci
  return (
    <div style={{ background: snow(dark), padding: 12 }}>
      <div style={{ background: surf(dark), borderRadius: 18, overflow: 'hidden' }}>
        <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, display: 'grid', gap: 8, justifyItems: 'center' }}>
            {crest ? <img src={crestUrl(h)} alt="" style={{ width: 44, height: 44, objectFit: 'contain' }} /> : <Plate club={h} system={sys} size={56} onDark={dark} />}
            <span style={{ fontSize: 12, fontWeight: 700, color: ink(dark) }}>{h.short}</span>
          </div>
          <span style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 13, color: slate(dark) }}>SCOUT</span>
          <div style={{ flex: 1, display: 'grid', gap: 8, justifyItems: 'center' }}>
            {crest ? <img src={crestUrl(a)} alt="" style={{ width: 44, height: 44, objectFit: 'contain' }} /> : <Plate club={a} system={sys} size={56} onDark={dark} />}
            <span style={{ fontSize: 12, fontWeight: 700, color: ink(dark) }}>{a.short}</span>
          </div>
        </div>
        {[['Form', '3-1-1', '4-0-1'], ['Goals for', '7', '11'], ['Clean sheets', '1', '3']].map(([label, l, r]) => (
          <div key={label} style={{ padding: '10px 16px', borderTop: `1px solid ${line(dark)}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 52, textAlign: 'right', fontFamily: BLACK, fontWeight: 900, fontSize: 14, color: ink(dark) }}>{l}</span>
            <div style={{ flex: 1, display: 'grid', gap: 4, justifyItems: 'center' }}>
              <span style={{ fontSize: 10, letterSpacing: 1.2, fontWeight: 800, color: slate(dark) }}>{label.toUpperCase()}</span>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <ClubRule club={h} system={sys} width={40} />
                <ClubRule club={a} system={sys} width={40} />
              </div>
            </div>
            <span style={{ width: 52, fontFamily: BLACK, fontWeight: 900, fontSize: 14, color: ink(dark) }}>{r}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// -------------------------------------------------------------- duel card
function Duel({ dark }: { dark: boolean }) {
  return (
    <div style={{ background: snow(dark), padding: 12 }}>
      <div style={{ background: `linear-gradient(150deg, ${T.primary}, #1E3A8A)`, borderRadius: 18, padding: 20, textAlign: 'center' }}>
        <p style={{ fontSize: 11, letterSpacing: 2, fontWeight: 800, color: 'rgba(255,255,255,0.75)' }}>SHOWDOWN · MATCHWEEK 4</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }}>
          {['RS', 'CG'].map((initials, i) => (
            <div key={initials} style={{ flex: 1, display: 'grid', justifyItems: 'center', gap: 8 }}>
              <span style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(255,255,255,0.18)', border: '2px solid rgba(255,255,255,0.4)', display: 'grid', placeItems: 'center', fontFamily: BLACK, fontWeight: 900, fontSize: 18, color: '#fff' }}>{initials}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{i === 0 ? 'Ryan' : 'Carson'}</span>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.8)', marginTop: 16 }}>Unaffected — a duel is member v member. No club mark involved.</p>
      </div>
    </div>
  )
}

export default function ScreensB() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('dark')) setDark(true)
  }, [])

  const screens: { title: string; note: string; render: (c: Ctx) => React.ReactNode }[] = [
    { title: 'Home + Pools — the pool card', note: 'The rail carries the competition, not a club. Solid runs the competition’s NAME up the rail, which the card has never said; Duotone and Outline use a monogram.', render: (c) => <PoolCard {...c} /> },
    { title: 'Pick’em — the picker', note: 'Two plates and a 1/X/2 row. The plate has to survive next to a selected primary-blue button without competing with it.', render: (c) => <Pickem {...c} /> },
    { title: 'Predict the Table — the drag list', note: 'Twenty rows that move under a finger. A uniform plate makes the drag target obvious in a way ragged crests do not.', render: (c) => <TablePicker {...c} /> },
    { title: 'Line-ups — the pitch', note: 'Shirt number in the club’s colour. Numbers, names and positions are facts we already store; the photograph and the crest both go.', render: (c) => <Lineups {...c} /> },
    { title: 'Scouting — the dossier', note: 'Two clubs compared. At 56px the plate anchors each side, and the comparison rows use the club rule rather than a repeated mark.', render: (c) => <Dossier {...c} /> },
  ]

  return (
    <div style={{ minHeight: '100vh', background: T.snow, padding: 40, fontFamily: BLACK }}>
      <div style={{ maxWidth: 1800, margin: '0 auto', display: 'grid', gap: 44 }}>
        <header>
          <h1 style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 32, color: T.ink }}>Screens B — playing</h1>
          <p style={{ color: T.slate, fontWeight: 500, maxWidth: 900, marginTop: 8 }}>
            Pool cards, Pick’em, Predict the Table, line-ups and the scouting dossier. Same three systems.
          </p>
          <button onClick={() => setDark((d) => !d)} style={{ marginTop: 12, borderRadius: 999, border: `1px solid ${T.silver}`, padding: '8px 14px', color: T.ink, background: 'transparent', fontWeight: 700 }}>
            {dark ? 'Light' : 'Dark'} mode
          </button>
        </header>

        {screens.map((s) => (
          <Section key={s.title} title={s.title} note={s.note}>
            <Phone title="TODAY — CRESTS">{s.render({ sys: 'solid', dark, crest: true })}</Phone>
            {SYS.map((y) => <Phone key={y.key} title={y.name.toUpperCase()}>{s.render({ sys: y.key, dark })}</Phone>)}
          </Section>
        ))}

        <Section title="Showdown — the duel card" note="Included for completeness: a duel is member against member, so nothing on it changes.">
          <Phone title="UNCHANGED"><Duel dark={dark} /></Phone>
        </Section>
      </div>
    </div>
  )
}
