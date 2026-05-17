import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text as RNText, View } from 'react-native';

import { useTheme, withOpacity } from '@/theme';

type CountdownHeroProps = {
  daysUntilKickoff: number;
};

const GLOWS = [
  { color: '#4B2D8E', size: 180, opacity: 0.35, blur: 60, top: -50, left: -120 },
  { color: '#DC0032', size: 150, opacity: 0.25, blur: 50, top: -30, right: -50 },
  { color: '#00A3AD', size: 120, opacity: 0.2, blur: 45, bottom: -40, right: -30 },
  { color: '#00B140', size: 100, opacity: 0.15, blur: 40, bottom: -10, left: -40 },
  { color: '#E4007C', size: 90, opacity: 0.12, blur: 35, top: 30, left: '40%' as const },
];

export function CountdownHero({ daysUntilKickoff }: CountdownHeroProps) {
  const theme = useTheme();

  return (
    <LinearGradient
      colors={['#0A0A12', '#12101E']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        height: 180,
        borderRadius: theme.radii.lg,
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
        gap: theme.spacing.sm,
      }}
    >
      {GLOWS.map((g, i) => (
        <View
          key={i}
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: g.size,
            height: g.size,
            borderRadius: g.size / 2,
            backgroundColor: withOpacity(g.color, g.opacity),
            shadowColor: g.color,
            shadowOpacity: 0.6,
            shadowRadius: g.blur,
            shadowOffset: { width: 0, height: 0 },
            top: g.top,
            left: g.left,
            right: g.right,
            bottom: g.bottom,
          }}
        />
      ))}

      <BlurView
        intensity={70}
        tint="dark"
        pointerEvents="none"
        style={StyleSheet.absoluteFillObject}
      />

      <RNText
        style={{
          fontFamily: 'Nunito_700Bold',
          fontSize: 11,
          letterSpacing: 2,
          color: '#FFD100',
          textTransform: 'uppercase',
        }}
      >
        FIFA World Cup
      </RNText>

      <RNText
        style={{
          fontFamily: 'Nunito_900Black',
          fontSize: 56,
          color: '#FFFFFF',
          lineHeight: 64,
        }}
      >
        {daysUntilKickoff}
      </RNText>

      <RNText
        style={{
          fontFamily: 'Nunito_700Bold',
          fontSize: 11,
          letterSpacing: 1.5,
          color: 'rgba(255,255,255,0.7)',
          textTransform: 'uppercase',
        }}
      >
        Days to Kickoff
      </RNText>
    </LinearGradient>
  );
}
