import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text as RNText,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import { getCompetitionMarkPng, getPoolStripe } from '@/lib/design/competition';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

// =============================================================
// PICK ONE COMPETITION
// =============================================================
// `GroupPickerSheet` with a different row — same animation, same backdrop, same
// max-height rule — because a member should not be able to tell that the Team,
// Group and Competition pills are three different files.
//
// ⚠ THE CALLER DECIDES WHETHER THE PILL EXISTS AT ALL. `distinctCompetitions`
// returns an empty list for a member whose football is one league (or only the
// World Cup), and the filter bar hides the pill on that. This sheet therefore
// never needs an empty state — the same rule the Group pill was given after it
// shipped opening a blank sheet, which reads as broken rather than as
// inapplicable.
// =============================================================

export type CompetitionOption = {
  /** `external_league_id` — the brand key, and the filter's identity. */
  id: number;
  name: string;
  count: number;
};

export type CompetitionPickerSheetHandle = {
  open: () => void;
  close: () => void;
};

type Props = {
  competitions: CompetitionOption[];
  selectedId: number | null;
  onSelect: (competition: CompetitionOption | null) => void;
};

export const CompetitionPickerSheet = forwardRef<CompetitionPickerSheetHandle, Props>(
  function CompetitionPickerSheet({ competitions, selectedId, onSelect }, ref) {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const [visible, setVisible] = useState(false);

    const screenHeight = Dimensions.get('window').height;
    const backdropOpacity = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(screenHeight)).current;

    useImperativeHandle(ref, () => ({
      open: () => setVisible(true),
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

    function handleSelect(competition: CompetitionOption | null) {
      onSelect(competition);
      animateOut();
    }

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
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: theme.radii.xl,
            borderTopRightRadius: theme.radii.xl,
            transform: [{ translateY }],
            paddingBottom: insets.bottom + theme.spacing.sm,
            maxHeight: screenHeight - insets.top - 12,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              paddingHorizontal: theme.spacing.lg,
              paddingTop: theme.spacing.md,
              paddingBottom: theme.spacing.md,
            }}
          >
            <RNText
              style={{
                flex: 1,
                fontFamily: fontFamilies.bold,
                fontSize: 17,
                color: theme.colors.ink,
              }}
            >
              Select Competition
            </RNText>
            <CloseButton onPress={animateOut} />
          </View>

          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: theme.spacing.lg }}
          >
            {/* ⚠ THE WAY BACK OUT, and it has to be in the sheet. Every other
                pill returns to "All" by tapping Date, but a member who opened
                this to narrow the list looks for the undo where they made the
                choice. Without it the only exit is a control that looks like a
                different question. */}
            <Row
              label="All competitions"
              detail={`${competitions.reduce((n, c) => n + c.count, 0)} matches`}
              selected={selectedId === null}
              onPress={() => handleSelect(null)}
              divided={false}
            />
            {competitions.map((c) => (
              <Row
                key={c.id}
                label={c.name}
                detail={`${c.count} ${c.count === 1 ? 'match' : 'matches'}`}
                selected={selectedId === c.id}
                onPress={() => handleSelect(c)}
                competitionId={c.id}
                divided
              />
            ))}
          </ScrollView>
        </Animated.View>
      </Modal>
    );
  },
);

function Row({
  label,
  detail,
  selected,
  onPress,
  competitionId,
  divided,
}: {
  label: string;
  detail: string;
  selected: boolean;
  onPress: () => void;
  competitionId?: number;
  divided: boolean;
}) {
  const theme = useTheme();
  const mark = competitionId != null ? getCompetitionMarkPng(competitionId) : null;
  return (
    <View>
      {divided ? (
        <View style={{ height: 0.5, backgroundColor: withOpacity(theme.colors.silver, 0.5) }} />
      ) : null}
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 14,
          backgroundColor: pressed ? withOpacity(theme.colors.ink, 0.04) : 'transparent',
        })}
      >
        {competitionId != null ? (
          <LinearGradient
            colors={getPoolStripe(competitionId)}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {mark ? (
              <Image
                source={mark}
                style={{ width: 17, height: 17 }}
                resizeMode="contain"
                fadeDuration={0}
              />
            ) : null}
          </LinearGradient>
        ) : (
          // The "All" row keeps the same 26px lead-in so the labels line up
          // rather than stepping in and out by a chip's width.
          <View style={{ width: 26, height: 26 }} />
        )}
        <RNText
          numberOfLines={1}
          style={{
            flex: 1,
            fontFamily: fontFamilies.semibold,
            fontSize: 16,
            color: theme.colors.ink,
          }}
        >
          {label}
        </RNText>
        <RNText
          style={{
            fontFamily: fontFamilies.medium,
            fontSize: 12,
            color: theme.colors.slate,
          }}
        >
          {detail}
        </RNText>
        {selected ? (
          <Icon name="checkmark" size={13} tint={theme.colors.primary} weight="semibold" />
        ) : (
          <Icon name="chevron.right" size={11} tint={theme.colors.silver} weight="semibold" />
        )}
      </Pressable>
    </View>
  );
}

function CloseButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? withOpacity(theme.colors.ink, 0.08) : theme.colors.mist,
      })}
    >
      <Icon name="xmark" size={14} tint={theme.colors.ink} weight="semibold" />
    </Pressable>
  );
}
