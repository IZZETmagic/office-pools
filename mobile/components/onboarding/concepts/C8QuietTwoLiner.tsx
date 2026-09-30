// CONCEPT 8 — QUIET TWO-LINER
// ============================================================================
// The control. No illustration, no hero, no celebration — two system-style rows and a Done. The
// skip is weighted exactly the same as the accept.
//
// ⭐ WHY IT IS IN THE SET AND NOT A STRAW MAN. "More persuasive" and "converts better" are not the
// same claim. A decorated ask can read as a pitch, and a pitch invites a defence; a plain one
// reads as a settings screen, which people complete without deciding how they feel about it.
// Whichever of these eight wins should have to beat THIS, or the win is just a preference for
// nicer screens.
//
// ⭐ IT IS ALSO THE CHEAPEST TO SHIP AND THE CHEAPEST TO CHANGE, which matters for a screen that
// every single new member sees exactly once and that no one will ever revisit to admire.
//
// Disclosure-gate sentence: "two settings, set them or don't." Passes trivially — there is
// nothing here to disclose.

import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';

import { Button, Text } from '@/components/ui';
import type { StoredAvatarBuild } from '@/lib/avatar/storedConfig';
import { useAvatarAssets } from '@/lib/useAvatarAssets';
import { useTheme, withOpacity } from '@/theme';

import {
  AvatarQuickBuild,
  randomBuild,
  randomGround,
  SEED_BUILD,
  ShuffleButton,
  SimulatedPushAlert,
  useHeadSvg,
  useSimulatedPush,
} from './shared';

export function C8QuietTwoLiner({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const { assets } = useAvatarAssets();
  const [ground] = useState(randomGround);
  const [build, setBuild] = useState<StoredAvatarBuild>(SEED_BUILD);
  const [editing, setEditing] = useState(false);
  const [avatarSet, setAvatarSet] = useState(false);
  const push = useSimulatedPush();
  const head = useHeadSvg(build, ground);

  if (editing) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
        <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ paddingVertical: theme.spacing.xl, gap: theme.spacing.xl }}>
            <Text variant="sectionHeader" color="ink" align="center">
              Profile picture
            </Text>
            <AvatarQuickBuild build={build} ground={ground} onChange={setBuild} />
            <ShuffleButton onShuffle={() => assets && setBuild(randomBuild(assets))} />
          </ScrollView>
          <SafeAreaView edges={['bottom']}>
            <View style={{ paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.lg, gap: theme.spacing.sm }}>
              <Button
                title="Save"
                size="lg"
                fullWidth
                onPress={() => {
                  setAvatarSet(true);
                  setEditing(false);
                }}
              />
              <Button title="Cancel" size="lg" variant="ghost" fullWidth onPress={() => setEditing(false)} />
            </View>
          </SafeAreaView>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1 }}>
        <View style={{ padding: theme.spacing.xl, gap: theme.spacing.xl }}>
          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="pageTitle" color="ink">
              Set up
            </Text>
            <Text variant="body" color="slate">
              Optional. Both can be changed later in Settings.
            </Text>
          </View>

          <View
            style={{
              borderRadius: theme.radii.md,
              backgroundColor: theme.colors.surface,
              overflow: 'hidden',
            }}
          >
            <SettingRow
              title="Profile picture"
              value={avatarSet ? 'Set' : 'Not set'}
              done={avatarSet}
              leading={
                avatarSet && head ? (
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      overflow: 'hidden',
                      backgroundColor: ground,
                    }}
                  >
                    <SvgXml xml={head} width={32} height={32} />
                  </View>
                ) : null
              }
              onPress={() => setEditing(true)}
            />
            <View style={{ height: 1, backgroundColor: theme.colors.mist, marginLeft: theme.spacing.lg }} />
            <SettingRow
              title="Notifications"
              value={
                push.status === 'granted' ? 'On' : push.status === 'denied' ? 'Off' : 'Not set'
              }
              done={push.status === 'granted'}
              onPress={push.status === 'undetermined' ? push.ask : () => {}}
            />
          </View>

          <Text variant="detail" color="slate">
            Notifications cover pick deadlines, goals in matches you have a pick on, and replies to
            you. Nothing else.
          </Text>
        </View>

        <View style={{ flex: 1 }} />

        <SafeAreaView edges={['bottom']}>
          <Animated.View entering={FadeIn} style={{ paddingHorizontal: theme.spacing.xl, paddingBottom: theme.spacing.lg }}>
            <Button title="Done" size="lg" fullWidth onPress={onDone} />
          </Animated.View>
        </SafeAreaView>
      </SafeAreaView>

      <SimulatedPushAlert visible={push.asking} onAnswer={push.answer} />
    </View>
  );
}

function SettingRow({
  title,
  value,
  done,
  leading,
  onPress,
}: {
  title: string;
  value: string;
  done: boolean;
  leading?: React.ReactNode;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
        paddingVertical: theme.spacing.lg,
        backgroundColor: pressed ? withOpacity(theme.colors.slate, 0.08) : 'transparent',
      })}
    >
      {leading}
      <Text variant="cardTitle" color="ink" style={{ flex: 1 }}>
        {title}
      </Text>
      <Text variant="body" color={done ? 'green' : 'slate'}>
        {value}
      </Text>
      <Text variant="cardTitle" color="slate">
        ›
      </Text>
    </Pressable>
  );
}
