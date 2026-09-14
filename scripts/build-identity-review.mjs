// =============================================================
// Builds drafts/2026-09-13_identity_review.html — one self-contained file
// holding every crest-free mockup, for making the call.
// =============================================================
import { writeFileSync } from 'fs'

const CLUBS = {
  ars: { n: 'Arsenal', s: 'Arsenal', c: 'ARS', p: '#DB0007', id: 42 },
  avl: { n: 'Aston Villa', s: 'Villa', c: 'AVL', p: '#670E36', id: 66 },
  bha: { n: 'Brighton', s: 'Brighton', c: 'BHA', p: '#0057B8', id: 51 },
  bou: { n: 'Bournemouth', s: 'Bournemouth', c: 'BOU', p: '#B50E12', id: 35 },
  bre: { n: 'Brentford', s: 'Brentford', c: 'BRE', p: '#E30613', id: 55 },
  che: { n: 'Chelsea', s: 'Chelsea', c: 'CHE', p: '#034694', id: 49 },
  cry: { n: 'Crystal Palace', s: 'Palace', c: 'CRY', p: '#1B458F', id: 52 },
  eve: { n: 'Everton', s: 'Everton', c: 'EVE', p: '#003399', id: 45 },
  ful: { n: 'Fulham', s: 'Fulham', c: 'FUL', p: '#1B1B1B', id: 36 },
  lee: { n: 'Leeds United', s: 'Leeds', c: 'LEE', p: '#1D428A', id: 63 },
  liv: { n: 'Liverpool', s: 'Liverpool', c: 'LIV', p: '#C8102E', id: 40 },
  mci: { n: 'Manchester City', s: 'Man City', c: 'MCI', p: '#1C6FB5', id: 50 },
  mun: { n: 'Manchester United', s: 'Man United', c: 'MUN', p: '#DA291C', id: 33 },
  new: { n: 'Newcastle', s: 'Newcastle', c: 'NEW', p: '#241F20', id: 34 },
  nfo: { n: "Nottingham Forest", s: "Nott'm Forest", c: 'NFO', p: '#C40000', id: 65 },
  tot: { n: 'Tottenham', s: 'Spurs', c: 'TOT', p: '#132257', id: 47 },
  int: { n: 'Inter Milan', s: 'Inter', c: 'INT', p: '#0B5FA5', id: 505 },
  udi: { n: 'Udinese', s: 'Udinese', c: 'UDI', p: '#2B2B2B', id: 494 },
  ala: { n: 'Deportivo Alavés', s: 'Alavés', c: 'ALA', p: '#0761AF', id: 542 },
  val: { n: 'Valencia', s: 'Valencia', c: 'VAL', p: '#C4701A', id: 532 },
  atm: { n: 'Atlético Madrid', s: 'Atlético', c: 'ATM', p: '#C8102E', id: 530 },
  osa: { n: 'Osasuna', s: 'Osasuna', c: 'OSA', p: '#A21C28', id: 727 },
  bar: { n: 'Barcelona', s: 'Barcelona', c: 'BAR', p: '#A50044', id: 529 },
  san: { n: 'Racing Santander', s: 'Racing', c: 'SAN', p: '#00A94F', id: 541 },
}
// ⚠ THE SECOND COLOUR EXISTS FOR DARK SURFACES. Udinese's near-black vanished
// on the Next Kickoff card — a club whose first colour is dark needs its other
// one there, which is honest anyway: Udinese really do play in black AND white.
const SECOND = { udi:'#FFFFFF', new:'#FFFFFF', ful:'#FFFFFF', tot:'#FFFFFF', int:'#FFFFFF',
  mun:'#FFFFFF', mci:'#FFFFFF', liv:'#FFFFFF', ars:'#FFFFFF', che:'#DBA111', lee:'#FFE100',
  nfo:'#FFFFFF', bha:'#FFFFFF', eve:'#FFFFFF', avl:'#95BFE5', bou:'#FFFFFF', bre:'#FFFFFF',
  cry:'#C4122E', ala:'#FFFFFF', val:'#FFFFFF', atm:'#1B3A6B', osa:'#0A2B5E', bar:'#EDBB00', san:'#FFFFFF' }
const lum = (hex) => { const s=hex.replace('#',''); const [r,g,b]=[0,2,4].map(i=>parseInt(s.slice(i,i+2),16)); return (0.299*r+0.587*g+0.114*b)/255 }
/** The colour a club may use on a dark ground: its first, unless that is too dark. */
const onDark = (k) => (lum(CLUBS[k].p) > 0.28 ? CLUBS[k].p : (SECOND[k] || '#FFFFFF'))

const crest = (k) => `https://media.api-sports.io/football/teams/${CLUBS[k].id}.png`
const tint = (hex, a) => {
  const s = hex.replace('#', '')
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16))
  return `rgba(${r},${g},${b},${a})`
}

// ------------------------------------------------------------------ helpers
const rule = (k, w = 26, h = 3) => `<span class="rule" style="width:${w}px;height:${h}px;background:${CLUBS[k].p}"></span>`
const phone = (label, body) => `<div class="phone"><p class="plabel">${label}</p><div class="pframe">${body}</div></div>`
const section = (id, title, note, phones, verdict) => `
<section id="${id}">
  <h2>${title}</h2>
  <p class="note">${note}</p>
  ${verdict ? `<p class="verdict"><strong>Recommendation:</strong> ${verdict}</p>` : ''}
  <div class="row">${phones}</div>
</section>`

// ------------------------------------------------------------------ surfaces
const FX = [
  { h: 'mun', a: 'mci', hs: 0, as: 1 },
  { h: 'ars', a: 'che', hs: 2, as: 1 },
  { h: 'liv', a: 'nfo', hs: 1, as: 1 },
  { h: 'tot', a: 'new', t: '17:30' },
  { h: 'bha', a: 'eve', t: '20:00' },
]

function resultsRow(f, dir) {
  const done = f.hs !== undefined
  const hw = done && f.hs > f.as, aw = done && f.as > f.hs
  const cls = (win, other) => (done && !win && other ? 'name dim' : 'name')
  if (dir === 'crest') {
    return `<div class="r crestrow">
      <img src="${crest(f.h)}" alt=""><span class="nm">${CLUBS[f.h].s}</span>
      <span class="mid">${done ? `${f.hs} – ${f.as}` : f.t}</span>
      <span class="nm ta-r">${CLUBS[f.a].s}</span><img src="${crest(f.a)}" alt="">
    </div>`
  }
  const inner = `
    <div class="side">
      <div class="${cls(hw, aw)}">${CLUBS[f.h].s}</div>
      ${dir === 'underline' ? rule(f.h) : ''}
    </div>
    <div class="score">${done
      ? `<span class="sc">${f.hs}<i>–</i>${f.as}</span>`
      : `<span class="tm">${f.t}</span>`}</div>
    <div class="side ta-r">
      <div class="${cls(aw, hw)}">${CLUBS[f.a].s}</div>
      ${dir === 'underline' ? rule(f.a) : ''}
    </div>`
  if (dir !== 'field') return `<div class="r">${inner}</div>`
  return `<div class="r fieldrow">
    <span class="fh" style="background:linear-gradient(90deg, ${tint(CLUBS[f.h].p, 0.14)}, transparent 78%);border-left:2px solid ${CLUBS[f.h].p}"></span>
    <span class="fa" style="background:linear-gradient(270deg, ${tint(CLUBS[f.a].p, 0.14)}, transparent 78%);border-right:2px solid ${CLUBS[f.a].p}"></span>
    <div class="fc">${inner}</div>
  </div>`
}

const results = (dir) => `<div class="screen"><div class="card">
  <div class="cardhead"><div class="h1">Today</div><div class="kicker">PREMIER LEAGUE · MATCHWEEK 4</div></div>
  ${FX.map((f) => resultsRow(f, dir)).join('')}
</div></div>`

function header(dir) {
  const h = 'mun', a = 'mci'
  if (dir === 'crest') {
    return `<div class="hdr purple">
      <p class="kicker c">PREMIER LEAGUE · MATCHWEEK 4</p>
      <div class="mirror">
        <div><img class="big" src="${crest(h)}" alt=""><div class="hn">Man United</div></div>
        <div class="bigscore">0<i>–</i>1</div>
        <div><img class="big" src="${crest(a)}" alt=""><div class="hn">Man City</div></div>
      </div>
      <p class="ft">FULL TIME</p><p class="scorer">Haaland 60'</p>${tabs()}
    </div><div class="screen"><div class="card pad"><div class="h1">Match Facts</div><div class="sub">Old Trafford, Manchester</div></div></div>`
  }
  const bg = dir === 'field'
    ? `<span class="fieldbg"><span style="background:linear-gradient(180deg,${tint(CLUBS[h].p, .9)},${tint(CLUBS[h].p, .25)})"></span><span style="background:linear-gradient(180deg,${tint(CLUBS[a].p, .9)},${tint(CLUBS[a].p, .25)})"></span></span><span class="scrim"></span>`
    : ''
  return `<div class="hdr ink">${bg}
    <div class="hdrc">
      <p class="kicker c">PREMIER LEAGUE · MATCHWEEK 4</p>
      <div class="stack">
        <div class="srow"><div><div class="bigname dim">Manchester United</div>${dir === 'underline' ? rule(h, 52, 4) : ''}</div><div class="bignum dim">0</div></div>
        <div class="srow"><div><div class="bigname">Manchester City</div>${dir === 'underline' ? rule(a, 52, 4) : ''}</div><div class="bignum">1</div></div>
      </div>
      <p class="ft">FULL TIME</p><p class="scorer">Haaland 60'</p>${tabs()}
    </div></div>
    <div class="screen"><div class="card pad"><div class="h1">Match Facts</div><div class="sub">Old Trafford, Manchester</div></div></div>`
}
const tabs = () => `<div class="tabs">${['Facts', 'Line-ups', 'Stats', 'Scouting'].map((t, i) => `<span class="${i === 0 ? 'on' : ''}">${t}</span>`).join('')}</div>`

