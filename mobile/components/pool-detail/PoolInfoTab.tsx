// Read-only "About this pool" tab visible to all members. Mirrors the
// information displayed on the web (app/pools/[pool_id]/PoolInfoTab.tsx)
// — same data fields, mobile chrome. Sections in order:
//   1. About (description, if set)
//   2. Deadlines (per-round for progressive, single + status for others)
//   3. Entries & Participants (mode, entries-per-player, max, totals)
//   4. Fees & Prize Pool (only when entry_fee > 0; includes per-entry
//      Paid/Unpaid status for the current user's own entries)
//   5. Pool Details (status badge + created date)
//   6. Danger Zone (Leave Pool — mobile-only, web doesn't have this here)
//
// Sole-admin guard on Leave: client-side disable + tooltip when the user
// is the only admin in the pool. Server-side check in
// /api/pools/[id]/leave is still authoritative and surfaces as a
// ConfirmDialog error if somehow bypassed (e.g. another admin demoted
// between client-render and request).

import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text as RNText, View } from 'react-native';

import { ConfirmDialog, Icon, Text } from '@/components/ui';
import { leavePool } from '@/lib/api';
import { useHomeData } from '@/lib/HomeDataProvider';
import { useMemberRoster } from '@/lib/useMemberRoster';
import type { PoolDetailInfo } from '@/lib/usePoolDetail';
import { usePoolEntries } from '@/lib/usePoolEntries';
import { usePoolRounds, roundLabel } from '@/lib/usePoolRounds';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

const MODE_LABEL: Record<string, string> = {
  full_tournament: 'Full Tournament',
  progressive: 'Progressive',
  bracket_picker: 'Bracket Picker',
};

type Props = {
  pool: PoolDetailInfo;
};

