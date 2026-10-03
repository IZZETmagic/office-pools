// THROWAWAY — the My Crews concept, for review on the device. Fixture data only;
// nothing reads or writes. Delete this file (and its Stack.Screen + dev row) when
// the real build lands. The plan is drafts/2026-10-02_crews_plan.md.
//
// Mocks the nine decisions settled with Ryan on 2026-10-02:
//   1  Two ways in: PLAYED in one of the crew's pools (automatic), or ADDED by the
//      captain / co-captain by exact username or email (one Join tap). No friends
//      list — adding is a lookup, never a browse.
//   2  All three crew cards (saved spot, added-to-crew, keep this group) light the
//      Activity dot.
//   3  Exits stick. Leavers can Rejoin themselves; the removed only by being added back.
//   4  Co-captain is optional, with a standing nudge.
//   5  Saved spots inside a pool: a COUNT for members, NAMES for the pool admin.
//   6  Crew pools are always Private.
//   7  Saved spots never exceed the pool's tier cap — Go Plus, or choose who gets them.
//   8  (No email campaign — nothing to mock.)
//   9  Captainless crews pass to the longest-standing member.
//
// Six views: My Crews · Crew (as member or captain) · New crew · How it's made ·
// Held seat · Activity.

import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NeedsYouCard, deadlineLabel } from '@/components/activity/NeedsYouCard';
import { Icon } from '@/components/ui';
import type { NeedsYouItem } from '@/lib/useActivity';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type ViewKey = 'list' | 'crew' | 'new' | 'made' | 'seat' | 'activity';
const VIEWS: { key: ViewKey; label: string }[] = [
  { key: 'list', label: 'My Crews' },
  { key: 'crew', label: 'Crew' },
  { key: 'new', label: 'New crew' },
  { key: 'made', label: "How it's made" },
  { key: 'seat', label: 'Held seat' },
  { key: 'activity', label: 'Activity' },
];

// ── Fixtures ────────────────────────────────────────────────────────────────

type Crew = {
  id: string;
  name: string;
  people: number;
  seasons: number;
  since: string;
  status: { kind: 'live' | 'seat' | 'quiet'; text: string };
  leader: string;
  you: string;
};

const CREWS: Crew[] = [
  {
    id: 'office',
    name: 'Bermuda Office',
    people: 14,
    seasons: 3,
    since: 'Jun 2026',
    status: { kind: 'live', text: 'Premier League · matchweek 7' },
    leader: 'Dave leads all-time',
    you: 'You’re 4th all-time',
  },
  {
    id: 'fivea',
    name: 'Friday Five-a-side',
    people: 9,
    seasons: 2,
    since: 'Jun 2026',
    status: { kind: 'seat', text: 'Your spot’s saved · Champions League' },
    leader: 'You lead all-time',
    you: '1 title',
  },
  {
    id: 'family',
    name: 'The Family',
    people: 6,
    seasons: 1,
    since: 'Jun 2026',
    status: { kind: 'quiet', text: 'Last played World Cup 2026' },
    leader: 'Mum won the only season',
    you: 'You finished 3rd',
  },
];

const MEMBERS = [
  { name: 'Dave', role: 'Captain' },
  { name: 'Priya', role: 'Co-captain' },
  { name: 'You', role: null },
  { name: 'Marcus', role: null },
  { name: 'Aisha', role: null },
  { name: 'Tom', role: null },
  { name: 'Leah', role: null },
  { name: 'Sam', role: null },
  { name: 'Jordan', role: null },
  { name: 'Nia', role: null },
  { name: 'Chris', role: null },
  { name: 'Ella', role: null },
  { name: 'Ben', role: null },
  { name: 'Kai', role: null },
];

const ALL_TIME = [
  { name: 'Dave', seasons: 3, titles: 1, best: '1st' },
  { name: 'Priya', seasons: 3, titles: 1, best: '1st' },
  { name: 'Marcus', seasons: 3, titles: 0, best: '2nd' },
  { name: 'You', seasons: 3, titles: 0, best: '3rd' },
  { name: 'Aisha', seasons: 2, titles: 0, best: '2nd' },
];

const PAST = [
  { comp: 'World Cup 2026', mode: 'Bracket', winner: 'Dave', you: '3rd of 12' },
  { comp: 'World Cup 2026', mode: 'Showdown', winner: 'Priya', you: '5th of 10' },
];

// ── Screen ──────────────────────────────────────────────────────────────────