const TABLE = [['liv', 4, '+8', 12], ['ars', 4, '+6', 10], ['mci', 4, '+5', 9], ['che', 4, '+2', 8], ['tot', 4, '+1', 7], ['new', 4, '0', 5], ['bha', 4, '-1', 5], ['mun', 4, '-3', 4]]
const table = (dir) => `<div class="screen"><div class="card">
  <div class="thead"><span class="rk"></span><span class="grow"></span><span class="col">PL</span><span class="col">GD</span><span class="col pts">PTS</span></div>
  ${TABLE.map(([k, pl, gd, pts], i) => `<div class="trow">
    ${dir === 'field' ? `<span class="tfield" style="background:linear-gradient(90deg,${tint(CLUBS[k].p, .11)},transparent 42%)"></span>` : ''}
    <span class="rk">${i + 1}</span>
    ${dir === 'crest' ? `<img class="tc" src="${crest(k)}" alt="">` : ''}
    ${dir === 'underline' ? `<span class="tr" style="background:${CLUBS[k].p}"></span>` : ''}
    <span class="grow tn">${CLUBS[k].s}</span>
    <span class="col">${pl}</span><span class="col">${gd}</span><span class="col pts">${pts}</span>
  </div>`).join('')}
</div></div>`

// ------------------------------------------------------ remaining surfaces
const fixtureList = () => `<div class="screen"><div class="card">
  ${[['SATURDAY 14 SEPTEMBER', [['liv', 'nfo', '12:30'], ['ars', 'che', '15:00'], ['bha', 'eve', '15:00']]],
     ['SUNDAY 15 SEPTEMBER', [['mun', 'mci', '14:00'], ['tot', 'new', '16:30']]]]
    .map(([d, rows]) => `<div class="daylabel">${d}</div>` + rows.map(([h, a, t]) => `<div class="r">
        <div class="side"><div class="name">${CLUBS[h].s}</div>${rule(h, 22)}</div>
        <div class="score"><span class="tm">${t}</span></div>
        <div class="side ta-r"><div class="name">${CLUBS[a].s}</div>${rule(a, 22)}</div>
      </div>`).join('')).join('')}
</div></div>`

const poolCard = () => `<div class="screen">
  ${[['The Sargasso Sea', '2nd', '14', "Pick'em"], ['Office Legends', '5th', '31', 'Predict the Table']]
    .map(([n, r, of, m]) => `<div class="card pool">
      <span class="rail"><span class="railtext">PREMIER LEAGUE</span></span>
      <div class="poolbody">
        <div class="poolhead"><span class="h1">${n}</span><span class="sub">${m}</span></div>
        <div class="rank"><b>${r}</b><span class="sub">of ${of}</span></div>
        <div class="kpis">${[['PTS', '348'], ['EXACT', '14'], ['MW', '4']].map(([k, v]) => `<div class="kpi"><i>${k}</i><b>${v}</b></div>`).join('')}</div>
      </div></div>`).join('')}
</div>`

const pickem = () => `<div class="screen">${[['mun', 'mci', 2], ['ars', 'che', 0], ['liv', 'nfo', null]].map(([h, a, p]) => `
  <div class="card pad mb">
    <div class="pkrow">
      <div class="side"><div class="name">${CLUBS[h].s}</div>${rule(h, 22)}</div>
      <span class="sub">Sat 15:00</span>
      <div class="side ta-r"><div class="name">${CLUBS[a].s}</div>${rule(a, 22)}</div>
    </div>
    <div class="btns">${['1', 'X', '2'].map((l, j) => `<span class="${p === j ? 'on' : ''}">${l}</span>`).join('')}</div>
  </div>`).join('')}</div>`

const dragTable = () => `<div class="screen"><div class="card pad">
  <div class="h1">Predict the table</div><div class="sub mb">Drag to reorder · locks Fri 19:00</div>
  ${['mci', 'ars', 'liv', 'che', 'tot', 'mun', 'new', 'bha'].map((k, i) => `<div class="drag">
    <span class="rk">${i + 1}</span><span class="tr" style="background:${CLUBS[k].p}"></span>
    <span class="grow tn">${CLUBS[k].s}</span><span class="handle">≡</span></div>`).join('')}
</div></div>`

const lineups = () => {
  const XI = [[[1, 'Onana']], [[2, 'Dalot'], [19, 'Varane'], [6, 'Martínez'], [23, 'Shaw']], [[18, 'Casemiro'], [37, 'Mainoo'], [8, 'Bruno']], [[10, 'Rashford'], [11, 'Højlund'], [17, 'Garnacho']]]
  return `<div class="screen"><div class="card pad">
    <div class="lhead"><span class="tr" style="background:${CLUBS.mun.p};height:18px"></span><span class="h1">Manchester United</span><span class="sub">4–3–3</span></div>
    <div class="pitch">${XI.map((row) => `<div class="prow">${row.map(([n, nm]) => `
      <div class="pl"><span class="num" style="color:${CLUBS.mun.p}">${n}</span><span class="pn">${nm}</span></div>`).join('')}</div>`).join('')}</div>
    <p class="sub mt">Shirt number in the club’s colour. Numbers, names and positions are facts.</p>
  </div></div>`
}

const SCOUT = [['Form', 'W W L D W', 'W W W D W', .42], ['Goals for', '7', '11', .39], ['Goals against', '6', '3', .67], ['Clean sheets', '1', '3', .25], ['Corners', '24', '31', .44]]
const scoutBars = () => `<div class="screen"><div class="card pad">
  <div class="scouthead">
    <div><div class="h1">Man United</div>${rule('mun', 34)}</div>
    <span class="kicker">SCOUT</span>
    <div class="ta-r"><div class="h1">Man City</div><div class="ta-r-in">${rule('mci', 34)}</div></div>
  </div>
  ${SCOUT.map(([l, a, b, sp]) => `<div class="srow2">
    <div class="sline"><b>${a}</b><i>${l.toUpperCase()}</i><b>${b}</b></div>
    <div class="bar"><span style="flex:${sp};background:${CLUBS.mun.p}"></span><span class="gap"></span><span style="flex:${1 - sp};background:${CLUBS.mci.p}"></span></div>
  </div>`).join('')}
</div></div>`

const scoutCols = () => `<div class="screen"><div class="card">
  <div class="cols">
    <div class="colh" style="background:${tint(CLUBS.mun.p, .13)};border-top:3px solid ${CLUBS.mun.p}"><b>Man United</b><i>Home · 6th</i></div>
    <div class="colh ta-r" style="background:${tint(CLUBS.mci.p, .13)};border-top:3px solid ${CLUBS.mci.p}"><b>Man City</b><i>Away · 2nd</i></div>
  </div>
  ${SCOUT.map(([l, a, b]) => `<div class="colrow">
    <span class="cl" style="background:${tint(CLUBS.mun.p, .06)}">${a}</span>
    <span class="cm">${l.toUpperCase()}</span>
    <span class="cr" style="background:${tint(CLUBS.mci.p, .06)}">${b}</span></div>`).join('')}
</div></div>`

const people = () => `<div class="screen"><div class="card pad">
  <div class="kicker">THE PEOPLE</div><div class="h1 mb">Five to watch</div>
  ${[['mci', 9, 'Erling Haaland', '4 goals'], ['mci', 17, 'Kevin De Bruyne', '3 assists'], ['mun', 8, 'Bruno Fernandes', '2 goals · 2 assists'], ['mun', 10, 'Marcus Rashford', '2 goals'], ['mci', 47, 'Phil Foden', '1 goal · 3 key passes']]
    .map(([k, n, nm, st]) => `<div class="prow2">
      <span class="pnum" style="color:${CLUBS[k].p}">${n}</span>
      <span class="tr" style="background:${CLUBS[k].p};opacity:.35;height:26px"></span>
      <span class="grow"><b>${nm}</b><i>${st}</i></span><span class="pcode">${CLUBS[k].c}</span></div>`).join('')}
</div></div>`