export function PoolInfoTab({ pool }: Props) {
  const theme = useTheme();
  const { refresh: refreshHomeData } = useHomeData();

  // Used to compute admin count for the sole-admin gate. useMemberRoster
  // already has a realtime sub on pool_members so the count stays
  // accurate live — if another admin gets demoted while you're sitting
  // here, the Leave Pool row flips to disabled within a frame.
  const { members } = useMemberRoster(pool.poolId);
  const adminCount = members.filter((m) => m.role === 'admin').length;
  const isSoleAdmin = pool.isAdmin && adminCount <= 1;

  // Current user's own entries — drives the per-entry Paid/Unpaid badges
  // in the Fees & Prize Pool card. Only used when entry_fee > 0 so this
  // hook is harmless to call unconditionally.
  const { entries: userEntries } = usePoolEntries(pool.poolId);

  // Round states only matter for progressive pools — the hook is called
  // unconditionally so the order of hooks stays stable, but its output
  // is gated by the render-time isProgressive branch.
  const { data: roundsData } = usePoolRounds(pool.poolId);

  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  // Server endpoint enforces the sole-admin rule too; this client gate
  // is purely UX (avoid surfacing a button the user can't use). If the
  // server rejects for any reason, the error surfaces in the same
  // ConfirmDialog chrome.
  async function performLeave() {
    setLeaveBusy(true);
    try {
      await leavePool(pool.poolId);
      void fetch(`/api/pools/${pool.poolId}/recalculate`, { method: 'POST' });
      void refreshHomeData();
      router.replace('/(tabs)');
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            && typeof (err as { message: unknown }).message === 'string'
            ? (err as { message: string }).message
            : 'Unknown error';
      setShowLeaveConfirm(false);
      setLeaveError(message);
    } finally {
      setLeaveBusy(false);
    }
  }

  const isProgressive = pool.predictionMode === 'progressive';
  const modeLabelText = pool.predictionMode
    ? MODE_LABEL[pool.predictionMode] ?? pool.predictionMode
    : '—';
  const entryFee = pool.entryFee ?? 0;
  const currency = pool.entryFeeCurrency || 'USD';
  const showFeesCard = entryFee > 0;

  // For non-progressive pools we compute past-deadline locally so we can
  // surface an Open / Closed badge alongside the single deadline. Mirrors
  // the web component's `isPastDeadline` prop.
  const isPastDeadline = pool.predictionDeadline
    ? new Date(pool.predictionDeadline).getTime() < Date.now()
    : false;

  return (
    <View
      style={{
        paddingHorizontal: theme.spacing.lg,
        paddingTop: theme.spacing.md,
        paddingBottom: theme.spacing.xxxl,
        gap: theme.spacing.lg,
      }}
    >
      {/* About — description only, hidden when no description set */}
      {pool.description ? (
        <Card>
          <Caption>About</Caption>
          <RNText
            style={{
              fontFamily: fontFamilies.regular,
              fontSize: 14,
              lineHeight: 20,
              color: theme.colors.ink,
            }}
          >
            {pool.description}
          </RNText>
        </Card>
      ) : null}

      {/* Deadlines */}
      <Card>
        <Caption>Deadlines</Caption>
        <RNText style={{ fontFamily: fontFamilies.regular, fontSize: 11, color: theme.colors.slate }}>
          When predictions lock
        </RNText>
        {isProgressive && roundsData && roundsData.rounds.length > 0 ? (
          <View style={{ marginTop: theme.spacing.sm, gap: theme.spacing.xs }}>
            {roundsData.rounds.map((rs) => (
              <View
                key={rs.round_key}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 8,
                  borderTopWidth: 1,
                  borderTopColor: withOpacity(theme.colors.slate, 0.08),
                }}
              >
                <RNText
                  style={{ fontFamily: fontFamilies.medium, fontSize: 13, color: theme.colors.slate }}
                >
                  {roundLabel(rs.round_key)}
                </RNText>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <RNText
                    style={{
                      fontFamily: fontFamilies.regular,
                      fontSize: 11,
                      color: theme.colors.slate,
                    }}
                  >
                    {rs.deadline ? formatDeadline(rs.deadline) : 'No deadline'}
                  </RNText>
                  <RoundStateBadge state={rs.state} />
                </View>
              </View>
            ))}
          </View>
        ) : pool.predictionDeadline ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: theme.spacing.sm,
            }}
          >
            <RNText
              style={{ fontFamily: fontFamilies.semibold, fontSize: 14, color: theme.colors.ink }}
            >
              {formatDeadline(pool.predictionDeadline)}
            </RNText>
            <Badge tone={isPastDeadline ? 'neutral' : 'green'}>
              {isPastDeadline ? 'Closed' : 'Open'}
            </Badge>
          </View>
        ) : (
          <RNText
            style={{
              fontFamily: fontFamilies.regular,
              fontSize: 14,
              color: theme.colors.silver,
              marginTop: theme.spacing.sm,
            }}
          >
            No deadline set
          </RNText>
        )}
      </Card>

      {/* Entries & Participants */}
      <Card>
        <Caption>Entries & Participants</Caption>
        <RNText style={{ fontFamily: fontFamilies.regular, fontSize: 11, color: theme.colors.slate }}>
          Pool size and entry limits
        </RNText>
        <View style={{ marginTop: theme.spacing.sm }}>
          <InfoRow label="Prediction mode">
            <Badge tone="blue">{modeLabelText}</Badge>
          </InfoRow>
          <InfoRow
            label="Entries per player"
            value={String(pool.maxEntriesPerUser)}
          />
          <InfoRow
            label="Max participants"
            value={pool.maxParticipants ? String(pool.maxParticipants) : 'Unlimited'}
          />
          <InfoRow label="Total members" value={String(pool.memberCount)} />
          <InfoRow label="Total entries" value={String(pool.totalEntries)} />
        </View>
      </Card>

      {/* Fees & Prize Pool — only when entry_fee > 0 */}
      {showFeesCard ? (
        <Card>
          <Caption>Fees & Prize Pool</Caption>
          <RNText style={{ fontFamily: fontFamilies.regular, fontSize: 11, color: theme.colors.slate }}>
            Entry costs and total pot
          </RNText>
          <View style={{ marginTop: theme.spacing.sm }}>
            <InfoRow label="Entry fee" value={formatFee(entryFee, currency)} />
            <InfoRow
              label="Total prize pool"
              value={formatFee(entryFee * pool.totalEntries, currency)}
            />
          </View>
          {userEntries.length > 0 ? (
            <View
              style={{
                marginTop: theme.spacing.md,
                paddingTop: theme.spacing.sm,
                borderTopWidth: 1,
                borderTopColor: withOpacity(theme.colors.slate, 0.08),
                gap: 6,
              }}
            >
              <RNText
                style={{
                  fontFamily: fontFamilies.bold,
                  fontSize: 12,
                  color: theme.colors.ink,
                  marginBottom: 2,
                }}
              >
                Your Fee Status
              </RNText>
              {userEntries.map((entry) => (
                <View
                  key={entry.entryId}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 4,
                  }}
                >
                  <RNText
                    style={{
                      fontFamily: fontFamilies.medium,
                      fontSize: 13,
                      color: theme.colors.slate,
                    }}
                  >
                    {entry.entryName}
                  </RNText>
                  <Badge tone={entry.feePaid ? 'green' : 'amber'}>
                    {entry.feePaid ? 'Paid' : 'Unpaid'}
                  </Badge>
                </View>
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}

      {/* Pool Details */}
      <Card>
        <Caption>Pool Details</Caption>
        <View style={{ marginTop: theme.spacing.sm }}>
          <InfoRow label="Status">
            <Badge tone={statusTone(pool.status)}>{statusLabel(pool.status)}</Badge>
          </InfoRow>
          <InfoRow label="Created" value={formatCreated(pool.createdAt)} />
        </View>
      </Card>

      {/* Danger Zone — Leave Pool (mobile-only) */}
      <Card>
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 11,
            color: theme.colors.red,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          }}
        >
          Danger Zone
        </RNText>
        <LeaveRow
          disabled={isSoleAdmin}
          disabledReason={
            isSoleAdmin
              ? 'Promote another admin or delete the pool to leave'
              : null
          }
          onPress={() => setShowLeaveConfirm(true)}
        />
      </Card>

      <ConfirmDialog
        visible={showLeaveConfirm}
        title="Leave Pool"
        description={`Leave ${pool.poolName}? Your entries, predictions, and standings will be removed, and a "Left ${pool.poolName}" entry will be added to your activity feed.`}
        cancelLabel="Cancel"
        confirmLabel="Leave Pool"
        destructive
        busy={leaveBusy}
        onCancel={() => setShowLeaveConfirm(false)}
        onConfirm={() => void performLeave()}
      />

      <ConfirmDialog
        visible={leaveError !== null}
        title="Couldn't leave pool"
        description={leaveError ?? ''}
        confirmLabel="OK"
        destructive
        onConfirm={() => setLeaveError(null)}
      />
    </View>
  );
}