export default function CrewsConcept() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [view, setView] = useState<ViewKey>('list');

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <View
        style={{
          paddingTop: insets.top + theme.spacing.sm,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.sm,
          gap: theme.spacing.md,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={({ pressed }) => ({
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: withOpacity(theme.colors.ink, 0.06),
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Icon name="chevron.left" size={16} tint={theme.colors.ink} weight="semibold" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <RNText style={{ fontFamily: fontFamilies.black, fontSize: 20, color: theme.colors.ink }}>
              My Crews
            </RNText>
            <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 11, color: theme.colors.slate }}>
              Concept · the nine decisions of 2 Oct · nothing saves
            </RNText>
          </View>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {VIEWS.map((v) => (
            <Pill key={v.key} label={v.label} on={v.key === view} onPress={() => setView(v.key)} />
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingTop: theme.spacing.md,
          paddingHorizontal: theme.spacing.xl,
          paddingBottom: theme.spacing.xxl + insets.bottom,
          gap: theme.spacing.xl,
        }}
      >
        {view === 'list' ? <ListView onOpen={() => setView('crew')} onNew={() => setView('new')} /> : null}
        {view === 'crew' ? <CrewView /> : null}
        {view === 'new' ? <NewCrewView /> : null}
        {view === 'made' ? <MadeView /> : null}
        {view === 'seat' ? <SeatView /> : null}
        {view === 'activity' ? <ActivityView /> : null}
      </ScrollView>
    </View>
  );
}

// ── View 1: the list ────────────────────────────────────────────────────────

function ListView({ onOpen, onNew }: { onOpen: () => void; onNew: () => void }) {
  const theme = useTheme();
  return (
    <>
      <Pressable
        onPress={onNew}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          borderRadius: theme.radii.lg,
          borderWidth: 1.5,
          borderStyle: 'dashed',
          borderColor: withOpacity(theme.colors.primary, 0.5),
          paddingVertical: theme.spacing.md + 2,
          opacity: pressed ? 0.6 : 1,
        })}
      >
        <Icon name="plus" size={14} tint={theme.colors.primary} weight="semibold" />
        <RNText style={{ fontFamily: fontFamilies.black, fontSize: 14, color: theme.colors.primary }}>New crew</RNText>
      </Pressable>
      <View style={{ gap: theme.spacing.sm }}>
        {CREWS.map((c) => (
          <CrewCard key={c.id} crew={c} onPress={onOpen} />
        ))}
      </View>
      <Explainer text="A crew is a group you play with. You’re in one because you played in its pools, or because you said yes when its captain added you. Each new season you get a saved spot — use it or don’t. We’ll remind you once. Leave anytime." />
    </>
  );
}

function CrewCard({ crew, onPress }: { crew: Crew; onPress: () => void }) {
  const theme = useTheme();
  const tone =
    crew.status.kind === 'live'
      ? { bg: theme.colors.greenLight, ink: theme.colors.green }
      : crew.status.kind === 'seat'
        ? { bg: theme.colors.primaryLight, ink: theme.colors.primary }
        : { bg: theme.colors.mist, ink: theme.colors.slate };

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.lg,
        gap: theme.spacing.md,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <FaceStack count={crew.people} />
        <View style={{ flex: 1, gap: 1 }}>
          <RNText numberOfLines={1} style={{ fontFamily: fontFamilies.black, fontSize: 17, color: theme.colors.ink }}>
            {crew.name}
          </RNText>
          <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 12, color: theme.colors.slate }}>
            {crew.people} people · {crew.seasons} {crew.seasons === 1 ? 'season' : 'seasons'} since {crew.since}
          </RNText>
        </View>
        <Icon name="chevron.right" tint={theme.colors.slate} size={11} weight="semibold" />
      </View>
      <View
        style={{
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: tone.bg,
          borderRadius: theme.radii.pill,
          paddingHorizontal: 10,
          paddingVertical: 5,
        }}
      >
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone.ink }} />
        <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 12, color: tone.ink }}>{crew.status.text}</RNText>
      </View>
      <View style={{ flexDirection: 'row', gap: theme.spacing.lg }}>
        <Stat icon="trophy.fill" tint={theme.colors.amber} text={crew.leader} />
        <Stat icon="person.crop.circle" tint={theme.colors.slate} text={crew.you} />
      </View>
    </Pressable>
  );
}

// ── View 2: one crew, as a member or as its captain ─────────────────────────

