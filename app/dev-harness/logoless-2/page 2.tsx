'use client'

// =============================================================
// Throwaway: logoless, part 2 — the surfaces with nowhere to hide
// =============================================================
// A fixture row is easy: the club names are already written on it. These are
// the hard ones, where the crest was doing real work:
//
//   · the scout report      — two clubs opposed, with nothing else on screen
//   · the Last Man Standing grid — twenty clubs at once, six already used
//   · the Showdown duel      — members, but their PICKS are clubs
//   · the fixture list       — the long scroll, grouped by day
//
// Direction B (a colour rule attached to the name) is the base everywhere.
// Where that is not enough on its own, there are two further ideas per surface.
// =============================================================

import { useEffect, useState } from 'react'
import { CLUBS, type Club } from '../_identity/clubs'
import { T, BLACK } from '../_identity/plates'

const ink = (d: boolean) => (d ? T.inkD : T.ink)
const slate = (d: boolean) => (d ? T.slateD : T.slate)
const surf = (d: boolean) => (d ? T.surfaceD : T.surface)
const snow = (d: boolean) => (d ? T.snowD : T.snow)
const mist = (d: boolean) => (d ? T.mistD : T.mist)
const line = (d: boolean) => (d ? T.silverD : T.silver)

function tint(hex: string, a: number) {
  const s = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

function Phone({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ width: 390 }}>
      <p style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 12, letterSpacing: 1.3, color: T.slate, marginBottom: 8 }}>{title}</p>
      <div style={{ borderRadius: 24, overflow: 'hidden', border: `1px solid ${T.silver}` }}>{children}</div>
    </div>
  )
}
function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <div>
        <h2 style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 22, color: T.ink }}>{title}</h2>
        <p style={{ color: T.slate, fontWeight: 500, maxWidth: 960 }}>{note}</p>
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>{children}</div>
    </section>
  )
}
function Rule({ c, w = 26, h = 3 }: { c: Club; w?: number; h?: number }) {
  return <span style={{ display: 'block', width: w, height: h, borderRadius: 2, background: c.primary }} />
}

// =============================================================== SCOUT REPORT
const ROWS: [string, string, string, number][] = [
  ['Form', 'W W L D W', 'W W W D W', 0.42],
  ['Goals for', '7', '11', 0.39],
  ['Goals against', '6', '3', 0.67],
  ['Clean sheets', '1', '3', 0.25],
  ['Corners', '24', '31', 0.44],
]

/** 1 — names with rules, comparison as a divergent bar in the two colours. */
function ScoutBars({ dark }: { dark: boolean }) {
  const h = CLUBS.mun, a = CLUBS.mci
  return (
    <div style={{ background: snow(dark), padding: 12 }}>
      <div style={{ background: surf(dark), borderRadius: 18, padding: '18px 18px 8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 19, color: ink(dark), letterSpacing: '-0.01em' }}>Man United</div>
            <div style={{ marginTop: 6 }}><Rule c={h} w={34} /></div>
          </div>
          <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: slate(dark), paddingTop: 6 }}>SCOUT</div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 19, color: ink(dark), letterSpacing: '-0.01em' }}>Man City</div>
            <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}><Rule c={a} w={34} /></div>
          </div>
        </div>
        <div style={{ marginTop: 18 }}>
          {ROWS.map(([label, l, r, split]) => (
            <div key={label} style={{ padding: '12px 0', borderTop: `1px solid ${line(dark)}` }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 7 }}>
                <span style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 14, color: ink(dark), fontVariantNumeric: 'tabular-nums' }}>{l}</span>
                <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.4, color: slate(dark) }}>{label.toUpperCase()}</span>
                <span style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 14, color: ink(dark), fontVariantNumeric: 'tabular-nums' }}>{r}</span>
              </div>
              <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: mist(dark) }}>
                <span style={{ flex: split, background: h.primary }} />
                <span style={{ width: 2 }} />
                <span style={{ flex: 1 - split, background: a.primary }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** 2 — the colour owns the column: two tinted fields, the numbers inside them. */
function ScoutColumns({ dark }: { dark: boolean }) {
  const h = CLUBS.mun, a = CLUBS.mci
  return (
    <div style={{ background: snow(dark), padding: 12 }}>
      <div style={{ background: surf(dark), borderRadius: 18, overflow: 'hidden' }}>
        <div style={{ display: 'flex' }}>
          {[h, a].map((c, i) => (
            <div key={c.id} style={{
              flex: 1, padding: '16px 14px', textAlign: i === 0 ? 'left' : 'right',
              background: tint(c.primary, dark ? 0.34 : 0.13),
              borderTop: `3px solid ${c.primary}`,
            }}>
              <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 17, color: ink(dark) }}>{c.short}</div>
              <div style={{ fontSize: 11, color: slate(dark), marginTop: 2 }}>{i === 0 ? 'Home · 6th' : 'Away · 2nd'}</div>
            </div>
          ))}
        </div>
        {ROWS.map(([label, l, r]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', borderTop: `1px solid ${line(dark)}` }}>
            <div style={{ flex: 1, padding: '11px 14px', background: tint(h.primary, dark ? 0.16 : 0.06) }}>
              <span style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 14, color: ink(dark), fontVariantNumeric: 'tabular-nums' }}>{l}</span>
            </div>
            <div style={{ width: 108, textAlign: 'center', fontSize: 10, fontWeight: 800, letterSpacing: 1.2, color: slate(dark) }}>{label.toUpperCase()}</div>
            <div style={{ flex: 1, padding: '11px 14px', textAlign: 'right', background: tint(a.primary, dark ? 0.16 : 0.06) }}>
              <span style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 14, color: ink(dark), fontVariantNumeric: 'tabular-nums' }}>{r}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 3 — the people card: numbers as the typography, no photograph. */
