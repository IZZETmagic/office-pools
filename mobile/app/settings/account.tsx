// Account Information. Read-only for now — the web profile
// (app/profile/ProfilePage.tsx → AccountSettingsTab) can edit username, full
// name and email; mobile deliberately still can't. Change Password moved here
// from the profile tab's old Security section.

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text as RNText,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { SectionWrapper, SettingsCard, SettingsHeader, SettingsRow } from '@/components/settings';
import { Icon } from '@/components/ui';
import { useHomeData } from '@/lib/HomeDataProvider';
import { supabase } from '@/lib/supabase';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

export default function AccountSettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { data } = useHomeData();
  const [passwordOpen, setPasswordOpen] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <SettingsHeader title="Account Information" />
      <ScrollView
        contentContainerStyle={{
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.xxl + insets.bottom,
          gap: theme.spacing.xl,
        }}
      >
        <SectionWrapper title="Profile">
          <SettingsCard>
            <AccountRow label="Username" value={data?.username ?? ''} />
            <Divider />
            <AccountRow label="Full Name" value={data?.fullName ?? ''} />
            <Divider />
            <AccountRow label="Email" value={data?.email ?? ''} />
          </SettingsCard>
          <RNText
            style={{
              marginTop: theme.spacing.sm,
              fontFamily: fontFamilies.medium,
              fontSize: 11,
              color: theme.colors.slate,
            }}
          >
            To change these, sign in on the web at sportpool.io.
          </RNText>
        </SectionWrapper>

        <SectionWrapper title="Security">
          <SettingsCard>
            <SettingsRow
              icon="lock.fill"
              title="Change Password"
              subtitle="Update your account password"
              onPress={() => setPasswordOpen(true)}
            />
          </SettingsCard>
        </SectionWrapper>
      </ScrollView>

      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </View>
  );
}

function AccountRow({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: theme.spacing.md,
        paddingVertical: 11,
      }}
    >
      <RNText
        style={{
          width: 76,
          fontFamily: fontFamilies.medium,
          fontSize: 12,
          color: theme.colors.slate,
        }}
      >
        {label}
      </RNText>
      <RNText
        numberOfLines={1}
        style={{ flex: 1, fontFamily: fontFamilies.medium, fontSize: 14, color: theme.colors.ink }}
      >
        {value}
      </RNText>
    </View>
  );
}

function Divider() {
  const theme = useTheme();
  return (
    <View
      style={{
        height: 0.5,
        marginHorizontal: theme.spacing.md - 2,
        backgroundColor: withOpacity(theme.colors.mist, 0.5),
      }}
    />
  );
}

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const theme = useTheme();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) {
      setNewPassword('');
      setConfirmPassword('');
      setError(null);
      setSuccess(false);
      setLoading(false);
    }
  }, [open]);

  async function handleSubmit() {
    setError(null);
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setLoading(true);
    const { error: updErr } = await supabase.auth.updateUser({ password: newPassword });
    setLoading(false);
    if (updErr) {
      setError(updErr.message);
      return;
    }
    setSuccess(true);
    setTimeout(onClose, 1200);
  }

  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.snow }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: theme.spacing.xl,
            paddingVertical: theme.spacing.md,
          }}
        >
          <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 17, color: theme.colors.ink }}>
            Change Password
          </RNText>
          <Pressable onPress={onClose} hitSlop={12}>
            <RNText
              style={{ fontFamily: fontFamilies.semibold, fontSize: 15, color: theme.colors.primary }}
            >
              Done
            </RNText>
          </Pressable>
        </View>

        {success ? (
          <View
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.md }}
          >
            <Icon name="checkmark.circle.fill" tint={theme.colors.green} size={48} weight="regular" />
            <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 18, color: theme.colors.ink }}>
              Password Updated
            </RNText>
          </View>
        ) : (
          <View style={{ padding: theme.spacing.xl, gap: theme.spacing.md }}>
            {error ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  padding: 10,
                  backgroundColor: theme.colors.redLight,
                  borderRadius: theme.radii.sm,
                }}
              >
                <Icon
                  name="exclamationmark.circle.fill"
                  tint={theme.colors.red}
                  size={12}
                  weight="regular"
                />
                <RNText
                  style={{
                    flex: 1,
                    fontFamily: fontFamilies.medium,
                    fontSize: 12,
                    color: theme.colors.red,
                  }}
                >
                  {error}
                </RNText>
              </View>
            ) : null}

            <LabeledInput
              label="NEW PASSWORD"
              placeholder="At least 8 characters"
              value={newPassword}
              onChangeText={setNewPassword}
              secure
            />
            <LabeledInput
              label="CONFIRM PASSWORD"
              placeholder="Re-enter password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secure
            />

            <Pressable
              onPress={handleSubmit}
              disabled={loading || !newPassword || !confirmPassword}
              style={({ pressed }) => ({
                marginTop: theme.spacing.sm,
                paddingVertical: theme.spacing.md + 2,
                alignItems: 'center',
                borderRadius: theme.radii.md,
                backgroundColor:
                  !newPassword || !confirmPassword
                    ? withOpacity(theme.colors.primary, 0.4)
                    : theme.colors.primary,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 15, color: '#FFFFFF' }}>
                  Update Password
                </RNText>
              )}
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

function LabeledInput({
  label,
  placeholder,
  value,
  onChangeText,
  secure,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (s: string) => void;
  secure?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 10,
          letterSpacing: 0.5,
          color: theme.colors.slate,
        }}
      >
        {label}
      </RNText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.slate}
        autoCapitalize="none"
        autoCorrect={false}
        style={{
          fontFamily: fontFamilies.medium,
          fontSize: 14,
          color: theme.colors.ink,
          padding: 12,
          backgroundColor: withOpacity(theme.colors.mist, 0.5),
          borderRadius: theme.radii.md,
        }}
      />
    </View>
  );
}
