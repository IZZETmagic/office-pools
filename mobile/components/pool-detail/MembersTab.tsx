import { router } from 'expo-router';
import { ActivityIndicator, Text as RNText, View } from 'react-native';

import { Icon, Text, Pressable } from '@/components/ui';
import { LeaderboardAvatar } from './LeaderboardAvatar';
import { useMemberRoster, type RosterMember } from '@/lib/useMemberRoster';
import { fontFamilies, useTheme, withOpacity } from '@/theme';
import { PoolSpotsSaved } from '@/components/crews/PoolCrewLine';

type Props = {
  poolId: string;
};

export function MembersTab({ poolId }: Props) {
  const theme = useTheme();
  const { members, loading } = useMemberRoster(poolId);

  if (loading && members.length === 0) {
    return (
      <View style={{ paddingVertical: theme.spacing.xxxl, alignItems: 'center' }}>
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (members.length === 0) {
    return (
      <View
        style={{
          alignItems: 'center',
          gap: theme.spacing.sm,
          paddingHorizontal: theme.spacing.xl,
          paddingVertical: theme.spacing.xxxl,
        }}
      >
        <Icon name="person.3" tint={theme.colors.silver} size={36} weight="regular" />
        <Text variant="cardTitle" align="center">
          No members yet
        </Text>
        <Text variant="body" color="slate" align="center">
          Members will appear here as they join the pool.
        </Text>
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
      {/* Crews (154): who still has a saved spot — this tab is the pool admin's, and so are the names. */}
      <PoolSpotsSaved poolId={poolId} />
      <View
        style={{
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radii.lg,
          padding: theme.spacing.lg,
          gap: 10,
          ...theme.shadows.card,
        }}
      >
        <View style={{ gap: 10 }}>
          <Text variant="sectionHeader">
            {members.length} {members.length === 1 ? 'Member' : 'Members'}
          </Text>
          <View style={{ height: 0.5, backgroundColor: withOpacity(theme.colors.silver, 0.6) }} />
        </View>
        {members.map((m, i) => (
          <View key={m.memberId}>
            {i > 0 ? (
              <View
                style={{
                  height: 0.5,
                  backgroundColor: withOpacity(theme.colors.silver, 0.5),
                  marginLeft: 48,
                  marginBottom: 6,
                }}
              />
            ) : null}
            <MemberRow
              member={m}
              onPress={() => router.push(`/pool/${poolId}/member/${m.memberId}`)}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

function MemberRow({ member, onPress }: { member: RosterMember; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingVertical: 6,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Avatar member={member} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="cardTitle" numberOfLines={1}>
          {member.fullName}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <RNText
            style={{
              fontFamily: fontFamilies.medium,
              fontSize: 12,
              color: theme.colors.slate,
            }}
            numberOfLines={1}
          >
            @{member.username}
          </RNText>
          {member.entryCount > 0 ? (
            <>
              <RNText
                style={{
                  fontFamily: fontFamilies.medium,
                  fontSize: 12,
                  color: theme.colors.slate,
                }}
              >
                ·
              </RNText>
              <RNText
                style={{
                  fontFamily: fontFamilies.medium,
                  fontSize: 12,
                  color: theme.colors.slate,
                }}
              >
                {member.entryCount} {member.entryCount === 1 ? 'entry' : 'entries'}
              </RNText>
            </>
          ) : null}
          {member.isAdmin ? (
            <>
              <RNText
                style={{
                  fontFamily: fontFamilies.medium,
                  fontSize: 12,
                  color: theme.colors.slate,
                }}
              >
                ·
              </RNText>
              <RNText
                style={{
                  fontFamily: fontFamilies.bold,
                  fontSize: 10,
                  color: theme.colors.slate,
                  letterSpacing: 0.4,
                }}
              >
                ADMIN
              </RNText>
            </>
          ) : null}
        </View>
      </View>
      <Icon name="chevron.right" tint={theme.colors.slate} size={11} weight="semibold" />
    </Pressable>
  );
}

/**
 * ⚠⚠ THIS CIRCLE USED TO ENCODE ROLE, NOT IDENTITY. It was one letter on
 * `primary` at 12%, or `slate` at 15% for an admin — so every ordinary member in
 * the pool was the same colour as every other, and the only thing it told you was
 * whether somebody could remove you. The row already says "ADMIN" in words, so
 * that signal was being made twice and identity not at all.
 *
 * ⚠ The fallback now shows TWO letters rather than one, because `initialsOf` is
 * what every other surface in the app uses and "A" for Aisha Khan is a poorer
 * stand-in for a person than "AK".
 */
function Avatar({ member }: { member: RosterMember }) {
  return (
    <LeaderboardAvatar
      userId={member.userId ?? null}
      name={member.fullName || member.username || '?'}
      avatarBuild={member.avatarBuild}
      avatarColour={member.avatarColour}
      size={36}
      rank={1}
    />
  );
}
