// Cross-platform single-input prompt dialog. Replaces `Alert.prompt`
// (iOS-only — silently no-ops on Android), styled to match the same
// floating-card chrome the in-app DeleteConfirmModal uses so the look
// is consistent across iOS and Android.
//
// Usage:
//   const [open, setOpen] = useState(false);
//   <PromptDialog
//     visible={open}
//     title="Add Entry"
//     description="Name this entry"
//     defaultValue={`${username} ${entries.length + 1}`}
//     confirmLabel="Add"
//     onCancel={() => setOpen(false)}
//     onSubmit={(value) => { setOpen(false); void addEntry(value); }}
//   />
//
// ⚠ MOVING OUT OF THE KEYBOARD'S WAY (Ryan, 2026-10-02: "it pushes it up, and
// it's very sudden and abrupt … and when you dismiss it, something similar").
// This used to sit in a KeyboardAvoidingView, which moves its content with
// LayoutAnimation — and on the New Architecture (`newArchEnabled`) that does
// not animate reliably, so the card SNAPPED up when the keyboard came and
// snapped down as it left. On iOS the card now moves itself:
//   · up, by half the keyboard's height (so it stays centred in what's left
//     of the screen), over the keyboard's own duration, on the native driver;
//   · NOT back down when the dialog closes — it holds still while it fades,
//     and the keyboard slides away beneath it;
//   · and because it keeps that offset, every later opening starts already
//     in place: the keyboard rises into the space below and nothing moves.
// Android keeps the KeyboardAvoidingView: a Modal's window there resizes for
// the keyboard itself, so moving the card as well would move it twice.

import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  TextInput,
  Text as RNText,
  View,
} from 'react-native';

import { fontFamilies, useTheme, withOpacity } from '@/theme';

const IOS = Platform.OS === 'ios';
/** Close to the iOS keyboard's own curve, so the card and the keyboard move as one. */
const KEYBOARD_EASING = Easing.bezier(0.17, 0.59, 0.4, 0.77);

type PromptDialogProps = {
  visible: boolean;
  title: string;
  description?: string;
  /** Seeds the input on open; the user can edit freely. */
  defaultValue?: string;
  placeholder?: string;
  /** Left button copy. */
  cancelLabel?: string;
  /** Right (primary) button copy. */
  confirmLabel?: string;
  /** Tints the confirm button red — for delete / remove flows. */
  destructive?: boolean;
  /** Disables the confirm button while a parent op is in flight. */
  busy?: boolean;
  /** Optional max character length for the input. */
  maxLength?: number;
  onCancel: () => void;
  onSubmit: (value: string) => void;
};