function CrewView() {
  const theme = useTheme();
  const [asCaptain, setAsCaptain] = useState(false);

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 12, color: theme.colors.slate }}>Viewing as</RNText>
        <Pill label="Member" on={!asCaptain} onPress={() => setAsCaptain(false)} small />
        <Pill label="Captain" on={asCaptain} onPress={() => setAsCaptain(true)} small />
      </View>

      <View style={{ gap: 4 }}>
        <RNText style={{ fontFamily: fontFamilies.black, fontSize: 26, color: theme.colors.ink }}>Bermuda Office</RNText>
        <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 13, color: theme.colors.slate }}>
          14 people · 3 seasons since Jun 2026
        </RNText>
        <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 13, color: theme.colors.slate }}>
          Captain {asCaptain ? 'you' : 'Dave'} · Co-captain Priya
        </RNText>
      </View>

      <Section title="Playing now">
        <Card padded={false}>
          <Row divider={false}>
            <View style={{ flex: 1, gap: 2 }}>
              <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 15, color: theme.colors.ink }}>Premier League 26/27</RNText>
              <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 12, color: theme.colors.slate }}>
                Pick’em · 12 of 14 playing · run by Marcus
              </RNText>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <RNText style={{ fontFamily: fontFamilies.black, fontSize: 17, color: theme.colors.ink }}>3rd</RNText>
              <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 10.5, color: theme.colors.slate }}>you</RNText>
            </View>
            <Icon name="chevron.right" tint={theme.colors.slate} size={11} weight="semibold" />
          </Row>
          <Row divider>
            <View style={{ flex: 1, gap: 2 }}>
              <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 15, color: theme.colors.ink }}>Premier League 26/27</RNText>
              <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 12, color: theme.colors.slate }}>
                Last Man Standing · 8 playing · run by Aisha
              </RNText>
            </View>
            <SmallButton label="Join" primary />
          </Row>
        </Card>
        <Hint text="Any member can start a pool for the crew; whoever starts it runs that season. Missed your saved spot? A long competition stays joinable from here." />
      </Section>

      <Section title="All-time">
        <Card padded={false}>
          <TableHeader cols={['SEASONS', 'TITLES', 'BEST']} />
          {ALL_TIME.map((r, i) => (
            <Row key={r.name} divider={i > 0}>
              <RNText style={{ width: 18, fontFamily: fontFamilies.black, fontSize: 13, color: theme.colors.slate }}>
                {i + 1}
              </RNText>
              <RNText
                style={{
                  flex: 1,
                  fontFamily: r.name === 'You' ? fontFamilies.black : fontFamilies.bold,
                  fontSize: 14,
                  color: r.name === 'You' ? theme.colors.primary : theme.colors.ink,
                }}
              >
                {r.name}
              </RNText>
              <Num>{r.seasons}</Num>
              <Num>{r.titles}</Num>
              <Num>{r.best}</Num>
            </Row>
          ))}
        </Card>
        <Hint text="Seasons, titles and best finish — never points summed across different games." />
      </Section>

      <Section title="Past seasons">
        <Card padded={false}>
          {PAST.map((p, i) => (
            <Row key={p.mode} divider={i > 0}>
              <View style={{ flex: 1, gap: 1 }}>
                <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 14, color: theme.colors.ink }}>{p.comp}</RNText>
                <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 11.5, color: theme.colors.slate }}>
                  {p.mode} · won by {p.winner}
                </RNText>
              </View>
              <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 12.5, color: theme.colors.slate }}>{p.you}</RNText>
            </Row>
          ))}
        </Card>
      </Section>

      <Section title="The crew" action={asCaptain ? 'Add people' : undefined}>
        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: theme.spacing.md }}>
            {MEMBERS.map((m) => {
              // Viewing as captain: you hold the armband, so Dave is just a member here.
              const name = m.name;
              const role = asCaptain && m.name === 'You' ? 'Captain' : asCaptain && m.name === 'Dave' ? null : m.role;
              return (
                <View key={m.name} style={{ width: '25%', alignItems: 'center', gap: 4 }}>
                  <Face name={name} size={40} />
                  <RNText numberOfLines={1} style={{ fontFamily: fontFamilies.bold, fontSize: 11.5, color: theme.colors.ink }}>
                    {name}
                  </RNText>
                  {role ? (
                    <RNText style={{ fontFamily: fontFamilies.black, fontSize: 8.5, letterSpacing: 0.5, color: theme.colors.amber }}>
                      {role.toUpperCase()}
                    </RNText>
                  ) : null}
                </View>
              );
            })}
          </View>
        </Card>
        {asCaptain ? (
          <>
            <Card padded={false}>
              <SubHeader text="INVITED · WAITING" />
              {[
                { who: '@rob.k', how: 'Added by username' },
                { who: 'mia@example.com', how: 'Invite sent' },
              ].map((r, i) => (
                <Row key={r.who} divider={i > 0}>
                  <Icon name={r.who.startsWith('@') ? 'at.circle.fill' : 'envelope.fill'} size={18} tint={theme.colors.slate} />
                  <View style={{ flex: 1 }}>
                    <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 14, color: theme.colors.ink }}>{r.who}</RNText>
                    <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 11.5, color: theme.colors.slate }}>{r.how}</RNText>
                  </View>
                  <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 12.5, color: theme.colors.red }}>Withdraw</RNText>
                </Row>
              ))}
            </Card>
            <Hint text="Only you and your co-captain see who’s invited. Tap a member to make them co-captain or remove them — removed people aren’t told, and their history stays." />
          </>
        ) : (
          <Hint text="The captain and co-captain add people by username or email. Anyone who plays in one of the crew’s pools is in automatically." />
        )}
      </Section>

      <View style={{ alignItems: 'center', gap: 4 }}>
        <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 14, color: theme.colors.red }}>Leave crew</RNText>
        <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 11.5, color: theme.colors.slate, textAlign: 'center' }}>
          {asCaptain
            ? 'If you leave, Priya (co-captain) becomes captain. With no co-captain, the longest-standing member would.'
            : 'Your history stays, and you can rejoin from here any time. Joining one of the crew’s pools won’t re-add you on its own.'}
        </RNText>
      </View>
    </>
  );
}

// ── View 3: New crew — a lookup, never a browse ─────────────────────────────

