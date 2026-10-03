// One crew — playing now, all-time, past seasons, the people in it.
//
// The rules it shows (Ryan, 2026-10-02):
//   · Captain + co-captain add people (by exact username or email — AddPeopleSheet), remove people,
//     and rename; the captain alone names the co-captain. Removal is silent and keeps history.
//   · Anyone in the crew can join a running season they're not in, from here.
//   · Leaving is one tap; history stays; the captaincy passes on (said before the tap). Someone who
//     left can open this page and Rejoin; the removed can't see it at all (the API answers 404).
//   · Seasons · titles · best finish — never summed points. Last Man Standing has no rank.
//
// Reads GET /api/crews/:id (lib/crews/read.readCrew).

import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AddPeopleSheet, type AddPeopleSheetHandle } from '@/components/crews/AddPeopleSheet';
import { Card, Hint, Notice, Row, Section } from '@/components/crews/bits';
import { CrewFace } from '@/components/crews/CrewFace';
import { SettingsHeader } from '@/components/settings';
import { ConfirmDialog, Icon, PromptDialog } from '@/components/ui';
import { ActionSheet, type ActionSheetOption } from '@/components/ui/ActionSheet';
import {
  joinPoolById,
  leaveCrew,
  rejoinCrew,
  removeCrewMember,
  renameCrew,
  revokeCrewInvite,
  setCrewCoCaptain,
} from '@/lib/api';
import {
  finishText,
  leaveConsequence,
  ordinal,
  personName,
  plural,
  roleLabel,
  shortName,
  winnersText,
  type CrewDetail,
} from '@/lib/crews';
import { useHomeData } from '@/lib/HomeDataProvider';
import { useManualRefresh } from '@/lib/useManualRefresh';
import { invalidateCrews, useCrew } from '@/lib/useCrews';
import { fontFamilies, useTheme } from '@/theme';

type Member = CrewDetail['members'][number];
type MemberAction = 'co_captain' | 'remove';

