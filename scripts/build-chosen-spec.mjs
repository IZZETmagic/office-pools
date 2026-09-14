// =============================================================
// drafts/2026-09-14_chosen_design.html — the chosen approach only.
// No comparisons, no rejected options: this is what the app becomes.
// =============================================================
import { writeFileSync } from 'fs'

const C = {
  ars:['Arsenal','Arsenal','ARS','#DB0007','#FFFFFF'], avl:['Aston Villa','Villa','AVL','#670E36','#95BFE5'],
  bha:['Brighton','Brighton','BHA','#0057B8','#FFFFFF'], bou:['Bournemouth','Bournemouth','BOU','#B50E12','#1B1B1B'],
  bre:['Brentford','Brentford','BRE','#E30613','#FFFFFF'], che:['Chelsea','Chelsea','CHE','#034694','#DBA111'],
  cry:['Crystal Palace','Palace','CRY','#1B458F','#C4122E'], eve:['Everton','Everton','EVE','#003399','#FFFFFF'],
  ful:['Fulham','Fulham','FUL','#1B1B1B','#FFFFFF'], lee:['Leeds United','Leeds','LEE','#1D428A','#FFE100'],
  liv:['Liverpool','Liverpool','LIV','#C8102E','#00B2A9'], mci:['Manchester City','Man City','MCI','#1C6FB5','#FFFFFF'],
  mun:['Manchester United','Man United','MUN','#DA291C','#FFFFFF'], new:['Newcastle','Newcastle','NEW','#241F20','#FFFFFF'],
  nfo:['Nottingham Forest',"Nott'm Forest",'NFO','#C40000','#FFFFFF'], tot:['Tottenham','Spurs','TOT','#132257','#FFFFFF'],
  int:['Inter Milan','Inter','INT','#0B5FA5','#FFFFFF'], udi:['Udinese','Udinese','UDI','#2B2B2B','#FFFFFF'],
  ala:['Deportivo Alavés','Alavés','ALA','#0761AF','#FFFFFF'], val:['Valencia','Valencia','VAL','#C4701A','#FFFFFF'],
  atm:['Atlético Madrid','Atlético','ATM','#C8102E','#1B3A6B'], osa:['Osasuna','Osasuna','OSA','#A21C28','#0A2B5E'],
  bar:['Barcelona','Barcelona','BAR','#A50044','#EDBB00'], san:['Racing Santander','Racing','SAN','#00A94F','#FFFFFF'],
}
const N = (k) => C[k][0], S = (k) => C[k][1], K = (k) => C[k][2], P = (k) => C[k][3], Q = (k) => C[k][4]
const lum = (h) => { const s=h.replace('#',''); const [r,g,b]=[0,2,4].map(i=>parseInt(s.slice(i,i+2),16)); return (0.299*r+0.587*g+0.114*b)/255 }
const onDark = (k) => (lum(P(k)) > 0.28 ? P(k) : Q(k))
const tint = (h,a) => { const s=h.replace('#',''); const [r,g,b]=[0,2,4].map(i=>parseInt(s.slice(i,i+2),16)); return `rgba(${r},${g},${b},${a})` }

// THE MARK — a 3×20 pill in the club's primary, before the name.
const mark = (k, h = 20, dark = false) => `<span class="pill" style="height:${h}px;background:${dark ? onDark(k) : P(k)}"></span>`

const phone = (label, body) => `<div class="phone"><p class="plabel">${label}</p><div class="pframe">${body}</div></div>`
const sec = (id, n, title, note, body) => `<section id="${id}"><div class="sh"><span class="snum">${n}</span><h2>${title}</h2></div><p class="note">${note}</p><div class="row">${body}</div></section>`