function NewCrewView() {
  const theme = useTheme();
  const [picked, setPicked] = useState<string | null>(null);
  const matches = [
    { id: 'a', display: 'Dave Okafor', handle: '@Dave' },
    { id: 'b', display: 'Dave Lin', handle: '@dave' },
  ];

  return (
    <>
      <Card>
        <View style={{ gap: theme.spacing.md }}>
          <Field label="CREW NAME" value="Sunday League Lads" />

          <View style={{ gap: 6 }}>
            <Label text="ADD PEOPLE — USERNAME OR EMAIL" />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                backgroundColor: theme.colors.mist,
                borderRadius: theme.radii.sm,
                padding: theme.spacing.md,
              }}
            >
              <Icon name="magnifyingglass" size={14} tint={theme.colors.slate} />
              <RNText style={{ flex: 1, fontFamily: fontFamilies.semibold, fontSize: 14, color: theme.colors.ink }}>dave</RNText>
            </View>
            <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 11.5, color: theme.colors.slate, marginLeft: 2 }}>
              Two people have that username — which one?
            </RNText>
            <View style={{ borderRadius: theme.radii.sm, borderWidth: 1, borderColor: theme.colors.mist, overflow: 'hidden' }}>
              {matches.map((m, i) => {
                const on = picked === m.id;
                return (
                  <Pressable key={m.id} onPress={() => setPicked(on ? null : m.id)}>
                    <Row divider={i > 0}>
                      <Face name={m.display} size={32} />
                      <View style={{ flex: 1 }}>
                        <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 14, color: theme.colors.ink }}>{m.display}</RNText>
                        <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 11.5, color: theme.colors.slate }}>{m.handle}</RNText>
                      </View>
                      <SmallButton label={on ? 'Added' : 'Add'} primary={!on} />
                    </Row>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ gap: 6 }}>
            <Label text="WAITING ON" />
            {[
              ...(picked ? [{ who: matches.find((m) => m.id === picked)!.handle, how: 'Invited — they tap Join once' }] : []),
              { who: 'mia@example.com', how: 'Invite sent' },
            ].map((r) => (
              <View key={r.who} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Icon name="checkmark.circle.fill" size={16} tint={theme.colors.green} />
                <RNText style={{ flex: 1, fontFamily: fontFamilies.semibold, fontSize: 13, color: theme.colors.ink }}>{r.who}</RNText>
                <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 11.5, color: theme.colors.slate }}>{r.how}</RNText>
              </View>
            ))}
          </View>

          <Button label="Create crew" primary />
        </View>
      </Card>

      <Hint text="Exact matches only — no browsing, no suggestions, no “people you may know”. An email always says “Invite sent”, so it never reveals who’s on SportPool; if they aren’t, we send them one invite." />

      <View
        style={{
          flexDirection: 'row',
          gap: theme.spacing.sm,
          backgroundColor: theme.colors.amberLight,
          borderRadius: theme.radii.md,
          padding: theme.spacing.lg,
        }}
      >
        <Icon name="person.crop.circle" size={16} tint={theme.colors.amber} />
        <RNText style={{ flex: 1, fontFamily: fontFamilies.medium, fontSize: 12.5, lineHeight: 18, color: theme.colors.ink }}>
          After someone joins: <RNText style={{ fontFamily: fontFamilies.bold }}>Pick a co-captain</RNText>, so the crew
          isn’t stuck if you’re away. Optional — this stays on the crew page until you do.
        </RNText>
      </View>
    </>
  );
}

// ── View 4: the other ways a crew starts, and the create flow ───────────────

