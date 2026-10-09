// Your Crews on Home (2026-10-09) — the My Crews card, as a rail under Your Pools.
//
// Ryan picked this from the Crews-on-Home mockups. Decisions about a crew — a saved spot, an invite,
// "Keep this group together?" — stay in Activity → Needs you (CrewNeedsCard), so this section only
// shows the groups: no buttons on it, and nothing at all when you have no crew.
//
// ⚠ Titles and places, never points (lib/crews.ts). The footer's words come from `crewFooter`.

import { router } from 'expo-router';
import { FlatList, Platform, Text as RNText, useWindowDimensions, View } from 'react-native';

import { CrewStatusChip } from '@/components/crews/bits';
import { CrewFace, CrewFaceStack } from '@/components/crews/CrewFace';
import { Icon, Pressable, Text } from '@/components/ui';
import { CREW_FOOTER_EMPTY, crewFooter, crewSummary, shortName, type CrewCard, type CrewFooter } from '@/lib/crews';
import { fontFamilies, useTheme } from '@/theme';

/** A card's width when there are several — the next one peeks in, as on Your Pools. */
const RAIL_CARD_WIDTH = 290;

export function CrewsSection({ crews, viewerId }: { crews: CrewCard[]; viewerId: string | null }) {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  if (crews.length === 0) return null;
  // One crew fills the row: a 290 card beside empty space reads as a rail with something missing.
  const cardWidth = crews.length === 1 ? screenWidth - theme.spacing.xl * 2 : RAIL_CARD_WIDTH;

  return (
    <View style={{ gap: theme.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="sectionHeader">Your Crews</Text>
        <Text variant="caption" color="slate">
          {crews.length}
        </Text>
      </View>

      <FlatList
        data={crews}
        keyExtractor={(item) => item.crewId}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -theme.spacing.xl }}
        contentContainerStyle={{
          gap: theme.spacing.md,
          paddingLeft: theme.spacing.xl,
          paddingRight: theme.spacing.xl,
          // Room for the cards' shadow, as on Your Pools.
          paddingTop: theme.spacing.xxs,
          paddingBottom: theme.spacing.sm,
        }}
        renderItem={({ item }) => <CrewRailCard crew={item} viewerId={viewerId} width={cardWidth} />}
      />
    </View>
  );
}

function CrewRailCard({ crew, viewerId, width }: { crew: CrewCard; viewerId: string | null; width: number }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/profile/crews/[id]', params: { id: crew.crewId } })}
      accessibilityRole="button"
      accessibilityLabel={`${crew.name}, ${crewSummary(crew)}`}
      style={({ pressed }) => ({
        width,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radii.lg,
        padding: theme.spacing.lg,
        gap: theme.spacing.md,
        opacity: pressed ? 0.7 : 1,
        ...theme.shadows.card,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <CrewFaceStack people={crew.faces} total={crew.people} />
        <Icon name="chevron.right" tint={theme.colors.slate} size={11} weight="semibold" />
      </View>
      <View style={{ gap: 2 }}>
        <RNText numberOfLines={1} style={{ fontFamily: fontFamilies.black, fontSize: 18, color: theme.colors.ink }}>
          {crew.name}
        </RNText>
        <RNText numberOfLines={1} style={{ fontFamily: fontFamilies.semibold, fontSize: 13, color: theme.colors.slate }}>
          {crewSummary(crew)}
        </RNText>
      </View>
      <CrewStatusChip status={crew.status} />
      <Footer footer={crewFooter(crew, viewerId)} />
    </Pressable>
  );
}

/** Who leads all-time, and where you sit — two columns, or one when it's you or nobody yet. */
function Footer({ footer }: { footer: CrewFooter }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: theme.colors.mist, paddingTop: theme.spacing.md }}>
      {footer.kind === 'none' ? (
        <Column label="All-time">
          <RNText numberOfLines={1} style={{ fontFamily: fontFamilies.semibold, fontSize: 13, color: theme.colors.slate }}>
            {CREW_FOOTER_EMPTY}
          </RNText>
        </Column>
      ) : (
        <Column label="Leads all-time">
          <CrewFace person={footer.leader} size={22} />
          <RNText numberOfLines={1} style={{ flexShrink: 1, fontFamily: fontFamilies.bold, fontSize: 14, color: theme.colors.ink }}>
            {footer.kind === 'you-lead' ? 'You' : shortName(footer.leader)}
          </RNText>
          {footer.titles ? (
            <RNText style={{ fontFamily: fontFamilies.semibold, fontSize: 12, color: theme.colors.slate }}>{footer.titles}</RNText>
          ) : null}
        </Column>
      )}
      {footer.kind === 'leader' && footer.you ? (
        <Column label="You" divider>
          <RNText
            style={{
              fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
              fontSize: 18,
              fontWeight: '800',
              color: theme.colors.ink,
            }}
          >
            {footer.you}
          </RNText>
          <RNText style={{ fontFamily: fontFamilies.semibold, fontSize: 12, color: theme.colors.slate }}>all-time</RNText>
        </Column>
      ) : null}
    </View>
  );
}

function Column({ label, divider, children }: { label: string; divider?: boolean; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        gap: 6,
        ...(divider ? { borderLeftWidth: 1, borderLeftColor: theme.colors.mist, paddingLeft: 14 } : null),
      }}
    >
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 10,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: theme.colors.slate,
        }}
      >
        {label}
      </RNText>
      {/* minHeight = the face, so a card with no leader yet is as tall as its neighbours. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 22 }}>{children}</View>
    </View>
  );
}