const USED = new Set(['tot', 'new', 'ful'])
const lmsList = () => `<div class="screen"><div class="card pad">
  <div class="h1">Pick your club</div><div class="sub mb">Matchweek 5 · three already used</div>
  ${['liv', 'ars', 'mci', 'che', 'tot', 'mun', 'new', 'bha', 'avl', 'ful'].map((k) => `<div class="lms ${USED.has(k) ? 'used' : ''}">
    <span class="tr" style="background:${CLUBS[k].p}"></span><span class="grow tn">${CLUBS[k].n}</span>
    <span class="sub">${USED.has(k) ? 'used MW2' : 'v Brighton (H)'}</span></div>`).join('')}
</div></div>`

const lmsTiles = () => `<div class="screen"><div class="card pad">
  <div class="h1 mb">Pick your club</div>
  <div class="tiles">${['liv', 'ars', 'mci', 'che', 'tot', 'mun', 'new', 'bha', 'avl', 'ful', 'nfo', 'bou'].map((k) => `
    <div class="tile ${USED.has(k) ? 'used' : ''}" style="border-top:3px solid ${CLUBS[k].p}"><b>${CLUBS[k].s}</b><i>${USED.has(k) ? 'used' : 'v BHA (H)'}</i></div>`).join('')}</div>
</div></div>`

const lmsSides = () => `<div class="screen"><div class="card pad">
  <div class="h1">Back a winner</div><div class="sub mb">Tap the side you think wins · no repeats</div>
  ${[['liv', 'nfo'], ['ars', 'che'], ['mci', 'bha'], ['mun', 'eve'], ['avl', 'cry']].map(([h, a], i) => `<div class="sides">
    ${[h, a].map((k, j) => `<div class="sidebox ${i === 1 && j === 0 ? 'on' : ''} ${USED.has(k) ? 'used' : ''}" style="${i === 1 && j === 0 ? `background:${tint(CLUBS[k].p, .16)};border-left:3px solid ${CLUBS[k].p}` : ''}">
      <b>${CLUBS[k].s}</b><i>${j === 0 ? 'Home' : 'Away'}${USED.has(k) ? ' · used' : ''}</i></div>`).join('')}
  </div>`).join('')}
</div></div>`

const duel = () => `<div class="screen">
  <div class="duelhead"><p class="kicker c">SHOWDOWN · MATCHWEEK 4</p>
    <div class="duelrow"><b>Ryan</b><i>3 – 2</i><b>Carson</b></div></div>
  <div class="card pad mt">
    ${[['mun', 'mci', '1', '2'], ['ars', 'che', '1', '1'], ['liv', 'nfo', 'X', '1'], ['tot', 'new', '2', '2']].map(([h, a, p1, p2]) => `
      <div class="duelpick"><span class="pk ${p1 === '2' ? 'win' : ''}">${p1}</span>
        <span class="grow ta-c"><b>${CLUBS[h].s} <em>v</em> ${CLUBS[a].s}</b><span class="rules">${rule(h, 22)}${rule(a, 22)}</span></span>
        <span class="pk ${p2 === '2' ? 'win' : ''}">${p2}</span></div>`).join('')}
  </div></div>`

const kickoff = (variant) => {
  const clock = (big) => `<div class="clock" style="font-size:${big}px">${[['19', 'H'], ['23', 'M'], ['17', 'S']].map(([n, u], i) => `<span>${n}<i>${u}</i></span>${i < 2 ? '<em>:</em>' : ''}`).join('')}</div>`
  const head = `<div class="kohead"><span>NEXT KICKOFF</span><span>MATCHWEEK 4</span></div>`
  if (variant === 'crest') return `<div class="screen"><div class="kocard">${head}
    <div class="komirror"><div><img class="komark" src="${crest('int')}" alt=""><b>INT</b></div>
      <div class="kogrow">${clock(34)}<p class="sub c">Monday, Sep 14</p></div>
      <div><img class="komark" src="${crest('udi')}" alt=""><b>UDI</b></div></div>
    <p class="more">1 more match today</p><p class="sub c">Milan</p></div></div>`
  if (variant === 'flanks') return `<div class="screen"><div class="kocard">${head}
    <div class="komirror"><div class="koflank"><b>Inter Milan</b>${rule('int', 30)}</div>
      <div class="kogrow">${clock(31)}<p class="sub c">Monday, Sep 14</p></div>
      <div class="koflank ta-r"><b>Udinese</b><span class="ta-r-in">${rule('udi', 30)}</span></div></div>
    <p class="more">1 more match today</p><p class="sub c">Milan</p></div></div>`
  if (variant === 'line') return `<div class="screen"><div class="kocard">${head}
    ${clock(42)}<div class="kofix">${rule('int', 22)}<b>Inter Milan <em>v</em> Udinese</b>${rule('udi', 22)}</div>
    <p class="sub c">Monday, Sep 14 · Milan</p><p class="more">1 more match today</p></div></div>`
  return `<div class="screen"><div class="kocard blobs">
    <span class="blob b1" style="background:${tint(CLUBS.int.p, .22)}"></span><span class="blob b2" style="background:${tint(CLUBS.udi.p, .30)}"></span>
    <div class="korel">${head}${clock(40)}<p class="sub c">Monday, Sep 14</p>
      <div class="kosplit"><b>Inter Milan</b><em>v</em><b>Udinese</b></div>
      <p class="more">1 more match today</p><p class="sub c">Milan</p></div></div></div>`
}

const UP = [['int', 'udi', 'Mon, Sep 14 · 3:45 PM', 'Milan'], ['lee', 'new', 'Mon, Sep 14 · 4:00 PM', 'Elland Road, Leeds'], ['ala', 'val', 'Wed, Sep 16 · 12:00 PM', 'Estadio Mendizorrotza, Vitoria'], ['atm', 'osa', 'Wed, Sep 16 · 12:00 PM', 'Metropolitano Stadium, Madrid'], ['bar', 'san', 'Wed, Sep 16 · 12:00 PM', 'Camp Nou, Barcelona']]
const upcoming = (variant) => `<div class="screen"><h3 class="uph">Upcoming Matches</h3>
  ${UP.map(([h, a, w, v]) => {
    if (variant === 'crest') return `<div class="card upc"><div class="upcrest">
      <div><img src="${crest(h)}" alt=""><b>${CLUBS[h].c}</b></div><span class="vs">VS</span>
      <div><img src="${crest(a)}" alt=""><b>${CLUBS[a].c}</b></div>
      <div class="grow ta-r"><b>${w}</b><i>${v}</i></div></div></div>`
    if (variant === 'names') return `<div class="card upc"><div class="upnames">
      <div class="side"><div class="name">${CLUBS[h].n}</div>${rule(h, 24)}</div><span class="vs">V</span>
      <div class="side ta-r"><div class="name">${CLUBS[a].n}</div><span class="ta-r-in">${rule(a, 24)}</span></div></div>
      <div class="upmeta"><b>${w}</b><i>${v}</i></div></div>`
    if (variant === 'stacked') return `<div class="card upc"><div class="upstack">
      <span class="stackrules">${rule(h, 3, 16)}${rule(a, 3, 16)}</span>
      <span class="grow"><b>${CLUBS[h].n}</b><b>${CLUBS[a].n}</b></span>
      <span class="ta-r"><b class="pri">${w.split(' · ')[1]}</b><i>${w.split(' · ')[0]}</i></span></div>
      <div class="sub mt6">${v}</div></div>`
    return `<div class="card upedge"><span class="edge"><span style="background:${CLUBS[h].p}"></span><span style="background:${CLUBS[a].p}"></span></span>
      <div class="edgebody"><b>${CLUBS[h].n} <em>v</em> ${CLUBS[a].n}</b><div class="upmeta2"><b>${w}</b><i>${v}</i></div></div></div>`
  }).join('')}</div>`