function MadeView() {
  const theme = useTheme();
  const [picked, setPicked] = useState('office');
  const options = [
    { id: 'office', label: 'Bermuda Office', sub: '14 people · 13 get a saved spot · Review' },
    { id: 'fivea', label: 'Friday Five-a-side', sub: '9 people · 8 get a saved spot · Review' },
    { id: 'none', label: 'No crew', sub: 'Share a link instead' },
  ];
  const crewPicked = picked !== 'none';

  return (
    <>
      <Section title="① When a pool ends — admin only">
        <Card>
          <View style={{ gap: theme.spacing.md }}>
            <FaceStack count={12} />
            <RNText style={{ fontFamily: fontFamilies.black, fontSize: 19, color: theme.colors.ink }}>
              World Cup 2026 is done. Keep this group together?
            </RNText>
            <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 13, color: theme.colors.slate, lineHeight: 18 }}>
              Save these 12 as a crew. Next time you start a pool, they each get a saved spot — nobody has to be
              chased.
            </RNText>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: theme.colors.mist,
                borderRadius: theme.radii.sm,
                padding: theme.spacing.md,
              }}
            >
              <View style={{ flex: 1 }}>
                <Label text="CO-CAPTAIN · OPTIONAL" />
                <RNText style={{ fontFamily: fontFamilies.semibold, fontSize: 14, color: theme.colors.slate, marginTop: 2 }}>
                  Pick one of the 12
                </RNText>
              </View>
              <Icon name="chevron.right" tint={theme.colors.slate} size={11} weight="semibold" />
            </View>
            <Button label="Save as a crew" primary />
            <Button label="Not now" />
          </View>
        </Card>
        <Hint text="The 12 aren’t asked anything — they’re in because they played. “Not now” removes this for good." />
      </Section>

      <Section title="② On the create flow’s name screen">
        <Card>
          <View style={{ gap: theme.spacing.md }}>
            <Field label="NAME" value="Bermuda Office — Champions League" />
            <View style={{ gap: 6 }}>
              <Label text="CREW" />
              {options.map((o) => {
                const on = picked === o.id;
                return (
                  <Pressable
                    key={o.id}
                    onPress={() => setPicked(o.id)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: theme.spacing.md,
                      padding: theme.spacing.md,
                      borderRadius: theme.radii.sm,
                      borderWidth: 1.5,
                      borderColor: on ? theme.colors.primary : theme.colors.mist,
                      backgroundColor: on ? theme.colors.primaryLight : 'transparent',
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 14, color: theme.colors.ink }}>{o.label}</RNText>
                      <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 11.5, color: theme.colors.slate }}>{o.sub}</RNText>
                    </View>
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        borderWidth: on ? 6 : 1.5,
                        borderColor: on ? theme.colors.primary : theme.colors.silver,
                      }}
                    />
                  </Pressable>
                );
              })}
            </View>
            <View style={{ gap: 6 }}>
              <Label text="WHO CAN JOIN" />
              {crewPicked ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    backgroundColor: theme.colors.mist,
                    borderRadius: theme.radii.sm,
                    padding: theme.spacing.md,
                  }}
                >
                  <Icon name="lock.fill" size={13} tint={theme.colors.slate} />
                  <View style={{ flex: 1 }}>
                    <RNText style={{ fontFamily: fontFamilies.semibold, fontSize: 14, color: theme.colors.ink }}>Private</RNText>
                    <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 11.5, color: theme.colors.slate }}>
                      Crew pools are always private: your crew gets saved spots, and anyone you share the link with can
                      join.
                    </RNText>
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Pill label="Private · code only" on onPress={() => {}} small />
                  <Pill label="Public · listed in Discover" on={false} onPress={() => {}} small />
                </View>
              )}
            </View>
            <Button label="Create pool" primary />
          </View>
        </Card>
        <Hint text="Pick a crew and they get saved spots (Review opens the roster — see Held seat). Pick “No crew” and it’s today’s pool, public or private — and at the end you’re offered ①." />
      </Section>

      <Section title="③ If the crew’s already playing it">
        <Card>
          <View style={{ gap: theme.spacing.md }}>
            <RNText style={{ fontFamily: fontFamilies.black, fontSize: 17, color: theme.colors.ink }}>
              Bermuda Office is already playing the Premier League
            </RNText>
            <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 13, color: theme.colors.slate, lineHeight: 18 }}>
              You’re running Pick’em. Start Last Man Standing alongside it?
            </RNText>
            <Button label="Start another" primary />
            <Button label="Go back" />
          </View>
        </Card>
        <Hint text="A confirm, not a block — two games on the same season is the range working." />
      </Section>

      <Explainer text="Three ways a crew starts: save a group after a pool (①), pick it when you create one (②), or New crew on My Crews. Adding someone is always an exact lookup — never a list to browse." />
    </>
  );
}

// ── View 5: held seat ───────────────────────────────────────────────────────

const ROSTER = [
  { name: 'Dave', reason: null },
  { name: 'Priya', reason: null },
  { name: 'Marcus', reason: null },
  { name: 'Aisha', reason: null },
  { name: 'Leah', reason: null },
  { name: 'Sam', reason: null },
  { name: 'Jordan', reason: null },
  { name: 'Nia', reason: null },
  { name: 'Chris', reason: null },
  { name: 'Tom', reason: 'Didn’t play last season' },
  { name: 'Ella', reason: 'Didn’t play last season' },
  { name: 'Ben', reason: 'Hasn’t opened SportPool in 6 months' },
  { name: 'Kai', reason: 'Hasn’t opened SportPool in 6 months' },
];
const FREE_SPOTS = 9; // a Free pool holds 10, and you're one of them

