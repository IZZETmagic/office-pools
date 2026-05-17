import { Link } from 'expo-router';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { Button, Card, Input, Screen, Text, Wordmark } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/theme';

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken';

export default function SignUpScreen() {
  const theme = useTheme();
  const { signUp, checkUsernameAvailable } = useAuth();

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateUsername = useCallback(async (value: string) => {
    if (value.length < 3 || !/^[a-zA-Z0-9_]+$/.test(value)) {
      setUsernameStatus('idle');
      return;
    }
    setUsernameStatus('checking');
    const available = await checkUsernameAvailable(value);
    setUsernameStatus(available ? 'available' : 'taken');
  }, [checkUsernameAvailable]);

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    const result = await signUp({
      email: email.trim(),
      password,
      username: username.trim(),
      fullName: fullName.trim(),
    });
    setLoading(false);
    if (result.error) {
      setError(result.error);
      if (result.error.toLowerCase().includes('taken')) {
        setUsernameStatus('taken');
      }
    }
  }

  const usernameHint =
    usernameStatus === 'checking'
      ? 'Checking…'
      : usernameStatus === 'available'
        ? 'Available ✓'
        : usernameStatus === 'taken'
          ? 'Taken'
          : '3–20 chars; letters, numbers, underscores';

  const usernameError =
    username.length > 0 && username.length < 3
      ? 'At least 3 characters'
      : username.length > 0 && !/^[a-zA-Z0-9_]*$/.test(username)
        ? 'Only letters, numbers, and underscores'
        : usernameStatus === 'taken'
          ? 'That username is taken'
          : undefined;

  const disabled =
    !fullName ||
    !username ||
    !email ||
    !password ||
    usernameStatus === 'taken' ||
    usernameStatus === 'checking';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <Screen>
        <View style={{ gap: theme.spacing.sm, alignItems: 'center', marginTop: theme.spacing.lg }}>
          <Wordmark size={32} />
          <Text variant="body" color="slate" align="center">
            Get started with your prediction pool
          </Text>
        </View>

        <Card>
          <View style={{ gap: theme.spacing.lg }}>
            {error ? (
              <View
                style={{
                  padding: theme.spacing.md,
                  borderRadius: theme.radii.md,
                  backgroundColor: theme.colors.redLight,
                }}
              >
                <Text variant="body" color="red">
                  {error}
                </Text>
              </View>
            ) : null}

            <Input
              label="Full Name"
              value={fullName}
              onChangeText={setFullName}
              placeholder="John Smith"
              autoCapitalize="words"
              autoComplete="name"
              textContentType="name"
              returnKeyType="next"
            />

            <Input
              label="Username"
              value={username}
              onChangeText={(value) => {
                setUsername(value);
                setUsernameStatus('idle');
              }}
              onBlur={() => validateUsername(username)}
              placeholder="johnsmith"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
              helperText={usernameHint}
              error={usernameError}
              returnKeyType="next"
            />

            <Input
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              returnKeyType="next"
            />

            <Input
              label="Password"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              helperText="At least 6 characters"
              returnKeyType="go"
              onSubmitEditing={handleSubmit}
            />

            <Button
              title="Sign Up"
              size="lg"
              fullWidth
              loading={loading}
              disabled={disabled}
              onPress={handleSubmit}
            />
          </View>
        </Card>

        <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
          <Text variant="body" color="slate">
            Already have an account?
          </Text>
          <Link href="/(auth)/sign-in" asChild>
            <Text variant="cardTitle" color="primary">
              Sign in
            </Text>
          </Link>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
