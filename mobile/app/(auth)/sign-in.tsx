import { Link } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Icon, Input, Text, Wordmark } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useTheme, withOpacity } from '@/theme';

export default function SignInScreen() {
  const theme = useTheme();
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    const result = await signIn(email.trim(), password);
    setLoading(false);
    if (result.error) setError(result.error);
  }

  function handleForgotPassword() {
    Alert.alert(
      'Reset on web',
      'Password reset is available on the web app. Visit officepools.app, reset your password, then sign in here.',
    );
  }

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
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.lg }}>
            <Icon name="trophy.fill" color="primary" size={64} />
            <Wordmark size={36} />
            <Text variant="body" color="slate" align="center">
              Predict. Compete. Win.
            </Text>
          </View>

          <View style={{ gap: theme.spacing.lg, paddingBottom: theme.spacing.xl }}>
            {error ? (
              <View
                style={{
                  padding: theme.spacing.md,
                  borderRadius: theme.radii.md,
                  backgroundColor: theme.colors.redLight,
                }}
              >
                <Text variant="body" color="red" align="center">
                  {error}
                </Text>
              </View>
            ) : null}

            <Input
              value={email}
              onChangeText={setEmail}
              placeholder="Email"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="next"
            />

            <Input
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
            />

            <Button
              title="Sign In"
              size="lg"
              fullWidth
              loading={loading}
              disabled={!email || !password}
              onPress={handleSubmit}
            />

            <Pressable
              onPress={handleForgotPassword}
              style={({ pressed }) => ({
                alignSelf: 'center',
                opacity: pressed ? 0.6 : 1,
                paddingVertical: theme.spacing.sm,
              })}
            >
              <Text variant="cardTitle" color="primary">
                Forgot password?
              </Text>
            </Pressable>
          </View>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              alignItems: 'center',
              gap: theme.spacing.sm,
              paddingTop: theme.spacing.lg,
            }}
          >
            <Text variant="body" color="slate">
              Don&apos;t have an account?
            </Text>
            <Link href="/(auth)/sign-up" asChild>
              <Pressable>
                {({ pressed }) => (
                  <Text variant="cardTitle" color="primary" style={{ opacity: pressed ? 0.6 : 1 }}>
                    Sign Up
                  </Text>
                )}
              </Pressable>
            </Link>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
