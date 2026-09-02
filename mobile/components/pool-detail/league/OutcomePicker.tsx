// =============================================================
// RESULTS DEPTH — one tap, three options
// =============================================================
// Decision 9's whole argument for Results is arithmetic: 10 fixtures × 38
// matchweeks is **380 taps** at this depth and **760 numeric decisions** at
// Scores. "A month of World Cup scorelines is a burst; ten months of them is
// homework." So this control is the one most league members will ever use, and
// `TapScoreField` — the Scores control — is the opt-up.
//
// ⚠ IT STORES A TAP, NEVER A SENTINEL SCORELINE. Decision 9 warns about this
// explicitly and migration 064 built the column to prevent it: encoding home /
// draw / away as 1-0 / 0-0 / 0-1 would score as a genuine **exact** and would
// show the member a fabricated *"you predicted 1-0"* they never picked. The
// value here goes to `league_predictions.predicted_outcome` and nowhere near a
// score field.
// =============================================================

import { Pressable, View } from 'react-native'

import { Text } from '@/components/ui'
import { fontFamilies, useTheme, withOpacity } from '@/theme'

export type Outcome = 'home' | 'draw' | 'away'

type Props = {
  value: Outcome | null
  onChange: (next: Outcome) => void
  /** Short club labels — the crest is not always available and this must read. */
  homeLabel: string
  awayLabel: string
  disabled?: boolean
}

export function OutcomePicker({ value, onChange, homeLabel, awayLabel, disabled }: Props) {
  const theme = useTheme()

  // ⚠ HOME · DRAW · AWAY, in that order, always. It is the order a scoreline is
  // read in and the order the fixture is drawn in above it; reversing it on one
  // surface would make a tap mean the other team.
  const options: Array<{ key: Outcome; label: string }> = [
    { key: 'home', label: homeLabel },
    { key: 'draw', label: 'Draw' },
    { key: 'away', label: awayLabel },
  ]

  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {options.map((o) => {
        const selected = value === o.key
        return (
          <Pressable
            key={o.key}
            onPress={() => !disabled && onChange(o.key)}
            disabled={disabled}
            // A pick is a small target on a phone and this is the only control
            // on the row, so it takes the whole width it can get.
            style={{
              flex: 1,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 10,
              borderWidth: 1,
              paddingHorizontal: 6,
              backgroundColor: selected
                ? withOpacity(theme.colors.primary, 0.18)
                : theme.colors.mist,
              borderColor: selected
                ? withOpacity(theme.colors.primary, 0.35)
                : 'transparent',
              opacity: disabled ? 0.5 : 1,
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: Boolean(disabled) }}
            accessibilityLabel={
              o.key === 'draw' ? 'Draw' : `${o.label} to win`
            }
          >
            <Text
              numberOfLines={1}
              style={{
                fontFamily: selected ? fontFamilies.semibold : fontFamilies.regular,
                fontSize: 13,
                color: selected ? theme.colors.ink : theme.colors.slate,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
