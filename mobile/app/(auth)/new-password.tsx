import { useState } from 'react';
import { Pressable } from 'react-native';

import { ResetShell } from '@/components/auth/ResetShell';
import { Button, Input, Text } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { MIN_PASSWORD_LENGTH, validateNewPassword } from '@/lib/passwordReset';
import { useTheme } from '@/theme';

/**
 * Step 3 of 3: choose the new password. Reached only through the root gate,
 * which holds a `recovering` person here.
 *
 * Both ways out clear `recovering`, and the gate then routes onward exactly as
 * it would after a sign-in. "Not now" leaves them signed in (Ryan, 2026-10-04):
 * the code already proved the inbox is theirs.
 */
export default function NewPasswordScreen() {
  const theme = useTheme();
  const { completePasswordReset, skipPasswordReset } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    const invalid = validateNewPassword(password, confirm);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    setSaving(true);
    const result = await completePasswordReset(password);
    if (result.error) {
      setSaving(false);
      setError(result.error);
    }
  }

  return (
    <ResetShell
      icon="lock.fill"
      title="Choose a new password"
      body="You’re signed in. Set a new password for next time, or do it later in Profile → Account."
      error={error}
    >
      <Input
        value={password}
        onChangeText={setPassword}
        placeholder="New password"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        autoFocus
        helperText={`At least ${MIN_PASSWORD_LENGTH} characters`}
      />
      <Input
        value={confirm}
        onChangeText={setConfirm}
        placeholder="Confirm new password"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={handleSave}
      />
      <Button
        title="Save password"
        size="lg"
        fullWidth
        loading={saving}
        disabled={!password || !confirm}
        onPress={handleSave}
      />
      <Pressable
        onPress={skipPasswordReset}
        disabled={saving}
        style={({ pressed }) => ({
          alignSelf: 'center',
          opacity: pressed ? 0.6 : 1,
          paddingVertical: theme.spacing.sm,
        })}
      >
        <Text variant="cardTitle" color="primary">
          Not now
        </Text>
      </Pressable>
    </ResetShell>
  );
}