// ---------------------------------------------------------------------- CSS
const CSS = `
:root{--snow:#F7F8FC;--surface:#FFF;--mist:#EEF1F8;--silver:#D4DAE8;--slate:#7B87A8;--ink:#1B2340;--primary:#3B6EFF;--accent:#F5C518;--green:#22C55E;--midnight:#0B0F1A}
body.dark{--snow:#121520;--surface:#1C2030;--mist:#232840;--silver:#2E3448;--slate:#8B97B8;--ink:#E8EAF0;--primary:#5B8AFF}
*{box-sizing:border-box}
body{margin:0;background:var(--snow);color:var(--ink);font-family:Nunito,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-weight:500}
.wrap{max-width:1860px;margin:0 auto;padding:36px 40px 120px}
h1{font-weight:900;font-size:34px;letter-spacing:-.02em;margin:0 0 8px}
h2{font-weight:900;font-size:23px;letter-spacing:-.01em;margin:0 0 6px}
h3{font-weight:900}
.note{color:var(--slate);max-width:1000px;margin:0 0 6px}
.verdict{background:var(--mist);border-left:3px solid var(--primary);padding:9px 14px;border-radius:0 12px 12px 0;max-width:1000px;font-size:14px;margin:10px 0 4px}
section{margin:44px 0;scroll-margin-top:70px}
.row{display:flex;gap:20px;flex-wrap:wrap;margin-top:16px}
.phone{width:390px}
.plabel{font-weight:900;font-size:11px;letter-spacing:1.4px;color:var(--slate);margin:0 0 8px}
.pframe{border-radius:24px;overflow:hidden;border:1px solid var(--silver)}
.screen{background:var(--snow);padding:12px}
.card{background:var(--surface);border-radius:18px;overflow:hidden}
.card.pad{padding:16px 18px}
.mb{margin-bottom:12px}.mt{margin-top:10px}.mt6{margin-top:6px}
.ta-r{text-align:right}.ta-c{text-align:center}.ta-r-in{display:flex;justify-content:flex-end}
.grow{flex:1;min-width:0}
.sub{font-size:12px;color:var(--slate);font-weight:500}
.h1{font-weight:900;font-size:17px}
.kicker{font-weight:900;font-size:10px;letter-spacing:1.8px;color:var(--slate)}
.kicker.c{text-align:center;display:block;color:rgba(255,255,255,.62)}
.cardhead{padding:16px 18px 12px}
.rule{display:block;border-radius:2px;margin-top:5px}
/* results */
.r{display:flex;align-items:center;gap:12px;padding:14px 18px;border-top:1px solid var(--silver);position:relative}
.side{flex:1;min-width:0}
.name{font-weight:900;font-size:16px;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.name.dim{font-weight:700;color:var(--slate)}
.ta-r .rule{margin-left:auto}
.score{min-width:58px;text-align:center;flex-shrink:0}
.sc{font-weight:900;font-size:19px;font-variant-numeric:tabular-nums}
.sc i{color:var(--silver);margin:0 5px;font-style:normal}
.tm{font-weight:900;font-size:15px;color:var(--primary);font-variant-numeric:tabular-nums}
.crestrow img{width:24px;height:24px;object-fit:contain}
.crestrow .nm{flex:1;font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.crestrow .mid{font-weight:900;font-size:15px}
.fieldrow{padding:0}
.fh,.fa{position:absolute;top:0;bottom:0;width:50%}.fh{left:0}.fa{right:0}
.fc{position:relative;display:flex;align-items:center;gap:12px;padding:14px 18px;width:100%}
.daylabel{padding:14px 18px 8px;font-weight:900;font-size:10px;letter-spacing:1.8px;color:var(--slate)}
/* header */
.hdr{position:relative;padding:44px 22px 16px;background:var(--midnight)}
.hdr.purple{background:linear-gradient(160deg,#5B2C82,#3D195B)}
.hdr.ink{background:linear-gradient(180deg,#151C30,#0B0F1A)}
.fieldbg{position:absolute;inset:0;display:flex}.fieldbg span{flex:1}
.scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(11,15,26,.28),rgba(11,15,26,.9))}
.hdrc{position:relative}
.mirror{display:flex;align-items:center;justify-content:space-between;margin-top:20px;text-align:center;color:#fff}
.mirror>div{flex:1}
.big{width:72px;height:72px;object-fit:contain}
.hn{font-size:14px;font-weight:700;margin-top:8px}
.bigscore{font-weight:900;font-size:44px}.bigscore i{opacity:.5;margin:0 8px;font-style:normal}
.stack{margin-top:24px;display:grid;gap:14px}
.srow{display:flex;align-items:center;gap:14px;color:#fff}
.bigname{font-weight:900;font-size:26px;letter-spacing:-.02em;line-height:1.05}
.bigname.dim,.bignum.dim{color:rgba(255,255,255,.6)}
.bignum{font-weight:900;font-size:38px;font-variant-numeric:tabular-nums;margin-left:auto}
.ft{text-align:center;font-weight:900;font-size:10px;letter-spacing:1.8px;color:rgba(255,255,255,.55);margin:20px 0 0}
.scorer{text-align:center;font-size:13px;color:rgba(255,255,255,.82);margin:8px 0 0}
.tabs{display:flex;gap:8px;margin-top:18px}
.tabs span{border-radius:999px;padding:9px 14px;font-size:13px;font-weight:700;background:rgba(255,255,255,.14);color:rgba(255,255,255,.92)}
.tabs span.on{background:#fff;color:#1B2340}
/* table */
.thead{display:flex;gap:10px;padding:14px 18px 10px}
.trow{display:flex;align-items:center;gap:10px;padding:10px 18px;border-top:1px solid var(--silver);position:relative}
.tfield{position:absolute;inset:0}
.rk{width:20px;font-weight:900;font-size:13px;color:var(--slate);font-variant-numeric:tabular-nums;position:relative}
.col{width:26px;text-align:center;font-size:12px;color:var(--slate);font-variant-numeric:tabular-nums;position:relative}
.col.pts{width:32px;font-weight:900;font-size:15px;color:var(--ink)}
.thead .col{font-weight:900;font-size:10px;letter-spacing:1px}
.tn{font-weight:900;font-size:15px;letter-spacing:-.01em;position:relative;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tc{width:24px;height:24px;object-fit:contain;position:relative}
.tr{width:3px;height:20px;border-radius:2px;flex-shrink:0;position:relative}
/* pool card */
.pool{display:flex;margin-bottom:12px;border:1px solid var(--silver)}
.rail{width:30px;background:linear-gradient(to bottom,#5B2C82,#3D195B);display:grid;place-items:center;flex-shrink:0}
.railtext{writing-mode:vertical-rl;transform:rotate(180deg);color:#fff;font-weight:900;font-size:10px;letter-spacing:.16em}
.poolbody{flex:1;padding:12px;display:grid;gap:8px}
.poolhead{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.rank b{font-weight:900;font-size:22px}.rank .sub{margin-left:4px}
.kpis{display:flex;gap:6px}
.kpi{flex:1;background:var(--mist);border-radius:12px;padding:6px 8px}
.kpi i{display:block;font-style:normal;font-size:9px;font-weight:900;letter-spacing:1px;color:var(--slate)}
.kpi b{font-weight:900;font-size:14px}
/* pickem */
.pkrow{display:flex;align-items:center;gap:10px}
.btns{display:flex;gap:8px;margin-top:12px}
.btns span{flex:1;text-align:center;padding:10px 0;border-radius:12px;background:var(--mist);font-weight:900;font-size:14px}
.btns span.on{background:var(--primary);color:#fff}
.drag{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:12px;background:var(--mist);margin-bottom:6px}
.handle{color:var(--slate);letter-spacing:2px}
/* lineups */
.lhead{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.pitch{background:#1B5E33;border-radius:14px;padding:16px 8px;display:grid;gap:16px}
.prow{display:flex;justify-content:space-around}
.pl{display:grid;justify-items:center;gap:4px;width:68px}
.num{width:40px;height:40px;border-radius:12px;background:#fff;display:grid;place-items:center;font-weight:900;font-size:16px}
.pn{font-size:10px;color:#fff;font-weight:700}
/* scout */
.scouthead{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px}
.srow2{padding:12px 0;border-top:1px solid var(--silver)}
.sline{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:7px}
.sline b{font-weight:900;font-size:14px;font-variant-numeric:tabular-nums}
.sline i{font-style:normal;font-size:10px;font-weight:900;letter-spacing:1.4px;color:var(--slate)}
.bar{display:flex;height:6px;border-radius:3px;overflow:hidden;background:var(--mist)}
.bar .gap{width:2px}
.cols{display:flex}
.colh{flex:1;padding:16px 14px}
.colh b{display:block;font-weight:900;font-size:17px}
.colh i{font-style:normal;font-size:11px;color:var(--slate)}
.colrow{display:flex;align-items:center;border-top:1px solid var(--silver)}
.cl,.cr{flex:1;padding:11px 14px;font-weight:900;font-size:14px;font-variant-numeric:tabular-nums}
.cr{text-align:right}
.cm{width:108px;text-align:center;font-size:10px;font-weight:900;letter-spacing:1.2px;color:var(--slate)}
.prow2{display:flex;align-items:center;gap:14px;padding:11px 0;border-top:1px solid var(--silver)}
.pnum{width:30px;text-align:right;font-weight:900;font-size:21px;font-variant-numeric:tabular-nums;letter-spacing:-.03em}
.prow2 b{display:block;font-weight:900;font-size:14px}
.prow2 i{font-style:normal;font-size:11px;color:var(--slate)}
.pcode{font-size:10px;font-weight:900;letter-spacing:1px;color:var(--slate)}
/* lms */
.lms{display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--silver)}
.lms.used{opacity:.38}.lms.used .tn{text-decoration:line-through}
.tiles{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.tile{border-radius:12px;padding:10px 12px;background:var(--mist)}
.tile.used{opacity:.35}
.tile b{display:block;font-weight:900;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tile i{font-style:normal;font-size:10px;color:var(--slate)}
.sides{display:flex;gap:8px;margin-bottom:8px}
.sidebox{flex:1;border-radius:12px;padding:10px 12px;background:var(--mist);border-left:3px solid transparent}
.sidebox.used{opacity:.34}
.sidebox b{display:block;font-weight:900;font-size:13px}
.sidebox i{font-style:normal;font-size:10px;color:var(--slate)}
/* duel */
.duelhead{background:linear-gradient(150deg,#3B6EFF,#1E3A8A);border-radius:18px;padding:18px}
.duelrow{display:flex;justify-content:space-between;align-items:center;margin-top:14px;color:#fff}
.duelrow b{font-weight:900;font-size:20px}
.duelrow i{font-style:normal;font-weight:900;font-size:15px;color:rgba(255,255,255,.6)}
.duelpick{display:flex;align-items:center;gap:10px;padding:12px 0;border-top:1px solid var(--silver)}
.duelpick:first-child{border-top:none}
.pk{width:26px;text-align:center;font-weight:900;font-size:13px}
.pk.win{color:var(--green)}
.duelpick b{font-weight:900;font-size:14px}
.duelpick em{font-style:normal;color:var(--slate);font-weight:700}
.rules{display:flex;gap:4px;justify-content:center;margin-top:5px}
.rules .rule{margin-top:0}
/* kickoff + upcoming: always dark, that is where they live */
.kocard,.upc,.upedge{background:#1C2030;color:#E8EAF0}
.kocard{border-radius:24px;padding:18px 20px 20px;position:relative;overflow:hidden}
.kohead{display:flex;justify-content:space-between;font-weight:900;font-size:11px;letter-spacing:2.2px;color:#8B97B8}
.komirror{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:18px}
.komirror>div{text-align:center}
.komark{width:52px;height:52px;object-fit:contain;display:block;margin:0 auto 8px}
.komirror b{font-weight:900;font-size:15px;letter-spacing:2px;color:#fff}
.koflank{width:96px;text-align:left}
.koflank b{display:block;font-size:17px;line-height:1.1;letter-spacing:0}
.kogrow{flex:1}
.clock{display:flex;align-items:baseline;justify-content:center;gap:2px;font-weight:900;color:#fff;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.clock i{font-style:normal;font-size:.34em;color:#8B97B8;margin:0 6px 0 2px}
.clock em{font-style:normal;color:#8B97B8;margin-right:6px}
.kofix{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:16px}
.kofix b{font-weight:900;font-size:18px;color:#fff}
.kofix em,.kosplit em{font-style:normal;color:#8B97B8;font-weight:700}
.kofix .rule{margin-top:0}
.kosplit{display:flex;justify-content:space-between;align-items:flex-end;margin-top:20px}
.kosplit b{font-weight:900;font-size:16px;color:#fff}
.more{text-align:center;font-size:13px;color:#F5C518;font-weight:700;margin:14px 0 0}
.kocard .sub{color:#8B97B8}
.sub.c{text-align:center;margin-top:8px}
.blob{position:absolute;border-radius:50%}
.b1{bottom:-60px;left:-40px;width:170px;height:170px}
.b2{top:-40px;right:-30px;width:190px;height:190px}
.korel{position:relative}
.uph{font-weight:900;font-size:24px;color:#E8EAF0;margin:6px 4px 14px}
.screen:has(.uph){background:#121520}
.upc{border-radius:18px;padding:14px 16px;margin-bottom:10px}
.upcrest{display:flex;align-items:center;gap:12px}
.upcrest>div{text-align:center}
.upcrest img{width:38px;height:38px;object-fit:contain;display:block;margin:0 auto 6px}
.upcrest b{font-weight:900;font-size:13px;letter-spacing:2px;color:#fff}
.upcrest .grow b{letter-spacing:0;font-size:14px;display:block}
.upcrest .grow i{font-style:normal;font-size:12px;color:#8B97B8;display:block;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.vs{font-size:11px;color:#8B97B8;font-weight:800;letter-spacing:1px}
.upnames{display:flex;align-items:center;gap:10px}
.upnames .name{color:#fff}
.upmeta{display:flex;justify-content:space-between;margin-top:12px;padding-top:10px;border-top:1px solid #2E3448}
.upmeta b{font-size:12.5px;color:#fff;font-weight:700}
.upmeta i{font-style:normal;font-size:12.5px;color:#8B97B8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:170px}
.upstack{display:flex;gap:12px}
.stackrules{display:grid;gap:4px;padding-top:2px}
.stackrules .rule{margin-top:0}
.upstack .grow b{display:block;font-weight:900;font-size:16px;color:#fff;line-height:1.35}
.upstack .ta-r b{font-weight:900;font-size:13px}
.upstack .pri{color:#5B8AFF}
.upstack .ta-r i{font-style:normal;font-size:11px;color:#8B97B8;display:block;margin-top:2px}
.upc .sub{color:#8B97B8}
.upedge{border-radius:18px;display:flex;overflow:hidden;margin-bottom:10px}
.edge{width:5px;display:grid}.edge span{display:block}
.edgebody{flex:1;padding:14px 16px;min-width:0}
.edgebody>b{font-weight:900;font-size:16px;color:#fff;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.edgebody em{font-style:normal;color:#8B97B8;font-weight:700}
.upmeta2{display:flex;justify-content:space-between;gap:10px;margin-top:8px}
.upmeta2 b{font-size:12.5px;color:#fff;font-weight:700}
.upmeta2 i{font-style:normal;font-size:12.5px;color:#8B97B8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px}
/* chrome */
.bar-top{position:sticky;top:0;z-index:10;background:var(--snow);border-bottom:1px solid var(--silver);padding:10px 40px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
.bar-top a{color:var(--slate);text-decoration:none;font-size:12px;font-weight:800;letter-spacing:.4px}
.bar-top a:hover{color:var(--primary)}
button{border-radius:999px;border:1px solid var(--silver);background:transparent;color:var(--ink);font-weight:800;padding:7px 14px;cursor:pointer;font-family:inherit}
table.dec{border-collapse:collapse;width:100%;max-width:1000px;margin-top:12px;font-size:14px}
table.dec th,table.dec td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--silver);vertical-align:top}
table.dec th{font-weight:900;font-size:11px;letter-spacing:1.2px;color:var(--slate)}
`

