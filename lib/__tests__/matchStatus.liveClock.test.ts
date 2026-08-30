// =============================================================
// A match in stoppage time is still being played
// =============================================================
// Ryan, 2026-08-30, off a dashboard card: Man United 5-1 Ipswich, LIVE badge
// pulsing, and the clock underneath it reading "FT" — while the game was in
// 90+8.
//
// The card was not reading the feed at all. It derived its clock from
// `match_date` and wall time: minutes since kick-off, minus a hard-coded
// fifteen for half time, and "FT" from 120 minutes on. That can never see
// stoppage time, and it calls every long game finished.
//
// The RN app has had this right since it learned about `live_added`, so the fix
// was to stop inventing a clock on the web and use the same helper. These tests
// hold both halves of that: the helper's behaviour, and the read paths that
// have to carry `live_added` for it to have anything to say.
// =============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { getLiveClock } from '@/lib/matchStatus'

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8')

describe('the live clock', () => {
  it('shows the running minute during a half', () => {
    expect(getLiveClock({ status: 'live', livePeriod: '2H', liveMinute: 67 })).toBe("67'")
  })

  it('holds the minute and adds the stoppage at the end of a half', () => {
    // THE CASE THAT STARTED THIS. The feed holds `live_minute` at 90 and counts
    // the stoppage separately, so a clock that only reads the minute stalls —
    // and one that reads the wall clock calls it full time.
    expect(getLiveClock({ status: 'live', livePeriod: '2H', liveMinute: 90, liveAdded: 8 })).toBe("90+8'")
    expect(getLiveClock({ status: 'live', livePeriod: '1H', liveMinute: 45, liveAdded: 2 })).toBe("45+2'")
  })

  it('ignores a zero or absent stoppage rather than printing "+0"', () => {
    expect(getLiveClock({ status: 'live', livePeriod: '2H', liveMinute: 90, liveAdded: 0 })).toBe("90'")
    expect(getLiveClock({ status: 'live', livePeriod: '2H', liveMinute: 90, liveAdded: null })).toBe("90'")
  })

  it('keeps counting through extra time', () => {
    expect(getLiveClock({ status: 'live', livePeriod: 'ET', liveMinute: 105 })).toBe("ET 105'")
    expect(getLiveClock({ status: 'live', livePeriod: 'ET', liveMinute: 105, liveAdded: 2 })).toBe("ET 105+2'")
    // The break between ET halves reports no running minute.
    expect(getLiveClock({ status: 'live', livePeriod: 'ET', liveMinute: null })).toBe('ET')
  })

  it('names the phases that have no running minute', () => {
    expect(getLiveClock({ status: 'live', livePeriod: 'HT' })).toBe('HT')
    expect(getLiveClock({ status: 'live', livePeriod: 'PEN' })).toBe('PENS')
  })

  it('says nothing at all when the match is not live', () => {
    // Never "FT": a finished match leaves the live list entirely, and the row
    // that shows FT decides that from `status === "completed"`, not from a clock.
    expect(getLiveClock({ status: 'completed', livePeriod: '2H', liveMinute: 90 })).toBeNull()
    expect(getLiveClock({ status: 'scheduled' })).toBeNull()
    // Live, but the sync has not reported a minute yet — the LIVE badge is all
    // we honestly know.
    expect(getLiveClock({ status: 'live', liveMinute: null })).toBeNull()
  })
})

describe('the web and RN copies of the clock', () => {
  it('are the same function', () => {
    // lib/matchStatus.ts is a hand-kept port of mobile/lib/matchStatus.ts, and
    // the drift between them IS this bug: the web copy sat a version behind,
    // with no `liveAdded` and no ET minute, for as long as the dashboard was
    // guessing. Comparing the source rather than sampling behaviour is what
    // catches the next divergence on the day it lands.
    const body = (p: string) => {
      const s = read(p)
      return s
        .slice(s.indexOf('export function getLiveClock'))
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '')
        .replace(/[\s;]+/g, '')
    }
    expect(body('lib/matchStatus.ts')).toBe(body('mobile/lib/matchStatus.ts'))
  })
})

describe('the read paths that feed it', () => {
  // A clock reading a column nobody selected renders `undefined` forever and
  // says nothing about it — the failure shape this repo has been bitten by more
  // than once. Each surface that shows stoppage time has to fetch it.
  it('selects live_added for a World Cup match', () => {
    expect(read('lib/poolData.ts')).toMatch(/live_added/)
    expect(read('app/dashboard/page.tsx')).toMatch(/live_added/)
  })

  it('selects live_added for a league fixture', () => {
    const s = read('lib/league/read.ts')
    // Both readers: the pool's fixture list and the dashboard's live panel.
    expect(s.match(/live_added/g)?.length ?? 0).toBeGreaterThanOrEqual(4)
  })

  it('leaves the dashboard no wall clock to fall back on', () => {
    const s = read('app/dashboard/DashboardClient.tsx')
    // The definition, not the name — the card's comment still names the old
    // helper so the next reader knows why the clock comes off the feed.
    expect(s).not.toMatch(/function getElapsedTime/)
    expect(s).toMatch(/import \{ getLiveClock \} from '@\/lib\/matchStatus'/)
  })
})
