import { forwardRef, useState } from 'react';
import {
  TextInput,
  View,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Text } from './Text';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type InputProps = TextInputProps & {
  label?: string;
  helperText?: string;
  error?: string;
  rightSlot?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
};

export const Input = forwardRef<TextInput, InputProps>(function Input(
  { label, helperText, error, rightSlot, containerStyle, style, ...props },
  ref,
) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  const borderColor = error
    ? theme.colors.red
    : focused
      ? theme.colors.primary
      : 'transparent';

  return (
    <View style={[{ gap: theme.spacing.xs }, containerStyle]}>
      {label ? (
        <Text variant="caption" color="slate">
          {label}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: theme.colors.mist,
          borderRadius: theme.radii.md,
          borderWidth: focused || error ? theme.borders.standard : 0,
          borderColor,
          paddingHorizontal: theme.spacing.lg,
        }}
      >
        <TextInput
          {...props}
          ref={ref}
          onFocus={(e) => {
            setFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            props.onBlur?.(e);
          }}
          placeholderTextColor={withOpacity(theme.colors.slate, 0.7)}
          style={[
            {
              flex: 1,
              paddingVertical: theme.spacing.lg,
              fontFamily: fontFamilies.medium,
              fontSize: 16,
              color: theme.colors.ink,
            },
            style,
          ]}
        />
        {rightSlot}
      </View>
      {error ? (
        <Text variant="detail" color="red">
          {error}
        </Text>
      ) : helperText ? (
        <Text variant="detail" color="slate">
          {helperText}
        </Text>
      ) : null}
    </View>
  );
});