const NAV = [['directions', 'Directions'], ['everywhere', 'Applied everywhere'], ['scout', 'Scout report'], ['lms', 'Last Man Standing'], ['kickoff', 'Next Kickoff'], ['upcoming', 'Upcoming'], ['decide', 'Decisions']]

const R1 = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<title>SportPool — crest-free identity review</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@500;700;900&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
<div class="bar-top">
  <strong style="font-weight:900">Crest-free review</strong>
  ${NAV.map(([id, n]) => `<a href="#${id}">${n}</a>`).join('')}
  <button onclick="document.body.classList.toggle('dark')" style="margin-left:auto">Light / dark</button>
</div>
<div class="wrap">
<h1>SportPool — crest-free identity</h1>
<p class="note" style="margin-bottom:18px">13 September 2026. Every mockup from the review, in one file. Column one of each row is <strong>what ships today</strong>; everything after it uses only club <strong>names</strong>, <strong>colours</strong>, three-letter codes from <code>league_clubs.abbreviation</code> and shirt numbers — all facts. No crest, league mark, sponsor, manufacturer mark, kit reproduction or player photograph anywhere.</p>

${section('directions', '1 · The three directions', 'Applied to the three highest-traffic surfaces. A uses no club colour at all and so works for every competition on day one; B attaches the colour to the name; C makes the colour the space.',
  ['crest', 'broadsheet', 'underline', 'field'].map((d) => phone(d === 'crest' ? 'TODAY' : `${d.toUpperCase()}`, results(d))).join('')
  + ['crest', 'broadsheet', 'underline', 'field'].map((d) => phone(d === 'crest' ? 'TODAY' : `${d.toUpperCase()}`, header(d))).join('')
  + ['crest', 'broadsheet', 'underline', 'field'].map((d) => phone(d === 'crest' ? 'TODAY' : `${d.toUpperCase()}`, table(d))).join(''),
  'B · Underline. A is calm but every club is the same grey. C is rich on the header and muddy in a table of eight rows. B keeps the page quiet and still gives each club a colour, and it degrades to A for any club with no colour on file.')}

${section('everywhere', '2 · Direction B applied everywhere', 'The rest of the app in the recommended direction, so the whole thing can be judged in one voice.',
  [['FIXTURE LIST', fixtureList()], ['POOL CARD (HOME + POOLS)', poolCard()], ["PICK'EM", pickem()], ['PREDICT THE TABLE', dragTable()], ['LINE-UPS', lineups()], ['SHOWDOWN DUEL', duel()]].map(([l, b]) => phone(l, b)).join(''))}

${section('scout', '3 · Scout report — three options', 'The crest was anchoring each side of a comparison. Replacing it with the comparison itself is the upgrade.',
  [['1 · DIVERGENT BARS', scoutBars()], ['2 · TINTED COLUMNS', scoutCols()], ['3 · PEOPLE CARD', people()]].map(([l, b]) => phone(l, b)).join(''),
  'Divergent bars. Two badges never told you City have conceded three and United six; the bar does, and it uses the club colours rather than decorating with them. The people card is not an alternative — it is the other half of the same screen.')}