function ScoutPeople({ dark }: { dark: boolean }) {
  const h = CLUBS.mun, a = CLUBS.mci
  const people: [Club, number, string, string][] = [
    [a, 9, 'Erling Haaland', '4 goals'],
    [a, 17, 'Kevin De Bruyne', '3 assists'],
    [h, 8, 'Bruno Fernandes', '2 goals · 2 assists'],
    [h, 10, 'Marcus Rashford', '2 goals'],
    [a, 47, 'Phil Foden', '1 goal · 3 key passes'],
  ]
  return (
    <div style={{ background: snow(dark), padding: 12 }}>
      <div style={{ background: surf(dark), borderRadius: 18, padding: '16px 18px 6px' }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: slate(dark) }}>THE PEOPLE</div>
        <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 17, color: ink(dark), marginTop: 4, marginBottom: 8 }}>Five to watch</div>
        {people.map(([c, n, name, stat]) => (
          <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 0', borderTop: `1px solid ${line(dark)}` }}>
            <span style={{
              width: 30, textAlign: 'right', fontFamily: BLACK, fontWeight: 900, fontSize: 21,
              color: c.primary, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em',
            }}>{n}</span>
            <span style={{ width: 3, height: 26, borderRadius: 2, background: c.primary, opacity: 0.35 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 14, color: ink(dark) }}>{name}</div>
              <div style={{ fontSize: 11, color: slate(dark), marginTop: 1 }}>{stat}</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: slate(dark) }}>{c.code}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ================================================================ LMS GRID
const TWENTY = ['liv', 'ars', 'mci', 'che', 'tot', 'mun', 'new', 'bha', 'avl', 'eve', 'ful', 'nfo', 'bou', 'bre', 'cry', 'ips', 'lee', 'hul', 'sun', 'cov'] as const
const USED = new Set(['tot', 'new', 'ful', 'bre'])

/** 1 — a list, not a grid: full names, colour rule, used ones struck out. */
function LmsList({ dark }: { dark: boolean }) {
  return (
    <div style={{ background: snow(dark), padding: 12 }}>
      <div style={{ background: surf(dark), borderRadius: 18, padding: '16px 18px 8px' }}>
        <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 17, color: ink(dark) }}>Pick your club</div>
        <div style={{ fontSize: 11, color: slate(dark), marginTop: 2, marginBottom: 6 }}>Matchweek 5 · four already used</div>
        {TWENTY.slice(0, 10).map((k) => {
          const c = CLUBS[k]
          const used = USED.has(k)
          return (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: `1px solid ${line(dark)}`, opacity: used ? 0.38 : 1 }}>
              <span style={{ width: 3, height: 18, borderRadius: 2, background: c.primary }} />
              <span style={{
                flex: 1, fontFamily: BLACK, fontWeight: 900, fontSize: 15, color: ink(dark),
                textDecoration: used ? 'line-through' : 'none',
              }}>{c.name}</span>
              <span style={{ fontSize: 11, color: slate(dark) }}>{used ? 'used MW2' : 'v Brighton (H)'}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** 2 — two-up tiles, the colour as a top edge on each tile. */
function LmsTiles({ dark }: { dark: boolean }) {
  return (
    <div style={{ background: snow(dark), padding: 12 }}>
      <div style={{ background: surf(dark), borderRadius: 18, padding: 16 }}>
        <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 17, color: ink(dark), marginBottom: 12 }}>Pick your club</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {TWENTY.slice(0, 12).map((k) => {
            const c = CLUBS[k]
            const used = USED.has(k)
            return (
              <div key={c.id} style={{
                borderRadius: 12, padding: '10px 12px', background: mist(dark),
                borderTop: `3px solid ${c.primary}`, opacity: used ? 0.35 : 1,
              }}>
                <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 13, color: ink(dark), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.short}</div>
                <div style={{ fontSize: 10, color: slate(dark), marginTop: 2 }}>{used ? 'used' : 'v BHA (H)'}</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/** 3 — the fixture IS the pick: choose a side of a match, not a club in a list. */
function LmsFixtures({ dark }: { dark: boolean }) {
  const pairs: [Club, Club][] = [[CLUBS.liv, CLUBS.nfo], [CLUBS.ars, CLUBS.che], [CLUBS.mci, CLUBS.bha], [CLUBS.mun, CLUBS.eve], [CLUBS.avl, CLUBS.cry]]
  return (
    <div style={{ background: snow(dark), padding: 12 }}>
      <div style={{ background: surf(dark), borderRadius: 18, padding: '16px 16px 8px' }}>
        <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 17, color: ink(dark) }}>Back a winner</div>
        <div style={{ fontSize: 11, color: slate(dark), marginTop: 2, marginBottom: 10 }}>Tap the side you think wins · no repeats</div>
        {pairs.map(([h, a], i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {[h, a].map((c, j) => {
              const chosen = i === 1 && j === 0
              const used = USED.has(Object.keys(CLUBS).find((k) => CLUBS[k].id === c.id) as string)
              return (
                <div key={c.id} style={{
                  flex: 1, borderRadius: 12, padding: '10px 12px',
                  background: chosen ? tint(c.primary, dark ? 0.4 : 0.16) : mist(dark),
                  borderLeft: `3px solid ${chosen ? c.primary : 'transparent'}`,
                  opacity: used ? 0.34 : 1,
                }}>
                  <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 13, color: ink(dark), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.short}</div>
                  <div style={{ fontSize: 10, color: slate(dark), marginTop: 2 }}>{j === 0 ? 'Home' : 'Away'}{used ? ' · used' : ''}</div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ================================================================= SHOWDOWN
function DuelPicks({ dark }: { dark: boolean }) {
  const rows: [Club, Club, string, string][] = [
    [CLUBS.mun, CLUBS.mci, '1', '2'],
    [CLUBS.ars, CLUBS.che, '1', '1'],
    [CLUBS.liv, CLUBS.nfo, 'X', '1'],
    [CLUBS.tot, CLUBS.new, '2', '2'],
  ]
  return (
    <div style={{ background: snow(dark), padding: 12 }}>
      <div style={{ background: `linear-gradient(150deg, ${T.primary}, #1E3A8A)`, borderRadius: 18, padding: '18px 18px 16px' }}>
        <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: 2, color: 'rgba(255,255,255,0.7)', textAlign: 'center' }}>SHOWDOWN · MATCHWEEK 4</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
          <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 20, color: '#fff' }}>Ryan</div>
          <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 15, color: 'rgba(255,255,255,0.6)' }}>3 – 2</div>
          <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 20, color: '#fff' }}>Carson</div>
        </div>
      </div>
      <div style={{ background: surf(dark), borderRadius: 18, marginTop: 10, padding: '6px 16px 8px' }}>
        {rows.map(([h, a, p1, p2], i) => (
          <div key={i} style={{ padding: '12px 0', borderTop: i ? `1px solid ${line(dark)}` : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 26, textAlign: 'center', fontFamily: BLACK, fontWeight: 900, fontSize: 13, color: p1 === '2' ? T.green : ink(dark) }}>{p1}</span>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 14, color: ink(dark) }}>
                  {h.short} <span style={{ color: slate(dark), fontWeight: 700 }}>v</span> {a.short}
                </div>
                <div style={{ display: 'flex', gap: 4, justifyContent: 'center', marginTop: 5 }}>
                  <Rule c={h} w={22} h={3} /><Rule c={a} w={22} h={3} />
                </div>
              </div>
              <span style={{ width: 26, textAlign: 'center', fontFamily: BLACK, fontWeight: 900, fontSize: 13, color: p2 === '2' ? T.green : ink(dark) }}>{p2}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================= FIXTURE LIST
function FixtureList({ dark }: { dark: boolean }) {
  const days: [string, [Club, Club, string][]][] = [
    ['SATURDAY 14 SEPTEMBER', [[CLUBS.liv, CLUBS.nfo, '12:30'], [CLUBS.ars, CLUBS.che, '15:00'], [CLUBS.bha, CLUBS.eve, '15:00'], [CLUBS.avl, CLUBS.cry, '17:30']]],
    ['SUNDAY 15 SEPTEMBER', [[CLUBS.mun, CLUBS.mci, '14:00'], [CLUBS.tot, CLUBS.new, '16:30']]],
  ]
  return (
    <div style={{ background: snow(dark), padding: 12 }}>
      <div style={{ background: surf(dark), borderRadius: 18, padding: '4px 0 6px' }}>
        {days.map(([day, fx]) => (
          <div key={day}>
            <div style={{ padding: '14px 18px 8px', fontSize: 10, fontWeight: 800, letterSpacing: 1.8, color: slate(dark) }}>{day}</div>
            {fx.map(([h, a, t], i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', padding: '13px 18px', borderTop: `1px solid ${line(dark)}`, gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 15, color: ink(dark) }}>{h.short}</div>
                  <div style={{ marginTop: 5 }}><Rule c={h} w={22} /></div>
                </div>
                <div style={{ width: 50, textAlign: 'center', fontFamily: BLACK, fontWeight: 900, fontSize: 14, color: T.primary, fontVariantNumeric: 'tabular-nums' }}>{t}</div>
                <div style={{ flex: 1, minWidth: 0, display: 'grid', justifyItems: 'end' }}>
                  <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 15, color: ink(dark) }}>{a.short}</div>
                  <div style={{ marginTop: 5 }}><Rule c={a} w={22} /></div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function Logoless2() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('dark')) setDark(true)
  }, [])

  return (
    <div style={{ minHeight: '100vh', background: T.snow, padding: 40, fontFamily: BLACK }}>
      <div style={{ maxWidth: 1800, margin: '0 auto', display: 'grid', gap: 44 }}>
        <header>
          <h1 style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 32, color: T.ink }}>Logoless — the hard surfaces</h1>
          <p style={{ color: T.slate, fontWeight: 500, maxWidth: 940, marginTop: 8 }}>
            A fixture row already has the club names written on it. These do not: the scout report puts two clubs
            against each other with nothing else on screen, and Last Man Standing asks you to scan twenty at once.
            Direction B is the base; each hard surface gets two further ideas.
          </p>
          <button onClick={() => setDark((x) => !x)} style={{ marginTop: 14, borderRadius: 999, border: `1px solid ${T.silver}`, padding: '8px 14px', color: T.ink, background: 'transparent', fontWeight: 700 }}>
            {dark ? 'Light' : 'Dark'} mode
          </button>
        </header>

        <Section title="Scout report" note="The crest was the anchor for each side. Replacing it with a bar chart is the upgrade: the comparison was always the point, and a divergent bar in the two clubs’ colours says more than two badges ever did.">
          <Phone title="1 · DIVERGENT BARS">{<ScoutBars dark={dark} />}</Phone>
          <Phone title="2 · TWO TINTED COLUMNS">{<ScoutColumns dark={dark} />}</Phone>
          <Phone title="3 · THE PEOPLE CARD">{<ScoutPeople dark={dark} />}</Phone>
        </Section>

        <Section title="Last Man Standing — twenty clubs at once" note="The hardest surface in the app: a grid of crests is genuinely fast to scan. Three answers — go long instead of wide, tile with a colour edge, or change the question so you pick a SIDE of a fixture rather than a club from a list.">
          <Phone title="1 · FULL-NAME LIST">{<LmsList dark={dark} />}</Phone>
          <Phone title="2 · TILES, COLOUR EDGE">{<LmsTiles dark={dark} />}</Phone>
          <Phone title="3 · PICK A SIDE">{<LmsFixtures dark={dark} />}</Phone>
        </Section>

        <Section title="Showdown — the duel" note="The duel itself is member v member, so the header never needed a club mark. The picks underneath are fixtures, and they take the same treatment as everywhere else.">
          <Phone title="DUEL + PICKS">{<DuelPicks dark={dark} />}</Phone>
          <Phone title="FIXTURE LIST">{<FixtureList dark={dark} />}</Phone>
        </Section>
      </div>
    </div>
  )
}
