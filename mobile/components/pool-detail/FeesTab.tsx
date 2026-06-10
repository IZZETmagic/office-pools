// Admin-only Fee Management tab — mobile parity with the web's FeesTab
// (app/pools/[pool_id]/admin/FeesTab.tsx). Same feature surface:
//   1. Summary card: per-entry fee, totals (entries / paid / unpaid /
//      collection rate %), amount collected vs expected, progress bar.
//   2. Filter pills: All / Unpaid / Paid.
//   3. Per-member cards with per-entry Mark Paid / Mark Unpaid actions
//      and a Mark All Paid shortcut when a member has 2+ unpaid entries.
//   4. Empty states for "no entries yet" and "everything's paid".
//
// Reads `pool_members` with embedded users + pool_entries directly via the
// supabase client (same pattern as useMemberRoster / SettingsTab.handleSave).
// Mutations update pool_entries.fee_paid + fee_paid_at on the matching
// entry_id. After every mutation we re-fetch the list so the summary
// counters and the row badges re-settle in one render pass.

import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text as RNText, View } from 'react-native';

import { Icon } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import type { PoolDetailInfo } from '@/lib/usePoolDetail';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type Props = {
  pool: PoolDetailInfo;
};

type Entry = {
  entryId: string;
  entryName: string;
  entryNumber: number;
  feePaid: boolean;
  feePaidAt: string | null;
  createdAt: string;
};

type Member = {
  memberId: string;
  username: string;
  fullName: string | null;
  entries: Entry[];
};

type Filter = 'all' | 'unpaid' | 'paid';

type DbRow = {
  member_id: string;
  users:
    | { username: string | null; full_name: string | null }
    | Array<{ username: string | null; full_name: string | null }>
    | null;
  pool_entries:
    | Array<{
        entry_id: string;
        entry_name: string;
        entry_number: number;
        fee_paid: boolean | null;
        fee_paid_at: string | null;
        created_at: string;
      }>
    | null;
};