${section('lms', '4 · Last Man Standing — three options', 'The hardest surface in the app, and the one that genuinely loses something: twenty crests in a grid are fast to scan.',
  [['1 · FULL-NAME LIST', lmsList()], ['2 · TILES, COLOUR EDGE', lmsTiles()], ['3 · PICK A SIDE', lmsSides()]].map(([l, b]) => phone(l, b)).join(''),
  'Pick a side. It changes the question rather than degrading the answer — you needed the fixture to make the pick anyway, and used clubs grey out in place. Tiles are the safe choice if the pick flow must not change.')}

${section('kickoff', '5 · Next Kickoff — three options', 'This card never shows a club name: it says INT and UDI and lets the crest do the naming. The move is to promote the name into the space the crest was using.',
  [['TODAY', kickoff('crest')], ['1 · NAMES ON THE FLANKS', kickoff('flanks')], ['2 · CLOCK HERO, FIXTURE LINE', kickoff('line')], ['3 · THE CARD’S BLOBS', kickoff('blobs')]].map(([l, b]) => phone(l, b)).join(''),
  'Clock hero. The countdown gets bigger, the fixture becomes a readable sentence, and date and venue merge into one line. The blob variant is the most “SportPool” of the three if you want colour on it.')}

${section('upcoming', '6 · Upcoming Matches — three options', 'Five rows across three competitions. Today the venue truncates because two crests and two codes eat the row.',
  [['TODAY', upcoming('crest')], ['1 · NAMES, META BELOW', upcoming('names')], ['2 · STACKED', upcoming('stacked')], ['3 · SPLIT EDGE', upcoming('edge')]].map(([l, b]) => phone(l, b)).join(''),
  'Split edge. One line per fixture, the venue stops truncating, and the two-colour edge reads as one match rather than two things.')}

`


// =============================================================
// ROUND 2 — after Ryan's notes of 13 Sep
// =============================================================
const ruleD = (k, w = 3, h = 18) => `<span class="rule" style="width:${w}px;height:${h}px;background:${onDark(k)};margin-top:0"></span>`
const pill = (k, h = 20) => `<span class="pill" style="height:${h}px;background:${CLUBS[k].p}"></span>`

// --- 1. Row treatments: underline vs left pill vs the new edge tab ----------
function rowTreat(f, kind) {
  const done = f.hs !== undefined
  const hw = done && f.hs > f.as, aw = done && f.as > f.hs
  const nm = (win, other) => (done && !win && other ? 'name dim' : 'name')
  const score = done ? `<span class="sc">${f.hs}<i>–</i>${f.as}</span>` : `<span class="tm">${f.t}</span>`
  if (kind === 'under') return `<div class="r"><div class="side"><div class="${nm(hw, aw)}">${CLUBS[f.h].s}</div>${rule(f.h)}</div>
    <div class="score">${score}</div><div class="side ta-r"><div class="${nm(aw, hw)}">${CLUBS[f.a].s}</div>${rule(f.a)}</div></div>`
  if (kind === 'pill') return `<div class="r"><div class="sidep">${pill(f.h)}<div class="${nm(hw, aw)}">${CLUBS[f.h].s}</div></div>
    <div class="score">${score}</div><div class="sidep rev">${pill(f.a)}<div class="${nm(aw, hw)}">${CLUBS[f.a].s}</div></div></div>`
  return `<div class="r tabrow"><span class="tabl" style="background:${CLUBS[f.h].p}"></span><span class="tabr" style="background:${CLUBS[f.a].p}"></span>
    <div class="side"><div class="${nm(hw, aw)}">${CLUBS[f.h].s}</div></div><div class="score">${score}</div>
    <div class="side ta-r"><div class="${nm(aw, hw)}">${CLUBS[f.a].s}</div></div></div>`
}
const resultsTreat = (kind) => `<div class="screen"><div class="card">
  <div class="cardhead"><div class="h1">Today</div><div class="kicker">PREMIER LEAGUE · MATCHWEEK 4</div></div>
  ${FX.map((f) => rowTreat(f, kind)).join('')}</div></div>`

// --- 2/3. Match header: mirrored, long names, no hard seam ------------------
function headerV2(kind) {
  const h = 'mun', a = 'mci'
  const nameBox = (k, side) => `<div class="hteam ${side}">
    ${kind === 'pillglow' ? `<span class="hpill" style="background:${CLUBS[k].p}"></span>` : ''}
    <div class="hname">${CLUBS[k].n.replace(' ', '<br>')}</div>
    ${kind !== 'pillglow' ? `<span class="hrule" style="background:${CLUBS[k].p}"></span>` : ''}
  </div>`
  const glow = kind === 'glow' || kind === 'pillglow'
    ? `<span class="glow gl" style="background:radial-gradient(closest-side, ${tint(CLUBS[h].p, .55)}, transparent)"></span>
       <span class="glow gr" style="background:radial-gradient(closest-side, ${tint(CLUBS[a].p, .5)}, transparent)"></span>`
    : `<span class="sweep" style="background:${tint(CLUBS[h].p, .42)}"></span>
       <span class="sweep2" style="background:${tint(CLUBS[a].p, .42)}"></span>`
  return `<div class="hdr v2">${glow}
    <div class="hdrc">
      <p class="kicker c">PREMIER LEAGUE · MATCHWEEK 4</p>
      <div class="hmirror">${nameBox(h, 'l')}
        <div class="hscore"><b>0<i>–</i>1</b><span>FULL TIME</span></div>
        ${nameBox(a, 'r')}</div>
      <p class="scorer">⚽ Haaland 60'</p>${tabs()}
    </div></div>
    <div class="screen"><div class="card pad"><div class="h1">Match Facts</div><div class="sub">Old Trafford, Manchester</div></div></div>`
}

// --- 4. Table: left pill vs rank in the club's colour -----------------------
const tableV2 = (kind) => `<div class="screen"><div class="card">
  <div class="thead"><span class="rk"></span><span class="grow"></span><span class="col">PL</span><span class="col">GD</span><span class="col pts">PTS</span></div>
  ${TABLE.map(([k, pl, gd, pts], i) => `<div class="trow">
    <span class="rk" ${kind === 'rank' ? `style="color:${CLUBS[k].p}"` : ''}>${i + 1}</span>
    ${kind === 'pill' ? pill(k, 18) : ''}
    <span class="grow tn">${CLUBS[k].s}</span>
    <span class="col">${pl}</span><span class="col">${gd}</span><span class="col pts">${pts}</span></div>`).join('')}
