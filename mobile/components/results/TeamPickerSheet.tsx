import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  FlatList,
  Modal,
  Platform,
  Pressable,
  Text as RNText,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fontFamilies, useTheme, withOpacity } from '@/theme';

export type TeamOption = {
  id: string;
  name: string;
  flagUrl: string | null;
};

export type TeamPickerSheetHandle = {
  open: () => void;
  close: () => void;
};

type Props = {
  teams: TeamOption[];
  onSelect: (team: TeamOption) => void;
};

// Vanilla RN Modal + Animated.View — same pattern as AdjustPointsSheet /
// BadgeDetailSheet. Avoids the gorhom library and gives us full control of
// the top inset (so the header + search bar never sit under the status bar /
// Dynamic Island on iOS or status bar on Android).
export const TeamPickerSheet = forwardRef<TeamPickerSheetHandle, Props>(function TeamPickerSheet(
  { teams, onSelect },
  ref,
) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(false);
  const [query, setQuery] = useState('');

  const screenHeight = Dimensions.get('window').height;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(screenHeight)).current;

  useImperativeHandle(ref, () => ({
    open: () => {
      setQuery('');
      setVisible(true);
    },
    close: () => animateOut(),
  }));

  function animateIn() {
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 280,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }

  function animateOut() {
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: screenHeight,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => setVisible(false));
  }

  useEffect(() => {
    if (visible) animateIn();
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter((t) => t.name.toLowerCase().includes(q));
  }, [teams, query]);

  function handleSelect(team: TeamOption) {
    onSelect(team);
    animateOut();
  }

  // Sheet's top edge sits below the safe-area top + a small extra gap so
  // the chrome (drag handle, header, search) is never occluded by the
  // status bar / notch / Dynamic Island.
  const sheetTopOffset = insets.top + 12;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={animateOut}>
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          opacity: backdropOpacity,
        }}
      >
        <Pressable style={{ flex: 1 }} onPress={animateOut} />
      </Animated.View>

      <Animated.View
        style={{
          position: 'absolute',
          top: sheetTopOffset,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: theme.colors.surface,
          borderTopLeftRadius: theme.radii.xl,
          borderTopRightRadius: theme.radii.xl,
          transform: [{ translateY }],
          overflow: 'hidden',
        }}
      >
        {/* Header — title on the left, close button right-aligned. */}
        <View
          style={{
            paddingHorizontal: theme.spacing.lg,
            paddingTop: theme.spacing.md,
            paddingBottom: theme.spacing.md,
            gap: theme.spacing.sm,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
            <RNText
              style={{
                flex: 1,
                fontFamily: fontFamilies.bold,
                fontSize: 17,
                color: theme.colors.ink,
              }}
            >
              Select Team
            </RNText>
            <CloseButton onPress={animateOut} />
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: theme.radii.md,
              backgroundColor: theme.colors.mist,
            }}
          >
            {Platform.OS === 'ios' ? (
              <SymbolView
                name="magnifyingglass"
                size={14}
                tintColor={theme.colors.slate}
                weight="medium"
              />
            ) : (
              <RNText style={{ fontSize: 14, color: theme.colors.slate }}>🔍</RNText>
            )}
            <TextInput
              placeholder="Search teams"
              placeholderTextColor={theme.colors.slate}
              value={query}
              onChangeText={setQuery}
              autoCorrect={false}
              autoCapitalize="words"
              style={{
                flex: 1,
                fontFamily: fontFamilies.regular,
                fontSize: 14,
                color: theme.colors.ink,
                padding: 0,
              }}
            />
          </View>
        </View>

        {/* List */}
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + theme.spacing.lg }}
          ItemSeparatorComponent={() => (
            <View
              style={{
                height: 0.5,
                marginHorizontal: theme.spacing.lg,
                backgroundColor: withOpacity(theme.colors.silver, 0.5),
              }}
            />
          )}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => handleSelect(item)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                paddingHorizontal: theme.spacing.lg,
                paddingVertical: 14,
                backgroundColor: pressed ? withOpacity(theme.colors.ink, 0.04) : 'transparent',
              })}
            >
              {item.flagUrl ? (
                <Image
                  source={{ uri: item.flagUrl }}
                  style={{ width: 30, height: 20, borderRadius: 3 }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              ) : (
                <View
                  style={{
                    width: 30,
                    height: 20,
                    borderRadius: 3,
                    backgroundColor: theme.colors.mist,
                  }}
                />
              )}
              <RNText
                style={{
                  flex: 1,
                  fontFamily: fontFamilies.medium,
                  fontSize: 15,
                  color: theme.colors.ink,
                }}
              >
                {item.name}
              </RNText>
              {Platform.OS === 'ios' ? (
                <SymbolView
                  name="chevron.right"
                  size={11}
                  tintColor={theme.colors.silver}
                  weight="semibold"
                />
              ) : (
                <RNText style={{ fontSize: 14, color: theme.colors.silver }}>›</RNText>
              )}
            </Pressable>
          )}
        />
      </Animated.View>
    </Modal>
  );
});

function CloseButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel="Close"
      accessibilityRole="button"
      style={({ pressed }) => ({
        width: 32,
        height: 32,
        borderRadius: theme.radii.pill,
        backgroundColor: withOpacity(theme.colors.ink, 0.06),
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      {Platform.OS === 'ios' ? (
        <SymbolView
          name="xmark"
          size={14}
          tintColor={theme.colors.ink}
          weight="semibold"
        />
      ) : (
        <RNText
          style={{
            fontSize: 16,
            color: theme.colors.ink,
            fontFamily: fontFamilies.bold,
            lineHeight: 16,
          }}
        >
          ✕
        </RNText>
      )}
    </Pressable>
  );
}