// ---------------------------------------------------------------- jersey
// ⚠ GENERATED AS VECTOR, NOT TRACED. Two hand-built attempts read as bubbles and
// then as ears, and a trace of a raster reference was only ever an approximation.
// This is native SVG from Recraft with the white ground and the baked-in number
// stripped — the number has to be live. Sources in assets/jersey-explore/.
const JERSEY = `<g transform="translate(26.98 39.91) scale(0.9726)">
    <path transform="translate(0,0)" fill="currentColor" d="M 805.72 268.331 C 815.61 267.505 828.24 269.476 837.14 274.155 C 867.84 290.292 860.36 318.501 870.08 344.886 C 886.51 389.488 913.95 420.038 956.55 440.097 C 995.81 458.459 1040.74 460.564 1081.54 445.954 C 1128.72 428.831 1167.74 389.56 1182.33 341.057 C 1186.56 326.989 1186.97 308.782 1193.25 296.176 C 1199.43 284.018 1210.29 274.89 1223.32 270.88 C 1234.28 267.643 1245.90 267.42 1256.98 270.233 C 1267.42 272.799 1281.83 279.015 1292.02 283.148 L 1346.80 305.292 L 1463.06 352.173 C 1488.08 362.172 1516.61 372.159 1540.11 384.616 C 1614.73 424.173 1674.18 500.8 1689.02 584.485 C 1692.04 601.521 1695.35 618.527 1698.56 635.524 L 1722.29 756.714 L 1744.90 869.851 C 1748.26 886.592 1755.14 916.408 1753.36 932.301 C 1751.79 947.518 1745.88 962.693 1736.38 976.01 C 1720.07 998.671 1698.24 1008.47 1673.50 1014.53 C 1651.29 1019.98 1629.09 1025.49 1606.99 1031 C 1558.90 1043.03 1511.14 1055.57 1463.74 1068.62 L 1453.38 1515.55 L 1463.11 1652.5 C 1465.42 1678.73 1467.85 1705.65 1469.61 1731.88 C 1470.15 1739.88 1468.86 1749.66 1466.60 1757.03 C 1459.80 1778.93 1446.00 1792.05 1425.67 1801.26 C 1416.09 1804.2 1406.94 1805.81 1396.62 1805.75 C 1365.22 1805.57 1333.79 1805.2 1302.42 1805.32 L 885.28 1805.36 L 722.18 1805.97 C 713.07 1806.02 703.90 1806.19 694.80 1806.12 C 656.59 1805.78 623.59 1812.13 596.55 1782.55 C 586.15 1770.9 580.10 1755.86 579.23 1739.59 C 578.66 1727.49 583.31 1687.87 584.61 1673.81 L 594.85 1540.68 L 585.89 1068.75 C 534.60 1053.76 482.05 1041.56 429.84 1027.73 C 406.01 1021.06 379.73 1017.11 356.14 1008.84 C 323.26 997.374 295.11 959.995 296.35 926.532 C 299.17 904.305 303.84 882.858 308.57 860.997 L 333.08 745.113 L 355.46 639.459 C 370.80 565.706 377.74 517.729 426.48 456.986 C 447.72 430.474 473.62 408.059 502.91 390.84 C 527.70 376.241 561.47 364.251 588.63 353.381 L 701.30 307.888 C 719.68 300.56 790.28 270.043 805.72 268.331 z"/>
    <path transform="translate(0,0)" fill="currentColor" d="M 1142.87 768.33 C 1160.47 766.198 1177.04 769.93 1191.62 779.855 C 1227.26 804.104 1222.13 840.678 1222.15 877.721 L 1218.98 984.356 L 1214.39 1094.83 C 1213.73 1112.85 1213.75 1133.22 1211.78 1151.1 C 1208.43 1182.5 1183.00 1206.31 1154.12 1211.16 C 1113.59 1216.02 1078.22 1185.24 1078.55 1141.66 C 1078.63 1131.28 1078.71 1120.89 1078.83 1110.51 L 1079.62 1039.93 L 1081.21 903.459 C 1081.19 879.207 1080.36 854.534 1082.02 830.378 C 1084.31 797.099 1111.08 773.322 1142.87 768.33 z"/>
  </g>`
const KEEPER = `<g transform="translate(-675.45 -700.74) scale(1.6584)">
    <path transform="translate(0,0)" fill="#fff" fill-opacity=".22" d="M 815.07 923.046 C 805.20 951.756 799.95 990.57 794.68 1020.52 C 780.96 1096 765.50 1171.6 746.66 1247.32 L 727.69 1309.95 C 717.62 1339.74 713.54 1363.6 681.68 1379.17 C 641.02 1398.72 598.42 1375.28 597.39 1332.65 C 596.62 1314.71 604.05 1296.54 609.24 1278.44 L 624.82 1213.46 C 636.42 1140.44 643.45 1067.51 647.98 994.663 L 674.15 836.74 C 678.44 815.891 686.08 772.717 693.64 754.41 C 713.68 705.945 755.59 673.604 802.91 654.11 C 832.85 641.767 862.98 629.906 893.30 618.532 C 905.61 613.804 919.89 607.622 932.13 603.428 C 933.47 633.831 940.38 656.489 963.80 677.79 C 981.54 693.988 1005.01 702.436 1029.00 701.261 C 1054.24 699.882 1077.83 688.31 1094.37 669.199 C 1109.50 651.901 1117.80 627.156 1118.08 604.349 C 1147.06 614.711 1175.87 625.54 1204.50 636.832 C 1230.09 646.686 1255.72 655.359 1279.84 668.686 C 1365.76 716.148 1368.11 797.659 1385.51 883.572 L 1410.26 1123.89 L 1431.75 1247.41 C 1436.89 1267.66 1443.16 1288.71 1448.41 1309.08 C 1451.83 1321.54 1452.85 1329.83 1450.42 1341.6 C 1447.13 1358.66 1437.03 1372.56 1422.25 1380.14 C 1399.62 1391.41 1369.97 1385.89 1348.65 1366.68 C 1332.31 1351.68 1325.30 1323.27 1318.55 1302.74 L 1294.56 1218.77 L 1266.21 1087 C 1257.25 1034.26 1248.58 978.328 1235.44 926.068 L 1232.92 927.932 C 1232.79 934.514 1231.97 941.856 1231.53 948.501 C 1219.41 1036.08 1213.35 1124.55 1219.66 1211.98 C 1223.41 1248.8 1229.57 1285.43 1238.10 1321.75 C 1241.69 1336.39 1251.98 1363.05 1253.06 1376.06 C 1253.97 1386.56 1247.68 1396.92 1241.01 1403.77 C 1197.38 1447.69 1047.55 1446.35 985.66 1444.04 C 938.85 1442.29 836.51 1438.1 807.44 1401.77 C 801.34 1394.02 798.08 1384.54 798.91 1374.08 C 800.18 1357.21 812.53 1319.93 816.39 1300.86 C 827.06 1241.67 834.21 1181.75 834.08 1121.88 C 832.44 1075.17 828.54 1028.44 822.61 981.772 C 820.73 966.885 816.69 937.084 817.34 923.916 L 815.07 923.046 z"/>
    <path transform="translate(0,0)" fill="currentColor" d="M 1232.92 927.932 C 1232.95 927.091 1232.76 922.003 1233.71 921.679 C 1234.85 922.244 1235.18 924.98 1235.44 926.068 L 1232.92 927.932 z"/>
    <path transform="translate(0,0)" fill="currentColor" d="M 815.07 923.046 L 815.26 921.721 C 815.35 920.998 815.45 919.991 816.10 919.533 C 817.20 919.43 817.28 923.386 817.34 923.916 L 815.07 923.046 z"/>
  </g>`