function SeatView() {
  const theme = useTheme();
  const [mode, setMode] = useState<'cap' | 'choose' | 'plus'>('cap');
  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set(ROSTER.filter((r) => !r.reason).map((r) => r.name)),
  );
  const over = ticked.size > FREE_SPOTS;
  const toggle = (n: string) =>
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  return (
    <>
      <Section title="What a member sees — Activity → Needs you">
        <CrewNeedsCard kind="seat" />
        <Hint text="Do nothing and the spot quietly goes at first lock. It never shows as an empty entry. We remind you once." />
      </Section>

      <Section title="What members see in the pool — a count">
        <Card padded={false}>
          <Row divider={false}>
            <Icon name="person.3.fill" size={14} tint={theme.colors.primary} />
            <RNText style={{ flex: 1, fontFamily: fontFamilies.bold, fontSize: 14, color: theme.colors.ink }}>
              Part of Bermuda Office
            </RNText>
            <Icon name="chevron.right" tint={theme.colors.slate} size={11} weight="semibold" />
          </Row>
          <Row divider>
            <RNText style={{ flex: 1, fontFamily: fontFamilies.semibold, fontSize: 14, color: theme.colors.ink }}>
              <RNText style={{ color: theme.colors.green, fontFamily: fontFamilies.black }}>9 in</RNText> · 3 spots saved
            </RNText>
            <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 11.5, color: theme.colors.slate }}>until Tue 5:45 pm</RNText>
          </Row>
        </Card>
        <Hint text="Never whose. Gone at first lock." />
      </Section>

      <Section title="What the pool admin sees — Members tab">
        <Card padded={false}>
          <SubHeader text="SPOTS SAVED · 3" />
          {['Tom', 'Ella', 'Jordan'].map((n, i) => (
            <Row key={n} divider={i > 0}>
              <Face name={n} size={28} />
              <RNText style={{ flex: 1, fontFamily: fontFamilies.bold, fontSize: 14, color: theme.colors.ink }}>{n}</RNText>
              <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 12, color: theme.colors.slate }}>Waiting</RNText>
            </Row>
          ))}
        </Card>
        <Hint text="Only the pool’s admin sees these names. Declined spots aren’t listed. We send the one reminder — nobody has to chase." />
      </Section>

      <Section title="Roster review — whoever starts the pool">
        <Card>
          <View style={{ gap: theme.spacing.md }}>
            <View>
              <RNText style={{ fontFamily: fontFamilies.black, fontSize: 17, color: theme.colors.ink }}>Bermuda Office · 14 people</RNText>
              <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 13, color: theme.colors.slate }}>
                {mode === 'plus' ? 'Plus holds 30 — everyone gets a saved spot.' : 'A Free pool holds 10.'}
              </RNText>
            </View>
            {mode === 'plus' ? (
              <Pressable onPress={() => setMode('cap')}>
                <Button label="Back to Free" />
              </Pressable>
            ) : (
              <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Pressable onPress={() => setMode('plus')}>
                    <Button label="Go Plus · room for 30" primary />
                  </Pressable>
                </View>
              </View>
            )}
            {mode !== 'plus' ? (
              <Pressable onPress={() => setMode(mode === 'choose' ? 'cap' : 'choose')}>
                <Button label={`Choose who gets the ${FREE_SPOTS} spots`} />
              </Pressable>
            ) : null}
          </View>
        </Card>

        {mode === 'choose' ? (
          <Card padded={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.md }}>
              <RNText style={{ flex: 1, fontFamily: fontFamilies.black, fontSize: 9.5, letterSpacing: 0.6, color: theme.colors.slate }}>
                WHO GETS A SAVED SPOT
              </RNText>
              <RNText
                style={{
                  fontFamily: fontFamilies.black,
                  fontSize: 12,
                  color: over ? theme.colors.red : theme.colors.green,
                }}
              >
                {ticked.size} of {FREE_SPOTS}
              </RNText>
            </View>
            {ROSTER.map((r, i) => {
              const on = ticked.has(r.name);
              return (
                <Pressable key={r.name} onPress={() => toggle(r.name)}>
                  <Row divider={i > 0}>
                    <Icon
                      name={on ? 'checkmark.circle.fill' : 'circle'}
                      size={20}
                      tint={on ? theme.colors.primary : theme.colors.silver}
                    />
                    <View style={{ flex: 1 }}>
                      <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 14, color: theme.colors.ink }}>{r.name}</RNText>
                      {r.reason ? (
                        <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 11.5, color: theme.colors.amber }}>{r.reason}</RNText>
                      ) : null}
                    </View>
                  </Row>
                </Pressable>
              );
            })}
          </Card>
        ) : null}
        <Hint
          text={
            mode === 'choose'
              ? 'We start by leaving out people who didn’t play last season or haven’t been around — change it however you like. Nobody unticked is told, and they stay in the crew. Upgrade before first lock and you can give them spots too.'
              : 'A saved spot is always a real promise: we never save more spots than the pool can hold, so nobody finds out at the door.'
          }
        />
      </Section>
    </>
  );
}

// ── View 6: Activity → Needs you ────────────────────────────────────────────

/** A real-shaped pick item, drawn by the live NeedsYouCard, for scale. */
const PICK_ITEM: NeedsYouItem = {
  id: 'fixture-pick',
  kind: 'pick',
  pool_id: 'fixture',
  pool_name: 'Bermuda Office',
  entry_id: 'fixture',
  title: 'Matchweek 8 picks',
  subtitle: 'Bermuda Office · Premier League',
  deadline_at: new Date(Date.now() + 5 * 3_600_000).toISOString(),
  made: 4,
  total: 10,
  cta: 'Make picks',
  link: { pathname: '/', params: {} },
};

function ActivityView() {
  const theme = useTheme();
  return (
    <>
      <View style={{ gap: theme.spacing.sm + 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.sm, marginLeft: 4 }}>
          <RNText style={{ fontFamily: fontFamilies.black, fontSize: 20, color: theme.colors.ink }}>Needs you</RNText>
          <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 14, color: theme.colors.slate }}>4</RNText>
        </View>
        <NeedsYouCard item={PICK_ITEM} onPress={() => {}} />
        <CrewNeedsCard kind="seat" />
        <CrewNeedsCard kind="invite" />
        <CrewNeedsCard kind="save" />
      </View>

      <Section title="The rules">
        <Card>
          <View style={{ gap: theme.spacing.md }}>
            <Rule
              title="Saved spot — every crew member"
              body="Appears when the crew starts a pool. Sorted with picks by deadline: its deadline is first lock. Gone when you take it, decline it, or the pool locks."
            />
            <Rule
              title="Added to a crew — whoever was added"
              body="The captain or co-captain added you by username or email. Join once and you’re in like everyone else. “No thanks” means that crew can’t add you again."
            />
            <Rule
              title="Keep this group? — the pool admin only"
              body="Appears when a crewless pool finishes. No deadline, so it sorts last. “Not now” removes it for good."
            />
            <Rule title="The dot" body="All three light the Activity tab dot, like any Needs you card." />
            <Rule
              title="Not here"
              body="Nothing about other people’s choices. Who hasn’t taken a spot is shown only to the pool’s admin, in the Members tab."
            />
          </View>
        </Card>
      </Section>
    </>
  );
}