</div></div>`

// --- 5. Pick'em: the team IS the button, Draw in the middle -----------------
const pickemV2 = (kind) => `<div class="screen">${[['mun', 'mci', 2], ['ars', 'che', 0], ['liv', 'nfo', null]].map(([h, a, p]) => {
  const btn = (k, i) => `<div class="tbtn ${p === i ? 'on' : ''}" ${p === i ? `style="border-color:${CLUBS[k].p};background:${tint(CLUBS[k].p, .1)}"` : ''}>
      <span class="pill" style="height:22px;background:${CLUBS[k].p}"></span><b>${CLUBS[k].s}</b></div>`
  if (kind === 'trio') return `<div class="card pad mb">
    <div class="sub mb">Sat 15:00 · Old Trafford</div>
    <div class="trio">${btn(h, 0)}<div class="dbtn ${p === 1 ? 'on' : ''}">Draw</div>${btn(a, 2)}</div></div>`
  return `<div class="card pad mb"><div class="sub mb">Sat 15:00 · Old Trafford</div>
    <div class="stackbtn">${btn(h, 0)}${btn(a, 2)}</div>
    <div class="dbtn wide ${p === 1 ? 'on' : ''}">Draw</div></div>`
}).join('')}</div>`

// --- 6. Jerseys -------------------------------------------------------------
// ⚠ ROUNDED, NOT SHARP. The app's language is radii 6→32 and Nunito Black, so a
// sharp-shouldered football shirt reads as a foreign object. These are built
// from rounded rects under a mask: body + two sleeve stubs, neck bitten out.
function jersey(id, shape, pattern, k, num = 24, size = 96) {
  const c = CLUBS[k].p
  const c2 = SECOND[k] || '#FFFFFF'
  // Body sits 30→104 so the shirt is taller than it is wide; sleeves are FLAT
  // ellipses on the shoulder line, not circles near the neck — round sleeves set
  // high read as ears, which the first pass proved.
  const S = { soft: { rx: 20, bw: 62, ex: 17, ey: 12, ec: 50 }, bubble: { rx: 28, bw: 66, ex: 19, ey: 14, ec: 52 }, squircle: { rx: 28, bw: 80, ex: 0, ey: 0, ec: 0 }, tall: { rx: 15, bw: 56, ex: 15, ey: 11, ec: 50 } }[shape]
  const bx = (120 - S.bw) / 2
  const sleeves = S.ex ? `
    <ellipse cx="${bx + 1}" cy="${S.ec}" rx="${S.ex}" ry="${S.ey}"/>
    <ellipse cx="${bx + S.bw - 1}" cy="${S.ec}" rx="${S.ex}" ry="${S.ey}"/>` : ''
  const pat = {
    solid: `<rect x="0" y="0" width="120" height="120" fill="${c}"/>`,
    stripes: `<rect width="120" height="120" fill="${c}"/>` + [0, 2, 4].map((i) => `<rect x="${bx + 6 + i * 17}" y="0" width="9" height="120" fill="${c2}" opacity=".92"/>`).join(''),
    hoops: `<rect width="120" height="120" fill="${c}"/>` + [0, 1, 2].map((i) => `<rect x="0" y="${48 + i * 18}" width="120" height="9" fill="${c2}" opacity=".92"/>`).join(''),
    sash: `<rect width="120" height="120" fill="${c}"/><rect x="-20" y="52" width="170" height="17" fill="${c2}" opacity=".92" transform="rotate(32 60 60)"/>`,
    yoke: `<rect width="120" height="120" fill="${c}"/><rect x="0" y="0" width="120" height="46" fill="${c2}" opacity=".9"/>`,
    split: `<rect width="60" height="120" fill="${c}"/><rect x="60" width="60" height="120" fill="${c2}" opacity=".92"/>`,
  }[pattern]
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="shirt">
    <defs><mask id="m${id}">
      <rect width="120" height="120" fill="black"/>
      <g fill="white"><rect x="${bx}" y="30" width="${S.bw}" height="74" rx="${S.rx}"/>${sleeves}</g>
      <circle cx="60" cy="29" r="12" fill="black"/>
    </mask></defs>
    <g mask="url(#m${id})">${pat}</g>
    <text x="60" y="82" text-anchor="middle" font-family="Nunito,sans-serif" font-weight="900" font-size="34"
      fill="${pattern === 'yoke' || pattern === 'split' ? '#FFFFFF' : (lum(c) > 0.6 ? '#1B2340' : '#FFFFFF')}">${num}</text>
  </svg>`
}
const JERSEYS = [
  ['soft', 'solid', 'mun', 'Soft tee · solid'],
  ['bubble', 'solid', 'mci', 'Bubble · solid'],
  ['squircle', 'solid', 'liv', 'Squircle · no sleeves'],
  ['tall', 'solid', 'che', 'Tall · slimmer'],
  ['soft', 'stripes', 'bre', 'Soft tee · stripes'],
  ['soft', 'hoops', 'cry', 'Soft tee · hoops'],
  ['bubble', 'sash', 'liv', 'Bubble · sash'],
  ['soft', 'yoke', 'avl', 'Soft tee · shoulder yoke'],
  ['bubble', 'split', 'cry', 'Bubble · halves'],
]
const jerseySheet = () => `<div class="jgrid">${JERSEYS.map(([sh, pt, k, label], i) => `
  <div class="jcell"><div class="jart">${jersey(i, sh, pt, k, [1, 9, 10, 8, 17, 23, 6, 11, 4][i])}</div><span>${label}</span></div>`).join('')}</div>`

const lineupsV2 = (shape) => {
  const XI = [[[1, 'Onana']], [[2, 'Dalot'], [19, 'Varane'], [6, 'Martínez'], [23, 'Shaw']], [[18, 'Casemiro'], [37, 'Mainoo'], [8, 'Bruno']], [[10, 'Rashford'], [11, 'Højlund'], [17, 'Garnacho']]]
  let n = 100
  return `<div class="screen"><div class="card pad">
    <div class="lhead">${pill('mun', 18)}<span class="h1">Manchester United</span><span class="sub">4–3–3</span></div>
    <div class="pitch">${XI.map((row) => `<div class="prow">${row.map(([num, nm]) => `
      <div class="pl">${jersey(n++, shape, 'solid', 'mun', num, 44)}<span class="pn">${nm}</span></div>`).join('')}</div>`).join('')}</div>
  </div></div>`
}

// --- 8a. Everyone's LMS picks ----------------------------------------------
const MEMBERS = [['Ryan', ['liv', 'ars', 'mci', 'che']], ['Carson', ['ars', 'mci', 'liv', 'tot']], ['Nadia', ['mci', 'liv', 'tot', 'ars']], ['Jules', ['che', 'tot', 'ars', 'liv']], ['Dev', ['tot', 'che', 'bha', 'mci']]]
const lmsPicksGrid = () => `<div class="screen"><div class="card pad">
  <div class="h1">Everyone’s picks</div><div class="sub mb">Matchweeks 1–4</div>
  <div class="pickgrid"><div class="pgh"></div>${[1, 2, 3, 4].map((w) => `<div class="pgh">MW${w}</div>`).join('')}
  ${MEMBERS.map(([who, picks]) => `<div class="pgn">${who}</div>` + picks.map((k) => `
    <div class="pgc" style="background:${tint(CLUBS[k].p, .16)};border-left:3px solid ${CLUBS[k].p}">${CLUBS[k].c}</div>`).join('')).join('')}</div>
</div></div>`
const lmsPicksByClub = () => `<div class="screen"><div class="card pad">
  <div class="h1">Matchweek 4 picks</div><div class="sub mb">Grouped by club · 5 still standing</div>
  ${[['che', ['Ryan']], ['tot', ['Carson', 'Nadia']], ['liv', ['Jules']], ['mci', ['Dev']]].map(([k, who]) => `
    <div class="byclub"><span class="pill" style="height:34px;background:${CLUBS[k].p}"></span>
      <span class="grow"><b>${CLUBS[k].n}</b><i>${who.join(', ')}</i></span><span class="cnt">${who.length}</span></div>`).join('')}
</div></div>`

// --- 8b. Next Kickoff, with the dark-club fix -------------------------------
const kickoffV2 = (variant) => {
  const clock = (big) => `<div class="clock" style="font-size:${big}px">${[['19', 'H'], ['23', 'M'], ['17', 'S']].map(([n, u], i) => `<span>${n}<i>${u}</i></span>${i < 2 ? '<em>:</em>' : ''}`).join('')}</div>`
  const head = `<div class="kohead"><span>NEXT KICKOFF</span><span>MATCHWEEK 4</span></div>`
  if (variant === 'line') return `<div class="screen"><div class="kocard">${head}${clock(42)}
    <div class="kofix">${ruleD('int', 22, 3)}<b>Inter Milan <em>v</em> Udinese</b>${ruleD('udi', 22, 3)}</div>
    <p class="sub c">Monday, Sep 14 · Milan</p><p class="more">1 more match today</p></div></div>`
  return `<div class="screen"><div class="kocard blobs">
    <span class="blob b1" style="background:${tint(onDark('int'), .20)}"></span><span class="blob b2" style="background:${tint(onDark('udi'), .16)}"></span>
    <div class="korel">${head}<div class="komirror2">
      <div class="koside">${ruleD('int', 26, 3)}<b>Inter Milan</b></div>
      <div class="kogrow">${clock(31)}<p class="sub c">Monday, Sep 14</p></div>
      <div class="koside ta-r">${ruleD('udi', 26, 3)}<b>Udinese</b></div></div>
      <p class="more">1 more match today</p><p class="sub c">Milan</p></div></div></div>`
}
const upcomingV2 = (variant) => `<div class="screen"><h3 class="uph">Upcoming Matches</h3>
  ${UP.map(([h, a, w, v]) => variant === 'names'
    ? `<div class="card upc"><div class="upnames">
        <div class="side"><div class="name">${CLUBS[h].n}</div><span class="rule" style="width:24px;height:3px;background:${onDark(h)}"></span></div><span class="vs">V</span>
        <div class="side ta-r"><div class="name">${CLUBS[a].n}</div><span class="ta-r-in"><span class="rule" style="width:24px;height:3px;background:${onDark(a)}"></span></span></div></div>
        <div class="upmeta"><b>${w}</b><i>${v}</i></div></div>`
    : `<div class="card upc"><div class="upstack">
        <span class="stackrules">${ruleD(h, 3, 16)}${ruleD(a, 3, 16)}</span>
        <span class="grow"><b>${CLUBS[h].n}</b><b>${CLUBS[a].n}</b></span>
        <span class="ta-r"><b class="pri">${w.split(' · ')[1]}</b><i>${w.split(' · ')[0]}</i></span></div>
        <div class="sub mt6">${v}</div></div>`).join('')}</div>`