function jersey(id, k, num, size = 44, opts = {}) {
  const c = opts.grey ? '#9AA3B8' : P(k)
  const ink = lum(c) > 0.6 ? '#1B2340' : '#fff'
  return `<svg viewBox="0 0 2048 2048" width="${size}" height="${size}" style="color:${c}${opts.grey ? ';opacity:.5' : ''}">
    ${opts.keeper ? KEEPER : JERSEY}
    ${num === null ? '' : `<text x="1024" y="1290" text-anchor="middle" font-family="Nunito,sans-serif" font-weight="900" font-size="560" fill="${ink}">${num}</text>`}
  </svg>`
}


const jerseyStates = () => `<div class="screen"><div class="card pad">
  <div class="h1">The kit</div><div class="sub mb">One asset, filled by club. The number is live text, never baked in.</div>
  <div class="jrow">
    <div class="jc">${jersey('s1','mun',10,72)}<span>OUTFIELD</span></div>
    <div class="jc">${jersey('s2','mun',1,72,{keeper:true})}<span>KEEPER</span></div>
    <div class="jc">${jersey('s3','mun',23,72,{grey:true})}<span>USED / OUT</span></div>
    <div class="jc">${jersey('s4','mun',null,72)}<span>BLANK</span></div>
  </div>
  <div class="jrow mt">
    ${['liv','mci','che','tot','new','avl','lee','san'].map((k,i)=>`<div class="jc">${jersey('c'+i,k,[9,7,8,4,6,2,5,3][i],48)}</div>`).join('')}
  </div>
</div></div>`

// ---------------------------------------------------------------- screens
const FX = [['mun','mci',0,1],['ars','che',2,1],['liv','nfo',1,1],['tot','new',null,'17:30'],['bha','eve',null,'20:00']]
const fxRow = (h,a,hs,as) => {
  const done = hs !== null
  const hw = done && hs > as, aw = done && as > hs
  const nm = (w,o) => (done && !w && o ? 'name dim' : 'name')
  return `<div class="r">
    <div class="sidep">${mark(h)}<div class="${nm(hw,aw)}">${S(h)}</div></div>
    <div class="score">${done ? `<span class="sc">${hs}<i>–</i>${as}</span>` : `<span class="tm">${as}</span>`}</div>
    <div class="sidep rev">${mark(a)}<div class="${nm(aw,hw)}">${S(a)}</div></div></div>`
}
const results = () => `<div class="screen"><div class="card">
  <div class="cardhead"><div class="h1">Today</div><div class="kicker">PREMIER LEAGUE · MATCHWEEK 4</div></div>
  ${FX.map((f) => fxRow(...f)).join('')}</div></div>`

const fixtures = () => `<div class="screen"><div class="card">
  ${[['SATURDAY 14 SEPTEMBER',[['liv','nfo','12:30'],['ars','che','15:00'],['bha','eve','15:00']]],
     ['SUNDAY 15 SEPTEMBER',[['mun','mci','14:00'],['tot','new','16:30']]]]
  .map(([d,rows]) => `<div class="daylabel">${d}</div>` + rows.map(([h,a,t]) => fxRow(h,a,null,t)).join('')).join('')}
</div></div>`

const header = () => {
  const h='mun', a='mci'
  return `<div class="hdr">
    <span class="glow gl" style="background:radial-gradient(closest-side, ${tint(P(h),.55)}, transparent)"></span>
    <span class="glow gr" style="background:radial-gradient(closest-side, ${tint(P(a),.5)}, transparent)"></span>
    <div class="hdrc"><p class="kicker c">PREMIER LEAGUE · MATCHWEEK 4</p>
      <div class="hmirror">
        <div class="hteam"><div class="hname">${N(h).replace(' ','<br>')}</div><span class="hrule" style="background:${P(h)}"></span></div>
        <div class="hscore"><b>0<i>–</i>1</b><span>FULL TIME</span></div>
        <div class="hteam"><div class="hname">${N(a).replace(' ','<br>')}</div><span class="hrule" style="background:${P(a)}"></span></div>
      </div><p class="scorer">⚽ Haaland 60'</p>
      <div class="tabs">${['Facts','Line-ups','Stats','Scouting'].map((t,i)=>`<span class="${i?'':'on'}">${t}</span>`).join('')}</div>
    </div></div>
  <div class="screen"><div class="card pad"><div class="h1">Match Facts</div>
    <div class="fact">Matchweek 4</div><div class="fact">Sunday, 14 September at 12:30 PM</div><div class="fact">Old Trafford, Manchester</div></div></div>`
}

const lineups = () => {
  const XI=[[[1,'Onana']],[[2,'Dalot'],[19,'Varane'],[6,'Martínez'],[23,'Shaw']],[[18,'Casemiro'],[37,'Mainoo'],[8,'Bruno']],[[10,'Rashford'],[11,'Højlund'],[17,'Garnacho']]]
  let i=0
  return `<div class="screen"><div class="card pad">
    <div class="lhead">${mark('mun',18)}<span class="h1">Manchester United</span><span class="sub">4–3–3</span></div>
    <div class="pitch">${XI.map((row)=>`<div class="prow">${row.map(([n,nm])=>`<div class="pl">${jersey(i++,'mun',n)}<span class="pn">${nm}</span></div>`).join('')}</div>`).join('')}</div>
  </div></div>`
}

