// Small red dot indicator used across the app to flag pending notifications.
//
// Pure visual — does NOT determine its own visibility. Callers conditionally
// render it (and pass position props as needed) based on data from
// usePendingActions. This keeps the dot component dumb and the logic
// centralized in one hook.
//
// Used in 4 places:
//   1. Bottom tab bar — Pools tab when any pool has pending actions / unread
//   2. Pool list cards — each card with pending items in that pool
//   3. Pool detail tab bar — Form / Predictions tabs with relevant pending
//   4. In-tab specific cells (badge cells in Form tab, match rows in Predictions)
//
// Sizing variants intentionally minimal — 'sm' for cell-level callouts where
// space is tight, 'md' for tab icons and pool cards. Color always red.

import { View } from 'react-native';

import { useTheme } from '@/theme';

type Props = {
  /** Pure visual size. 'sm' is 8px, 'md' is 10px. */
  size?: 'sm' | 'md';
  /**
   * Optional absolute positioning over a parent — useful for floating over
   * tab icons, badge cells, etc. Parent must have position: 'relative' or
   * the dot will position relative to the nearest positioned ancestor.
   */
  top?: number;
  right?: number;
  /** Optional white halo around the dot to lift it off colored backgrounds. */
  withHalo?: boolean;
};

export function NotificationDot({ size = 'md', top, right, withHalo = true }: Props) {
  const theme = useTheme();
  const px = size === 'sm' ? 8 : 10;
  const isAbsolute = top !== undefined || right !== undefined;

  return (
    <View
      pointerEvents="none"
      style={{
        position: isAbsolute ? 'absolute' : 'relative',
        top: isAbsolute ? top : undefined,
        right: isAbsolute ? right : undefined,
        width: px,
        height: px,
        borderRadius: px / 2,
        backgroundColor: theme.colors.red,
        borderWidth: withHalo ? 1.5 : 0,
        borderColor: theme.colors.surface,
      }}
    />
  );
}
