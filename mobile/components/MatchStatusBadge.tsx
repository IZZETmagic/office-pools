import { Text as RNText, View, type StyleProp, type ViewStyle } from 'react-native';

import { getMatchStatusBadge, type MatchStatusInput } from '@/lib/matchStatus';
import { fontFamilies, useTheme, withOpacity } from '@/theme';

type Props = {
  match: MatchStatusInput;
  style?: StyleProp<ViewStyle>;
};

/**
 * Pill showing a match's abnormal status (Postponed / Cancelled / Suspended /
 * Delayed / …). Renders nothing for a normal match. Surface-agnostic — the
 * translucent tint reads on both the light results screens and the dark
 * Next Kickoff gradient. For the compact results row we render the label
 * inline instead (see MatchResultRow); the label/tone still come from
 * getMatchStatusBadge so wording stays in one place.
 */
export function MatchStatusBadge({ match, style }: Props) {
  const theme = useTheme();
  const badge = getMatchStatusBadge(match);
  if (!badge) return null;

  const color = badge.tone === 'red' ? theme.colors.red : theme.colors.amber;

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'center',
          gap: 5,
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 999,
          backgroundColor: withOpacity(color, 0.15),
        },
        style,
      ]}
    >
      <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: color }} />
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 10,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          color,
        }}
      >
        {badge.label}
      </RNText>
    </View>
  );
}
