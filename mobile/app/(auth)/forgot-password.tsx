import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { ResetShell } from '@/components/auth/ResetShell';
import { Button, Input } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { RESET_CODE_LENGTH, looksLikeEmail } from '@/lib/passwordReset';

/** Step 1 of 3: ask for the email, send the code. */
export default function ForgotPasswordScreen() {
  const { requestPasswordReset } = useAuth();
  // Carried over from sign-in, so someone who typed their email first
  // doesn't have to type it twice.
  const params = useLocalSearchParams<{ email?: string }>();
  const [email, setEmail] = useState(params.email ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSend = looksLikeEmail(email) && !loading;

  async function handleSend() {
    if (!canSend) return;
    setError(null);
    setLoading(true);
    const result = await requestPasswordReset(email);
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.push({ pathname: '/(auth)/reset-code', params: { email: email.trim() } });
  }

  return (
    <ResetShell
      icon="lock.fill"
      title="Reset your password"
      body={`Enter the email you signed up with and we’ll send you a ${RESET_CODE_LENGTH}-digit code.`}
      error={error}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/(auth)/sign-in'))}
    >
      <Input
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="send"
        autoFocus
        onSubmitEditing={handleSend}
      />
      <Button
        title="Send code"
        size="lg"
        fullWidth
        loading={loading}
        disabled={!looksLikeEmail(email)}
        onPress={handleSend}
      />
    </ResetShell>
  );
}
