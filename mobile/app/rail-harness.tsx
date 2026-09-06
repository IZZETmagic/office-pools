// THROWAWAY. Delete once the rail is confirmed on device.
//
// Two questions, one screen.
//
// 1. DO THE PNG MARKS RENDER? Every static check passes: the tournaments carry
//    the right external_league_id, an anon-key client can read it, the PNGs are
//    registered in the Metro bundle, and 39.png is pure white on transparent
//    with 8,946 opaque pixels. So the question is what the DEVICE does.
//      · marks render here  -> the card is passing a null externalLeagueId
//      · marks blank here   -> the Image/asset path is wrong on device
//
// 2. ⚠ DOES THE WORLD CUP'S <mask> RENDER? This is the one this repo has
//    carried unanswered since 2026-09-02. The World Cup has NO png — the
//    provider returns a generic placeholder shield for league 1, so the mark is
//    hand-drawn and INLINED as SVG in CompetitionRail.tsx, and its trophy shape
//    exists only because slivers are cut out of a white rect by a <mask>. Web
//    knocks it out with a CSS mask; RN has none, so it rests entirely on
//    react-native-svg honouring maskUnits.
//
//    ⭐ THE FAILURE IS VISIBLE, WHICH IS WHY IT IS WORTH LOOKING: if the mask is
//    dropped, the rect renders whole and the mark is a PLAIN WHITE SLAB — a
//    rounded-corner block with no trophy in it. If the mask works you can see
//    the bowl, the stem and the tiered base, with three curved cuts through it.
//    Precedent: `transform="rotate(-90 …)"` was silently ignored by this same
//    library and looked deliberate. Only looking at it caught that too.
//
// The bottom row is what actually ships now: the pools tab uses `default` (46),
// the home card uses `compact` (30).
import { ScrollView, View, Image } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { CompetitionRail } from '@/components/CompetitionRail';
import { Text } from '@/components/ui';
import {
  LEAGUE_ID,
  getCompetitionMarkPng,
  getPoolStripe,
} from '@/lib/design/competition';

const ALL = Object.entries(LEAGUE_ID) as [string, number][];

// The same markup CompetitionRail inlines, repeated here ONLY so it can be
// drawn big. If the two ever disagree this harness is lying — but it is
// throwaway, and the guard test pins the real one against public/competitions/1.svg.
const WORLD_CUP_MARK = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="19 12 62 167">
  <mask id="t" maskUnits="userSpaceOnUse" x="19" y="12" width="62" height="167">
    <g fill="#fff">
      <circle cx="50" cy="44" r="30"/>
      <path d="M27 62 C 30 98, 38 126, 42 146 L58 146 C 62 126, 70 98, 73 62 Z"/>
      <rect x="37" y="146" width="26" height="8" rx="2"/>
      <rect x="30" y="157" width="40" height="8" rx="2"/>
      <rect x="22" y="168" width="56" height="9" rx="3"/>
    </g>
    <g fill="none" stroke="#000" stroke-width="5" stroke-linecap="round">
      <path d="M43 146 C 41 112, 38 84, 46 60 C 51 46, 60 34, 70 30"/>
      <path d="M57 144 C 60 112, 64 86, 60 66"/>
      <path d="M30 60 C 27 44, 33 28, 44 20"/>
    </g>
  </mask>
  <rect x="19" y="12" width="62" height="167" fill="#fff" mask="url(#t)"/>
</svg>`;

// The same drawing with the mask REMOVED — what a dropped mask looks like.
// Side by side, "is it working?" stops being a judgement call.
const WORLD_CUP_UNMASKED = WORLD_CUP_MARK
  .replace(' mask="url(#t)"', '')
  .replace(/<mask[\s\S]*?<\/mask>/, '');

export default function RailHarness() {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }}>
      <Text variant="cardTitle">Rail harness</Text>

      {/* ── 1. THE MASK, BIG ────────────────────────────────────────────── */}
      <View style={{ gap: 8 }}>
        <Text variant="cardTitle">1 · The World Cup mask</Text>
        <Text variant="detail" color="slate">
          LEFT is what ships. RIGHT is the same drawing with the mask deleted. If they look
          the SAME, react-native-svg dropped the mask and the mark is a white slab.
        </Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <View style={{ backgroundColor: '#C9A227', borderRadius: 8, padding: 10 }}>
              <SvgXml xml={WORLD_CUP_MARK} width={90} height={165} />
            </View>
            <Text variant="detail" color="slate">masked — expect a trophy</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <View style={{ backgroundColor: '#C9A227', borderRadius: 8, padding: 10 }}>
              <SvgXml xml={WORLD_CUP_UNMASKED} width={90} height={165} />
            </View>
            <Text variant="detail" color="slate">unmasked — a plain slab</Text>
          </View>
        </View>
      </View>

      {/* ── 2. BOTH RAIL SIZES, AS SHIPPED ──────────────────────────────── */}
      <View style={{ gap: 8 }}>
        <Text variant="cardTitle">2 · Every rail, both sizes</Text>
        <Text variant="detail" color="slate">
          default (46) is the pools tab · compact (30) is the home card
        </Text>
      </View>

      {ALL.map(([name, id]) => {
        const png = getCompetitionMarkPng(id);
        const stripe = getPoolStripe(id);
        return (
          <View key={id} style={{ flexDirection: 'row', gap: 10, alignItems: 'stretch', height: 100 }}>
            {/* as the POOLS TAB renders it */}
            <View style={{ width: 46, overflow: 'hidden', borderRadius: 6 }}>
              <CompetitionRail externalLeagueId={id} size="default" />
            </View>

            {/* as the HOME CARD renders it */}
            <View style={{ width: 30, overflow: 'hidden', borderRadius: 6 }}>
              <CompetitionRail externalLeagueId={id} size="compact" />
            </View>

            {/* the same asset drawn raw on a dark ground, bypassing the rail */}
            <View
              style={{
                width: 40, backgroundColor: '#222', borderRadius: 6,
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              {png ? (
                <Image source={png} style={{ width: 26, height: 40 }} resizeMode="contain" />
              ) : (
                <Text variant="caption">svg</Text>
              )}
            </View>

            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Text variant="body">{name} · {id}</Text>
              <Text variant="caption" color="slate">
                require → {png === null ? 'NULL (inline svg)' : `${typeof png}`}
              </Text>
              <Text variant="caption" color="slate">stripe {stripe[0]} → {stripe[1]}</Text>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}
