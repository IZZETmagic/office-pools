import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { ResetShell } from '@/components/auth/ResetShell';
import { Button, Input, Text, Pressable } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  RESEND_COOLDOWN_SECONDS,
  RESET_CODE_LENGTH,
  formatResetCode,
  normalizeResetCode,
} from '@/lib/passwordReset';
import { hapticFailure, hapticKeyTick, hapticSuccess } from '@/lib/haptics';
import { useTheme } from '@/theme';

/**
 * Step 2 of 3: type the code from the email.
 *
 * ⚠ THIS SCREEN NEVER NAVIGATES FORWARD. A right code creates a session and
 * raises `recovering`; the root gate sees both and replaces this screen with
 * new-password. Pushing from here as well would race the gate.
 */
export default function ResetCodeScreen() {
  const theme = useTheme();
  const { verifyResetCode, requestPasswordReset } = useAuth();
  const { email = '' } = useLocalSearchParams<{ email: string }>();

  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Starts full: the code was sent a moment ago, on the way to this screen.
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function submit(value: string) {
    if (verifying || value.length !== RESET_CODE_LENGTH) return;
    setError(null);
    setNotice(null);
    setVerifying(true);
    const result = await verifyResetCode(email, value);
    if (result.error) {
      // ⚠ The field CLEARS on a bad code, so the only other signal that
      // anything happened is six digits vanishing. Worth a buzz.
      hapticFailure();
      setVerifying(false);
      setError(result.error);
      setCode('');
    } else {
      hapticSuccess();
    }
  }

  function handleChange(text: string) {
    const next = normalizeResetCode(text);
    // ⚠ ONLY WHEN THE CODE GETS LONGER. `handleChange` fires on deletes and on
    // a paste too; ticking per keystroke regardless would buzz backwards while
    // someone corrects a typo, and fire once for an autofilled code that
    // arrived whole rather than six times.
    if (next.length === code.length + 1) hapticKeyTick();
    setCode(next);
    // A full code submits itself — which is what an autofilled code from Mail
    // looks like, so the person never has to find the button.
    if (next.length === RESET_CODE_LENGTH) void submit(next);
  }

  async function handleResend() {
    setError(null);
    setNotice(null);
    setCooldown(RESEND_COOLDOWN_SECONDS);
    const result = await requestPasswordReset(email);
    if (result.error) setError(result.error);
    else setNotice('We sent a new code. Use the newest one.');
  }

  return (
    <ResetShell
      icon="envelope.fill"
      title="Check your email"
      body={`If there’s a SportPool account for ${email}, we’ve sent it a ${RESET_CODE_LENGTH}-digit code.`}
      error={error}
      notice={notice}
      onBack={() => router.back()}
    >
      <Input
        // Held as digits, shown as the email prints it: 123-456.
        value={formatResetCode(code)}
        onChangeText={handleChange}
        placeholder={formatResetCode('0'.repeat(RESET_CODE_LENGTH))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={RESET_CODE_LENGTH + 4}
        autoFocus
        editable={!verifying}
        accessibilityLabel={`${RESET_CODE_LENGTH}-digit code`}
        style={{ textAlign: 'center', fontSize: 24, letterSpacing: 4 }}
      />
      <Button
        title="Continue"
        size="lg"
        fullWidth
        loading={verifying}
        disabled={code.length !== RESET_CODE_LENGTH}
        onPress={() => submit(code)}
      />
      <Pressable
        onPress={handleResend}
        disabled={cooldown > 0 || verifying}
        style={({ pressed }) => ({
          alignSelf: 'center',
          opacity: pressed ? 0.6 : 1,
          paddingVertical: theme.spacing.sm,
        })}
      >
        <Text variant="cardTitle" color={cooldown > 0 ? 'slate' : 'primary'}>
          {cooldown > 0 ? `Send a new code in ${cooldown}s` : 'Send a new code'}
        </Text>
      </Pressable>
    </ResetShell>
  );
}
