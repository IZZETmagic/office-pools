'use client'

// Throwaway. The identity system itself, before any screen uses it.

import { useEffect, useState } from 'react'
import { CLUBS, crestUrl, type Club } from '../_identity/clubs'
import { Plate, T, BLACK, type System, type PlateSize } from '../_identity/plates'

const SYSTEMS: { key: System; name: string; note: string }[] = [
  { key: 'solid', name: '1 · Solid', note: 'Filled plate in the club’s primary. Loudest, reads at 20px, matches the app’s filled-tile language.' },
  { key: 'duotone', name: '2 · Duotone', note: 'The same fill with a ring in the club’s SECOND colour. Arsenal red-and-white against United red-and-black.' },
  { key: 'outline', name: '3 · Outline', note: 'Surface fill, club-colour border and code. Quiet and editorial, and the only one that survives on a coloured ground.' },
]

const REDS = ['ars', 'mun', 'liv', 'bre', 'nfo', 'bou', 'sun'] as const
const BLUES = ['che', 'eve', 'mci', 'bha', 'cry', 'tot'] as const
const SIZES: PlateSize[] = [88, 56, 36, 28, 20]

function Card({ title, sub, children, dark }: { title: string; sub?: string; children: React.ReactNode; dark?: boolean }) {
  return (
    <div style={{ background: dark ? T.surfaceD : T.surface, borderRadius: 24, padding: 20, border: `1px solid ${dark ? T.silverD : T.silver}` }}>
      <h3 style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 16, color: dark ? T.inkD : T.ink }}>{title}</h3>
      {sub && <p style={{ fontSize: 12, color: dark ? T.slateD : T.slate, marginTop: 4, maxWidth: 460 }}>{sub}</p>}
      <div style={{ marginTop: 16 }}>{children}</div>
    </div>
  )
}

export default function IdentityHarness() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('dark')) setDark(true)
  }, [])
  const bg = dark ? T.snowD : T.snow
  const ink = dark ? T.inkD : T.ink
  const slate = dark ? T.slateD : T.slate

  return (
    <div style={{ minHeight: '100vh', background: bg, padding: 40, fontFamily: BLACK }}>
      <div style={{ maxWidth: 1700, margin: '0 auto', display: 'grid', gap: 28 }}>
        <header>
          <h1 style={{ fontFamily: BLACK, fontWeight: 900, fontSize: 32, color: ink }}>Club identity — three systems</h1>
          <p style={{ color: slate, marginTop: 8, maxWidth: 780, fontWeight: 500 }}>
            One primitive, three treatments, five sizes — the app’s real ones: 88 match header, 56 pool card,
            36 match row, 28 table row, 20 dense list. Radii step with size from <code>theme/radii.ts</code>.
            Never a circle: this app’s language is the rounded square.
          </p>
          <button
            onClick={() => setDark((d) => !d)}
            style={{ marginTop: 12, borderRadius: 999, border: `1px solid ${dark ? T.silverD : T.silver}`, padding: '8px 14px', color: ink, background: 'transparent', fontWeight: 700 }}
          >
            {dark ? 'Light' : 'Dark'} mode
          </button>
        </header>

        {/* Scale */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {SYSTEMS.map((s) => (
            <Card key={s.key} title={s.name} sub={s.note} dark={dark}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14 }}>
                {SIZES.map((z) => (
                  <div key={z} style={{ display: 'grid', gap: 6, justifyItems: 'center' }}>
                    <Plate club={CLUBS.mun} system={s.key} size={z} onDark={dark} />
                    <span style={{ fontSize: 10, color: slate, fontWeight: 700 }}>{z}</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>

        {/* The fixture test */}
        <Card
          title="“Oh, that’s Man United v Man City”"
          sub="The whole test. Plate, then name — at match-row size, which is where most of the app lives."
          dark={dark}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, alignItems: 'center' }}>
            <div>
              <p style={{ fontSize: 11, letterSpacing: 1.5, color: slate, fontWeight: 700, marginBottom: 10 }}>TODAY — CRESTS</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={crestUrl(CLUBS.mun)} alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
                <span style={{ fontWeight: 700, color: ink, fontSize: 15 }}>Man United</span>
                <span style={{ color: slate, fontWeight: 700 }}>v</span>
                <span style={{ fontWeight: 700, color: ink, fontSize: 15 }}>Man City</span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={crestUrl(CLUBS.mci)} alt="" style={{ width: 36, height: 36, objectFit: 'contain' }} />
              </div>
            </div>
            {SYSTEMS.map((s) => (
              <div key={s.key}>
                <p style={{ fontSize: 11, letterSpacing: 1.5, color: slate, fontWeight: 700, marginBottom: 10 }}>{s.name.toUpperCase()}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Plate club={CLUBS.mun} system={s.key} size={36} onDark={dark} />
                  <span style={{ fontWeight: 700, color: ink, fontSize: 15 }}>Man United</span>
                  <span style={{ color: slate, fontWeight: 700 }}>v</span>
                  <span style={{ fontWeight: 700, color: ink, fontSize: 15 }}>Man City</span>
                  <Plate club={CLUBS.mci} system={s.key} size={36} onDark={dark} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* The hard case */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {SYSTEMS.map((s) => (
            <Card
              key={s.key}
              title={`${s.name} — the seven reds and six blues`}
              sub="The real stress test. One colour cannot separate these; the second colour and the code can."
              dark={dark}
            >
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {REDS.map((k) => (
                    <div key={k} style={{ display: 'grid', gap: 4, justifyItems: 'center', width: 56 }}>
                      <Plate club={CLUBS[k]} system={s.key} size={36} onDark={dark} />
                      <span style={{ fontSize: 9, color: slate, fontWeight: 600, textAlign: 'center' }}>{CLUBS[k].short}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {BLUES.map((k) => (
                    <div key={k} style={{ display: 'grid', gap: 4, justifyItems: 'center', width: 56 }}>
                      <Plate club={CLUBS[k]} system={s.key} size={36} onDark={dark} />
                      <span style={{ fontSize: 9, color: slate, fontWeight: 600, textAlign: 'center' }}>{CLUBS[k].short}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Full sheet */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {SYSTEMS.map((s) => (
            <Card key={s.key} title={`${s.name} — the full division`} dark={dark}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Object.values(CLUBS).map((c: Club) => (
                  <div key={c.id} style={{ display: 'grid', gap: 4, justifyItems: 'center', width: 52 }}>
                    <Plate club={c} system={s.key} size={36} onDark={dark} />
                    <span style={{ fontSize: 9, color: slate, fontWeight: 600, textAlign: 'center', lineHeight: 1.2 }}>{c.short}</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
