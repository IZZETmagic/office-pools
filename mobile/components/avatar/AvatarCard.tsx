import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, Text as RNText, Pressable } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { Icon } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { fontFamilies, useTheme } from '@/theme';

// =============================================================
// The member's avatar, as a card
// =============================================================
// The phone half of the card that landed on the web profile. Ryan: put it "right under the header
// section ... like what we did on the web version". On a phone the web card is the AVATAR ALONE
// with the name and numbers underneath, which is the layout ported here.
//
// ⭐⭐ THE SVG IS COMPOSED ON THE SERVER. `lib/avatar/compose.ts` is 1,071 lines of pure,
// dependency-free TypeScript and would run here unchanged — but mobile cannot import from the repo
// root (no metro.config.js; `@/*` maps to `mobile/`), so using it would mean a hand-mirrored FOURTH
// compositor, which is the exact thing `scripts/verify-avatar-parity.mjs` exists to police. So
// `/api/avatar/me` composes and this draws the string, the same way `components/match/Jersey.tsx`
// already renders a raw SVG with `<SvgXml>`.
//
// ⚠⚠ THIS QUIETLY SHOWS INITIALS AGAINST PRODUCTION UNTIL THE AVATAR BRANCH MERGES. `lib/api.ts`
// points at https://sportpool.io by default and the route is not there yet — measured,
// /avatar-assets.json is 404 on prod and 200 on dev. Point the app at dev with
// EXPO_PUBLIC_API_BASE_URL while developing. The fallback is correct behaviour, which is also what
// makes its absence easy to miss.
//
// ⭐ The pencil opens the RN editor at `app/profile/avatar.tsx`, which composes LOCALLY rather
// than through this card's endpoint — an editor previews on every tap and a round trip per tap
// would feel broken. See that screen's banner.
// =============================================================

/** Mirrors `AvatarMeResponse` in `app/api/avatar/me/route.ts`. Redeclared because mobile cannot
 *  import from the repo root — the same reason the compositor lives on the server. */
type AvatarMeResponse = {
  svg: string | null;
  ground: string;
  hasAvatar: boolean;
};

/**
 * ⚠ THE CARD'S HEIGHT IS FIXED, and the avatar is sized from it rather than from the width.
 * 224 is the web card's phone height, kept so the two read as the same object.
 *
 * ⚠⚠ THE SQUARE FITS THE CARD — no overflow. Ryan: "can we zoom out the avatar so we can see the
 * shirt?" It rendered at 1.2x, which crops the bottom fifth, and the body runs to the bottom of
 * the 2048 canvas — so the fifth being thrown away was the shirt. The same mistake the editor
 * had, from the same borrowed reasoning: on the WEB card a head-and-shoulders crop is the
 * intent, and a member's own profile card is the one place they want to see what they built.
 *
 * ⚠ Fitting costs apparent size — the figure is smaller than a cropped one in the same card. The
 * lever for "bigger" is therefore CARD_HEIGHT, not the multiplier.
 *
 * ⚠ It also removes the clipping risk the old note worried about: at 224 the square is narrower
 * than the card on any phone, where 269 only just fitted 343.
 */
/**
 * ⚠ A LITERAL, NOT `theme.colors.ink`. Everything painted on the card sits on the member's
 * ground, which does not change with the theme — so a theme-aware token would invert into an
 * unreadable pairing in one of the two. Same value the web card pins to.
 */
const ON_GROUND = '#1B2340';

const CARD_HEIGHT = 224;
const AVATAR_SIZE = CARD_HEIGHT;