export function PromptDialog({
  visible,
  title,
  description,
  defaultValue = '',
  placeholder,
  cancelLabel = 'Cancel',
  confirmLabel = 'OK',
  destructive = false,
  busy = false,
  maxLength,
  onCancel,
  onSubmit,
}: PromptDialogProps) {
  const theme = useTheme();
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<TextInput | null>(null);

  // iOS: how far the card sits above centre. Kept between openings on purpose (see the header).
  const lift = useRef(new Animated.Value(0)).current;
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  useEffect(() => {
    if (!IOS) return;
    const move = (toValue: number, duration: number) =>
      Animated.timing(lift, { toValue, duration: duration || 250, easing: KEYBOARD_EASING, useNativeDriver: true }).start();
    const show = Keyboard.addListener('keyboardWillShow', (e) => {
      if (visibleRef.current) move(-e.endCoordinates.height / 2, e.duration);
    });
    const hide = Keyboard.addListener('keyboardWillHide', (e) => {
      // Closing: hold still while the dialog fades. Only a keyboard dismissed with the dialog
      // still up brings the card back to the middle.
      if (visibleRef.current) move(0, e.duration);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [lift]);

  // Closing takes the keyboard down WITH the fade, rather than after it.
  useEffect(() => {
    if (!visible) Keyboard.dismiss();
  }, [visible]);

  // Reset input + focus whenever the dialog opens, so every show
  // starts from the supplied default. The autoFocus prop alone
  // doesn't refire across re-opens of the same Modal instance.
  useEffect(() => {
    if (!visible) return;
    setValue(defaultValue);
    // Defer focus so the Modal animation completes before the
    // keyboard is requested — otherwise iOS sometimes drops the
    // focus call mid-transition.
    const t = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(t);
  }, [visible, defaultValue]);

  const confirmTint = destructive ? theme.colors.red : theme.colors.primary;
  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0 && !busy;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior="height" enabled={!IOS} style={{ flex: 1 }}>
        {/* Backdrop. Tap-to-dismiss matches iOS Alert.prompt's
            "tap outside" behavior (which doesn't dismiss, actually
            — iOS alerts are modal). We mirror that: backdrop taps
            are absorbed but don't cancel, so the user has to choose
            a button explicitly. Prevents accidental dismissal. */}
        <View
          style={{
            flex: 1,
            backgroundColor: 'rgba(0,0,0,0.45)',
            justifyContent: 'center',
            padding: theme.spacing.xl,
          }}
        >
          <Animated.View
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radii.lg,
              padding: theme.spacing.lg,
              gap: theme.spacing.md,
              transform: [{ translateY: lift }],
            }}
          >
            <RNText
              style={{
                fontFamily: fontFamilies.bold,
                fontSize: 17,
                color: theme.colors.ink,
                textAlign: 'center',
              }}
            >
              {title}
            </RNText>
            {description ? (
              <RNText
                style={{
                  fontFamily: fontFamilies.regular,
                  fontSize: 13,
                  lineHeight: 18,
                  color: theme.colors.slate,
                  textAlign: 'center',
                }}
              >
                {description}
              </RNText>
            ) : null}
            <TextInput
              ref={inputRef}
              value={value}
              onChangeText={setValue}
              placeholder={placeholder}
              placeholderTextColor={theme.colors.slate}
              maxLength={maxLength}
              autoCapitalize="sentences"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (canSubmit) onSubmit(trimmed);
              }}
              selectTextOnFocus
              style={{
                fontFamily: fontFamilies.regular,
                fontSize: 15,
                color: theme.colors.ink,
                backgroundColor: theme.colors.mist,
                borderRadius: theme.radii.sm,
                paddingHorizontal: theme.spacing.md,
                paddingVertical: 10,
              }}
            />
            <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
              <Pressable
                onPress={onCancel}
                disabled={busy}
                style={({ pressed }) => ({
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: theme.radii.md,
                  backgroundColor: withOpacity(theme.colors.ink, 0.06),
                  alignItems: 'center',
                  opacity: pressed ? 0.7 : 1,
                })}
              >
                <RNText
                  style={{
                    fontFamily: fontFamilies.bold,
                    fontSize: 14,
                    color: theme.colors.ink,
                  }}
                >
                  {cancelLabel}
                </RNText>
              </Pressable>
              <Pressable
                onPress={() => onSubmit(trimmed)}
                disabled={!canSubmit}
                style={({ pressed }) => ({
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: theme.radii.md,
                  backgroundColor: canSubmit
                    ? withOpacity(confirmTint, 0.15)
                    : withOpacity(confirmTint, 0.06),
                  borderWidth: 1,
                  borderColor: canSubmit
                    ? withOpacity(confirmTint, 0.4)
                    : 'transparent',
                  alignItems: 'center',
                  opacity: !canSubmit ? 0.45 : pressed ? 0.7 : 1,
                })}
              >
                <RNText
                  style={{
                    fontFamily: fontFamilies.bold,
                    fontSize: 14,
                    color: confirmTint,
                  }}
                >
                  {busy ? 'Working…' : confirmLabel}
                </RNText>
              </Pressable>
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
