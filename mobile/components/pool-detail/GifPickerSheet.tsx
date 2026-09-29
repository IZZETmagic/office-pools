// =============================================================
// GifPickerSheet — search KLIPY and pick a GIF for Banter
// =============================================================
// The phone twin of the web's GifPicker. KLIPY's terms shape it
// (see lib/klipy.ts): the request goes from this device straight to
// api.klipy.com, results keep KLIPY's order, and the search box reads
// "Search KLIPY" (their REQUIRED attribution).
//
// ⚠ The test key allows 100 requests an hour, so typing is debounced
// and paging is a button, not onEndReached firing on every flick.
//
// Plays the small GIF through expo-image — already in the binary, so
// this ships by OTA. The MP4 would be lighter but needs expo-video, a
// native module, which would mean a store build.
// =============================================================

import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  Text as RNText,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui';
import {
  KLIPY_SEARCH_PLACEHOLDER,
  klipyCustomerId,
  klipyGifsUrl,
  parseKlipyPage,
  type KlipyGif,
} from '@/lib/klipy';
import { fontFamilies, useTheme } from '@/theme';

/** Public by design — KLIPY requires the device, not our server, to call it. */
export const KLIPY_APP_KEY = process.env.EXPO_PUBLIC_KLIPY_API_KEY ?? '';

// Every format a message needs, whoever renders it: the phone plays the
// GIF, the web plays the MP4, and a GIF sent here is shown there too.
const FORMATS: ('mp4' | 'gif' | 'jpg')[] = ['mp4', 'gif', 'jpg'];

type Props = {
  visible: boolean;
  appUserId: string | null;
  onClose: () => void;
  /** `query` is the search that led here ('' for trending) — KLIPY's share trigger wants it. */
  onSelect: (gif: KlipyGif, query: string) => void;
};

export function GifPickerSheet({ visible, appUserId, onClose, onSelect }: Props) {
  const theme = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<KlipyGif[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 400);
    return () => clearTimeout(t);
  }, [query]);

  const load = useCallback(
    async (q: string, nextPage: number) => {
      if (!appUserId) return;
      const id = ++requestRef.current;
      setLoading(true);
      setFailed(false);
      try {
        const res = await fetch(
          klipyGifsUrl({
            apiKey: KLIPY_APP_KEY,
            customerId: klipyCustomerId(appUserId),
            q,
            page: nextPage,
            perPage: 24,
            formats: FORMATS,
          }),
        );
        const parsed = parseKlipyPage(await res.json());
        if (id !== requestRef.current) return; // a newer search superseded this one
        setItems((prev) => (nextPage === 1 ? parsed.items : [...prev, ...parsed.items]));
        setHasNext(parsed.hasNext);
        setPage(nextPage);
      } catch (err) {
        if (id !== requestRef.current) return;
        console.warn('[GifPickerSheet] KLIPY request failed', err);
        setFailed(true);
      } finally {
        if (id === requestRef.current) setLoading(false);
      }
    },
    [appUserId],
  );

  useEffect(() => {
    if (visible) void load(debounced, 1);
  }, [visible, debounced, load]);

  // Opening afresh starts on trending, not on whatever was searched last time.
  useEffect(() => {
    if (!visible) {
      setQuery('');
      setDebounced('');
    }
  }, [visible]);

  const gap = theme.spacing.xs;
  const pad = theme.spacing.lg;
  const tileWidth = (screenWidth - pad * 2 - gap) / 2;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: theme.colors.snow }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: pad,
            paddingTop: theme.spacing.lg,
            paddingBottom: theme.spacing.sm,
          }}
        >
          <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 17, color: theme.colors.ink }}>
            Send a GIF
          </RNText>
          <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
            <RNText style={{ fontFamily: fontFamilies.semibold, fontSize: 15, color: theme.colors.primary }}>
              Cancel
            </RNText>
          </Pressable>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginHorizontal: pad,
            marginBottom: theme.spacing.sm,
            paddingHorizontal: 12,
            height: 40,
            borderRadius: theme.radii.sm,
            backgroundColor: theme.colors.mist,
          }}
        >
          <Icon name="magnifyingglass" size={16} tint={theme.colors.slate} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={KLIPY_SEARCH_PLACEHOLDER}
            placeholderTextColor={theme.colors.slate}
            accessibilityLabel={KLIPY_SEARCH_PLACEHOLDER}
            autoCorrect={false}
            returnKeyType="search"
            style={{
              flex: 1,
              fontFamily: fontFamilies.medium,
              fontSize: 16,
              color: theme.colors.ink,
              paddingVertical: 0,
            }}
          />
        </View>

        {failed && items.length === 0 ? (
          <RNText style={{ textAlign: 'center', marginTop: 40, fontFamily: fontFamilies.medium, color: theme.colors.slate }}>
            GIFs couldn’t load. Try again in a moment.
          </RNText>
        ) : !loading && items.length === 0 ? (
          <RNText style={{ textAlign: 'center', marginTop: 40, fontFamily: fontFamilies.medium, color: theme.colors.slate }}>
            No GIFs for “{debounced}”.
          </RNText>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(g) => g.slug}
            numColumns={2}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={{ paddingHorizontal: pad, paddingBottom: pad, gap }}
            columnWrapperStyle={{ gap }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => onSelect(item, debounced)}
                accessibilityRole="button"
                accessibilityLabel={item.title || 'GIF'}
                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
              >
                <Image
                  source={{ uri: item.gifUrl ?? item.stillUrl ?? undefined }}
                  placeholder={item.stillUrl ? { uri: item.stillUrl } : undefined}
                  style={{
                    width: tileWidth,
                    height: Math.min(tileWidth * 1.4, (tileWidth * item.height) / item.width),
                    borderRadius: theme.radii.sm,
                    backgroundColor: theme.colors.mist,
                  }}
                  contentFit="cover"
                  autoplay
                  recyclingKey={item.slug}
                />
              </Pressable>
            )}
            ListFooterComponent={
              loading ? (
                <ActivityIndicator style={{ marginVertical: 16 }} color={theme.colors.slate} />
              ) : hasNext && items.length > 0 ? (
                <Pressable
                  onPress={() => void load(debounced, page + 1)}
                  style={({ pressed }) => ({
                    alignSelf: 'center',
                    marginTop: 12,
                    paddingHorizontal: 16,
                    height: 36,
                    borderRadius: 18,
                    justifyContent: 'center',
                    backgroundColor: theme.colors.mist,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <RNText style={{ fontFamily: fontFamilies.semibold, fontSize: 14, color: theme.colors.ink }}>
                    More GIFs
                  </RNText>
                </Pressable>
              ) : null
            }
          />
        )}

        <RNText
          style={{
            textAlign: 'right',
            paddingHorizontal: pad,
            paddingVertical: 8,
            fontFamily: fontFamilies.semibold,
            fontSize: 11,
            color: theme.colors.slate,
          }}
        >
          Powered by KLIPY
        </RNText>
      </SafeAreaView>
    </Modal>
  );
}
