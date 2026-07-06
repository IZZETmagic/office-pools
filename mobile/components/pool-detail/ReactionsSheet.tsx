import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text as RNText,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// One person who reacted, pre-resolved by the caller (BanterSheet owns the
// member roster + avatar helpers, so this sheet stays a pure renderer).
export type Reactor = {
  userId: string;
  name: string;
  initials: string;
  gradient: readonly [string, string];
  isYou: boolean;
};

export type ReactorGroup = {
  emoji: string;
  count: number;
  reactors: Reactor[];
};

export type ReactionsSheetHandle = {
  open: (groups: ReactorGroup[]) => void;
  close: () => void;
};

// "All" tab sentinel — distinct from any emoji.
const ALL_TAB = 'all';

// "Who reacted" bottom sheet. Opened by tapping a reaction pill. A tab row
// (All + one per emoji, each with its count) filters the list of people below —
// the Facebook/WhatsApp reactions-detail pattern. Same Modal + slide-up shell
// as BadgeDetailSheet so it matches the app's other sheets.
export const ReactionsSheet = forwardRef<ReactionsSheetHandle>(
  function ReactionsSheet(_, ref) {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const [visible, setVisible] = useState(false);
    const [groups, setGroups] = useState<ReactorGroup[]>([]);
    const [selectedTab, setSelectedTab] = useState<string>(ALL_TAB);
    const screenHeight = Dimensions.get('window').height;
    const backdropOpacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(screenHeight)).current;

    useImperativeHandle(ref, () => ({
      open: (g) => {
        setGroups(g);
        setSelectedTab(ALL_TAB);
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

    const total = groups.reduce((sum, g) => sum + g.count, 0);

    // Rows for the selected tab: everyone (flattened, tagged with the emoji
    // they used) for "All", otherwise just that emoji's reactors.
    const rows =
      selectedTab === ALL_TAB
        ? groups.flatMap((g) =>
            g.reactors.map((r) => ({ reactor: r, emoji: g.emoji })),
          )
        : (groups.find((g) => g.emoji === selectedTab)?.reactors ?? []).map(
            (r) => ({ reactor: r, emoji: selectedTab }),
          );

    function tabColor(active: boolean) {
      return active ? theme.colors.ink : theme.colors.slate;
    }

    return (
      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={() => animateOut()}
        statusBarTranslucent
      >
        <View style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Animated.View
            style={[
              StyleSheet.absoluteFillObject,
              { backgroundColor: 'rgba(0,0,0,0.4)', opacity: backdropOpacity },
            ]}
          >
            <Pressable style={{ flex: 1 }} onPress={() => animateOut()} />
          </Animated.View>
          <Animated.View
            style={{
              transform: [{ translateY }],
              backgroundColor: theme.colors.surface,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingTop: theme.spacing.sm,
              paddingBottom: insets.bottom + theme.spacing.md,
              // Fixed height so the sheet doesn't resize when you switch tabs or
              // land on a reaction with only one person. Short lists leave white
              // space at the bottom; long lists scroll inside the list below.
              height: screenHeight * 0.55,
            }}
          >
            <View
              style={{
                alignSelf: 'center',
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: withOpacity(theme.colors.silver, 0.9),
                marginBottom: theme.spacing.sm,
              }}
            />
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: theme.spacing.lg,
                paddingBottom: theme.spacing.xs,
              }}
            >
              <RNText
                style={{
                  flex: 1,
                  fontFamily: fontFamilies.bold,
                  fontSize: 16,
                  color: theme.colors.ink,
                }}
              >
                Reactions
              </RNText>
              <Pressable
                onPress={() => animateOut()}
                hitSlop={12}
                style={({ pressed }) => ({
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: withOpacity(theme.colors.ink, 0.06),
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Icon name="xmark" size={13} tint={theme.colors.ink} weight="bold" />
              </Pressable>
            </View>

            {/* Tab row — All + one per emoji. Tapping filters the list below. */}
            <View
              style={{
                borderBottomWidth: 0.5,
                borderBottomColor: withOpacity(theme.colors.silver, 0.5),
              }}
            >
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: theme.spacing.md }}
              >
                <Pressable
                  onPress={() => setSelectedTab(ALL_TAB)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    paddingHorizontal: 14,
                    paddingVertical: 11,
                    borderBottomWidth: 2,
                    borderBottomColor:
                      selectedTab === ALL_TAB ? theme.colors.primary : 'transparent',
                  }}
                >
                  <RNText
                    style={{
                      fontFamily: fontFamilies.bold,
                      fontSize: 13,
                      color: tabColor(selectedTab === ALL_TAB),
                    }}
                  >
                    All
                  </RNText>
                  <RNText
                    style={{
                      fontFamily: fontFamilies.bold,
                      fontSize: 13,
                      color: tabColor(selectedTab === ALL_TAB),
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {total}
                  </RNText>
                </Pressable>
                {groups.map((g) => {
                  const active = selectedTab === g.emoji;
                  return (
                    <Pressable
                      key={g.emoji}
                      onPress={() => setSelectedTab(g.emoji)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 5,
                        paddingHorizontal: 14,
                        paddingVertical: 11,
                        borderBottomWidth: 2,
                        borderBottomColor: active ? theme.colors.primary : 'transparent',
                      }}
                    >
                      <RNText style={{ fontSize: 15 }}>{g.emoji}</RNText>
                      <RNText
                        style={{
                          fontFamily: fontFamilies.bold,
                          fontSize: 13,
                          color: tabColor(active),
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        {g.count}
                      </RNText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* People for the selected tab — flex:1 fills the fixed-height sheet
                so it scrolls when long and leaves white space when short. */}
            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {rows.map(({ reactor: r, emoji }, i) => (
                <View
                  key={emoji + r.userId + i}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: theme.spacing.lg,
                    paddingVertical: 9,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      overflow: 'hidden',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 12,
                    }}
                  >
                    <LinearGradient
                      colors={r.gradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFillObject}
                    />
                    <RNText
                      style={{
                        color: '#FFFFFF',
                        fontFamily: fontFamilies.bold,
                        fontSize: 13,
                      }}
                    >
                      {r.initials}
                    </RNText>
                  </View>
                  <RNText
                    numberOfLines={1}
                    style={{
                      flex: 1,
                      fontFamily: fontFamilies.semibold,
                      fontSize: 15,
                      color: theme.colors.ink,
                    }}
                  >
                    {r.name}
                    {r.isYou ? (
                      <RNText style={{ color: theme.colors.slate }}> (You)</RNText>
                    ) : null}
                  </RNText>
                  {selectedTab === ALL_TAB ? (
                    <RNText style={{ fontSize: 16, marginLeft: 8 }}>{emoji}</RNText>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    );
  },
);
