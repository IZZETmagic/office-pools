// Cross-platform confirmation / acknowledgement dialog. Sibling to
// PromptDialog — same centered-floating-card chrome, but without the
// text input. Replaces `Alert.alert` whenever the surrounding flow
// already uses PromptDialog so the visual language stays consistent.
//
// Two button modes:
//   - Two-button (cancel + confirm): pass `cancelLabel` and `onCancel`.
//     Confirm tint can flip red via `destructive`.
//   - Single-button (acknowledgement / success / info): omit
//     `cancelLabel` and `onCancel`. The confirm button stretches full
//     width and acts as the dismiss.

import {
  Modal,
  Pressable,
  Text as RNText,
  View,
} from 'react-native';

import { fontFamilies, useTheme, withOpacity } from '@/theme';

type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  description?: string;
  /** Right (primary) button copy. Defaults to "OK". */
  confirmLabel?: string;
  /** Left button copy. Omit to render a single-button (acknowledge) dialog. */
  cancelLabel?: string;
  /** Tints the confirm button red — for destructive actions. */
  destructive?: boolean;
  /** Disables the buttons while a parent async op is in flight. */
  busy?: boolean;
  onConfirm: () => void;
  /** Required when `cancelLabel` is set; ignored otherwise. */
  onCancel?: () => void;
};

export function ConfirmDialog({
  visible,
  title,
  description,
  confirmLabel = 'OK',
  cancelLabel,
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const theme = useTheme();
  const confirmTint = destructive ? theme.colors.red : theme.colors.primary;
  const hasCancel = Boolean(cancelLabel);

  // Android back button: in two-button mode, treat back as Cancel
  // (matching iOS swipe-down dismissal of an alert). In single-button
  // mode it confirms — the user only has one option anyway.
  function handleRequestClose() {
    if (hasCancel && onCancel) onCancel();
    else onConfirm();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleRequestClose}
    >
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
          <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
            {hasCancel ? (
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
            ) : null}
            <Pressable
              onPress={onConfirm}
              disabled={busy}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 12,
                borderRadius: theme.radii.md,
                backgroundColor: withOpacity(confirmTint, 0.15),
                borderWidth: 1,
                borderColor: withOpacity(confirmTint, 0.4),
                alignItems: 'center',
                opacity: busy ? 0.45 : pressed ? 0.7 : 1,
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
    </Modal>
  );
}