const SC=[['Form','W W L D W','W W W D W',.42],['Goals for','7','11',.39],['Goals against','6','3',.67],['Clean sheets','1','3',.25],['Corners','24','31',.44]]
const scout = () => `<div class="screen"><div class="card pad">
  <div class="scouthead">
    <div><div class="h1">Man United</div><span class="hrule" style="background:${P('mun')};margin-top:6px"></span></div>
    <span class="kicker">SCOUT</span>
    <div class="ta-r"><div class="h1">Man City</div><span class="hrule" style="background:${P('mci')};margin-top:6px;margin-left:auto"></span></div></div>
  ${SC.map(([l,x,y,sp])=>`<div class="srow2"><div class="sline"><b>${x}</b><i>${l.toUpperCase()}</i><b>${y}</b></div>
    <div class="bar"><span style="flex:${sp};background:${P('mun')}"></span><span class="gap"></span><span style="flex:${1-sp};background:${P('mci')}"></span></div></div>`).join('')}
</div></div>`

const people = () => `<div class="screen"><div class="card pad">
  <div class="kicker">THE PEOPLE</div><div class="h1 mb">Five to watch</div>
  ${[['mci',9,'Erling Haaland','4 goals'],['mci',17,'Kevin De Bruyne','3 assists'],['mun',8,'Bruno Fernandes','2 goals · 2 assists'],['mun',10,'Marcus Rashford','2 goals'],['mci',47,'Phil Foden','1 goal · 3 key passes']]
  .map(([k,n,nm,st])=>`<div class="prow2"><span class="pnum" style="color:${P(k)}">${n}</span>
    <span class="pill" style="height:26px;background:${P(k)};opacity:.35"></span>
    <span class="grow"><b>${nm}</b><i>${st}</i></span><span class="pcode">${K(k)}</span></div>`).join('')}
</div></div>`

const TB=[['liv',4,'+8',12],['ars',4,'+6',10],['mci',4,'+5',9],['che',4,'+2',8],['tot',4,'+1',7],['new',4,'0',5],['bha',4,'-1',5],['mun',4,'-3',4]]
const table = () => `<div class="screen"><div class="card">
  <div class="thead"><span class="rk"></span><span class="grow"></span><span class="col">PL</span><span class="col">GD</span><span class="col pts">PTS</span></div>
  ${TB.map(([k,pl,gd,pts],i)=>`<div class="trow"><span class="rk">${i+1}</span>${mark(k,18)}
    <span class="grow tn">${S(k)}</span><span class="col">${pl}</span><span class="col">${gd}</span><span class="col pts">${pts}</span></div>`).join('')}
</div></div>`

const pickem = () => `<div class="screen">${[['mun','mci',2],['ars','che',0],['liv','nfo',null]].map(([h,a,p])=>{
  const btn=(k,i)=>`<div class="tbtn ${p===i?'on':''}" ${p===i?`style="border-color:${P(k)};background:${tint(P(k),.1)}"`:''}>${mark(k,22)}<b>${S(k)}</b></div>`
  return `<div class="card pad mb"><div class="sub mb">Sat 15:00 · Old Trafford</div>
    <div class="trio">${btn(h,0)}<div class="dbtn ${p===1?'on':''}">Draw</div>${btn(a,2)}</div></div>`
}).join('')}</div>`

const dragTable = () => `<div class="screen"><div class="card pad">
  <div class="h1">Predict the table</div><div class="sub mb">Drag to reorder · locks Fri 19:00</div>
  ${['mci','ars','liv','che','tot','mun','new','bha'].map((k,i)=>`<div class="drag"><span class="rk">${i+1}</span>${mark(k,18)}
    <span class="grow tn">${S(k)}</span><span class="handle">≡</span></div>`).join('')}</div></div>`

const USED=new Set(['tot','new','ful'])
const lmsPick = () => `<div class="screen"><div class="card pad">
  <div class="h1">Pick your club</div><div class="sub mb">Matchweek 5 · three already used</div>
  ${['liv','ars','mci','che','tot','mun','new','bha','avl','ful'].map((k)=>`<div class="lms ${USED.has(k)?'used':''}">
    ${mark(k,18)}<span class="grow tn">${N(k)}</span><span class="sub">${USED.has(k)?'used MW2':'v Brighton (H)'}</span></div>`).join('')}
</div></div>`
const MEM=[['Ryan',['liv','ars','mci','che']],['Carson',['ars','mci','liv','tot']],['Nadia',['mci','liv','tot','ars']],['Jules',['che','tot','ars','liv']],['Dev',['tot','che','bha','mci']]]
const lmsPicks = () => `<div class="screen"><div class="card pad">
  <div class="h1">Everyone’s picks</div><div class="sub mb">Matchweeks 1–4</div>
  <div class="pickgrid"><div class="pgh"></div>${[1,2,3,4].map(w=>`<div class="pgh">MW${w}</div>`).join('')}
  ${MEM.map(([who,ps])=>`<div class="pgn">${who}</div>`+ps.map(k=>`<div class="pgc" style="background:${tint(P(k),.16)};border-left:3px solid ${P(k)}">${K(k)}</div>`).join('')).join('')}</div>
</div></div>`

