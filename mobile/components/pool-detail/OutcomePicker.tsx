// =============================================================
// RESULTS DEPTH — the club IS the button
// =============================================================
// Decision 9's whole argument for Results is arithmetic: 10 fixtures × 38
// matchweeks is **380 taps** at this depth and **760 numeric decisions** at
// Scores. So this control is the one most league members will ever use.
//
// ## ⚠ IT WAS A HOME / DRAW / AWAY WORD CONTROL, AND THAT WAS THE PROBLEM
//
// Ryan, 2026-09-03: make it look like the web app. The web had already moved,
// and its reasoning is why this followed: a segmented control reading
// "Home · Draw · Away" made every pick an act of TRANSLATION. Read "Crystal
// Palace v Manchester City", decide City, then work out that City is "Away" and
// tap a word. Three hundred and eighty times a season.
//
// Everywhere else the product already speaks in clubs — the Results tab renders
// "Manchester City win", Last Man Standing is "pick one club to win", the
// scoring rules say "you call each match". Only the control spoke in positions.
//
// So the club cards ARE the radios, and the crest stops being decoration and
// becomes the affordance.
//
// ## ⚠ THREE LETTERS, NOT A TRUNCATED NAME
//
// At phone width "Crystal Palace" and "Nottingham Forest" truncate to "Crystal
// P…" and "Nottingham…", which is worse than CRY and NOT: **an abbreviation is
// read as a whole word, an ellipsis is read as a failure.** Verified on
// production before relying on it — all 58 clubs across the three seasons in
// play carry a 3-letter `abbreviation` and a crest, so there is no guesswork.
// The accessible label stays the full "Crystal Palace to win" either way.
//
// ## ⚠ MIRRORED, so the fixture reads as a fixture
//
// Home is crest-then-code and away is code-then-crest, which puts the two
// crests at the outer edges and runs the eye inward to the Draw between them —
// the shape "Palace v City" is written in everywhere else.
//
// ⚠ IT STORES A TAP, NEVER A SENTINEL SCORELINE. Decision 9 warns about this
// explicitly and migration 064 built a separate column to prevent it: encoding
// home / draw / away as 1-0 / 0-0 / 0-1 would score as a genuine **exact** and
// would show the member a fabricated *"you predicted 1-0"* they never picked.
// =============================================================

import { Image, Pressable, Text as RNText, View } from 'react-native'

import { fontFamilies, useTheme, withOpacity } from '@/theme'

export type Outcome = 'home' | 'draw' | 'away'

export type OutcomeClub = {
  /** Full name — the accessible label, never the visible one at this size. */
  name: string
  /** The three-letter code: ARS, MCI, NOT. Falls back to the name if absent. */
  abbr: string | null
  crestUrl: string | null
}

type Props = {
  value: Outcome | null
  onChange: (next: Outcome) => void
  home: OutcomeClub
  away: OutcomeClub
  disabled?: boolean
}

export function OutcomePicker({ value, onChange, home, away, disabled }: Props) {
  const theme = useTheme()

  return (
    <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 6 }}>
      <ClubChoice
        club={home}
        side="home"
        selected={value === 'home'}
        disabled={disabled}
        onSelect={() => onChange('home')}
      />

      <Pressable
        onPress={() => !disabled && onChange('draw')}
        disabled={disabled}
        accessibilityRole="radio"
        accessibilityState={{ selected: value === 'draw', disabled: Boolean(disabled) }}
        accessibilityLabel="Draw"
        style={{
          // ⚠ Still fixed, just less cramped. It is one outcome of three but it
          // is not a team, so it must not flex with the clubs — left to do that
          // it becomes a third slab and the control reads as three things of
          // equal weight. 64 is the width the web settled on for the same
          // control at the same job.
          width: 64,
          minHeight: 48,
          alignItems: 'center',
          justifyContent: 'center',
          // ⚠ A TOKEN, not a number. This was a hardcoded 10 — a value that
          // exists nowhere in `theme.radii` (6 / 12 / 18 / 24 / 32 / 999), so it
          // matched nothing else on the screen and could not follow the system
          // if it moved. `md` is the same corner the two club buttons take.
          borderRadius: theme.radii.md,
          borderWidth: 1,
          backgroundColor:
            value === 'draw' ? withOpacity(theme.colors.primary, 0.15) : theme.colors.snow,
          borderColor:
            value === 'draw' ? theme.colors.primary : withOpacity(theme.colors.slate, 0.2),
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <RNText
          style={{
            fontFamily: value === 'draw' ? fontFamilies.bold : fontFamilies.semibold,
            fontSize: 12,
            color: value === 'draw' ? theme.colors.ink : theme.colors.slate,
          }}
        >
          Draw
        </RNText>
      </Pressable>

      <ClubChoice
        club={away}
        side="away"
        selected={value === 'away'}
        disabled={disabled}
        onSelect={() => onChange('away')}
      />
    </View>
  )
}

function ClubChoice({
  club,
  side,
  selected,
  disabled,
  onSelect,
}: {
  club: OutcomeClub
  side: 'home' | 'away'
  selected: boolean
  disabled?: boolean
  onSelect: () => void
}) {
  const theme = useTheme()
  const label = club.abbr?.trim() || club.name

  return (
    <Pressable
      onPress={() => !disabled && onSelect()}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      // ⚠ The FULL name, not the code. A screen reader saying "ARS" is worse
      // than the ellipsis this control exists to avoid.
      accessibilityLabel={`${club.name} to win`}
      style={{
        flex: 1,
        minHeight: 48,
        flexDirection: side === 'away' ? 'row-reverse' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingHorizontal: 8,
        // ⚠ `theme.radii.md`, matching the Draw beside it — see the note there
        // for why the hardcoded 10 had to go.
        borderRadius: theme.radii.md,
        borderWidth: 1,
        backgroundColor: selected ? withOpacity(theme.colors.primary, 0.15) : theme.colors.snow,
        borderColor: selected ? theme.colors.primary : withOpacity(theme.colors.slate, 0.2),
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {club.crestUrl ? (
        <Image
          source={{ uri: club.crestUrl }}
          style={{ width: 22, height: 22 }}
          resizeMode="contain"
        />
      ) : (
        <View
          style={{
            width: 22,
            height: 22,
            // `pill` on a square is the token system's circle — the same shape
            // a hardcoded 11 gave, said in the vocabulary the rest uses.
            borderRadius: theme.radii.pill,
            backgroundColor: withOpacity(theme.colors.slate, 0.15),
          }}
        />
      )}
      {/*
        ⚠ The label stays at FULL strength whether or not it is selected. The
        web learned this the hard way: tinting the selected one looked right in
        light mode and backwards in dark, where the tint is bright but less
        luminant than the ink — so the club you had backed read SOFTER than the
        one you had not. Selection is carried by the fill and the border, which
        gain contrast rather than trading it away.
      */}
      <RNText
        numberOfLines={1}
        style={{
          fontFamily: selected ? fontFamilies.bold : fontFamilies.semibold,
          fontSize: 13,
          letterSpacing: 0.4,
          color: theme.colors.ink,
        }}
      >
        {label}
      </RNText>
    </Pressable>
  )
}
