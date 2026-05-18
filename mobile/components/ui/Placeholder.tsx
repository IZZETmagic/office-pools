import { View } from 'react-native';

import { Icon } from './Icon';
import { Screen } from './Screen';
import { Text } from './Text';
import { Wordmark } from './Wordmark';
import { useTheme, withOpacity } from '@/theme';

type PlaceholderProps = {
  title: string;
  caption?: string;
  icon: string;
};

export function Placeholder({ title, caption = 'Coming soon', icon }: PlaceholderProps) {
  const theme = useTheme();

  return (
    <Screen scroll={false} contentStyle={{ justifyContent: 'center', gap: theme.spacing.xxl }}>
      <View style={{ alignItems: 'center', gap: theme.spacing.lg }}>
        <View
          style={{
            width: 96,
            height: 96,
            borderRadius: theme.radii.xl,
            backgroundColor: withOpacity(theme.colors.primary, 0.08),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name={icon} color="primary" size={44} />
        </View>
        <Wordmark size={28} />
        <Text variant="sectionHeader" align="center">
          {title}
        </Text>
        <Text variant="body" color="slate" align="center">
          {caption}
        </Text>
      </View>
    </Screen>
  );
}