const duel = () => `<div class="screen">
  <div class="duelhead"><p class="kicker c">SHOWDOWN · MATCHWEEK 4</p><div class="duelrow"><b>Ryan</b><i>3 – 2</i><b>Carson</b></div></div>
  <div class="card pad mt">${[['mun','mci','1','2'],['ars','che','1','1'],['liv','nfo','X','1'],['tot','new','2','2']].map(([h,a,p1,p2])=>`
    <div class="duelpick"><span class="pk ${p2==='2'&&p1!=='2'?'':'win'}">${p1}</span>
      <span class="grow ta-c"><b>${S(h)} <em>v</em> ${S(a)}</b><span class="rules">${mark(h,3)}${mark(a,3)}</span></span>
      <span class="pk">${p2}</span></div>`).join('')}</div></div>`

const kickoff = () => {
  const clock = `<div class="clock">${[['19','H'],['23','M'],['17','S']].map(([n,u],i)=>`<span>${n}<i>${u}</i></span>${i<2?'<em>:</em>':''}`).join('')}</div>`
  return `<div class="screen dk"><div class="kocard">
    <div class="kohead"><span>NEXT KICKOFF</span><span>MATCHWEEK 4</span></div>${clock}
    <div class="kofix"><span class="rulek" style="background:${onDark('int')}"></span><b>Inter Milan <em>v</em> Udinese</b><span class="rulek" style="background:${onDark('udi')}"></span></div>
    <p class="sub c">Monday, Sep 14 · Milan</p><p class="more">1 more match today</p></div></div>`
}
const UP=[['int','udi','3:45 PM','Mon, Sep 14','Milan'],['lee','new','4:00 PM','Mon, Sep 14','Elland Road, Leeds'],['ala','val','12:00 PM','Wed, Sep 16','Estadio Mendizorrotza, Vitoria'],['atm','osa','12:00 PM','Wed, Sep 16','Metropolitano Stadium, Madrid'],['bar','san','12:00 PM','Wed, Sep 16','Camp Nou, Barcelona']]
const upcoming = () => `<div class="screen dk"><h3 class="uph">Upcoming Matches</h3>
  ${UP.map(([h,a,t,d,v])=>`<div class="card upc"><div class="upstack">
    <span class="stackrules">${mark(h,16,true)}${mark(a,16,true)}</span>
    <span class="grow"><b>${N(h)}</b><b>${N(a)}</b></span>
    <span class="ta-r"><b class="pri">${t}</b><i>${d}</i></span></div><div class="sub mt6">${v}</div></div>`).join('')}</div>`

const poolCard = () => `<div class="screen">
  ${[['The Sargasso Sea','2nd','14',"Pick'em"],['Office Legends','5th','31','Predict the Table']].map(([n,r,of,m])=>`
  <div class="card pool"><span class="rail"><span class="railtext">PREMIER LEAGUE</span></span>
    <div class="poolbody"><div class="poolhead"><span class="h1">${n}</span><span class="sub">${m}</span></div>
      <div class="rank"><b>${r}</b><span class="sub">of ${of}</span></div>
      <div class="kpis">${[['PTS','348'],['EXACT','14'],['MW','4']].map(([a,b])=>`<div class="kpi"><i>${a}</i><b>${b}</b></div>`).join('')}</div>
    </div></div>`).join('')}</div>`

