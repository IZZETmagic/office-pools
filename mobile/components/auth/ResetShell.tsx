import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon, Text, Pressable } from '@/components/ui';
import { useTheme } from '@/theme';

type ResetShellProps = {
  icon: string;
  title: string;
  body: string;
  error?: string | null;
  /** Good news worth saying, e.g. "we sent a new code". Never shown with an error. */
  notice?: string | null;
  /** Shows a back chevron when set. */
  onBack?: () => void;
  children: ReactNode;
};

/**
 * The frame the three password-reset screens share. Laid out like sign-in —
 * the message centred in the space above, the form and its error pinned above
 * the keyboard — so the flow reads as part of signing in, not a detour from it.
 */
export function ResetShell({ icon, title, body, error, notice, onBack, children }: ResetShellProps) {
  const theme = useTheme();

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.snow }}
      edges={['top', 'bottom', 'left', 'right']}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View style={{ flex: 1, paddingHorizontal: theme.spacing.xl }}>
          <View style={{ height: 44, justifyContent: 'center' }}>
            {onBack ? (
              <Pressable
                onPress={onBack}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Back"
                style={({ pressed }) => ({ alignSelf: 'flex-start', opacity: pressed ? 0.6 : 1 })}
              >
                <Icon name="chevron.left" color="ink" size={22} />
              </Pressable>
            ) : null}
          </View>

          <View
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              gap: theme.spacing.md,
            }}
          >
            <Icon name={icon} color="primary" size={48} />
            <Text variant="pageTitle" align="center">
              {title}
            </Text>
            <Text variant="body" color="slate" align="center">
              {body}
            </Text>
          </View>

          <View style={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xl }}>
            {error ? (
              <Banner tone="error" text={error} />
            ) : notice ? (
              <Banner tone="notice" text={notice} />
            ) : null}
            {children}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Banner({ tone, text }: { tone: 'error' | 'notice'; text: string }) {
  const theme = useTheme();
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{
        padding: theme.spacing.md,
        borderRadius: theme.radii.md,
        backgroundColor: tone === 'error' ? theme.colors.redLight : theme.colors.primaryLight,
      }}
    >
      <Text variant="body" color={tone === 'error' ? 'red' : 'primary'} align="center">
        {text}
      </Text>
    </View>
  );
}