// --- Helpers ----------------------------------------------------------

function Card({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.lg,
        gap: 8,
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

// Single line: muted label on the left, bold value (or arbitrary node) on
// the right. The value-node branch lets callers slot a Badge in for
// status-style rows.
function InfoRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: withOpacity(theme.colors.slate, 0.08),
      }}
    >
      <RNText
        style={{ fontFamily: fontFamilies.medium, fontSize: 13, color: theme.colors.slate }}
      >
        {label}
      </RNText>
      {children ? (
        children
      ) : (
        <RNText
          style={{ fontFamily: fontFamilies.bold, fontSize: 13, color: theme.colors.ink }}
        >
          {value ?? '—'}
        </RNText>
      )}
    </View>
  );
}

// Pill badge — color-coded by tone. Matches the visual language of the
// web component's Badge but rendered locally so we don't depend on the
// gigantic web Badge component or pull tailwind in.
type BadgeTone = 'green' | 'amber' | 'blue' | 'neutral';
function Badge({ tone, children }: { tone: BadgeTone; children: React.ReactNode }) {
  const theme = useTheme();
  const palette: Record<BadgeTone, { bg: string; fg: string }> = {
    green: { bg: withOpacity(theme.colors.green, 0.15), fg: theme.colors.green },
    amber: { bg: withOpacity(theme.colors.amber, 0.18), fg: theme.colors.amber },
    blue: { bg: withOpacity(theme.colors.primary, 0.14), fg: theme.colors.primary },
    neutral: { bg: withOpacity(theme.colors.slate, 0.14), fg: theme.colors.slate },
  };
  const { bg, fg } = palette[tone];
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: theme.radii.pill,
        paddingHorizontal: 8,
        paddingVertical: 3,
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 11,
          color: fg,
          letterSpacing: 0.3,
        }}
      >
        {children}
      </RNText>
    </View>
  );
}

