'use client'

// =============================================================
// Throwaway: Next Kickoff + Upcoming Matches, logoless
// =============================================================
// ⚠ THESE TWO NEVER SHOW A CLUB'S NAME. The card says "INT" and "UDI" and
// leaves the crest to do the naming. So deleting the crest is not the change —
// PROMOTING THE NAME into the space it used is. A three-letter code alone fails
// the "oh, that's Inter v Udinese" test for anyone who is not already fluent.
//
// Dark by default, because that is where both of these live.
// =============================================================

import { useEffect, useState } from 'react'

const BLACK = '"Nunito", system-ui, sans-serif'
const C = {
  snow: '#121520', surface: '#1C2030', mist: '#232840', silver: '#2E3448',
  slate: '#8B97B8', ink: '#E8EAF0', primary: '#5B8AFF', accent: '#F5C518',
}

type Club = { name: string; code: string; primary: string }
const K: Record<string, Club> = {
  int: { name: 'Inter Milan', code: 'INT', primary: '#0B5FA5' },
  udi: { name: 'Udinese', code: 'UDI', primary: '#2B2B2B' },
  lee: { name: 'Leeds United', code: 'LEE', primary: '#1D428A' },
  new: { name: 'Newcastle', code: 'NEW', primary: '#241F20' },
  ala: { name: 'Deportivo Alavés', code: 'ALA', primary: '#0761AF' },
  val: { name: 'Valencia', code: 'VAL', primary: '#C4701A' },
  atm: { name: 'Atlético Madrid', code: 'ATM', primary: '#C8102E' },
  osa: { name: 'Osasuna', code: 'OSA', primary: '#A21C28' },
  bar: { name: 'Barcelona', code: 'BAR', primary: '#A50044' },
  san: { name: 'Racing Santander', code: 'SAN', primary: '#00A94F' },
}

function tint(hex: string, a: number) {
  const s = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16))
  return `rgba(${r}, ${g}, ${b}, ${a})`
}
const Rule = ({ c, w = 26, h = 3 }: { c: Club; w?: number; h?: number }) => (
  <span style={{ display: 'block', width: w, height: h, borderRadius: 2, background: c.primary }} />
)

function Phone({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ width: 390 }}>
      <p style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 12, letterSpacing: 1.3, color: '#7B87A8', marginBottom: 8 }}>{title}</p>
      <div style={{ borderRadius: 24, overflow: 'hidden', background: C.snow, padding: 12 }}>{children}</div>
    </div>
  )
}
function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <div>
        <h2 style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 22, color: '#1B2340' }}>{title}</h2>
        <p style={{ color: '#7B87A8', fontWeight: 500, maxWidth: 980 }}>{note}</p>
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>{children}</div>
    </section>
  )
}

// ============================================================ NEXT KICKOFF
function Shell({ children, blobs }: { children: React.ReactNode; blobs?: [string, string] }) {
  return (
    <div style={{ position: 'relative', background: C.surface, borderRadius: 24, overflow: 'hidden', padding: '18px 20px 20px' }}>
      <span style={{
        position: 'absolute', top: -40, right: -30, width: 190, height: 190, borderRadius: 90,
        background: blobs ? tint(blobs[1], 0.22) : 'rgba(255,255,255,0.035)',
      }} />
      <span style={{
        position: 'absolute', bottom: -60, left: -40, width: 170, height: 170, borderRadius: 80,
        background: blobs ? tint(blobs[0], 0.22) : 'rgba(255,255,255,0.025)',
      }} />
      <div style={{ position: 'relative' }}>{children}</div>
    </div>
  )
}

function Kicker() {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 12, letterSpacing: 2.4, color: C.slate }}>NEXT KICKOFF</span>
      <span style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 12, letterSpacing: 2.4, color: C.slate }}>MATCHWEEK 4</span>
    </div>
  )
}
function Clock({ big = 38 }: { big?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
      {[['19', 'H'], ['23', 'M'], ['17', 'S']].map(([n, u], i) => (
        <span key={u} style={{ display: 'flex', alignItems: 'baseline' }}>
          <span style={{ fontFamily: BLACK, fontWeight: 900, fontSize: big, color: '#fff', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>{n}</span>
          <span style={{ fontSize: big * 0.34, color: C.slate, marginLeft: 2, marginRight: i < 2 ? 6 : 0 }}>{u}</span>
          {i < 2 && <span style={{ color: C.slate, marginRight: 6 }}>:</span>}
        </span>
      ))}
    </div>
  )
}
const Footer = () => (
  <>
    <p style={{ textAlign: 'center', fontSize: 13, color: C.accent, fontWeight: 700, marginTop: 14 }}>1 more match today</p>
    <p style={{ textAlign: 'center', fontSize: 13, color: C.slate, marginTop: 6 }}>Milan</p>
  </>
)

/** Today — crest + code flanking the clock. */
function KickoffToday() {
  return (
    <Shell>
      <Kicker />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }}>
        {['int', 'udi'].map((k, i) => (
          <div key={k} style={{ order: i === 0 ? 1 : 3, width: 86, display: 'grid', justifyItems: 'center', gap: 8 }}>
            <span style={{ width: 56, height: 56, borderRadius: 28, background: 'rgba(255,255,255,0.12)' }} />
            <span style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 15, letterSpacing: 2, color: '#fff' }}>{K[k].code}</span>
          </div>
        ))}
        <div style={{ order: 2, flex: 1 }}>
          <Clock />
          <p style={{ textAlign: 'center', fontSize: 13, color: C.slate, marginTop: 8 }}>Monday, Sep 14</p>
        </div>
      </div>
      <Footer />
    </Shell>
  )
}

