// Settings hub. The profile tab used to carry all of this inline as eight
// stacked sections; it now carries one row that lands here, and here is the
// only place that knows the sub-pages exist.

import { router } from 'expo-router';
import { Alert, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DividedList, SectionWrapper, SettingsHeader, SettingsRow } from '@/components/settings';
import { useAuth } from '@/lib/auth';
import { deleteAccount } from '@/lib/api';
import { useHomeData } from '@/lib/HomeDataProvider';
import { supabase } from '@/lib/supabase';
import { useArchivedPools } from '@/lib/useArchivedPools';
import { useTheme } from '@/theme';

// `id`, not `key` — spreading a props object that carries `key` into JSX is a
// React warning, and these rows are spread straight into <SettingsRow>.
type Row = {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  onPress: () => void;
};

export default function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const { data } = useHomeData();
  const { rows: archived, loading: archivedLoading } = useArchivedPools();

  const archivedSubtitle = archivedLoading
    ? 'Checking…'
    : archived && archived.length > 0
      ? `${archived.length} archived`
      : 'None archived';

  const items: Row[] = [
    {
      id: 'account',
      icon: 'person.crop.circle.fill',
      title: 'Account Information',
      subtitle: data?.username ? `@${data.username}` : 'Your profile and password',
      onPress: () => router.push('/settings/account'),
    },
    {
      id: 'notifications',
      icon: 'bell.fill',
      title: 'Notifications',
      subtitle: 'Push alerts and email preferences',
      onPress: () => router.push('/settings/notifications'),
    },
    {
      id: 'archived',
      icon: 'archivebox.fill',
      title: 'Archived Pools',
      subtitle: archivedSubtitle,
      onPress: () => router.push('/settings/archived-pools'),
    },
    {
      id: 'help',
      icon: 'questionmark.circle.fill',
      title: 'Help & Legal',
      subtitle: 'FAQs, privacy, terms and contact',
      onPress: () => router.push('/settings/help'),
    },
  ];

  const dangerItems: Row[] = [
    {
      id: 'sign-out',
      icon: 'rectangle.portrait.and.arrow.right',
      title: 'Sign Out',
      subtitle: 'You can sign back in any time',
      onPress: () => confirmSignOut(signOut),
    },
    {
      id: 'delete',
      icon: 'trash.fill',
      title: 'Delete Account',
      subtitle: 'Permanently remove all data',
      onPress: confirmDeleteAccount,
    },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <SettingsHeader title="Settings" />
      <ScrollView
        contentContainerStyle={{
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.xxl + insets.bottom,
          gap: theme.spacing.xl,
        }}
      >
        <SectionWrapper title="Preferences">
          <DividedList
            items={items}
            keyOf={(i) => i.id}
            render={({ id: _id, ...row }) => <SettingsRow {...row} />}
          />
        </SectionWrapper>

        <SectionWrapper title="Account Actions">
          <DividedList
            items={dangerItems}
            keyOf={(i) => i.id}
            render={({ id: _id, ...row }) => (
              <SettingsRow {...row} tone="danger" accessory="none" />
            )}
          />
        </SectionWrapper>
      </ScrollView>
    </View>
  );
}

function confirmSignOut(signOut: () => void | Promise<void>) {
  Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign Out', style: 'destructive', onPress: () => void signOut() },
  ]);
}

function confirmDeleteAccount() {
  Alert.alert(
    'Delete Account',
    'This is permanent. All your predictions, scores, and pool memberships will be permanently deleted.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAccount();
            await supabase.auth.signOut();
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Failed to delete account';
            Alert.alert('Delete failed', msg);
          }
        },
      },
    ],
  );
}