export default function CrewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { refresh: refreshHomeData } = useHomeData();
  const { data: crew, isLoading, error, refetch } = useCrew(id);
  const { refreshing, onRefresh } = useManualRefresh(async () => {
    await refetch();
  });

  const addPeopleRef = useRef<AddPeopleSheetHandle | null>(null);
  const [selected, setSelected] = useState<Member | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<Member | null>(null);
  const [choosingCo, setChoosingCo] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function act(fn: () => Promise<unknown>, after?: () => void) {
    setBusy(true);
    setProblem(null);
    try {
      await fn();
      invalidateCrews(queryClient, id);
      after?.();
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'That didn’t work. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <Shell title="Crew">
        <View style={{ padding: theme.spacing.xl, alignItems: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      </Shell>
    );
  }
  if (error || !crew) {
    return (
      <Shell title="Crew">
        <Notice text="We couldn’t open this crew. It may have closed, or you may no longer be in it." action="Back" onAction={() => router.back()} />
      </Shell>
    );
  }

  const v = crew.viewer;
  const captain = crew.members.find((m) => m.role === 'captain') ?? null;
  const co = crew.members.find((m) => m.role === 'co_captain') ?? null;
  const memberOptions = (m: Member): ActionSheetOption<MemberAction>[] => {
    const out: ActionSheetOption<MemberAction>[] = [];
    if (v.canSetCoCaptain && m.role === 'member') out.push({ label: 'Make co-captain', value: 'co_captain', icon: 'star.fill' });
    const canRemove =
      v.canManage && m.role !== 'captain' && (m.role === 'member' || v.role === 'captain');
    if (canRemove) out.push({ label: 'Remove from crew', value: 'remove', icon: 'person.badge.minus', destructive: true });
    return out;
  };

  return (
    <Shell title="Crew" refreshing={refreshing} onRefresh={onRefresh} bottom={insets.bottom}>
      {!v.active && v.canRejoin ? (
        <Card>
          <View style={{ gap: theme.spacing.md }}>
            <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 15, color: theme.colors.ink }}>You left this crew</RNText>
            <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 13, color: theme.colors.slate }}>
              Rejoin to get a saved spot next season again. Your history is still here.
            </RNText>
            <PrimaryButton label={busy ? 'Rejoining…' : 'Rejoin'} disabled={busy} onPress={() => void act(() => rejoinCrew(crew.crew.crewId))} />
          </View>
        </Card>
      ) : null}

      <View style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.md }}>
          <RNText style={{ flex: 1, fontFamily: fontFamilies.black, fontSize: 26, color: theme.colors.ink }}>{crew.crew.name}</RNText>
          {v.canManage ? (
            <Pressable onPress={() => setRenaming(true)} hitSlop={8} accessibilityRole="button" style={{ paddingTop: 8 }}>
              <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 13, color: theme.colors.primary }}>Rename</RNText>
            </Pressable>
          ) : null}
        </View>
        <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 13, color: theme.colors.slate }}>
          {[
            plural(crew.members.length, 'person', 'people'),
            captain ? `Captain ${v.role === 'captain' ? 'you' : shortName(captain)}` : null,
            co ? `Co-captain ${v.role === 'co_captain' ? 'you' : shortName(co)}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </RNText>
      </View>

      {problem ? (
        <View style={{ padding: theme.spacing.md, borderRadius: theme.radii.md, backgroundColor: theme.colors.redLight }}>
          <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 13, color: theme.colors.red, textAlign: 'center' }}>{problem}</RNText>
        </View>
      ) : null}

      {v.role === 'captain' && !co && crew.members.length > 1 ? (
        <Pressable
          onPress={() => setChoosingCo(true)}
          accessibilityRole="button"
          style={({ pressed }) => ({
            flexDirection: 'row',
            gap: theme.spacing.sm,
            backgroundColor: theme.colors.amberLight,
            borderRadius: theme.radii.md,
            padding: theme.spacing.lg,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Icon name="star.fill" size={15} tint={theme.colors.amber} />
          <RNText style={{ flex: 1, fontFamily: fontFamilies.medium, fontSize: 13, lineHeight: 18, color: theme.colors.ink }}>
            <RNText style={{ fontFamily: fontFamilies.bold }}>Pick a co-captain</RNText>, so the crew isn’t stuck if
            you’re away.
          </RNText>
          <Icon name="chevron.right" tint={theme.colors.slate} size={11} weight="semibold" />
        </Pressable>
      ) : null}

      {crew.playingNow.length ? (
        <Section title="Playing now">
          <Card padded={false}>
            {crew.playingNow.map((p, i) => (
              <Row key={p.poolId} divider={i > 0} onPress={p.viewerIn ? () => router.push({ pathname: '/pool/[id]', params: { id: p.poolId } }) : undefined}>
                <View style={{ flex: 1, gap: 2 }}>
                  <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 15, color: theme.colors.ink }}>{p.competition}</RNText>
                  <RNText numberOfLines={1} style={{ fontFamily: fontFamilies.medium, fontSize: 12, color: theme.colors.slate }}>
                    {p.poolName} · {plural(p.players, 'player')} · run by {shortName(p.runBy)}
                  </RNText>
                  {p.seat === 'open' ? (
                    <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 11.5, color: theme.colors.primary }}>Your spot’s saved</RNText>
                  ) : null}
                </View>
                {p.viewerIn ? (
                  <>
                    {p.viewerRank !== null ? (
                      <View style={{ alignItems: 'flex-end' }}>
                        <RNText style={{ fontFamily: fontFamilies.black, fontSize: 17, color: theme.colors.ink }}>{ordinal(p.viewerRank)}</RNText>
                        <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 10.5, color: theme.colors.slate }}>you</RNText>
                      </View>
                    ) : null}
                    <Icon name="chevron.right" tint={theme.colors.slate} size={11} weight="semibold" />
                  </>
                ) : p.joinable ? (
                  <SmallButton
                    label="Join"
                    disabled={busy}
                    onPress={() =>
                      void act(
                        () => joinPoolById(p.poolId),
                        () => {
                          void refreshHomeData();
                          router.push({ pathname: '/pool/[id]', params: { id: p.poolId } });
                        },
                      )
                    }
                  />
                ) : null}
              </Row>
            ))}
          </Card>
          <Hint text="Any member can start a pool for the crew — whoever starts it runs that season." />
        </Section>
      ) : null}

      {crew.allTime.length ? (
        <Section title="All-time">
          <Card padded={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.md, paddingBottom: 4 }}>
              <View style={{ width: 18 }} />
              <View style={{ flex: 1 }} />
              {['SEASONS', 'TITLES', 'BEST'].map((c) => (
                <RNText key={c} style={{ width: 54, textAlign: 'right', fontFamily: fontFamilies.black, fontSize: 9.5, letterSpacing: 0.6, color: theme.colors.slate }}>
                  {c}
                </RNText>
              ))}
            </View>
            {crew.allTime.map((r, i) => (
              <Row key={r.userId} divider={i > 0}>
                <RNText style={{ width: 18, fontFamily: fontFamilies.black, fontSize: 13, color: theme.colors.slate }}>{i + 1}</RNText>
                <RNText numberOfLines={1} style={{ flex: 1, fontFamily: fontFamilies.bold, fontSize: 14, color: theme.colors.ink }}>
                  {shortName(r)}
                </RNText>
                <Num>{r.seasons}</Num>
                <Num>{r.titles}</Num>
                <Num>{r.best === null ? '—' : ordinal(r.best)}</Num>
              </Row>
            ))}
          </Card>
          <Hint text="Seasons, titles and best finish — never points added up across different games." />
        </Section>
      ) : null}

      {crew.pastSeasons.length ? (
        <Section title="Past seasons">
          <Card padded={false}>
            {crew.pastSeasons.map((p, i) => (
              <Row key={p.poolId} divider={i > 0} onPress={() => router.push({ pathname: '/pool/[id]', params: { id: p.poolId } })}>
                <View style={{ flex: 1, gap: 1 }}>
                  <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 14, color: theme.colors.ink }}>{p.competition}</RNText>
                  <RNText numberOfLines={1} style={{ fontFamily: fontFamilies.medium, fontSize: 11.5, color: theme.colors.slate }}>
                    {[p.poolName, winnersText(p.winners)].filter(Boolean).join(' · ')}
                  </RNText>
                </View>
                <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 12.5, color: theme.colors.slate }}>{finishText(p.viewerRank, p.players)}</RNText>
              </Row>
            ))}
          </Card>
        </Section>
      ) : null}

      <Section title="The crew" action={v.canManage ? 'Add people' : undefined} onAction={() => addPeopleRef.current?.open()}>
        <Card>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: theme.spacing.md }}>
            {crew.members.map((m) => {
              const tappable = memberOptions(m).length > 0;
              const label = roleLabel(m.role);
              return (
                <Pressable
                  key={m.userId}
                  disabled={!tappable}
                  onPress={() => setSelected(m)}
                  accessibilityRole={tappable ? 'button' : undefined}
                  accessibilityLabel={`${personName(m)}${label ? `, ${label}` : ''}`}
                  style={{ width: '25%', alignItems: 'center', gap: 4 }}
                >
                  <CrewFace person={m} size={44} />
                  <RNText numberOfLines={1} style={{ maxWidth: '92%', fontFamily: fontFamilies.bold, fontSize: 11.5, color: theme.colors.ink }}>
                    {shortName(m)}
                  </RNText>
                  {label ? (
                    <RNText style={{ fontFamily: fontFamilies.black, fontSize: 8.5, letterSpacing: 0.5, color: theme.colors.amber }}>
                      {label.toUpperCase()}
                    </RNText>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        </Card>
        {v.canManage && crew.invites && crew.invites.length > 0 ? (
          <Card padded={false}>
            <View style={{ paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.md, paddingBottom: 2 }}>
              <RNText style={{ fontFamily: fontFamilies.black, fontSize: 9.5, letterSpacing: 0.6, color: theme.colors.slate }}>INVITED · WAITING</RNText>
            </View>
            {crew.invites.map((inv, i) => (
              <Row key={inv.inviteId} divider={i > 0}>
                {inv.invitee ? <CrewFace person={inv.invitee} size={28} /> : <Icon name="envelope.fill" size={18} tint={theme.colors.slate} />}
                <RNText numberOfLines={1} style={{ flex: 1, fontFamily: fontFamilies.bold, fontSize: 14, color: theme.colors.ink }}>
                  {inv.invitee ? personName(inv.invitee) : inv.email}
                </RNText>
                <Pressable
                  onPress={() => void act(() => revokeCrewInvite(inv.inviteId))}
                  disabled={busy}
                  accessibilityRole="button"
                  hitSlop={8}
                >
                  <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 12.5, color: theme.colors.red }}>Withdraw</RNText>
                </Pressable>
              </Row>
            ))}
          </Card>
        ) : null}
        <Hint
          text={
            v.canManage
              ? 'Only you and your co-captain see who’s invited. Tap someone to make them co-captain or remove them — removed people aren’t told, and their history stays.'
              : 'The captain and co-captain add people by username or email. Anyone who plays in one of the crew’s pools is in automatically.'
          }
        />
      </Section>

      {v.active ? (
        <View style={{ alignItems: 'center', gap: 4, paddingTop: theme.spacing.sm }}>
          <Pressable onPress={() => setConfirmLeave(true)} accessibilityRole="button" hitSlop={8}>
            <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 14, color: theme.colors.red }}>Leave crew</RNText>
          </Pressable>
        </View>
      ) : null}

      <AddPeopleSheet ref={addPeopleRef} crewId={crew.crew.crewId} onChanged={() => invalidateCrews(queryClient, id)} />

      <ActionSheet<MemberAction>
        visible={selected !== null}
        title={selected ? personName(selected) : undefined}
        options={selected ? memberOptions(selected) : []}
        onClose={() => setSelected(null)}
        onSelect={(value) => {
          const m = selected;
          setSelected(null);
          if (!m) return;
          if (value === 'co_captain') void act(() => setCrewCoCaptain(crew.crew.crewId, m.userId));
          if (value === 'remove') setConfirmRemove(m);
        }}
      />

      <ActionSheet<string>
        visible={choosingCo}
        title="Pick a co-captain"
        options={crew.members
          .filter((m) => m.role === 'member')
          .map((m) => ({ label: personName(m), value: m.userId }))}
        onClose={() => setChoosingCo(false)}
        onSelect={(userId) => {
          setChoosingCo(false);
          void act(() => setCrewCoCaptain(crew.crew.crewId, userId));
        }}
      />

      <ConfirmDialog
        visible={confirmRemove !== null}
        title={confirmRemove ? `Remove ${shortName(confirmRemove)}?` : ''}
        description="They’ll stop getting a saved spot. They won’t be told, and their history stays."
        confirmLabel="Remove"
        cancelLabel="Cancel"
        destructive
        busy={busy}
        onCancel={() => setConfirmRemove(null)}
        onConfirm={() => {
          const m = confirmRemove;
          setConfirmRemove(null);
          if (m) void act(() => removeCrewMember(crew.crew.crewId, m.userId));
        }}
      />

      <ConfirmDialog
        visible={confirmLeave}
        title={`Leave ${crew.crew.name}?`}
        description={leaveConsequence(crew)}
        confirmLabel="Leave"
        cancelLabel="Stay"
        destructive
        busy={busy}
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => {
          setConfirmLeave(false);
          void act(() => leaveCrew(crew.crew.crewId), () => router.back());
        }}
      />

      <PromptDialog
        visible={renaming}
        title="Rename the crew"
        defaultValue={crew.crew.name}
        confirmLabel="Save"
        maxLength={60}
        busy={busy}
        onCancel={() => setRenaming(false)}
        onSubmit={(name) => {
          setRenaming(false);
          if (name.trim() && name.trim() !== crew.crew.name) void act(() => renameCrew(crew.crew.crewId, name.trim()));
        }}
      />
    </Shell>
  );
}

function Shell({
  title,
  children,
  refreshing,
  onRefresh,
  bottom = 0,
}: {
  title: string;
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  bottom?: number;
}) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <SettingsHeader title={title} />
      <ScrollView
        contentContainerStyle={{
          paddingTop: theme.spacing.md,
          paddingHorizontal: theme.spacing.xl,
          paddingBottom: theme.spacing.xxl + bottom,
          gap: theme.spacing.xl,
        }}
        refreshControl={
          onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} /> : undefined
        }
      >
        {children}
      </ScrollView>
    </View>
  );
}

function Num({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <RNText style={{ width: 54, textAlign: 'right', fontFamily: fontFamilies.black, fontSize: 14, fontVariant: ['tabular-nums'], color: theme.colors.ink }}>
      {children}
    </RNText>
  );
}

function SmallButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => ({
        paddingHorizontal: theme.spacing.md,
        paddingVertical: 6,
        borderRadius: theme.radii.pill,
        backgroundColor: theme.colors.primary,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 12, color: '#FFFFFF' }}>{label}</RNText>
    </Pressable>
  );
}

function PrimaryButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => ({
        height: 48,
        borderRadius: theme.radii.md,
        backgroundColor: theme.colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 15, color: '#FFFFFF' }}>{label}</RNText>
    </Pressable>
  );
}
