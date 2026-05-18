// Cross-platform action picker — modal-floating card with a vertical
// list of choices. Sibling to PromptDialog (input) and ConfirmDialog
// (yes/no acknowledge). Use when the user needs to pick between 2+
// discrete actions on an object (e.g. tap kebab on an entry row →
// Rename / Delete picker).
//
// Same chrome as the other dialogs so the visual language stays
// consistent across the app's modal layer.

import {
  Modal,
  Pressable,
  Text as RNText,
  View,
} from 'react-native';

import { fontFamilies, useTheme, withOpacity } from '@/theme';

export type ActionMenuItem = {
  /** Stable key for React. */
  key: string;
  /** Primary label rendered on the row. */
  label: string;
  /** Optional second line. */
  description?: string;
  /** Tints the label red. Pair with onPress that performs a destructive op. */
  destructive?: boolean;
  /** Whether the row is interactive. Disabled rows render at 40% opacity and absorb taps. */
  disabled?: boolean;
  /** Fires on tap. The menu does NOT auto-close — let the caller decide. */
  onPress: () => void;
};

type ActionMenuProps = {
  visible: boolean;
  title?: string;
  description?: string;
  items: ActionMenuItem[];
  cancelLabel?: string;
  onCancel: () => void;
};

export function ActionMenu({
  visible,
  title,
  description,
  items,
  cancelLabel = 'Cancel',
  onCancel,
}: ActionMenuProps) {
  const theme = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
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
          {title ? (
            <RNText
              style={{
                fontFamily: fontFamilies.bold,
                fontSize: 17,
                color: theme.colors.ink,
                textAlign: 'center',
              }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {title}
            </RNText>
          ) : null}
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

          {/* Action rows — each takes its own onPress. The menu doesn't
              auto-dismiss because the caller often wants to chain into
              another dialog (e.g. Rename → PromptDialog) and animating
              dismissal here while opening the next modal would
              double-fade-in unpleasantly. Callers explicitly call
              onCancel() to close before opening the next one. */}
          <View style={{ gap: theme.spacing.xs }}>
            {items.map((item) => {
              const tint = item.destructive ? theme.colors.red : theme.colors.ink;
              return (
                <Pressable
                  key={item.key}
                  onPress={item.onPress}
                  disabled={item.disabled}
                  style={({ pressed }) => ({
                    paddingVertical: 12,
                    paddingHorizontal: theme.spacing.md,
                    borderRadius: theme.radii.md,
                    backgroundColor: withOpacity(
                      item.destructive ? theme.colors.red : theme.colors.ink,
                      0.06,
                    ),
                    opacity: item.disabled ? 0.4 : pressed ? 0.7 : 1,
                    gap: 2,
                  })}
                >
                  <RNText
                    style={{
                      fontFamily: fontFamilies.bold,
                      fontSize: 14,
                      color: tint,
                      textAlign: 'center',
                    }}
                  >
                    {item.label}
                  </RNText>
                  {item.description ? (
                    <RNText
                      style={{
                        fontFamily: fontFamilies.regular,
                        fontSize: 11,
                        color: theme.colors.slate,
                        textAlign: 'center',
                      }}
                    >
                      {item.description}
                    </RNText>
                  ) : null}
                </Pressable>
              );
            })}
          </View>

          {/* Cancel — separated by a slight gap so it reads as the
              escape hatch, not just another action. */}
          <Pressable
            onPress={onCancel}
            style={({ pressed }) => ({
              paddingVertical: 12,
              borderRadius: theme.radii.md,
              alignItems: 'center',
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <RNText
              style={{
                fontFamily: fontFamilies.semibold,
                fontSize: 14,
                color: theme.colors.slate,
              }}
            >
              {cancelLabel}
            </RNText>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