function Rule({ title, body }: { title: string; body: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 2 }}>
      <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 13.5, color: theme.colors.ink }}>{title}</RNText>
      <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 12, lineHeight: 17, color: theme.colors.slate }}>{body}</RNText>
    </View>
  );
}

/**
 * The three crew decisions, in NeedsYouCard's visual language: primary border,
 * title + subtitle, a pill top-right when there's a deadline, an action row at the
 * bottom. Crew cards carry a small eyebrow, and two buttons where a pick has one —
 * every crew decision can be a no.
 */
function CrewNeedsCard({ kind }: { kind: 'seat' | 'save' | 'invite' }) {
  const theme = useTheme();
  const lockAt = new Date(Date.now() + 4 * 86_400_000 + 3 * 3_600_000).toISOString();
  const copy = {
    seat: {
      eyebrow: 'FRIDAY FIVE-A-SIDE',
      title: 'Your spot’s saved',
      sub: 'Champions League · Pick’em',
      foot: '6 of 9 in',
      no: 'Not this one',
      yes: 'I’m in',
    },
    invite: {
      eyebrow: 'BERMUDA OFFICE · CREW',
      title: 'Dave added you to Bermuda Office',
      sub: '14 people · playing the Premier League',
      foot: 'Join once',
      no: 'No thanks',
      yes: 'Join',
    },
    save: {
      eyebrow: 'WORLD CUP 2026 · FINISHED',
      title: 'Keep this group together?',
      sub: 'Save these 12 as a crew for next time',
      foot: 'Only you see this',
      no: 'Not now',
      yes: 'Save as crew',
    },
  }[kind];

  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.md,
        borderWidth: 1.5,
        borderColor: theme.colors.primary,
        padding: theme.spacing.md + 2,
        gap: theme.spacing.sm + 2,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Icon name="person.3.fill" size={11} tint={theme.colors.primary} />
            <RNText style={{ fontFamily: fontFamilies.black, fontSize: 9.5, letterSpacing: 0.6, color: theme.colors.primary }}>
              {copy.eyebrow}
            </RNText>
          </View>
          <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 15, color: theme.colors.ink }}>{copy.title}</RNText>
          <RNText numberOfLines={1} style={{ fontFamily: fontFamilies.medium, fontSize: 12, color: theme.colors.slate }}>
            {copy.sub}
          </RNText>
        </View>
        {kind === 'seat' ? (
          <View
            style={{
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: 3,
              borderRadius: theme.radii.pill,
              backgroundColor: theme.colors.amberLight,
            }}
          >
            <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 11, color: theme.colors.amber }}>{deadlineLabel(lockAt)}</RNText>
          </View>
        ) : null}
      </View>

      {kind === 'seat' ? <FaceRow /> : <FaceStack count={kind === 'save' ? 12 : 14} />}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <RNText style={{ flex: 1, fontFamily: fontFamilies.medium, fontSize: 12, color: theme.colors.slate }}>{copy.foot}</RNText>
        <SmallButton label={copy.no} />
        <SmallButton label={copy.yes} primary />
      </View>
    </View>
  );
}

/** Who's already in — faces only, never who isn't. */
function FaceRow() {
  return (
    <View style={{ flexDirection: 'row' }}>
      {['Dave', 'Priya', 'Marcus', 'Aisha', 'Leah', 'Sam'].map((n, i) => (
        <View key={n} style={{ marginLeft: i === 0 ? 0 : -6 }}>
          <Face name={n} size={24} />
        </View>
      ))}
    </View>
  );
}

function SmallButton({ label, primary = false }: { label: string; primary?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.md,
        paddingVertical: 6,
        borderRadius: theme.radii.pill,
        backgroundColor: primary ? theme.colors.primary : theme.colors.mist,
      }}
    >
      <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 12, color: primary ? '#FFFFFF' : theme.colors.ink }}>
        {label}
      </RNText>
    </View>
  );
}

function Pill({ label, on, onPress, small = false }: { label: string; on: boolean; onPress: () => void; small?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: small ? 10 : 12,
        paddingVertical: small ? 5 : 7,
        borderRadius: theme.radii.pill,
        backgroundColor: on ? theme.colors.ink : theme.colors.mist,
      }}
    >
      <RNText style={{ fontFamily: fontFamilies.bold, fontSize: small ? 11.5 : 12.5, color: on ? theme.colors.snow : theme.colors.ink }}>
        {label}
      </RNText>
    </Pressable>
  );
}

function Label({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <RNText style={{ fontFamily: fontFamilies.black, fontSize: 9.5, letterSpacing: 0.6, color: theme.colors.slate }}>{text}</RNText>
  );
}