export function AvatarCard({
  fullName,
  username,
  memberSince,
  initials,
  stats,
}: {
  fullName: string;
  username: string;
  memberSince: string | null;
  initials: string;
  stats: { label: string; value: string }[];
}) {
  const theme = useTheme();
  const [avatar, setAvatar] = useState<AvatarMeResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<AvatarMeResponse>('/api/avatar/me')
      .then((r) => {
        if (!cancelled) setAvatar(r);
      })
      .catch(() => {
        // ⚠ Swallowed ON PURPOSE, unlike a data read. This is decoration around a screen that
        // works without it: an older build, a device pointed at production, or no signal all land
        // here, and every one of them should show initials rather than an error.
        if (!cancelled) setAvatar(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ⚠ Until the fetch lands there is no ground colour to paint, and guessing one would mean
  // mirroring the palette over here — the thing returning `ground` from the API avoided. The
  // card holds its shape in the surface colour and swaps once, rather than flashing a wrong one.
  const ground = avatar?.ground ?? theme.colors.surface;

  return (
    <View style={{ marginHorizontal: theme.spacing.xl, gap: theme.spacing.md }}>
      <View
        style={{
          height: CARD_HEIGHT,
          borderRadius: theme.radii.lg,
          backgroundColor: ground,
          overflow: 'hidden',
        }}
      >
        {avatar?.svg ? (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center' }}>
            <SvgXml xml={avatar.svg} width={AVATAR_SIZE} height={AVATAR_SIZE} />
          </View>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <View
              style={{
                width: 80,
                height: 80,
                borderRadius: 40,
                backgroundColor: 'rgba(255,255,255,0.35)',
                borderWidth: 2,
                borderColor: 'rgba(255,255,255,0.6)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 28, color: ON_GROUND }}>
                {initials}
              </RNText>
            </View>
          </View>
        )}

        {/* ⚠ Top right, mirroring the web card's pencil. A near-white chip with a dark glyph for
            the same reason the BETA mark below is: a white icon would vanish on the pale half of
            the palette. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={avatar?.hasAvatar ? 'Edit your avatar' : 'Build your avatar'}
          onPress={() => router.push('/profile/avatar')}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 40,
            height: 40,
            borderRadius: 14,
            backgroundColor: 'rgba(255,255,255,0.9)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* ⚠ `tint`, not `color` — `color` takes a THEME TOKEN NAME and would resolve to a
              theme-aware value; this glyph sits on the member's ground, which is the same
              value in both themes. Same distinction the web Icon draws. */}
          <Icon name="pencil.line" size={18} weight="semibold" tint={ON_GROUND} />
        </Pressable>

        {/* ⚠⚠ A NEAR-WHITE CHIP WITH DARK INK, NOT A THEME COLOUR. The ground is the member's
            colour and is the SAME VALUE in both themes, so anything theme-aware painted on it is
            guaranteed to fail in one of them. Measured on the web palette: white text fails on ALL
            TWENTY-TWO grounds (1.51–2.61:1) while this ink passes on all 22 (5.90–10.19). */}
        <View
          style={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.9)',
          }}
        >
          <RNText
            style={{
              fontFamily: fontFamilies.bold,
              fontSize: 10,
              letterSpacing: 0.6,
              color: ON_GROUND,
            }}
          >
            BETA
          </RNText>
        </View>
      </View>

      {/* The identity block and the numbers, on the PAGE rather than on the card — the same split
          the web card makes at phone width, and for the same reason: stacked inside a coloured
          card they were a block of text marooned in a field of colour. */}
      <View style={{ gap: 2 }}>
        <RNText
          numberOfLines={1}
          style={{ fontFamily: fontFamilies.bold, fontSize: 22, color: theme.colors.ink }}
        >
          {fullName}
        </RNText>
        <RNText style={{ fontFamily: fontFamilies.medium, fontSize: 14, color: theme.colors.slate }}>
          @{username}
        </RNText>
        {memberSince ? (
          <RNText
            style={{ fontFamily: fontFamilies.medium, fontSize: 12, color: theme.colors.slate }}
          >
            Member since {memberSince}
          </RNText>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', gap: theme.spacing.xl }}>
        {stats.map((s) => (
          <View key={s.label}>
            <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 20, color: theme.colors.ink }}>
              {s.value}
            </RNText>
            <RNText
              style={{ fontFamily: fontFamilies.medium, fontSize: 11, color: theme.colors.slate }}
            >
              {s.label}
            </RNText>
          </View>
        ))}
      </View>
    </View>
  );
}
