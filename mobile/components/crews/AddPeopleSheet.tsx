// Add people to a crew — captain and co-captain only (the crew page only offers it to them; the API
// refuses anyone else).
//
// ⭐ A LOOKUP, NEVER A BROWSE (Ryan, 2026-10-02). One field: an exact username or an email.
//   · A username shows EVERY exact, case-insensitive match with their face, so the captain picks the
//     right one — production has 36 username pairs that differ only by case ("Dave" / "dave").
//     No prefix search, no suggestions, no list of people you might know.
//   · An email always answers "Invite sent" — whether or not it has an account. It never reveals who
//     is on SportPool. Someone without an account gets one invite email carrying a one-time link;
//     whoever opens it can join (migration 155 — never by signing up with the address, which proves
//     nothing while email confirmation is off).
// Either way the person taps Join once before they're in.

import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetTextInput,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text as RNText, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, Text, useSheetChrome } from '@/components/ui';
import { inviteToCrew, lookupUsername } from '@/lib/api';
import { invitePreviewText, personName, type Person } from '@/lib/crews';
import { useHomeData } from '@/lib/HomeDataProvider';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

import { CrewFace } from './CrewFace';

export type AddPeopleSheetHandle = { open: () => void; close: () => void };

type RowState = { kind: 'idle' } | { kind: 'busy' } | { kind: 'added' } | { kind: 'error'; message: string };

const looksLikeEmail = (s: string) => s.includes('@') && !s.startsWith('@');

export const AddPeopleSheet = forwardRef<
  AddPeopleSheetHandle,
  { crewId: string; crewName: string; onChanged: () => void }
