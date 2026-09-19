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
// ## ⚠ THE SHORT NAME, NOT THREE LETTERS — AND THE PREMISE MOVED
//
// This read "THREE LETTERS, NOT A TRUNCATED NAME" until 2026-09-19, and the
// reasoning was sound at the time: at phone width "Crystal Palace" truncated to
// "Crystal P…", and an abbreviation is read as a whole word where an ellipsis
// is read as a failure.
//
// What changed is the budget, not the principle. The crest came out — it was
// the provider's artwork (drafts/2026-09-13_ip_exposure_audit.md §5) — and it
// was 22pt wide with a 6pt gap. Re-measured at 375pt: 307 for all three
// buttons, Draw takes 80, so a club gets 113. Padding 16, borders 2, the colour
// bar 3 and its gap 6 leave **86pt of text** — about 14 characters at 12pt,
// where before it was eight.
//
// Fourteen is enough for every club `shortClubName` produces: the longest are
// "Crystal Palace" at 14 and "Nott'm Forest" at 13. (Re-measured 2026-09-19
// when the type went to 13pt and the bar to 4pt inset 4: Draw dropped to 68 to
// pay for it, leaving the text 87.5pt against "Crystal Palace"'s 83.1.) So the name fits now, and a
// name beats a code when it fits. `lib/league/clubName.ts` already produced
// these forms and the contract already carried them in `short_name` — the
// control was the one surface still speaking in codes.
//
// ⚠ THE CODE REMAINS THE FALLBACK. A club with no `short_name` still renders
// its three letters rather than an ellipsis, which keeps the old decision
// intact for anything the shortening rules have not been measured against.
//
// ⚠ 13pt. This was 12 to match `ClubName` on the same screen; Ryan raised it
// on 2026-09-19 and Draw's width paid for it. The control being tapped can
// afford a point the row being read cannot.
//
// ## ⚠ MIRRORED, so the fixture reads as a fixture
//
// Home is bar-then-name and away is name-then-bar, which puts the two colour
// bars at the outer edges and runs the eye inward to the Draw between them —
// the shape "Palace v City" is written in everywhere else. Home aligns left and
// away aligns right, so every home name BEGINS on the same x and every away
// name ENDS on the same x down the list; centring them made the gap between a
// name and its own bar change on every row.
//
// ⚠ IT STORES A TAP, NEVER A SENTINEL SCORELINE. Decision 9 warns about this
// explicitly and migration 064 built a separate column to prevent it: encoding
// home / draw / away as 1-0 / 0-0 / 0-1 would score as a genuine **exact** and
// would show the member a fabricated *"you predicted 1-0"* they never picked.
// =============================================================

import { Pressable, Text as RNText, View } from 'react-native'

import { clubColorFromCrestUrl } from '@/lib/design/clubColors'
import { fontFamilies, useTheme, withOpacity } from '@/theme'

export type Outcome = 'home' | 'draw' | 'away'

