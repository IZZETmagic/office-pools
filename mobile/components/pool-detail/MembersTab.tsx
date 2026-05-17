import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import { ActivityIndicator, Platform, Pressable, Text as RNText, View } from 'react-native';

import { Text } from '@/components/ui';
import { useMemberRoster, type RosterMember } from '@/lib/useMemberRoster';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

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
        {Platform.OS === 'ios' ? (
          <SymbolView
            name="person.3"
            size={36}
            tintColor={theme.colors.silver}
            weight="light"
            resizeMode="scaleAspectFit"
          />
        ) : null}
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
      {Platform.OS === 'ios' ? (
        <SymbolView
          name="chevron.right"
          size={11}
          tintColor={theme.colors.slate}
          weight="semibold"
          resizeMode="scaleAspectFit"
        />
      ) : (
        <RNText style={{ fontSize: 14, color: theme.colors.slate }}>›</RNText>
      )}
    </Pressable>
  );
}

function Avatar({ member }: { member: RosterMember }) {
  const theme = useTheme();
  const initial = (member.fullName || member.username || '?').slice(0, 1).toUpperCase();
  const bg = member.isAdmin
    ? withOpacity(theme.colors.slate, 0.15)
    : withOpacity(theme.colors.primary, 0.12);
  const fg = member.isAdmin ? theme.colors.slate : theme.colors.primary;
  return (
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 14,
          color: fg,
        }}
      >
        {initial}
      </RNText>
    </View>
  );
}