// Maps a pool_round_states.state to one of our four tones + label. Used
// only for the per-round rows in progressive pool deadline listings.
function RoundStateBadge({ state }: { state: string }) {
  const tone: BadgeTone =
    state === 'open' ? 'green'
    : state === 'in_progress' ? 'amber'
    : state === 'completed' ? 'blue'
    : 'neutral';
  const label =
    state === 'in_progress'
      ? 'In Progress'
      : state.charAt(0).toUpperCase() + state.slice(1);
  return <Badge tone={tone}>{label}</Badge>;
}

function statusTone(status: string): BadgeTone {
  if (status === 'open' || status === 'active') return 'green';
  if (status === 'upcoming') return 'blue';
  if (status === 'closed') return 'amber';
  return 'neutral';
}

function statusLabel(status: string): string {
  if (status === 'open' || status === 'active') return 'Open';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// Leave row variant of DangerRow with built-in disabled state for the
// sole-admin case. Inlined here (rather than extending the SettingsTab
// DangerRow with a disabled prop) to keep both surfaces independent —
// changes here won't ripple into Stop Participating / Archive / Delete.
function LeaveRow({
  disabled,
  disabledReason,
  onPress,
}: {
  disabled: boolean;
  disabledReason: string | null;
  onPress: () => void;
}) {
  const theme = useTheme();
  const tint = disabled ? theme.colors.slate : theme.colors.red;
  const subtitle = disabled && disabledReason
    ? disabledReason
    : 'Remove yourself from this pool entirely';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.sm,
        opacity: disabled ? 0.55 : pressed ? 0.7 : 1,
      })}
    >
      <Icon
        name="rectangle.portrait.and.arrow.right"
        tint={tint}
        size={16}
        weight="semibold"
      />
      <View style={{ flex: 1, gap: 2 }}>
        <RNText
          style={{
            fontFamily: fontFamilies.bold,
            fontSize: 14,
            color: tint,
          }}
        >
          Leave Pool
        </RNText>
        <RNText
          style={{
            fontFamily: fontFamilies.regular,
            fontSize: 11,
            color: theme.colors.slate,
          }}
        >
          {subtitle}
        </RNText>
      </View>
      {!disabled ? (
        <Icon name="chevron.right" tint={theme.colors.slate} size={11} weight="semibold" />
      ) : null}
    </Pressable>
  );
}

// --- Formatters -------------------------------------------------------

function formatDeadline(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const date = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${date} at ${time}`;
}

function formatCreated(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatFee(amount: number, currency: string): string {
  // Intl.NumberFormat with the currency style handles symbol placement
  // and decimal precision per locale automatically (e.g. $1.00 vs 1,00 €).
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    // Fallback if the currency code is invalid (shouldn't happen — the
    // server validates on save — but cheap insurance).
    return `${amount.toFixed(2)} ${currency}`;
  }
}
