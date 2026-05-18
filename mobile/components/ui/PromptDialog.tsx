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

import { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  TextInput,
  Text as RNText,
  View,
} from 'react-native';

import { fontFamilies, useTheme, withOpacity } from '@/theme';

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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
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
          <View
            style={{
              backgroundColor: theme.colors.surface,
              borderRadius: theme.radii.lg,
              padding: theme.spacing.lg,
              gap: theme.spacing.md,
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
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