>(function AddPeopleSheet({ crewId, crewName, onChanged }, ref) {
  const theme = useTheme();
  const sheetChrome = useSheetChrome('surface');
  const insets = useSafeAreaInsets();
  const sheetRef = useRef<BottomSheet | null>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<Person[] | null>(null);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [note, setNote] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const { data: home } = useHomeData();
  const inviterName = home?.fullName?.trim() || home?.username || 'You';
  const emailTyped = looksLikeEmail(query.trim());

  useImperativeHandle(ref, () => ({
    open: () => {
      setQuery('');
      setMatches(null);
      setRows({});
      setNote(null);
      sheetRef.current?.expand();
    },
    close: () => sheetRef.current?.close(),
  }));

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.4} />,
    [],
  );

  async function find() {
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    setNote(null);
    setMatches(null);
    try {
      if (looksLikeEmail(q)) {
        await inviteToCrew(crewId, { email: q });
        // ⚠ The same answer whether or not the address has an account — never reveal who's on SportPool.
        setNote({ tone: 'ok', text: `Invite sent to ${q.toLowerCase()}. They’ll tap Join once to be in.` });
        setQuery('');
        onChanged();
      } else {
        const { matches: found } = await lookupUsername(q.replace(/^@/, ''));
        setMatches(found);
        setRows({});
        if (found.length === 0) setNote({ tone: 'bad', text: 'Nobody has that exact username.' });
        else if (found.length > 1) setNote({ tone: 'ok', text: `${found.length} people have that username — which one?` });
      }
    } catch (e) {
      setNote({ tone: 'bad', text: e instanceof Error ? e.message : 'That didn’t work. Please try again.' });
    } finally {
      setSearching(false);
    }
  }

  async function add(p: Person) {
    setRows((r) => ({ ...r, [p.userId]: { kind: 'busy' } }));
    try {
      await inviteToCrew(crewId, { userId: p.userId });
      setRows((r) => ({ ...r, [p.userId]: { kind: 'added' } }));
      onChanged();
    } catch (e) {
      setRows((r) => ({ ...r, [p.userId]: { kind: 'error', message: e instanceof Error ? e.message : 'Couldn’t add them.' } }));
    }
  }

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      enableDynamicSizing
      enablePanDownToClose
      backdropComponent={renderBackdrop}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      {...sheetChrome}
    >
      {/* ⚠ BottomSheetView, not BottomSheetScrollView (Ryan, 2026-10-02: "doesn't slide up far
          enough to actually see all the words"). With dynamic sizing the scroll view measured the
          sheet short, so the bottom of the content sat below what was visible. BottomSheetView is
          what JoinPoolSheet and SaveCrewSheet use, with the same keyboard props. The content is
          short — a field, a note, at most five exact matches — so nothing here needs to scroll. */}
      <BottomSheetView
        style={{
          paddingHorizontal: theme.spacing.xl,
          paddingTop: theme.spacing.sm,
          paddingBottom: insets.bottom + theme.spacing.md,
          gap: theme.spacing.lg,
        }}
      >
        <View style={{ alignItems: 'center', gap: theme.spacing.sm }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: theme.radii.xl,
              backgroundColor: withOpacity(theme.colors.primary, 0.1),
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="person.badge.plus" color="primary" size={26} weight="semibold" />
          </View>
          <Text variant="cardTitle" align="center">
            Add people
          </Text>
        </View>

        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <BottomSheetTextInput
            value={query}
            onChangeText={(v) => {
              setQuery(v);
              setNote(null);
            }}
            placeholder="Username or email"
            placeholderTextColor={theme.colors.slate}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            returnKeyType="search"
            onSubmitEditing={() => void find()}
            style={{
              flex: 1,
              backgroundColor: theme.colors.mist,
              borderRadius: theme.radii.md,
              paddingHorizontal: theme.spacing.md,
              paddingVertical: theme.spacing.md,
              fontFamily: fontFamilies.semibold,
              fontSize: 15,
              color: theme.colors.ink,
            }}
          />
          <Pressable
            onPress={() => void find()}
            disabled={!query.trim() || searching}
            accessibilityRole="button"
            style={({ pressed }) => ({
              paddingHorizontal: theme.spacing.lg,
              borderRadius: theme.radii.md,
              backgroundColor: theme.colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: !query.trim() || searching ? 0.5 : pressed ? 0.85 : 1,
            })}
          >
            {searching ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 14, color: '#FFFFFF' }}>
                {looksLikeEmail(query.trim()) ? 'Invite' : 'Find'}
              </RNText>
            )}
          </Pressable>
        </View>

        {/* The 2026-10-02 rule: invitations name who asked — once, and the captain sees the email's
            own first line before pressing Invite. Worded so it never says whether the address has
            an account. */}
        {emailTyped && !note ? (
          <View style={{ padding: theme.spacing.md, borderRadius: theme.radii.md, backgroundColor: theme.colors.mist, gap: 4 }}>
            <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 12, color: theme.colors.slate }}>
              We’ll send them one email:
            </RNText>
            <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 13, lineHeight: 18, color: theme.colors.ink }}>
              “{invitePreviewText(inviterName, crewName)}”
            </RNText>
            <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 11.5, lineHeight: 16, color: theme.colors.slate }}>
              From SportPool, never followed up. If they already use SportPool, it’ll be waiting in their app too.
            </RNText>
          </View>
        ) : null}

        {note ? (
          <RNText
            style={{
              fontFamily: fontFamilies.medium,
              fontSize: 12.5,
              lineHeight: 18,
              color: note.tone === 'ok' ? theme.colors.green : theme.colors.red,
              textAlign: 'center',
            }}
          >
            {note.text}
          </RNText>
        ) : null}

        {matches && matches.length > 0 ? (
          <View style={{ borderRadius: theme.radii.md, borderWidth: 1, borderColor: theme.colors.mist, overflow: 'hidden' }}>
            {matches.map((p, i) => {
              const st = rows[p.userId] ?? { kind: 'idle' };
              return (
                <View key={p.userId}>
                  {i > 0 ? <View style={{ height: 0.5, backgroundColor: withOpacity(theme.colors.slate, 0.15) }} /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md, padding: theme.spacing.md }}>
                    <CrewFace person={p} size={36} />
                    <View style={{ flex: 1 }}>
                      <RNText numberOfLines={1} style={{ fontFamily: fontFamilies.bold, fontSize: 14, color: theme.colors.ink }}>
                        {personName(p)}
                      </RNText>
                      <RNText numberOfLines={1} style={{ fontFamily: fontFamilies.medium, fontSize: 11.5, color: st.kind === 'error' ? theme.colors.red : theme.colors.slate }}>
                        {st.kind === 'error' ? st.message : `@${p.username ?? ''}`}
                      </RNText>
                    </View>
                    {st.kind === 'added' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Icon name="checkmark.circle.fill" size={16} tint={theme.colors.green} />
                        <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 12, color: theme.colors.green }}>Invited</RNText>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => void add(p)}
                        disabled={st.kind === 'busy'}
                        accessibilityRole="button"
                        accessibilityLabel={`Add ${personName(p)}`}
                        style={({ pressed }) => ({
                          minWidth: 56,
                          alignItems: 'center',
                          paddingHorizontal: theme.spacing.md,
                          paddingVertical: 6,
                          borderRadius: theme.radii.pill,
                          backgroundColor: theme.colors.primary,
                          opacity: pressed ? 0.85 : 1,
                        })}
                      >
                        {st.kind === 'busy' ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 12, color: '#FFFFFF' }}>Add</RNText>
                        )}
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

      </BottomSheetView>
    </BottomSheet>
  );
});
