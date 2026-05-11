import { Text, View } from 'react-native';

import { fontFamilies, useTheme } from '@/theme';

type WordmarkProps = {
  size?: number;
  onDark?: boolean;
};

export function Wordmark({ size = 32, onDark = false }: WordmarkProps) {
  const theme = useTheme();
  const sportColor = onDark ? '#FFFFFF' : theme.colors.ink;
  const poolColor = theme.colors.primary;
  const baseStyle = {
    fontFamily: fontFamilies.black,
    fontSize: size,
    lineHeight: Math.round(size * 1.1),
  };

  return (
    <View style={{ flexDirection: 'row' }}>
      <Text style={[baseStyle, { color: sportColor }]}>Sport</Text>
      <Text style={[baseStyle, { color: poolColor }]}>Pool</Text>
    </View>
  );
}
