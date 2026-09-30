import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';

import { hapticPress } from '@/lib/haptics';

/**
 * The bottom nav's tab button, with a haptic on press.
 *
 * ⚠ The per-platform choice is NOT here — see `lib/haptics.ts`. Android and
 * iOS need different calls for the same felt effect, and that reasoning is
 * shared with the avatar editor rather than duplicated per call site.
 */
export function HapticTab(props: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...props}
      onPressIn={(ev) => {
        hapticPress();
        props.onPressIn?.(ev);
      }}
    />
  );
}
