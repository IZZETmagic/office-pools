'use client'

// =============================================================
// Throwaway: the match header without crests
// =============================================================
// The rest of this screen is already clean — Match Facts and the Timeline are
// player names, minutes, a stadium name and our own icons, all of which are
// facts. The header is the only thing that has to change, which makes it a
// design brief rather than a compliance one.
//
// ⚠ THROWAWAY. Not linked, not a product surface.
//
// The brief: the crests are currently two small objects floating on the
// competition's purple. Take them away and there is room to do the thing crests
// actually prevent — let the two CLUBS own the header instead of the league.
// =============================================================

import { useEffect, useState } from 'react'

const UNITED = { name: 'Manchester United', code: 'MUN', color: '#DA291C', deep: '#8F1A12', id: 33 }
const CITY = { name: 'Manchester City', code: 'MCI', color: '#6CABDD', deep: '#1C6FB5', id: 50 }
const PL_PURPLE = '#3D195B'

const crest = (id: number) => `https://media.api-sports.io/football/teams/${id}.png`
const INK = '#0B0F1A'

function Kicker({ tone = 'rgba(255,255,255,0.72)' }: { tone?: string }) {
  return (
    <p className="text-[12px] font-bold tracking-[0.18em] text-center" style={{ color: tone }}>
      PREMIER LEAGUE · MATCHWEEK 4
    </p>
  )
}

function Scorer({ tone = 'rgba(255,255,255,0.85)' }: { tone?: string }) {
  return (
    <p className="text-[14px] text-center" style={{ color: tone }}>
      <span style={{ opacity: 0.75 }}>⚽</span> Erling Haaland 60&apos;
    </p>
  )
}

function Tabs({ active = 'Facts', onDark = true }: { active?: string; onDark?: boolean }) {
  return (
    <div className="flex gap-2 px-4 pb-4">
      {['Facts', 'Line-ups', 'Stats', 'Scouting'].map((t) => (
        <span
          key={t}
          className="rounded-chip px-4 py-2.5 text-[14px] font-semibold whitespace-nowrap"
          style={
            t === active
              ? { background: '#fff', color: INK }
              : { background: onDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.06)', color: onDark ? 'rgba(255,255,255,0.9)' : INK }
          }
        >
          {t}
        </span>
      ))}
    </div>
  )
}

function Score({ size = 56, tone = '#fff', muted = 'rgba(255,255,255,0.6)' }) {
  return (
    <div className="text-center">
      <div className="font-black tabular-nums leading-none" style={{ fontSize: size, color: tone, letterSpacing: '-0.02em' }}>
        0<span style={{ color: muted, margin: '0 10px' }}>–</span>1
      </div>
      <div className="text-[12px] mt-2" style={{ color: muted }}>Full Time</div>
    </div>
  )
}

