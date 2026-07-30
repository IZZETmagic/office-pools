// Help & Legal — external links, opened in an in-app browser so the user
// keeps their place in the app.

import * as WebBrowser from 'expo-web-browser';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DividedList, SectionWrapper, SettingsHeader, SettingsRow } from '@/components/settings';
import { useTheme } from '@/theme';

const LEGAL_LINKS: { label: string; url: string; icon: string; desc: string }[] = [
  {
    label: 'FAQs',
    url: 'https://sportpool.io/faq',
    icon: 'questionmark.circle.fill',
    desc: 'How pools, picks and scoring work',
  },
  {
    label: 'Privacy Policy',
    url: 'https://sportpool.io/privacy',
    icon: 'hand.raised.fill',
    desc: 'What we collect and why',
  },
  {
    label: 'Terms & Conditions',
    url: 'https://sportpool.io/terms',
    icon: 'doc.text.fill',
    desc: 'The rules of using SportPool',
  },
  {
    label: 'Contact Us',
    url: 'https://sportpool.io/contact',
    icon: 'envelope.fill',
    desc: 'Questions, bugs and feedback',
  },
];

export default function HelpScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  async function openLink(url: string) {
    try {
      await WebBrowser.openBrowserAsync(url, {
        // Match the app's primary so the modal toolbar looks branded.
        toolbarColor: theme.colors.surface,
        controlsColor: theme.colors.primary,
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      });
    } catch (err) {
      console.warn('[settings/help] failed to open browser', err);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      <SettingsHeader title="Help & Legal" />
      <ScrollView
        contentContainerStyle={{
          paddingTop: theme.spacing.md,
          paddingBottom: theme.spacing.xxl + insets.bottom,
          gap: theme.spacing.xl,
        }}
      >
        <SectionWrapper title="Help & Legal">
          <DividedList
            items={LEGAL_LINKS}
            keyOf={(l) => l.url}
            render={(l) => (
              <SettingsRow
                icon={l.icon}
                title={l.label}
                subtitle={l.desc}
                accessory="external"
                onPress={() => void openLink(l.url)}
              />
            )}
          />
        </SectionWrapper>
      </ScrollView>
    </View>
  );
}
