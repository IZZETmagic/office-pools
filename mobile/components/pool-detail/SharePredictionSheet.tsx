import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef } from 'react';
import { Image, Pressable, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fontFamilies, useTheme, withOpacity } from '@/theme';

export type PredictionOutcome = 'exact' | 'correct' | 'miss';

export type PredictionOption = {
  key: string;
  homeName: string;
  homeFlag: string | null;
  awayName: string;
  awayFlag: string | null;
  predictedHome: number;
  predictedAway: number;
  actualHome: number;
  actualAway: number;
  outcome: PredictionOutcome;
  matchNumber: number;
  stage: string;
};

const OUTCOME_TOKENS: Record<PredictionOutcome, { token: 'amber' | 'green' | 'red'; label: string }> = {
  exact: { token: 'amber', label: '★ EXACT' },
  correct: { token: 'green', label: '✓ CORRECT' },
  miss: { token: 'red', label: '✗ MISS' },
};

export type SharePredictionSheetHandle = {
  open: () => void;
  close: () => void;
};

type Props = {
  options: PredictionOption[];
  onPick: (key: string) => void;
};

export const SharePredictionSheet = forwardRef<SharePredictionSheetHandle, Props>(
  function SharePredictionSheet({ options, onPick }, ref) {
    const theme = useTheme();
    const insets = useSafeAreaInsets();
    const sheetRef = useRef<BottomSheet | null>(null);

    useImperativeHandle(ref, () => ({
      open: () => sheetRef.current?.expand(),
      close: () => sheetRef.current?.close(),
    }));

    const snapPoints = useMemo<(string | number)[]>(() => ['65%', '90%'], []);

    const renderBackdrop = useCallback(
      (props: BottomSheetBackdropProps) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          opacity={0.4}
        />
      ),
      [],
    );

    function handlePick(key: string) {
      sheetRef.current?.close();
      onPick(key);
    }

    return (
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={{ backgroundColor: theme.colors.silver }}
        backgroundStyle={{ backgroundColor: theme.colors.surface }}
      >
        <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.md }}>
          <RNText
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 16,
              color: theme.colors.ink,
            }}
          >
            Share which prediction?
          </RNText>
          <RNText
            style={{
              fontFamily: fontFamilies.regular,
              fontSize: 13,
              color: theme.colors.slate,
              marginTop: 2,
            }}
          >
            {options.length === 0
              ? "You haven't predicted any matches yet."
              : `${options.length} ${options.length === 1 ? 'pick' : 'picks'} to share`}
          </RNText>
        </View>
        <BottomSheetScrollView
          contentContainerStyle={{
            paddingHorizontal: theme.spacing.lg,
            paddingBottom: insets.bottom + theme.spacing.md,
            gap: 6,
          }}
        >
          {options.map((opt) => (
            <PredictionRow key={opt.key} option={opt} onPress={() => handlePick(opt.key)} />
          ))}
        </BottomSheetScrollView>
      </BottomSheet>
    );
  },
);

function PredictionRow({
  option,
  onPress,
}: {
  option: PredictionOption;
  onPress: () => void;
}) {
  const theme = useTheme();
  const outcome = OUTCOME_TOKENS[option.outcome];
  const outcomeColor = theme.colors[outcome.token];
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        gap: 8,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: pressed
          ? withOpacity(theme.colors.ink, 0.06)
          : theme.colors.surface,
        borderWidth: 0.5,
        borderColor: withOpacity(theme.colors.silver, 0.5),
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <RNText
          style={{
            fontFamily: fontFamilies.semibold,
            fontSize: 11,
            color: theme.colors.slate,
            letterSpacing: 0.2,
          }}
        >
          Match {option.matchNumber} · {option.stage}
        </RNText>
        <View
          style={{
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 12,
            backgroundColor: withOpacity(outcomeColor, 0.14),
          }}
        >
          <RNText
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 10,
              color: outcomeColor,
              letterSpacing: 0.5,
            }}
          >
            {outcome.label}
          </RNText>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TeamCell name={option.homeName} flag={option.homeFlag} align="right" />
        <View
          style={{
            alignItems: 'center',
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 10,
            backgroundColor: withOpacity(theme.colors.ink, 0.04),
            minWidth: 60,
          }}
        >
          <RNText
            style={{
              fontFamily: fontFamilies.regular,
              fontSize: 11,
              color: theme.colors.slate,
              fontVariant: ['tabular-nums'],
            }}
          >
            {option.predictedHome}–{option.predictedAway}
          </RNText>
          <RNText
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 16,
              color: theme.colors.ink,
              fontVariant: ['tabular-nums'],
              lineHeight: 18,
            }}
          >
            {option.actualHome}–{option.actualAway}
          </RNText>
        </View>
        <TeamCell name={option.awayName} flag={option.awayFlag} align="left" />
      </View>
    </Pressable>
  );
}

function TeamCell({
  name,
  flag,
  align,
}: {
  name: string;
  flag: string | null;
  align: 'left' | 'right';
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        flexDirection: align === 'right' ? 'row-reverse' : 'row',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {flag ? (
        <Image
          source={{ uri: flag }}
          style={{ width: 18, height: 13, borderRadius: 2 }}
          resizeMode="cover"
        />
      ) : (
        <View
          style={{ width: 18, height: 13, borderRadius: 2, backgroundColor: theme.colors.mist }}
        />
      )}
      <RNText
        numberOfLines={1}
        style={{
          flex: 1,
          fontFamily: fontFamilies.semibold,
          fontSize: 13,
          color: theme.colors.ink,
          textAlign: align,
        }}
      >
        {name}
      </RNText>
    </View>
  );
}