/** A — as it ships. */
function HeaderToday() {
  return (
    <div style={{ background: `linear-gradient(160deg, #5B2C82, ${PL_PURPLE})` }}>
      <div className="px-5 pt-12 pb-4">
        <Kicker />
        <div className="flex items-start justify-between mt-6">
          {[UNITED, CITY].map((c, i) => (
            <div key={c.code} className={`flex-1 ${i === 0 ? 'order-1' : 'order-3'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={crest(c.id)} alt="" className="w-[86px] h-[86px] object-contain mx-auto" />
              <p className="text-center text-white font-bold text-[19px] mt-3 leading-tight px-2">{c.name}</p>
            </div>
          ))}
          <div className="order-2 pt-5 shrink-0 px-1"><Score /></div>
        </div>
        <div className="mt-5"><Scorer /></div>
      </div>
      <Tabs />
    </div>
  )
}

/** B — the split. The two clubs own the header; a scrim keeps type legible. */
function HeaderSplit() {
  return (
    <div className="relative" style={{ background: INK }}>
      <div className="absolute inset-0" style={{ background: UNITED.color }} />
      <div
        className="absolute inset-0"
        style={{ background: CITY.deep, clipPath: 'polygon(53% 0, 100% 0, 100% 100%, 43% 100%)' }}
      />
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(180deg, rgba(11,15,26,0.34) 0%, rgba(11,15,26,0.06) 34%, rgba(11,15,26,0.82) 100%)` }}
      />
      <div className="relative px-5 pt-12 pb-4">
        <Kicker tone="rgba(255,255,255,0.86)" />
        <div className="flex items-center justify-between mt-8">
          <div className="flex-1 text-center">
            <div className="text-[30px] font-black text-white leading-none tracking-tight">{UNITED.code}</div>
          </div>
          <div className="px-2"><Score size={54} /></div>
          <div className="flex-1 text-center">
            <div className="text-[30px] font-black text-white leading-none tracking-tight">{CITY.code}</div>
          </div>
        </div>
        <div className="flex items-start justify-between mt-3">
          <p className="flex-1 text-center text-[14px] text-white/85 px-1 leading-tight">{UNITED.name}</p>
          <div className="w-[120px]" />
          <p className="flex-1 text-center text-[14px] text-white/85 px-1 leading-tight">{CITY.name}</p>
        </div>
        <div className="mt-6"><Scorer /></div>
      </div>
      <div className="relative"><Tabs /></div>
    </div>
  )
}

/** C — the monument. Ink ground, club colour as a rule, type does everything. */
function HeaderMonument() {
  return (
    <div style={{ background: `linear-gradient(180deg, #141A2B, ${INK})` }}>
      <div className="px-5 pt-12 pb-4">
        <Kicker tone="rgba(255,255,255,0.5)" />
        <div className="mt-9 flex items-end justify-between gap-3">
          <div className="flex-1">
            <div className="text-[26px] font-black text-white leading-none tracking-tight text-right">{UNITED.code}</div>
            <div className="h-[3px] mt-2 ml-auto" style={{ background: UNITED.color, width: 44 }} />
          </div>
          <div className="shrink-0 pb-1"><Score size={60} muted="rgba(255,255,255,0.38)" /></div>
          <div className="flex-1">
            <div className="text-[26px] font-black text-white leading-none tracking-tight">{CITY.code}</div>
            <div className="h-[3px] mt-2" style={{ background: CITY.color, width: 44 }} />
          </div>
        </div>
        <div className="flex justify-between gap-3 mt-3">
          <p className="flex-1 text-[13px] text-white/60 text-right">{UNITED.name}</p>
          <div className="w-[140px]" />
          <p className="flex-1 text-[13px] text-white/60">{CITY.name}</p>
        </div>
        <div className="mt-7"><Scorer tone="rgba(255,255,255,0.7)" /></div>
      </div>
      <Tabs />
    </div>
  )
}

/** D — bands. An abstract kit motif: colour, never the garment. */
function Bands({ c, flip }: { c: typeof UNITED; flip?: boolean }) {
  return (
    <div className="absolute inset-y-0" style={{ [flip ? 'right' : 'left']: 0, width: '42%' } as React.CSSProperties}>
      <div className="flex h-full w-full">
        {[1, 0.72, 1, 0.72].map((o, i) => (
          <div key={i} className="flex-1" style={{ background: c.deep, opacity: o }} />
        ))}
      </div>
    </div>
  )
}

function HeaderBands() {
  return (
    <div className="relative" style={{ background: INK }}>
      <Bands c={UNITED} />
      <Bands c={CITY} flip />
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(90deg, rgba(11,15,26,0.05) 0%, rgba(11,15,26,0.86) 40%, rgba(11,15,26,0.86) 60%, rgba(11,15,26,0.05) 100%)' }}
      />
      <div className="relative px-5 pt-12 pb-4">
        <Kicker tone="rgba(255,255,255,0.7)" />
        <div className="flex items-center justify-between mt-8">
          <div className="flex-1 text-center">
            <div className="text-[28px] font-black text-white leading-none tracking-tight">{UNITED.code}</div>
          </div>
          <div className="px-2"><Score size={52} /></div>
          <div className="flex-1 text-center">
            <div className="text-[28px] font-black text-white leading-none tracking-tight">{CITY.code}</div>
          </div>
        </div>
        <div className="flex items-start justify-between mt-3">
          <p className="flex-1 text-center text-[13px] text-white/80 px-1 leading-tight">{UNITED.name}</p>
          <div className="w-[110px]" />
          <p className="flex-1 text-center text-[13px] text-white/80 px-1 leading-tight">{CITY.name}</p>
        </div>
        <div className="mt-6"><Scorer /></div>
      </div>
      <div className="relative"><Tabs /></div>
    </div>
  )
}

/** E — minimal change. Keep the purple; swap each crest for a colour disc. */
function HeaderMinimal() {
  return (
    <div style={{ background: `linear-gradient(160deg, #5B2C82, ${PL_PURPLE})` }}>
      <div className="px-5 pt-12 pb-4">
        <Kicker />
        <div className="flex items-start justify-between mt-6">
          {[UNITED, CITY].map((c, i) => (
            <div key={c.code} className={`flex-1 ${i === 0 ? 'order-1' : 'order-3'}`}>
              <div
                className="grid place-items-center mx-auto font-black text-white"
                style={{
                  width: 78, height: 78, borderRadius: 24, background: c.deep, fontSize: 22,
                  border: '2px solid rgba(255,255,255,0.28)',
                }}
              >
                {c.code}
              </div>
              <p className="text-center text-white font-bold text-[18px] mt-3 leading-tight px-2">{c.name}</p>
            </div>
          ))}
          <div className="order-2 pt-4 shrink-0 px-1"><Score /></div>
        </div>
        <div className="mt-5"><Scorer /></div>
      </div>
      <Tabs />
    </div>
  )
}

function FactsBelow() {
  return (
    <div className="bg-surface-secondary px-3 py-4 space-y-3">
      <div className="rounded-card bg-surface px-4 py-3">
        <h2 className="text-[17px] font-black text-neutral-900 mb-2">Match Facts</h2>
        {[['Matchweek 4'], ['Sunday, September 13 at 12:30 PM'], ['Old Trafford, Manchester']].map(([t], i) => (
          <div key={i} className="flex items-center gap-3 py-2.5 border-t border-border-default">
            <span className="w-5 h-5 rounded-chip bg-primary-50 shrink-0" />
            <span className="text-[15px] text-neutral-900">{t}</span>
          </div>
        ))}
      </div>
      <div className="rounded-card bg-surface px-4 py-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[17px] font-black text-neutral-900">Timeline</h2>
          <span className="text-[13px] text-neutral-500">1 goal</span>
        </div>
        <p className="text-[12px] text-neutral-500 mt-2 border-t border-border-default pt-2">
          Unchanged — names, minutes and our own icons are all facts.
        </p>
      </div>
    </div>
  )
}

function Phone({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="w-[390px]">
        <h3 className="font-black text-neutral-900">{title}</h3>
        <p className="text-xs text-neutral-500">{note}</p>
      </div>
      <div className="w-[390px] rounded-card overflow-hidden border border-border-default">
        {children}
        <FactsBelow />
      </div>
    </div>
  )
}

export default function MatchHeaderHarness() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('dark')) setDark(true)
  }, [])
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  return (
    <div className="min-h-screen bg-surface px-6 py-10">
      <div className="max-w-[2200px] mx-auto space-y-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-black text-neutral-900">Match header — crest-free</h1>
          <p className="text-neutral-700 max-w-3xl">
            Only the header changes. Everything below it — Match Facts, the Timeline, the scorer line —
            is names, minutes, a stadium and our own icons, and stays exactly as it is.
          </p>
          <button
            onClick={() => setDark((d) => !d)}
            className="rounded-chip border border-border-default px-3 py-1.5 text-sm font-medium text-neutral-900"
          >
            {dark ? 'Light' : 'Dark'} mode
          </button>
        </header>

        <div className="flex flex-wrap gap-7">
          <Phone title="A. Today" note="Two crests on the league's purple. The clubs are guests on someone else's colour.">
            <HeaderToday />
          </Phone>
          <Phone title="B. The split" note="The two clubs own the header. Colours meet on a seam; a scrim keeps type legible.">
            <HeaderSplit />
          </Phone>
          <Phone title="C. The monument" note="Ink ground, club colour reduced to a rule under each code. Typography does the work.">
            <HeaderMonument />
          </Phone>
          <Phone title="D. Bands" note="An abstract kit motif — colour and rhythm, never the garment, the crest or a sponsor.">
            <HeaderBands />
          </Phone>
          <Phone title="E. Minimal change" note="Keep the purple, swap each crest for a colour disc. Smallest diff, least ambition.">
            <HeaderMinimal />
          </Phone>
        </div>
      </div>
    </div>
  )
}