const CSS = `
:root{--snow:#F7F8FC;--surface:#FFF;--mist:#EEF1F8;--silver:#D4DAE8;--slate:#7B87A8;--ink:#1B2340;--primary:#3B6EFF;--accent:#F5C518;--green:#22C55E;--midnight:#0B0F1A}
body.dark{--snow:#121520;--surface:#1C2030;--mist:#232840;--silver:#2E3448;--slate:#8B97B8;--ink:#E8EAF0;--primary:#5B8AFF}
*{box-sizing:border-box}
body{margin:0;background:var(--snow);color:var(--ink);font-family:Nunito,-apple-system,BlinkMacSystemFont,sans-serif;font-weight:500}
.wrap{max-width:1860px;margin:0 auto;padding:32px 40px 120px}
h1{font-weight:900;font-size:36px;letter-spacing:-.02em;margin:0 0 10px}
h2{font-weight:900;font-size:22px;letter-spacing:-.01em;margin:0}
.sh{display:flex;align-items:baseline;gap:12px}
.snum{font-weight:900;font-size:13px;color:var(--primary);letter-spacing:1px}
.note{color:var(--slate);max-width:1000px;margin:6px 0 0}
section{margin:42px 0;scroll-margin-top:66px}
.row{display:flex;gap:20px;flex-wrap:wrap;margin-top:16px}
.phone{width:390px}.plabel{font-weight:900;font-size:11px;letter-spacing:1.4px;color:var(--slate);margin:0 0 8px}
.pframe{border-radius:24px;overflow:hidden;border:1px solid var(--silver)}
.screen{background:var(--snow);padding:12px}.screen.dk{background:#121520}
.card{background:var(--surface);border-radius:18px;overflow:hidden}.card.pad{padding:16px 18px}
.mb{margin-bottom:12px}.mt{margin-top:10px}.mt6{margin-top:6px}.ta-r{text-align:right}.ta-c{text-align:center}
.grow{flex:1;min-width:0}.sub{font-size:12px;color:var(--slate);font-weight:500}
.h1{font-weight:900;font-size:17px}.kicker{font-weight:900;font-size:10px;letter-spacing:1.8px;color:var(--slate)}
.kicker.c{display:block;text-align:center;color:rgba(255,255,255,.62)}
.cardhead{padding:16px 18px 12px}
.pill{display:block;width:3px;border-radius:999px;flex-shrink:0}
.r{display:flex;align-items:center;gap:12px;padding:14px 18px;border-top:1px solid var(--silver)}
.sidep{flex:1;min-width:0;display:flex;align-items:center;gap:10px}
.sidep.rev{flex-direction:row-reverse}
.name{font-weight:900;font-size:16px;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.name.dim{font-weight:700;color:var(--slate)}
.score{min-width:58px;text-align:center;flex-shrink:0}
.sc{font-weight:900;font-size:19px;font-variant-numeric:tabular-nums}.sc i{color:var(--silver);margin:0 5px;font-style:normal}
.tm{font-weight:900;font-size:15px;color:var(--primary);font-variant-numeric:tabular-nums}
.daylabel{padding:14px 18px 8px;font-weight:900;font-size:10px;letter-spacing:1.8px;color:var(--slate)}
.fact{padding:11px 0;border-top:1px solid var(--silver);font-size:14px;font-weight:600}
/* header */
.hdr{position:relative;padding:44px 22px 16px;background:linear-gradient(180deg,#161D33,#0B0F1A);overflow:hidden}
.glow{position:absolute;width:300px;height:300px;border-radius:50%;filter:blur(6px)}
.gl{left:-110px;top:-60px}.gr{right:-110px;top:-60px}
.hdrc{position:relative}
.hmirror{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-top:22px}
.hteam{flex:1;display:grid;justify-items:center;gap:10px}
.hname{font-weight:900;font-size:19px;line-height:1.12;color:#fff;text-align:center}
.hrule{display:block;width:34px;height:4px;border-radius:2px}
.hscore{flex-shrink:0;text-align:center}
.hscore b{display:block;font-weight:900;font-size:44px;color:#fff;font-variant-numeric:tabular-nums}
.hscore i{font-style:normal;color:rgba(255,255,255,.45);margin:0 7px}
.hscore span{display:block;font-size:10px;font-weight:900;letter-spacing:1.6px;color:rgba(255,255,255,.55);margin-top:8px}
.scorer{text-align:center;font-size:13px;color:rgba(255,255,255,.82);margin:18px 0 0}
.tabs{display:flex;gap:8px;margin-top:18px}
.tabs span{border-radius:999px;padding:9px 14px;font-size:13px;font-weight:700;background:rgba(255,255,255,.14);color:rgba(255,255,255,.92)}
.tabs span.on{background:#fff;color:#1B2340}
/* table */
.thead{display:flex;gap:10px;padding:14px 18px 10px}
.trow{display:flex;align-items:center;gap:10px;padding:10px 18px;border-top:1px solid var(--silver)}
.rk{width:20px;font-weight:900;font-size:13px;color:var(--slate);font-variant-numeric:tabular-nums}
.col{width:26px;text-align:center;font-size:12px;color:var(--slate);font-variant-numeric:tabular-nums}
.col.pts{width:32px;font-weight:900;font-size:15px;color:var(--ink)}
.thead .col{font-weight:900;font-size:10px;letter-spacing:1px}
.tn{font-weight:900;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
/* pool card */
.pool{display:flex;margin-bottom:12px;border:1px solid var(--silver)}
.rail{width:30px;background:linear-gradient(to bottom,#5B2C82,#3D195B);display:grid;place-items:center;flex-shrink:0}
.railtext{writing-mode:vertical-rl;transform:rotate(180deg);color:#fff;font-weight:900;font-size:10px;letter-spacing:.16em}
.poolbody{flex:1;padding:12px;display:grid;gap:8px}
.poolhead{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.rank b{font-weight:900;font-size:22px}.rank .sub{margin-left:4px}
.kpis{display:flex;gap:6px}.kpi{flex:1;background:var(--mist);border-radius:12px;padding:6px 8px}
.kpi i{display:block;font-style:normal;font-size:9px;font-weight:900;letter-spacing:1px;color:var(--slate)}
.kpi b{font-weight:900;font-size:14px}
/* pickem + drag */
.trio{display:flex;gap:8px;align-items:stretch}
.tbtn{flex:1;min-width:0;display:flex;align-items:center;gap:8px;padding:12px;border-radius:14px;background:var(--mist);border:2px solid transparent}
.tbtn b{font-weight:900;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dbtn{display:grid;place-items:center;padding:0 16px;border-radius:14px;background:var(--mist);font-weight:900;font-size:13px;color:var(--slate)}
.dbtn.on{background:var(--primary);color:#fff}
.drag{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:12px;background:var(--mist);margin-bottom:6px}
.handle{color:var(--slate);letter-spacing:2px}
/* pitch */
.lhead{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.pitch{background:#1B5E33;border-radius:14px;padding:16px 8px;display:grid;gap:14px}
.prow{display:flex;justify-content:space-around}
.jrow{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end}
.jc{display:grid;justify-items:center;gap:6px}
.jc span{font-size:9px;font-weight:900;letter-spacing:.8px;color:var(--slate)}
.pl{display:grid;justify-items:center;gap:2px;width:68px}
.pn{font-size:10px;color:#fff;font-weight:700}
/* scout */
.scouthead{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px}
.srow2{padding:12px 0;border-top:1px solid var(--silver)}
.sline{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:7px}
.sline b{font-weight:900;font-size:14px;font-variant-numeric:tabular-nums}
.sline i{font-style:normal;font-size:10px;font-weight:900;letter-spacing:1.4px;color:var(--slate)}
.bar{display:flex;height:6px;border-radius:3px;overflow:hidden;background:var(--mist)}.bar .gap{width:2px}
.prow2{display:flex;align-items:center;gap:14px;padding:11px 0;border-top:1px solid var(--silver)}
.pnum{width:30px;text-align:right;font-weight:900;font-size:21px;font-variant-numeric:tabular-nums}
.prow2 b{display:block;font-weight:900;font-size:14px}.prow2 i{font-style:normal;font-size:11px;color:var(--slate)}
.pcode{font-size:10px;font-weight:900;letter-spacing:1px;color:var(--slate)}
/* lms */
.lms{display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--silver)}
.lms.used{opacity:.38}.lms.used .tn{text-decoration:line-through}
.pickgrid{display:grid;grid-template-columns:64px repeat(4,1fr);gap:6px;align-items:center}
.pgh{font-size:10px;font-weight:900;letter-spacing:1px;color:var(--slate);text-align:center}
.pgn{font-weight:900;font-size:13px}
.pgc{border-radius:10px;padding:9px 0;text-align:center;font-weight:900;font-size:11px}
/* duel */
.duelhead{background:linear-gradient(150deg,#3B6EFF,#1E3A8A);border-radius:18px;padding:18px}
.duelrow{display:flex;justify-content:space-between;align-items:center;margin-top:14px;color:#fff}
.duelrow b{font-weight:900;font-size:20px}.duelrow i{font-style:normal;font-weight:900;font-size:15px;color:rgba(255,255,255,.6)}
.duelpick{display:flex;align-items:center;gap:10px;padding:12px 0;border-top:1px solid var(--silver)}
.duelpick:first-child{border-top:none}
.pk{width:26px;text-align:center;font-weight:900;font-size:13px}.pk.win{color:var(--green)}
.duelpick b{font-weight:900;font-size:14px}.duelpick em{font-style:normal;color:var(--slate);font-weight:700}
.rules{display:flex;gap:4px;justify-content:center;margin-top:5px}
.rules .pill{height:3px!important;width:22px;border-radius:2px}
/* dark cards */
.kocard,.upc{background:#1C2030;color:#E8EAF0}
.kocard{border-radius:24px;padding:18px 20px 20px}
.kohead{display:flex;justify-content:space-between;font-weight:900;font-size:11px;letter-spacing:2.2px;color:#8B97B8;margin-bottom:16px}
.clock{display:flex;align-items:baseline;justify-content:center;gap:2px;font-weight:900;font-size:42px;color:#fff;font-variant-numeric:tabular-nums}
.clock i{font-style:normal;font-size:.34em;color:#8B97B8;margin:0 6px 0 2px}
.clock em{font-style:normal;color:#8B97B8;margin-right:6px}
.kofix{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:16px}
.kofix b{font-weight:900;font-size:18px;color:#fff}.kofix em{font-style:normal;color:#8B97B8;font-weight:700}
.rulek{display:block;width:22px;height:3px;border-radius:2px}
.more{text-align:center;font-size:13px;color:#F5C518;font-weight:700;margin:14px 0 0}
.kocard .sub,.upc .sub{color:#8B97B8}.sub.c{text-align:center;margin-top:8px}
.uph{font-weight:900;font-size:24px;color:#E8EAF0;margin:6px 4px 14px}
.upc{border-radius:18px;padding:14px 16px;margin-bottom:10px}
.upstack{display:flex;gap:12px}
.stackrules{display:grid;gap:4px;padding-top:3px}
.upstack .grow b{display:block;font-weight:900;font-size:16px;color:#fff;line-height:1.35}
.upstack .ta-r b{font-weight:900;font-size:13px}.upstack .pri{color:#5B8AFF}
.upstack .ta-r i{font-style:normal;font-size:11px;color:#8B97B8;display:block;margin-top:2px}
/* chrome */
.top{position:sticky;top:0;z-index:10;background:var(--snow);border-bottom:1px solid var(--silver);padding:10px 40px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
.top a{color:var(--slate);text-decoration:none;font-size:12px;font-weight:800}
.top a:hover{color:var(--primary)}
button{border-radius:999px;border:1px solid var(--silver);background:transparent;color:var(--ink);font-weight:800;padding:7px 14px;cursor:pointer;font-family:inherit}
.spec{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;margin-top:18px;max-width:1400px}
.sbox{background:var(--surface);border:1px solid var(--silver);border-radius:18px;padding:16px 18px}
.sbox h4{margin:0 0 8px;font-weight:900;font-size:14px}
.sbox ul{margin:0;padding-left:18px;font-size:13px;color:var(--slate);line-height:1.6}
.sbox code{font-size:12px}
.open{background:var(--mist);border-left:3px solid var(--accent);border-radius:0 12px 12px 0;padding:12px 16px;max-width:1000px;margin-top:14px;font-size:14px}
.open b{font-weight:900}
`
const NAV=[['home','Home'],['results','Results'],['match','Match detail'],['league','League'],['play','Playing'],['scout','Scout'],['lms','LMS'],['spec','The rules']]

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>SportPool — chosen design</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@500;600;700;900&display=swap" rel="stylesheet">
<style>${CSS}</style></head><body>
<div class="top"><strong style="font-weight:900">Chosen design</strong>
${NAV.map(([i,n])=>`<a href="#${i}">${n}</a>`).join('')}
<button onclick="document.body.classList.toggle('dark')" style="margin-left:auto">Light / dark</button></div>
<div class="wrap">
<h1>SportPool — the chosen design</h1>
<p class="note">14 September 2026. One approach, applied to every surface. No comparisons and no rejected options — this is what the app becomes. Nothing here uses a crest, a league mark, a sponsor or manufacturer mark, a kit reproduction or a player photograph. Club <strong>names</strong>, club <strong>colours</strong>, three-letter <strong>codes</strong> and shirt <strong>numbers</strong> are all facts.</p>
<div class="open"><b>Three calls still open.</b> The table has a clever alternative (rank number in the club’s colour instead of a pill); Upcoming Matches can be stacked as shown or names-with-meta-below; The jersey is settled: Recraft vector, 6.5% waist bow, outfield and keeper on one frame. Everything else below is settled.</div>