/** 1 — the names take the flanks, stacked, with a rule. */
function KickoffNames() {
  return (
    <Shell>
      <Kicker />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 20 }}>
        <div style={{ width: 92, display: 'grid', gap: 8, justifyItems: 'start' }}>
          <span style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 17, color: '#fff', lineHeight: 1.1 }}>{K.int.name}</span>
          <Rule c={K.int} w={30} />
        </div>
        <div style={{ flex: 1 }}>
          <Clock big={34} />
          <p style={{ textAlign: 'center', fontSize: 13, color: C.slate, marginTop: 8 }}>Monday, Sep 14</p>
        </div>
        <div style={{ width: 92, display: 'grid', gap: 8, justifyItems: 'end' }}>
          <span style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 17, color: '#fff', lineHeight: 1.1, textAlign: 'right' }}>{K.udi.name}</span>
          <Rule c={K.udi} w={30} />
        </div>
      </div>
      <Footer />
    </Shell>
  )
}

/** 2 — the clock is the hero; the fixture is one line beneath it. */
function KickoffLine() {
  return (
    <Shell>
      <Kicker />
      <div style={{ marginTop: 22 }}>
        <Clock big={44} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 16 }}>
          <Rule c={K.int} w={22} />
          <span style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 18, color: '#fff' }}>
            {K.int.name} <span style={{ color: C.slate, fontWeight: 700 }}>v</span> {K.udi.name}
          </span>
          <Rule c={K.udi} w={22} />
        </div>
        <p style={{ textAlign: 'center', fontSize: 13, color: C.slate, marginTop: 8 }}>Monday, Sep 14 · Milan</p>
      </div>
      <p style={{ textAlign: 'center', fontSize: 13, color: C.accent, fontWeight: 700, marginTop: 16 }}>1 more match today</p>
    </Shell>
  )
}

/** 3 — the card's own blobs carry the colour. */
function KickoffBlobs() {
  return (
    <Shell blobs={[K.int.primary, K.udi.primary]}>
      <Kicker />
      <div style={{ marginTop: 22 }}>
        <Clock big={42} />
        <p style={{ textAlign: 'center', fontSize: 13, color: C.slate, marginTop: 8 }}>Monday, Sep 14</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 20 }}>
          <span style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 16, color: '#fff' }}>{K.int.name}</span>
          <span style={{ fontSize: 12, color: C.slate, paddingBottom: 2 }}>v</span>
          <span style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 16, color: '#fff' }}>{K.udi.name}</span>
        </div>
      </div>
      <Footer />
    </Shell>
  )
}

// ========================================================= UPCOMING MATCHES
type Up = { h: Club; a: Club; when: string; where: string }
const UP: Up[] = [
  { h: K.int, a: K.udi, when: 'Mon, Sep 14 · 3:45 PM', where: 'Milan' },
  { h: K.lee, a: K.new, when: 'Mon, Sep 14 · 4:00 PM', where: 'Elland Road, Leeds' },
  { h: K.ala, a: K.val, when: 'Wed, Sep 16 · 12:00 PM', where: 'Estadio Mendizorrotza, Vitoria' },
  { h: K.atm, a: K.osa, when: 'Wed, Sep 16 · 12:00 PM', where: 'Metropolitano Stadium, Madrid' },
  { h: K.bar, a: K.san, when: 'Wed, Sep 16 · 12:00 PM', where: 'Camp Nou, Barcelona' },
]

function UpcomingShell({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <h3 style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 24, color: '#fff', margin: '6px 4px 14px' }}>Upcoming Matches</h3>
      <div style={{ display: 'grid', gap: 10 }}>{children}</div>
    </div>
  )
}
const Row = ({ children }: { children: React.ReactNode }) => (
  <div style={{ background: C.surface, borderRadius: 18, padding: '14px 16px' }}>{children}</div>
)

function UpcomingToday() {
  return (
    <UpcomingShell>
      {UP.slice(0, 4).map((m, i) => (
        <Row key={i}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {[m.h, m.a].map((c, j) => (
              <div key={j} style={{ order: j === 0 ? 1 : 3, width: 62, display: 'grid', justifyItems: 'center', gap: 6 }}>
                <span style={{ width: 42, height: 42, borderRadius: 21, background: 'rgba(255,255,255,0.12)' }} />
                <span style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 13, letterSpacing: 2, color: '#fff' }}>{c.code}</span>
              </div>
            ))}
            <span style={{ order: 2, fontSize: 12, color: C.slate, fontWeight: 700 }}>VS</span>
            <div style={{ order: 4, flex: 1, textAlign: 'right' }}>
              <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 14, color: '#fff' }}>{m.when}</div>
              <div style={{ fontSize: 12, color: C.slate, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.where}</div>
            </div>
          </div>
        </Row>
      ))}
    </UpcomingShell>
  )
}