export function FeesTab({ pool }: Props) {
  const theme = useTheme();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const entryFee = pool.entryFee ?? 0;
  const currency = pool.entryFeeCurrency || 'USD';

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('pool_members')
        .select(
          'member_id, users:user_id(username, full_name), pool_entries(entry_id, entry_name, entry_number, fee_paid, fee_paid_at, created_at)',
        )
        .eq('pool_id', pool.poolId);
      if (error) throw error;
      const rows = (data as DbRow[] | null) ?? [];
      const list: Member[] = rows.map((r) => {
        const user = Array.isArray(r.users) ? r.users[0] : r.users;
        const entries = (r.pool_entries ?? [])
          .slice()
          .sort((a, b) => a.entry_number - b.entry_number)
          .map((e) => ({
            entryId: e.entry_id,
            entryName: e.entry_name,
            entryNumber: e.entry_number,
            feePaid: !!e.fee_paid,
            feePaidAt: e.fee_paid_at,
            createdAt: e.created_at,
          }));
        return {
          memberId: r.member_id,
          username: user?.username ?? '',
          fullName: user?.full_name ?? null,
          entries,
        };
      });
      setMembers(list);
    } catch (err) {
      console.warn('[FeesTab.load]', err);
    } finally {
      setLoading(false);
    }
  }, [pool.poolId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleToggleFee(entry: Entry) {
    if (mutating) return;
    setMutating(true);
    const newPaid = !entry.feePaid;
    try {
      const { error } = await supabase
        .from('pool_entries')
        .update({
          fee_paid: newPaid,
          fee_paid_at: newPaid ? new Date().toISOString() : null,
        })
        .eq('entry_id', entry.entryId);
      if (error) throw error;
      await load();
    } catch (err) {
      Alert.alert(
        "Couldn't update fee status",
        err instanceof Error ? err.message : 'Unknown error',
      );
    } finally {
      setMutating(false);
    }
  }

  async function handleMarkAllPaid(member: Member) {
    if (mutating) return;
    const unpaid = member.entries.filter((e) => !e.feePaid);
    if (unpaid.length === 0) return;
    setMutating(true);
    let succeeded = 0;
    let failed = 0;
    try {
      for (const entry of unpaid) {
        const { error } = await supabase
          .from('pool_entries')
          .update({ fee_paid: true, fee_paid_at: new Date().toISOString() })
          .eq('entry_id', entry.entryId);
        if (error) {
          failed += 1;
          break;
        }
        succeeded += 1;
      }
      await load();
      if (failed > 0) {
        Alert.alert(
          'Partial update',
          `Marked ${succeeded} paid, ${unpaid.length - succeeded} failed. Please retry.`,
        );
      }
    } finally {
      setMutating(false);
    }
  }

  // Cross-member totals — driven off the raw `members` list, not the
  // filtered view, so swapping the filter pill doesn't rewrite the
  // summary numbers (web parity).
  const membersWithEntries = members.filter((m) => m.entries.length > 0);
  const allEntries = membersWithEntries.flatMap((m) => m.entries);
  const totalEntries = allEntries.length;
  const paidEntries = allEntries.filter((e) => e.feePaid).length;
  const unpaidEntries = totalEntries - paidEntries;
  const collectionRate = totalEntries > 0 ? Math.round((paidEntries / totalEntries) * 100) : 0;
  const amountCollected = paidEntries * entryFee;
  const amountExpected = totalEntries * entryFee;

  const filteredMembers = membersWithEntries
    .map((m) => {
      if (filter === 'unpaid') {
        const unpaid = m.entries.filter((e) => !e.feePaid);
        return unpaid.length > 0 ? { ...m, entries: unpaid } : null;
      }
      if (filter === 'paid') {
        const paid = m.entries.filter((e) => e.feePaid);
        return paid.length > 0 ? { ...m, entries: paid } : null;
      }
      return m;
    })
    .filter((m): m is Member => m !== null)
    .sort((a, b) => {
      const aUnpaid = a.entries.filter((e) => !e.feePaid).length;
      const bUnpaid = b.entries.filter((e) => !e.feePaid).length;
      if (aUnpaid > 0 && bUnpaid === 0) return -1;
      if (aUnpaid === 0 && bUnpaid > 0) return 1;
      return a.username.localeCompare(b.username);
    });

  if (loading && members.length === 0) {
    return (
      <View style={{ paddingVertical: theme.spacing.xxxl, alignItems: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.md,
        paddingBottom: theme.spacing.xxxl,
        gap: theme.spacing.lg,
      }}
    >
      {/* Summary */}
      <Card>
        <Caption>Fee Collection</Caption>
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 18,
            color: theme.colors.ink,
            marginTop: 2,
          }}
        >
          {formatFee(entryFee, currency)} per entry
        </RNText>

        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            marginTop: theme.spacing.sm,
          }}
        >
          <StatCell label="Total Entries" value={String(totalEntries)} tint={theme.colors.ink} />
          <StatCell label="Paid" value={String(paidEntries)} tint={theme.colors.green} />
          <StatCell label="Unpaid" value={String(unpaidEntries)} tint={theme.colors.amber} />
          <StatCell
            label="Collection"
            value={`${collectionRate}%`}
            tint={theme.colors.ink}
          />
        </View>

        <RNText
          style={{
            fontFamily: fontFamilies.medium,
            fontSize: 12,
            color: theme.colors.slate,
            marginTop: theme.spacing.sm,
          }}
        >
          {formatFee(amountCollected, currency)} of {formatFee(amountExpected, currency)} collected
        </RNText>

        <View
          style={{
            marginTop: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: withOpacity(theme.colors.silver, 0.5),
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${collectionRate}%`,
              height: '100%',
              backgroundColor: theme.colors.green,
            }}
          />
        </View>
      </Card>

      {/* Filter pills */}
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <FilterPill label="All" active={filter === 'all'} onPress={() => setFilter('all')} />
        <FilterPill
          label="Unpaid"
          active={filter === 'unpaid'}
          onPress={() => setFilter('unpaid')}
        />
        <FilterPill label="Paid" active={filter === 'paid'} onPress={() => setFilter('paid')} />
      </View>

      {/* List / empty state */}
      {membersWithEntries.length === 0 ? (
        <Card>
          <EmptyState
            icon="person.3"
            title="No entries yet"
            body="Members will appear here once they join and create entries."
          />
        </Card>
      ) : filteredMembers.length === 0 ? (
        <Card>
          {filter === 'unpaid' ? (
            <EmptyState
              icon="checkmark.circle.fill"
              tint={theme.colors.green}
              title="All entries are paid"
              body="Nice — everyone's settled up."
            />
          ) : (
            <EmptyState
              icon="dollarsign.circle"
              title="No entries marked paid yet"
              body="Mark entries as paid from the All tab to see them here."
            />
          )}
        </Card>
      ) : (
        filteredMembers.map((member) => (
          <MemberCard
            key={member.memberId}
            member={member}
            disabled={mutating}
            onToggleFee={handleToggleFee}
            onMarkAllPaid={() => handleMarkAllPaid(member)}
          />
        ))
      )}
    </View>
  );
}

// --- Member card ------------------------------------------------------

function MemberCard({
  member,
  disabled,
  onToggleFee,
  onMarkAllPaid,
}: {
  member: Member;
  disabled: boolean;
  onToggleFee: (entry: Entry) => void;
  onMarkAllPaid: () => void;
}) {
  const theme = useTheme();
  const totalEntries = member.entries.length;
  const memberPaid = member.entries.filter((e) => e.feePaid).length;
  const memberUnpaid = totalEntries - memberPaid;
  const allPaid = memberPaid === totalEntries;

  return (
    <Card>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          flexWrap: 'wrap',
        }}
      >
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 14,
            color: theme.colors.ink,
          }}
          numberOfLines={1}
        >
          {member.fullName ?? `@${member.username || 'member'}`}
        </RNText>
        {member.fullName && member.username ? (
          <RNText
            style={{
              fontFamily: fontFamilies.regular,
              fontSize: 12,
              color: theme.colors.slate,
              flexShrink: 1,
            }}
            numberOfLines={1}
          >
            @{member.username}
          </RNText>
        ) : null}
        <View style={{ flex: 1 }} />
        <RNText
          style={{
            fontFamily: fontFamilies.medium,
            fontSize: 11,
            color: allPaid ? theme.colors.green : theme.colors.slate,
          }}
        >
          {memberPaid}/{totalEntries} paid
        </RNText>
      </View>

      {memberUnpaid > 1 ? (
        <Pressable
          onPress={onMarkAllPaid}
          disabled={disabled}
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
            marginTop: theme.spacing.sm,
            paddingHorizontal: theme.spacing.md,
            paddingVertical: 6,
            borderRadius: theme.radii.pill,
            backgroundColor: withOpacity(theme.colors.green, 0.14),
            opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
          })}
        >
          <RNText
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 12,
              color: theme.colors.green,
            }}
          >
            Mark All Paid
          </RNText>
        </Pressable>
      ) : null}

      <View style={{ marginTop: theme.spacing.sm }}>
        {member.entries.map((entry, i) => (
          <View key={entry.entryId}>
            {i > 0 ? (
              <View
                style={{
                  height: 0.5,
                  backgroundColor: withOpacity(theme.colors.silver, 0.5),
                }}
              />
            ) : null}
            <EntryRow entry={entry} disabled={disabled} onToggle={() => onToggleFee(entry)} />
          </View>
        ))}
      </View>
    </Card>
  );
}

function EntryRow({
  entry,
  disabled,
  onToggle,
}: {
  entry: Entry;
  disabled: boolean;
  onToggle: () => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.sm,
        paddingVertical: 10,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <RNText
          style={{
            fontFamily: fontFamilies.semibold,
            fontSize: 13,
            color: theme.colors.ink,
          }}
          numberOfLines={1}
        >
          {entry.entryName}{' '}
          <RNText
            style={{
              fontFamily: fontFamilies.regular,
              fontSize: 12,
              color: theme.colors.slate,
            }}
          >
            #{entry.entryNumber}
          </RNText>
        </RNText>
        <RNText
          style={{
            fontFamily: fontFamilies.regular,
            fontSize: 11,
            color: theme.colors.slate,
          }}
        >
          Created {formatDate(entry.createdAt)}
          {entry.feePaid && entry.feePaidAt ? ` · Paid ${formatDate(entry.feePaidAt)}` : ''}
        </RNText>
      </View>
      <Pressable
        onPress={onToggle}
        disabled={disabled}
        style={({ pressed }) => ({
          paddingHorizontal: theme.spacing.md,
          paddingVertical: 6,
          borderRadius: theme.radii.pill,
          backgroundColor: entry.feePaid
            ? withOpacity(theme.colors.slate, 0.12)
            : withOpacity(theme.colors.green, 0.14),
          opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
        })}
      >
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 12,
            color: entry.feePaid ? theme.colors.slate : theme.colors.green,
          }}
        >
          {entry.feePaid ? 'Mark Unpaid' : 'Mark Paid'}
        </RNText>
      </Pressable>
    </View>
  );
}

// --- Shared helpers ---------------------------------------------------

function Card({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.lg,
        gap: 6,
        ...theme.shadows.card,
      }}
    >
      {children}
    </View>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <RNText
      style={{
        fontFamily: fontFamilies.bold,
        fontSize: 11,
        color: theme.colors.slate,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </RNText>
  );
}

function StatCell({
  label,
  value,
  tint,
}: {
  label: string;
  value: string;
  tint: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ width: '50%', paddingVertical: 6 }}>
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 10,
          color: theme.colors.slate,
          letterSpacing: 0.5,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </RNText>
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 20,
          color: tint,
          marginTop: 2,
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </RNText>
    </View>
  );
}

function FilterPill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: 8,
        borderRadius: theme.radii.pill,
        backgroundColor: active
          ? theme.colors.primary
          : withOpacity(theme.colors.silver, 0.4),
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 12,
          color: active ? '#FFFFFF' : theme.colors.slate,
          letterSpacing: 0.3,
        }}
      >
        {label}
      </RNText>
    </Pressable>
  );
}

function EmptyState({
  icon,
  title,
  body,
  tint,
}: {
  icon: string;
  title: string;
  body: string;
  tint?: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.xl,
      }}
    >
      <Icon name={icon as never} tint={tint ?? theme.colors.silver} size={28} weight="regular" />
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 14,
          color: theme.colors.ink,
        }}
      >
        {title}
      </RNText>
      <RNText
        style={{
          fontFamily: fontFamilies.regular,
          fontSize: 12,
          color: theme.colors.slate,
          textAlign: 'center',
          paddingHorizontal: theme.spacing.lg,
        }}
      >
        {body}
      </RNText>
    </View>
  );
}

// --- Formatters -------------------------------------------------------

function formatFee(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