${sec('home',1,'Home','The countdown leads and the fixture reads as a sentence beneath it. Upcoming is stacked, densest of the options, with the dark-surface colour rule applied — Udinese and Newcastle use their white here, which is honest to the kit.',
  phone('NEXT KICKOFF', kickoff()) + phone('UPCOMING MATCHES', upcoming()) + phone('POOL CARDS', poolCard()))}

${sec('results',2,'Results and fixtures','The mark is a 3×20 pill in the club’s colour, sitting before the name and mirrored on the away side. Winner in ink, loser in slate — so you can read the results without reading the scores.',
  phone('MATCH CENTRE', results()) + phone('FIXTURE LIST', fixtures()))}

${sec('match',3,'Match detail','Home left, away right. Names wrap to two lines at 19px so nothing truncates. The background is the two clubs’ colours as soft light on the ink base — no seam, no league purple.',
  phone('HEADER + FACTS', header()) + phone('LINE-UPS', lineups()) + phone('THE KIT', jerseyStates()))}

${sec('league',4,'League table','The pill sits between the rank and the name. Tabular figures throughout so the columns align.',
  phone('TABLE', table()))}

${sec('play',5,'Playing','Pick’em: the team name is the button, Draw sits between them, and selecting tints the button in that club’s own colour. No 1/X/2.',
  phone("PICK'EM", pickem()) + phone('PREDICT THE TABLE', dragTable()) + phone('SHOWDOWN DUEL', duel()))}