export type OutcomeClub = {
  /** Full name — the accessible label, never the visible one at this size. */
  name: string
  /**
   * The shortened form: "Man United", "Nott'm Forest". Produced by
   * `shortClubName` upstream and carried on the contract as `short_name`.
   */
  shortName: string | null
  /** The three-letter code — the FALLBACK now, not the label. */
  abbr: string | null
  /**
   * ⚠ KEPT FOR THE COLOUR, NOT FOR AN IMAGE. The crest itself is gone; this is
   * how `clubColorFromCrestUrl` finds the club's id, because the provider puts
   * it in the last path segment. See mobile/lib/design/clubColors.ts.
   */
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
          // ⚠ Still FIXED, just no longer cramped. It is one outcome of three
          // but it is not a team, so it must not flex with the clubs — left to
          // do that it becomes a third slab and the control reads as three
          // things of equal weight.
          //
          // ⚠ 56, DOWN FROM 80 (2026-09-19), AND THE WIDTH WENT TO THE CLUBS.
          // The budget at 375pt: 375 − 32 screen − 24 card − 12 gaps = 307 for
          // all three. The names are 14pt, so the widest label `shortClubName`
          // produces — "Crystal Palace" — needs 89.3pt. At Draw 56 each club
          // gets 125.5, and after 6+6 padding, 2 border, the 6pt bar, its 4pt
          // inset and the 5pt gap the text has **96.5: 7.2pt of slack** — more
          // than it had at Draw 64 with a thinner bar, measured not eyeballed.
          //
          // ⚠ THE FIRST ATTEMPT WENT TO 13pt AND RYAN COULD NOT SEE IT. One
          // point is ~8% and reads as unchanged; 12 → 14 is 17% and reads as
          // bigger. Worth remembering the next time a size is "a bit bigger".
          //
          // 80 was chosen for comfort, not necessity — the old note said as
          // much ("room to grow this again"). "Draw" is ~30pt at 12pt, so 64
          // still leaves it 13pt of padding a side.
          width: 56,
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
  // ⚠ SHORT NAME FIRST, CODE AS THE FALLBACK. See the header: the crest's 28pt
  // bought the room for a name, and a name beats a code when it fits.
  const label = club.shortName?.trim() || club.abbr?.trim() || club.name
  const bar = clubColorFromCrestUrl(club.crestUrl)

  return (
    <Pressable
      onPress={() => !disabled && onSelect()}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: Boolean(disabled) }}
      // ⚠ The FULL name, not the short form. A screen reader saying "Nott'm"
      // is worse than the ellipsis this control exists to avoid.
      accessibilityLabel={`${club.name} to win`}
      style={{
        flex: 1,
        minHeight: 48,
        flexDirection: 'row',
        alignItems: 'center',
        // ⚠ ALIGNED OUTWARD, NOT CENTRED. Home packs left and away packs right,
        // so the two colour bars sit at the control's outer edges and the names
        // line up down the list. Centring floated "Leeds" in the middle of its
        // slot while "Bournemouth" filled it, and nothing lined up.
        justifyContent: side === 'away' ? 'flex-end' : 'flex-start',
        // ⚠ 5 and 6, DOWN FROM 6 AND 8. The last 6pt the 14pt type needed came
        // from here rather than from the bar or its inset, both of which Ryan
        // had just signed off. The bar is still 4pt clear of the border.
        gap: 5,
        paddingHorizontal: 6,
        borderRadius: theme.radii.md,
        borderWidth: 1,
        // ⚠ SELECTION IS THE APP'S COLOUR, NEVER THE CLUB'S. The club's colour
        // is identity and says nothing about whether you backed it; primary is
        // what every other control on this screen uses for "chosen".
        backgroundColor: selected ? withOpacity(theme.colors.primary, 0.15) : theme.colors.snow,
        borderColor: selected ? theme.colors.primary : withOpacity(theme.colors.slate, 0.2),
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {/* ⚠ HOME DRAWS THE BAR FIRST, AWAY DRAWS IT LAST — the row is not
          reversed, the children are ordered. `row-reverse` would also flip
          which end `justifyContent` packs to, and the alignment above is the
          whole point. */}
      {side === 'home' ? <ClubBar colour={bar} side="home" /> : null}
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
          // ⚠ `flexShrink`, so a long name gives ground to the bar rather than
          // pushing it out of the button. The bar is 3pt and fixed; the name is
          // the only thing here that can yield.
          flexShrink: 1,
          fontFamily: selected ? fontFamilies.bold : fontFamilies.semibold,
          // ⚠ 14pt (Ryan, 2026-09-19 — twice: 13 was not visibly bigger). This
          // control is the thing being TAPPED 380 times a season, so it carries
          // the largest type on the card. Draw's width and 2pt off the button
          // padding bought it — see the width note there.
          fontSize: 14,
          letterSpacing: 0.2,
          color: theme.colors.ink,
        }}
      >
        {label}
      </RNText>
      {side === 'away' ? <ClubBar colour={bar} side="away" /> : null}
    </Pressable>
  )
}

/**
 * The club's colour, as a bar.
 *
 * ⚠ NULL RENDERS NOTHING, and that is a real case rather than a defensive
 * branch: `clubColors.ts` is the Premier League only, so a Serie A or La Liga
 * club has no colour on file. A grey bar would say "this club's colour is
 * grey", which is false; no bar says nothing, and the name still carries it.
 */
function ClubBar({ colour, side }: { colour: string | null; side: 'home' | 'away' }) {
  const theme = useTheme()
  if (!colour) return null
  return (
    <View
      style={{
        // ⚠ 6×30, UP FROM 4×24 (Ryan, 2026-09-19). Height is free — the button
        // is 48 tall — and the 2pt of width came from Draw, not from the name.
        width: 6,
        height: 30,
        borderRadius: theme.radii.pill,
        backgroundColor: colour,
        // ⚠ INSET OFF THE OUTER EDGE, not padded on both. The button's 8pt
        // padding put the bar hard against its own border; this walks it in
        // another 4. Done as a margin on the bar rather than more padding on
        // the button because padding would charge the NAME for it twice — and
        // the name has 4.4pt of slack, not 12.
        marginLeft: side === 'home' ? 4 : 0,
        marginRight: side === 'away' ? 4 : 0,
      }}
    />
  )
}
