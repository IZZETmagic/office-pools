import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Platform, View } from 'react-native';

import { type ColorToken, useTheme } from '@/theme';

type IconProps = {
  name: SymbolViewProps['name'];
  size?: number;
  color?: ColorToken;
  weight?: SymbolViewProps['weight'];
};

export function Icon({ name, size = 24, color = 'ink', weight = 'regular' }: IconProps) {
  const theme = useTheme();
  if (Platform.OS === 'ios') {
    return (
      <SymbolView
        name={name}
        size={size}
        tintColor={theme.colors[color]}
        weight={weight}
        resizeMode="scaleAspectFit"
      />
    );
  }
  // Phase 3b.1: replace with lucide-react-native fallback before Android GA.
  return <View style={{ width: size, height: size }} />;
}