${sec('scout',6,'Scout report','Each stat is a divergent bar in the two clubs’ colours — the comparison the crests were sitting next to. The people card uses the shirt number as the typography, coloured by club.',
  phone('DOSSIER', scout()) + phone('THE PEOPLE', people()))}

${sec('lms',7,'Last Man Standing','Picking stays a list of clubs with the fixture beside each. Everyone’s picks becomes a grid of tinted code cells — a one-for-one replacement for the grid of crests.',
  phone('PICK YOUR CLUB', lmsPick()) + phone('EVERYONE’S PICKS', lmsPicks()))}

<section id="spec"><div class="sh"><span class="snum">8</span><h2>The rules</h2></div>
<p class="note">What a developer needs in order to build any surface not drawn here.</p>
<div class="spec">
<div class="sbox"><h4>The mark</h4><ul>
<li>A pill: <code>3px</code> wide, <code>18–22px</code> tall, radius <code>999</code>, club primary.</li>
<li>Sits <strong>before</strong> the name; mirrored on the away side.</li>
<li>At header size it becomes a <code>34×4</code> rule under the name.</li>
<li>No club colour on file → no pill. The name carries it alone.</li></ul></div>
<div class="sbox"><h4>Colour data</h4><ul>
<li>Two colours per club: <strong>primary</strong> and <strong>secondary</strong>.</li>
<li>Primary must clear <strong>4.5:1</strong> against white, as the existing twenty do.</li>
<li>On a dark surface: use primary if its luminance is above <code>0.28</code>, else secondary.</li>
<li>~100 clubs across five competitions. <code>clubColors.ts</code> has 20 primaries today.</li></ul></div>
<div class="sbox"><h4>Type</h4><ul>
<li>Club names in Nunito <strong>900</strong>, <code>-0.01em</code>.</li>
<li>Finished match: winner in <code>ink</code>, loser in <code>slate</code> at 700.</li>
<li>All scores, times, ranks and points <strong>tabular</strong>.</li>
<li>Kickers uppercase, <code>1.8px</code> tracking, slate.</li></ul></div>
<div class="sbox"><h4>The jersey</h4><ul>
<li>Rounded-rect body <code>rx 20</code>, two flat ellipse sleeves, neck bitten out.</li>
<li>Fill = club primary. Number white, or ink when the primary is light.</li>
<li>Shown at <code>44px</code> on the pitch; the shape holds down to <code>28px</code>.</li>
<li>Patterns (stripes, hoops, sash) are deferred — the number needs a plate behind it first.</li></ul></div>
<div class="sbox"><h4>Never</h4><ul>
<li>A club crest or league mark, altered or not.</li>
<li>A shirt sponsor or manufacturer mark — never three stripes on a sleeve.</li>
<li>A reproduction of a specific season’s kit design.</li>
<li>A player photograph.</li>
<li>“Official”, “powered by”, or any suggestion of endorsement.</li></ul></div>
<div class="sbox"><h4>Still fine to use</h4><ul>
<li>Club and competition <strong>names</strong>, in our own type.</li>
<li><strong>Colours</strong>, <strong>abbreviations</strong>, <strong>shirt numbers</strong>, <strong>positions</strong>.</li>
<li>Fixtures, results, standings, stadium names, minutes, cards.</li>
<li>Our own artwork, badges and competition rails.</li></ul></div>
</div></section>
</div></body></html>`

writeFileSync('drafts/2026-09-14_chosen_design.html', html)
console.log('wrote drafts/2026-09-14_chosen_design.html')
