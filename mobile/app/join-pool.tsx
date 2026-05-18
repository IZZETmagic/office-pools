import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Icon, Input, Text } from '@/components/ui';
import { joinPool } from '@/lib/api';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type Tab = 'code' | 'qr';

export default function JoinPoolModal() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('code');
  const [poolCode, setPoolCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const trimmed = poolCode.trim().toUpperCase();
    if (!trimmed) return;
    setError(null);
    setLoading(true);
    try {
      await joinPool(trimmed);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join pool');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      {/* Modal header matching pool-preview: chevron-back on the left,
          centered title, right-side spacer for optical symmetry. iOS modal
          presentation provides its own safe inset above the card, Android
          renders edge-to-edge so we need insets.top. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: theme.spacing.xl,
          paddingTop:
            Platform.OS === 'android'
              ? insets.top + theme.spacing.md
              : theme.spacing.xxl,
          paddingBottom: theme.spacing.sm,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={({ pressed }) => ({
            opacity: pressed ? 0.5 : 1,
            width: 32,
            alignItems: 'flex-start',
          })}
        >
          <Icon name="chevron.left" size={24} color="ink" weight="bold" />
        </Pressable>
        <Text variant="cardTitle" numberOfLines={1} align="center" style={{ flex: 1 }}>
          Join Pool
        </Text>
        <View style={{ width: 32 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: theme.colors.snow }}
      >
        <View
          style={{
            paddingHorizontal: theme.spacing.xl,
            paddingTop: theme.spacing.xl,
            paddingBottom: theme.spacing.xl + insets.bottom,
            gap: theme.spacing.xxl,
            backgroundColor: theme.colors.snow,
          }}
        >
          <View style={{ alignItems: 'center', gap: theme.spacing.md }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: theme.radii.xl,
                backgroundColor: withOpacity(theme.colors.primary, 0.1),
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Icon name="person.badge.plus" color="primary" size={26} />
            </View>
            <Text variant="sectionHeader" align="center">
              Join a Pool
            </Text>
            <Text variant="body" color="slate" align="center">
              Enter a code or scan a QR to join
            </Text>
          </View>

          <SegmentedTabs tab={tab} onChange={setTab} />

          {tab === 'code' ? (
            <View style={{ gap: theme.spacing.xl }}>
              {error ? (
                <View
                  style={{
                    padding: theme.spacing.md,
                    borderRadius: theme.radii.md,
                    backgroundColor: theme.colors.redLight,
                  }}
                >
                  <Text variant="body" color="red" align="center">
                    {error}
                  </Text>
                </View>
              ) : null}

              <Input
                value={poolCode}
                onChangeText={(value) => {
                  setPoolCode(value.toUpperCase());
                  setError(null);
                }}
                placeholder="POOL CODE"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={12}
                style={{
                  fontFamily: Platform.OS === 'ios' ? 'Menlo-Bold' : 'monospace',
                  fontSize: 22,
                  letterSpacing: 4,
                  textAlign: 'center',
                }}
              />

              <View
                style={{
                  shadowColor: theme.colors.primary,
                  shadowOpacity: poolCode.trim() ? 0.3 : 0,
                  shadowRadius: 14,
                  shadowOffset: { width: 0, height: 6 },
                }}
              >
                <Pressable
                  onPress={handleSubmit}
                  disabled={loading || !poolCode.trim()}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: theme.spacing.sm,
                    height: 52,
                    borderRadius: theme.radii.md,
                    backgroundColor: theme.colors.primary,
                    opacity: !poolCode.trim() ? 0.5 : pressed ? 0.85 : 1,
                  })}
                >
                  <Icon name="arrow.right.circle.fill" color="ink" size={18} />
                  <Text
                    style={{
                      fontFamily: fontFamilies.bold,
                      fontSize: 16,
                      color: '#FFFFFF',
                      letterSpacing: 0.2,
                    }}
                  >
                    {loading ? 'Joining…' : 'Join Pool'}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View
              style={{
                alignItems: 'center',
                gap: theme.spacing.md,
                paddingVertical: theme.spacing.xxxl,
              }}
            >
              <Icon name="qrcode.viewfinder" color="slate" size={40} />
              <Text variant="body" color="slate" align="center">
                QR scanning ships in the next update.
              </Text>
            </View>
          )}

          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={({ pressed }) => ({
              alignSelf: 'center',
              paddingVertical: theme.spacing.sm,
              opacity: pressed ? 0.5 : 1,
            })}
          >
            <Text variant="body" color="slate">
              Cancel
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function SegmentedTabs({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: theme.colors.mist,
        borderRadius: theme.radii.md,
        padding: theme.spacing.xs,
      }}
    >
      <SegmentButton
        active={tab === 'code'}
        onPress={() => onChange('code')}
        icon="keyboard"
        label="Pool Code"
      />
      <SegmentButton
        active={tab === 'qr'}
        onPress={() => onChange('qr')}
        icon="qrcode"
        label="Scan QR"
      />
    </View>
  );
}

function SegmentButton({
  active,
  onPress,
  icon,
  label,
}: {
  active: boolean;
  onPress: () => void;
  icon: string;
  label: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.sm,
        paddingVertical: theme.spacing.md,
        borderRadius: theme.radii.sm,
        backgroundColor: active ? theme.colors.surface : 'transparent',
        opacity: pressed ? 0.85 : 1,
        ...(active ? theme.shadows.card : null),
      })}
    >
      <Icon name={icon as never} color={active ? 'primary' : 'slate'} size={14} weight="semibold" />
      <Text
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 14,
          color: active ? theme.colors.primary : theme.colors.slate,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