const CSS2 = `
.sidep{flex:1;min-width:0;display:flex;align-items:center;gap:10px}
.sidep.rev{flex-direction:row-reverse}
.sidep .name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pill{display:block;width:4px;border-radius:999px;flex-shrink:0}
.tabrow{position:relative;padding-left:24px;padding-right:24px}
.tabl,.tabr{position:absolute;top:10px;bottom:10px;width:5px}
.tabl{left:0;border-radius:0 5px 5px 0}.tabr{right:0;border-radius:5px 0 0 5px}
/* header v2 */
.hdr.v2{background:linear-gradient(180deg,#161D33,#0B0F1A);overflow:hidden}
.glow{position:absolute;width:300px;height:300px;border-radius:50%;filter:blur(6px)}
.gl{left:-110px;top:-60px}.gr{right:-110px;top:-60px}
.sweep,.sweep2{position:absolute;width:150%;height:320px;border-radius:50%;filter:blur(2px)}
.sweep{left:-58%;top:-130px}.sweep2{right:-58%;top:-130px}
.hmirror{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-top:22px}
.hteam{flex:1;display:grid;justify-items:center;gap:10px}
.hname{font-weight:900;font-size:19px;line-height:1.12;color:#fff;text-align:center;letter-spacing:-.01em}
.hrule{display:block;width:34px;height:4px;border-radius:2px}
.hpill{display:block;width:34px;height:4px;border-radius:2px}
.hscore{flex-shrink:0;text-align:center;padding-top:2px}
.hscore b{display:block;font-weight:900;font-size:44px;color:#fff;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.hscore i{font-style:normal;color:rgba(255,255,255,.45);margin:0 7px}
.hscore span{display:block;font-size:10px;font-weight:900;letter-spacing:1.6px;color:rgba(255,255,255,.55);margin-top:8px}
/* pickem v2 */
.trio{display:flex;gap:8px;align-items:stretch}
.tbtn{flex:1;min-width:0;display:flex;align-items:center;gap:8px;padding:12px 12px;border-radius:14px;background:var(--mist);border:2px solid transparent}
.tbtn b{font-weight:900;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dbtn{display:grid;place-items:center;padding:0 16px;border-radius:14px;background:var(--mist);font-weight:900;font-size:13px;color:var(--slate);border:2px solid transparent}
.dbtn.on{background:var(--primary);color:#fff}
.dbtn.wide{margin-top:8px;padding:12px 0}
.stackbtn{display:grid;gap:8px}
/* jerseys */
.jgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:18px;max-width:1000px;margin-top:16px}
.jcell{background:var(--surface);border:1px solid var(--silver);border-radius:18px;padding:14px;display:grid;justify-items:center;gap:8px}
.jcell span{font-size:11px;color:var(--slate);font-weight:700;text-align:center}
.jart{display:grid;place-items:center}
/* lms picks */
.pickgrid{display:grid;grid-template-columns:64px repeat(4,1fr);gap:6px;align-items:center}
.pgh{font-size:10px;font-weight:900;letter-spacing:1px;color:var(--slate);text-align:center}
.pgn{font-weight:900;font-size:13px}
.pgc{border-radius:10px;padding:9px 0;text-align:center;font-weight:900;font-size:11px;letter-spacing:.5px}
.byclub{display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--silver)}
.byclub b{display:block;font-weight:900;font-size:15px}
.byclub i{font-style:normal;font-size:12px;color:var(--slate)}
.cnt{font-weight:900;font-size:15px;color:var(--slate)}
.komirror2{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:16px}
.koside{width:100px;display:grid;gap:8px}
.koside.ta-r{justify-items:end}
.koside b{font-weight:900;font-size:16px;color:#fff;line-height:1.15}
`

const DECIDE = `<section id="decide"><h2>9 · What has to be decided</h2>
<table class="dec">
<tr><th>Decision</th><th>Options</th><th>Where it stands</th></tr>
<tr><td><strong>Row treatment</strong></td><td>Underline · left pill · edge tab</td><td>Your lean: a vertical line. Left pill and edge tab are both that idea; pick one in §8</td></tr>
<tr><td><strong>Match header</strong></td><td>Two glows · curved sweep · pill + glow</td><td>All three keep home left / away right and none has a hard seam</td></tr>
<tr><td><strong>League table</strong></td><td>Left pill · rank in club colour</td><td>Rank-in-colour is the clever one: colour with no extra element</td></tr>
<tr><td><strong>Pick’em</strong></td><td>Three buttons · stacked + Draw</td><td>1/X/2 is gone; the team name is the button</td></tr>
<tr><td><strong>Jersey</strong></td><td>Nine shapes and patterns</td><td>Pick a silhouette first, then whether patterns are worth the data</td></tr>
<tr><td><strong>LMS picks table</strong></td><td>Grid by matchweek · grouped by club</td><td>Grid replaces the crest grid one-for-one</td></tr>
<tr><td><strong>Next Kickoff</strong></td><td>Clock hero · soft blobs</td><td>Dark-club fix applied — Udinese now uses its white</td></tr>
<tr><td><strong>Upcoming</strong></td><td>Names + meta · stacked</td><td>Both work; stacked is denser</td></tr>
</table>
<p class="note" style="margin-top:14px">Generated by <code>scripts/build-identity-review.mjs</code>. Mockups also live at <code>app/dev-harness/*</code>. Nothing here is production code.</p>
</section>`

const R2 = `
${section('rows', '8 · Round two — the vertical line, three ways', 'Your lean, built three ways. Underline sits beneath the name; the pill sits before it; the edge tab bleeds off the card’s rounded edge so the colour is part of the silhouette rather than an applied mark.',
  [['UNDERLINE', resultsTreat('under')], ['LEFT PILL', resultsTreat('pill')], ['EDGE TAB (NEW)', resultsTreat('tab')]].map(([l, b]) => phone(l, b)).join(''),
  'The edge tab is the new idea and the most “premium” of the three: nothing floats, the colour belongs to the card. The left pill is the safest and reads fastest at small sizes.')}

${section('header2', '9 · Match header — home left, away right, no hard seam', 'Long names wrap to two lines at 19px, which fits “Manchester United” without truncation. The straight split is gone: colour arrives as light rather than as an edge.',
  [['TWO GLOWS', headerV2('glow')], ['CURVED SWEEP', headerV2('sweep')], ['PILL + GLOW', headerV2('pillglow')]].map(([l, b]) => phone(l, b)).join(''),
  'Two glows. The colour reads as stadium light behind each side, there is no seam to feel sharp, and the ink base keeps it in the SportPool palette rather than the league’s purple.')}

${section('table2', '10 · League table — one more idea', 'The left pill, and the clever alternative: the club’s colour in the rank number itself, so colour costs no extra element at all.',
  [['LEFT PILL', tableV2('pill')], ['RANK IN CLUB COLOUR', tableV2('rank')]].map(([l, b]) => phone(l, b)).join(''))}

${section('pickem2', '11 · Pick’em — the team is the button', 'No 1/X/2. Each side is a full button carrying the club’s name and colour, with Draw between them. Selecting tints the button in the club’s own colour rather than the app’s blue.',
  [['THREE BUTTONS', pickemV2('trio')], ['STACKED + DRAW', pickemV2('stack')]].map(([l, b]) => phone(l, b)).join(''))}

<section id="jerseys"><h2>12 · The jersey</h2>
<p class="note">Built from rounded rects under a mask — body, two sleeve stubs, neck bitten out — so the silhouette carries the app’s radii instead of a sharp football-shirt outline. Colour and number are data; the shape is ours. Patterns are optional and cost a second colour per club.</p>
${jerseySheet()}
<div class="row" style="margin-top:22px">
  ${[['SOFT TEE ON THE PITCH', lineupsV2('soft')], ['BUBBLE ON THE PITCH', lineupsV2('bubble')], ['SQUIRCLE ON THE PITCH', lineupsV2('squircle')]].map(([l, b]) => phone(l, b)).join('')}
</div></section>

${section('lmspicks', '13 · Last Man Standing — everyone’s picks', 'The grid of crests, replaced. Codes in a tinted cell keep the shape of the current table; grouping by club answers “who is on Chelsea this week” in one read.',
  [['GRID BY MATCHWEEK', lmsPicksGrid()], ['GROUPED BY CLUB', lmsPicksByClub()]].map(([l, b]) => phone(l, b)).join(''),
  'Grid by matchweek — it is a one-for-one replacement for what is there now.')}

${section('kickoff2', '14 · Next Kickoff + Upcoming, fixed', 'Udinese vanished because its colour is near-black on a near-black card. The rule now: on a dark surface a club uses its first colour only if that colour is light enough, otherwise its second — which for Udinese, Newcastle, Fulham and Spurs is white, and is honest to the kit.',
  [['CLOCK HERO', kickoffV2('line')], ['SOFT BLOBS', kickoffV2('blobs')], ['UPCOMING · NAMES', upcomingV2('names')], ['UPCOMING · STACKED', upcomingV2('stacked')]].map(([l, b]) => phone(l, b)).join(''))}
`

writeFileSync('drafts/2026-09-13_identity_review.html', R1.replace('</style>', CSS2 + '</style>') + R2 + DECIDE + '</div></body></html>')
console.log('wrote drafts/2026-09-13_identity_review.html')

// Screenshot helper: R2 on its own so a headless capture starts at the top.
if (process.env.R2ONLY) {
  const head = R1.slice(0, R1.indexOf('<h1>'))
  writeFileSync('/tmp/r2.html', head.replace('</style>', CSS2 + '</style>') + R2 + '</div></body></html>')
  console.log('wrote /tmp/r2.html')
}

if (process.env.R3ONLY) {
  const head = R1.slice(0, R1.indexOf('<h1>'))
  const tail = R2.slice(R2.indexOf('<section id="jerseys">'))
  writeFileSync('/tmp/r3.html', head.replace('</style>', CSS2 + '</style>') + tail + '</div></body></html>')
  console.log('wrote /tmp/r3.html')
}