/** 1 — names left and right, time and venue beneath. One line each. */
function UpcomingNames() {
  return (
    <UpcomingShell>
      {UP.map((m, i) => (
        <Row key={i}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 16, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.h.name}</div>
              <div style={{ marginTop: 6 }}><Rule c={m.h} w={24} /></div>
            </div>
            <span style={{ fontSize: 11, color: C.slate, fontWeight: 800, letterSpacing: 1 }}>V</span>
            <div style={{ flex: 1, minWidth: 0, display: 'grid', justifyItems: 'end' }}>
              <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 16, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{m.a.name}</div>
              <div style={{ marginTop: 6 }}><Rule c={m.a} w={24} /></div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.silver}` }}>
            <span style={{ fontSize: 12.5, color: '#fff', fontWeight: 700 }}>{m.when}</span>
            <span style={{ fontSize: 12.5, color: C.slate, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 170 }}>{m.where}</span>
          </div>
        </Row>
      ))}
    </UpcomingShell>
  )
}

/** 2 — stacked, the way the match header reads. Time to the right. */
function UpcomingStacked() {
  return (
    <UpcomingShell>
      {UP.map((m, i) => (
        <Row key={i}>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ display: 'grid', gap: 4, paddingTop: 2 }}>
              <Rule c={m.h} w={3} h={16} /><Rule c={m.a} w={3} h={16} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 16, color: '#fff', lineHeight: 1.35 }}>{m.h.name}</div>
              <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 16, color: '#fff', lineHeight: 1.35 }}>{m.a.name}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 13, color: C.primary }}>{m.when.split(' · ')[1]}</div>
              <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>{m.when.split(' · ')[0]}</div>
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: C.slate, marginTop: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.where}</div>
        </Row>
      ))}
    </UpcomingShell>
  )
}

/** 3 — the row's left edge is the fixture: two colours, split. */
function UpcomingEdge() {
  return (
    <UpcomingShell>
      {UP.map((m, i) => (
        <div key={i} style={{ background: C.surface, borderRadius: 18, overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: 5, display: 'grid' }}>
            <span style={{ background: m.h.primary }} /><span style={{ background: m.a.primary }} />
          </div>
          <div style={{ flex: 1, padding: '14px 16px', minWidth: 0 }}>
            <div style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 16, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {m.h.name} <span style={{ color: C.slate, fontWeight: 700 }}>v</span> {m.a.name}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 8 }}>
              <span style={{ fontSize: 12.5, color: '#fff', fontWeight: 700 }}>{m.when}</span>
              <span style={{ fontSize: 12.5, color: C.slate, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>{m.where}</span>
            </div>
          </div>
        </div>
      ))}
    </UpcomingShell>
  )
}

export default function Logoless3() {
  const [_, setX] = useState(0)
  useEffect(() => setX(1), [])
  return (
    <div style={{ minHeight: '100vh', background: '#F7F8FC', padding: 40, fontFamily: BLACK }}>
      <div style={{ maxWidth: 1800, margin: '0 auto', display: 'grid', gap: 44 }}>
        <header>
          <h1 style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 32, color: '#1B2340' }}>Next Kickoff + Upcoming Matches</h1>
          <p style={{ color: '#7B87A8', fontWeight: 500, maxWidth: 980, marginTop: 8 }}>
            Both of these show a code and a crest and <strong>never the club’s name</strong> — so the crest is doing the
            naming and “INT” is doing nothing for anyone who isn’t already fluent. The move is not to delete the crest,
            it is to promote the name into the space it was using. Dark, because that is where these live.
          </p>
        </header>

        <Section title="Next Kickoff" note="The countdown is the hero and the crests are flanking decoration. Three ways to give the clock more room, not less.">
          <Phone title="TODAY"><KickoffToday /></Phone>
          <Phone title="1 · NAMES ON THE FLANKS"><KickoffNames /></Phone>
          <Phone title="2 · CLOCK HERO, FIXTURE LINE"><KickoffLine /></Phone>
          <Phone title="3 · THE CARD’S BLOBS CARRY IT"><KickoffBlobs /></Phone>
        </Section>

        <Section title="Upcoming Matches" note="Five rows deep and mixing three competitions. Today the crest is the only thing separating Alavés from Valencia; the names do it better and the venue finally has room.">
          <Phone title="TODAY"><UpcomingToday /></Phone>
          <Phone title="1 · NAMES, META BELOW"><UpcomingNames /></Phone>
          <Phone title="2 · STACKED"><UpcomingStacked /></Phone>
          <Phone title="3 · SPLIT EDGE"><UpcomingEdge /></Phone>
        </Section>
      </div>
    </div>
  )
}