function SubHeader({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View style={{ paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.md, paddingBottom: 2 }}>
      <Label text={text} />
    </View>
  );
}

// ── Bits ────────────────────────────────────────────────────────────────────

const FACE_TINTS = ['#3B6EFF', '#22C55E', '#F59E0B', '#EF4444', '#8B5CF6', '#14B8A6'];

function Face({ name, size }: { name: string; size: number }) {
  const tint = FACE_TINTS[name.charCodeAt(0) % FACE_TINTS.length];
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: withOpacity(tint, 0.18),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <RNText style={{ fontFamily: fontFamilies.black, fontSize: size * 0.4, color: tint }}>{name[0]}</RNText>
    </View>
  );
}

function FaceStack({ count }: { count: number }) {
  const theme = useTheme();
  const names = MEMBERS.slice(0, 3).map((m) => m.name);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {names.map((n, i) => (
        <View
          key={n}
          style={{ marginLeft: i === 0 ? 0 : -10, borderRadius: 18, borderWidth: 2, borderColor: theme.colors.surface }}
        >
          <Face name={n} size={32} />
        </View>
      ))}
      <View
        style={{
          marginLeft: -10,
          width: 36,
          height: 36,
          borderRadius: 18,
          borderWidth: 2,
          borderColor: theme.colors.surface,
          backgroundColor: theme.colors.mist,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <RNText style={{ fontFamily: fontFamilies.black, fontSize: 11, color: theme.colors.slate }}>+{count - 3}</RNText>
      </View>
    </View>
  );
}

function Stat({ icon, tint, text }: { icon: string; tint: string; text: string }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Icon name={icon} size={12} tint={tint} />
      <RNText style={{ fontFamily: fontFamilies.semibold, fontSize: 12, color: theme.colors.ink }}>{text}</RNText>
    </View>
  );
}

function Section({ title, action, children }: { title: string; action?: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <RNText style={{ flex: 1, fontFamily: fontFamilies.black, fontSize: 15, color: theme.colors.ink }}>{title}</RNText>
        {action ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="plus" size={12} tint={theme.colors.primary} weight="semibold" />
            <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 13, color: theme.colors.primary }}>{action}</RNText>
          </View>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function Card({ children, padded = true }: { children: React.ReactNode; padded?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: padded ? theme.spacing.lg : 0,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

function Row({ children, divider }: { children: React.ReactNode; divider: boolean }) {
  const theme = useTheme();
  return (
    <View>
      {divider ? (
        <View style={{ height: 0.5, marginLeft: theme.spacing.md, backgroundColor: withOpacity(theme.colors.slate, 0.15) }} />
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.md - 2,
        }}
      >
        {children}
      </View>
    </View>
  );
}

function TableHeader({ cols }: { cols: string[] }) {
  const theme = useTheme();
  const t = { fontFamily: fontFamilies.black, fontSize: 9.5, letterSpacing: 0.6, color: theme.colors.slate };
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingHorizontal: theme.spacing.md,
        paddingTop: theme.spacing.md,
        paddingBottom: 4,
      }}
    >
      <View style={{ width: 18 }} />
      <View style={{ flex: 1 }} />
      {cols.map((c) => (
        <RNText key={c} style={{ ...t, width: 52, textAlign: 'right' }}>
          {c}
        </RNText>
      ))}
    </View>
  );
}

function Num({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <RNText
      style={{
        width: 52,
        textAlign: 'right',
        fontFamily: fontFamilies.black,
        fontSize: 14,
        fontVariant: ['tabular-nums'],
        color: theme.colors.ink,
      }}
    >
      {children}
    </RNText>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <RNText style={{ fontFamily: fontFamilies.black, fontSize: 9.5, letterSpacing: 0.6, color: theme.colors.slate }}>{label}</RNText>
      <View style={{ backgroundColor: theme.colors.mist, borderRadius: theme.radii.sm, padding: theme.spacing.md }}>
        <RNText style={{ fontFamily: fontFamilies.semibold, fontSize: 14, color: theme.colors.ink }}>{value}</RNText>
      </View>
    </View>
  );
}

function Button({ label, primary = false }: { label: string; primary?: boolean }) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: primary ? theme.colors.primary : theme.colors.mist,
        borderRadius: theme.radii.pill,
        paddingVertical: 13,
        alignItems: 'center',
      }}
    >
      <RNText style={{ fontFamily: fontFamilies.black, fontSize: 14.5, color: primary ? '#FFFFFF' : theme.colors.ink }}>
        {label}
      </RNText>
    </View>
  );
}

function Hint({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 11.5, lineHeight: 16, color: theme.colors.slate, paddingHorizontal: 4 }}>
      {text}
    </RNText>
  );
}

function Explainer({ text }: { text: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.mist,
        borderRadius: theme.radii.md,
        padding: theme.spacing.lg,
        flexDirection: 'row',
        gap: theme.spacing.sm,
      }}
    >
      <Icon name="person.3.fill" size={14} tint={theme.colors.slate} />
      <RNText style={{ flex: 1, fontFamily: fontFamilies.medium, fontSize: 12.5, lineHeight: 18, color: theme.colors.ink }}>
        {text}
      </RNText>
    </View>
  );
}
