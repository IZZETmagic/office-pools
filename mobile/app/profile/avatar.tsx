import { HugeiconsIcon } from '@hugeicons/react-native';
import {
  BackgroundIcon,
  HatIcon,
  Relieved02Icon,
  ScissorIcon,
} from '@hugeicons-pro/core-solid-rounded';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  View,
  Text as RNText,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';

import { composeAvatar, headOnly, PALETTE, type AvatarConfig } from '@/lib/avatar/compose';
import { GlassesIcon, HeadIcon, MoustacheIcon } from '@/lib/avatar/stepIcons';
import {
  isStoredAvatarBuild,
  readStoredAvatarBuild,
  toAvatarConfig,
  toStoredAvatarBuild,
  type StoredAvatarBuild,
} from '@/lib/avatar/storedConfig';
import {
  AVATAR_COLOUR_NAMES,
  avatarBackgroundFor,
  avatarIndexFor,
  GROUND_INK_DARK,
  isAvatarColourName,
} from '@/lib/avatarGradient';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useAvatarAssets } from '@/lib/useAvatarAssets';
import { fontFamilies, useTheme } from '@/theme';

// =============================================================
// The avatar editor
// =============================================================
// Ryan's layout, verbatim: "the card expands to fill the entire top quarter of the screen edge to
// edge on the top left and right sides. the avatar section is frozen there and the bottom part
// will also be 'edge to edge' (no cards) ... split into 3 part. top is the avatar card expanded
// edge to edge ... then a strip for selecting the different customization groups. then the bottom
// section will be where the user selects the assets"
//
// ⭐⭐ THIS COMPOSES LOCALLY, unlike the card on the profile screen. An editor previews on every
// tap and /api/avatar/me measured 284–476ms warm before phone latency; composing here is 0.8ms.
// That is the whole reason `mobile/lib/avatar/compose.ts` exists as a guarded verbatim copy —
// see its banner, and `lib/design/__tests__/avatarMirror.guard.test.ts`.
//
// ⚠ Display = server, editing = local. The card still uses the endpoint so that merely viewing a
// profile never pulls the 169 KB bundle; only this screen, which needs the art anyway, takes it.
// =============================================================

const STEPS = [
  { key: 'skin', label: 'Skin tone', icon: HeadIcon, size: 26 },
  { key: 'eyes', label: 'Eyes', icon: Relieved02Icon, size: 26 },
  { key: 'hair', label: 'Hair', icon: ScissorIcon, size: 26 },
  { key: 'eyewear', label: 'Glasses', icon: GlassesIcon, size: 34 },
  { key: 'facialhair', label: 'Facial hair', icon: MoustacheIcon, size: 34 },
  { key: 'wearables', label: 'Shirt', icon: HatIcon, size: 26 },
  { key: 'colour', label: 'Colour', icon: BackgroundIcon, size: 26 },
] as const;
type Step = (typeof STEPS)[number]['key'];

/**
 * ⚠ THE SENTINEL, mirrored from the web builder. A tile's head is composed on a colour nothing
 * ships and that path is then deleted, leaving the preview transparent so the TILE supplies the
 * background. Composing on a real colour would put an opaque square over the selected tint.
 * The colour is deliberately hideous: if the strip ever stops matching, tiles turn MAGENTA rather
 * than quietly reverting to a square.
 */
const HEAD_GROUND = '#FF00FF';
const HEAD_CANVAS = /<path[^>]*fill="rgb\(255,0,255\)"[^>]*\/?>/;
/** ⚠ Reaches OUTSIDE the 2048 canvas, which is why the tile carries the same colour behind it. */
const HEAD_CROP = '-63 -55 2166 2166';

/** ⚠ A STARTING FACE, not the admin default: no SP chest mark, no beard fade. */
const STARTING_BUILD: StoredAvatarBuild = {
  base: 'base-neck-100',
  skin: '#F5C9A6',
  hair: 'm03-quiff',
  hairColour: '#4A3B32',
  facialHair: null,
  glasses: null,
  earrings: null,
  garment: null,
  expression: 'x-happy',
  eyes: null,
  mouth: null,
  eyeColour: '#5B3A1E',
  mouthColour: '#B67A70',
  shirt: '#3B6EFF',
};

export default function AvatarEditorScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const { user } = useAuth();
  const { assets, error: assetsError } = useAvatarAssets();

  const [userId, setUserId] = useState<string | null>(null);
  const [storedRaw, setStoredRaw] = useState<unknown>(null);
  const [colour, setColour] = useState<string | null>(null);
  const [build, setBuild] = useState<StoredAvatarBuild | null>(null);
  const [step, setStep] = useState<Step>('skin');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // ⚠ Read straight from Supabase rather than through `useHomeData`, which carries no avatar
  // columns. The phone talks to the production database directly, and migration 147 is applied
  // there, so this works even while the API half of the feature is only on dev.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('users')
        .select('user_id, avatar_colour, avatar_build')
        .eq('auth_user_id', user.id)
        .single();
      if (cancelled) return;
      // ⚠ The error is not discarded — a swallowed 400 would look exactly like "no avatar yet"
      // and quietly start this member from scratch over the top of a face they already built.
      if (error) console.warn('[avatar editor] could not read the profile:', error.message);
      setUserId(data?.user_id ?? null);
      setColour(data?.avatar_colour ?? null);
      setStoredRaw(data?.avatar_build ?? null);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // ⚠ The TOLERANT reader, and it needs the art: it drops anything this bundle cannot draw rather
  // than throwing. Until the assets land there is nothing to resolve against, so this stays null.
  const stored = useMemo(
    () => (assets && storedRaw ? readStoredAvatarBuild(storedRaw, assets) : null),
    [assets, storedRaw],
  );
  const current = build ?? stored ?? STARTING_BUILD;

  const ground = avatarBackgroundFor(avatarIndexFor(userId ?? '', colour));

  const cfg: AvatarConfig = useMemo(
    () => ({ ...current, background: ground, mark: false }),
    [current, ground],
  );

  const preview = useMemo(
    () => (assets ? composeAvatar(cfg, assets) : ''),
    [assets, cfg],
  );

  const set = useCallback(
    <K extends keyof StoredAvatarBuild>(k: K, v: StoredAvatarBuild[K]) => {
      setBuild((b) => ({ ...(b ?? stored ?? STARTING_BUILD), [k]: v }));
    },
    [stored],
  );

  async function save() {
    if (!userId) return;
    setSaving(true);
    const payload = toStoredAvatarBuild({ ...current, background: ground, mark: false });
    // ⚠ The STRICT guard before it leaves. The column's CHECK is shape-only by design (147), so
    // this is the only thing between a malformed config and a member whose own profile cannot
    // render. It also enforces that `facialHairColour` is absent rather than null — unset means
    // "follow the hair, lifted", and writing it as a copy renders every beard 12 per channel off.
    if (!isStoredAvatarBuild(payload)) {
      setSaving(false);
      console.warn('[avatar editor] refusing to save a malformed config');
      return;
    }
    const { error } = await supabase
      .from('users')
      .update({
        avatar_build: payload,
        avatar_colour: isAvatarColourName(colour) ? colour : null,
      })
      .eq('user_id', userId);
    setSaving(false);
    if (error) {
      console.warn('[avatar editor] save failed:', error.message);
      return;
    }
    router.back();
  }

  /**
   * ⚠⚠ THE SQUARE FITS THE BAND — no overflow. Ryan: "the avatar is being cropped in and we
   * cannot see the shirt design."
   *
   * It used to render at 1.2× the band's height, borrowed from the web CARD where cropping to a
   * head and shoulders is the intent. In an EDITOR it is exactly wrong: the body runs to the
   * bottom of the 2048 canvas, so the 20% that overflowed was the shirt — the one thing the
   * wearables step exists to choose. A preview that hides what you are picking is not a preview.
   *
   * ⚠ Fitting costs apparent size: the figure is smaller than a cropped one in the same band.
   * The way to make it bigger is therefore the BAND, not the scale — grow `height / 3` and the
   * avatar grows with it, still whole.
   *
   * ⚠ Still clamped to the width. Fitting makes that far less likely to bite (the square is now
   * the band's height, not 1.2× it) but a short wide screen would still overflow sideways, and
   * losing the ears is worse than letterboxing.
   */
  /**
   * ⚠⚠ THE STATUS BAR WAS EATING THE HEADROOM. Ryan: "the hair is too close to the top of the
   * screen." The band is edge to edge and starts at y=0, and the avatar filled it exactly — so
   * the canvas's own headroom (the art starts about an eighth down) sat UNDER the status bar and
   * the hair emerged right at the clock. Making the band taller alone would not have fixed it:
   * with an exact fit the headroom is a PERCENTAGE, so it scales up and stays proportionally just
   * as close to the top.
   *
   * ⭐ So the band grows by exactly the inset and the figure starts below it. The ground still
   * runs under the status bar — the edge-to-edge look Ryan asked for is intact — but the avatar
   * no longer competes with the clock. The avatar's own size is unchanged, which is the point:
   * this is a clearance fix, not a scale one.
   *
   * ⚠ The lever for "bigger" remains the divisor below. A third of the screen is the figure; the
   * inset is added on top of it, so the band lands near 39% on a notched phone.
   */
  /**
   * ⚠ THREE PER ROW — Ryan: "each asset card should be big enough to able to fit three per row."
   * Derived from the real width rather than hardcoded, so it holds from an SE to a Pro Max:
   * the 16pt gutters either side and two 12pt gaps come out first, and the rest splits three ways.
   * `Math.floor` because a fractional width rounds up somewhere and wraps the third tile.
   */
  const tileSize = Math.floor((width - 32 - 24) / 3);

  const avatarSize = Math.min(height / 3, width);
  const bandHeight = insets.top + avatarSize;

  if (assetsError) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.colors.snow, padding: 24, paddingTop: insets.top + 24 }}>
        <RNText style={{ fontFamily: fontFamilies.medium, color: theme.colors.ink }}>
          {assetsError}
        </RNText>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <RNText style={{ fontFamily: fontFamilies.bold, color: theme.colors.primary }}>Close</RNText>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.snow }}>
      {/* ---- 1. the avatar, FROZEN, edge to edge ------------------------------------------- */}
      <View style={{ height: bandHeight, backgroundColor: ground, overflow: 'hidden' }}>
        {/* ⚠ Centred both ways, not pinned to the top. At the normal size the square fills the
            band exactly and this makes no difference — it matters only when the width clamp
            above kicks in and the square is shorter than the band. Any spare room is the
            member's ground on both sides of a square painted that same colour, so the
            letterboxing is invisible rather than a visible band of dead space. */}
        {preview ? (
          <View
            style={{
              position: 'absolute',
              top: insets.top,
              left: 0,
              right: 0,
              bottom: 0,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <SvgXml xml={preview} width={avatarSize} height={avatarSize} />
          </View>
        ) : null}

        {/* ⚠ Near-white chips with dark ink, not theme colours: the ground is the member's colour
            and the SAME value in both themes, so anything theme-aware on it fails in one of them.
            Measured on the web palette, white text fails on all 22 grounds. */}
        <View
          style={{
            position: 'absolute',
            top: insets.top + 8,
            left: 12,
            right: 12,
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}
        >
          <Chip label="Cancel" onPress={() => router.back()} />
          <Chip label={saving ? 'Saving…' : 'Done'} onPress={save} disabled={saving || !loaded} />
        </View>
      </View>

      {/* ---- 2. the group strip ------------------------------------------------------------ */}
      <View
        style={{
          flexDirection: 'row',
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.silver,
          backgroundColor: theme.colors.surface,
        }}
      >
        {STEPS.map((s) => {
          const active = s.key === step;
          return (
            <Pressable
              key={s.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={s.label}
              onPress={() => setStep(s.key)}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 12,
                borderBottomWidth: 2,
                marginBottom: -1,
                borderBottomColor: active ? theme.colors.primary : 'transparent',
              }}
            >
              <HugeiconsIcon
                icon={s.icon}
                size={s.size}
                color={active ? theme.colors.primary : theme.colors.slate}
              />
            </Pressable>
          );
        })}
      </View>

      {/* ---- 3. the assets, scrolling, edge to edge ----------------------------------------- */}
      {!assets || !loaded ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingVertical: 16, paddingBottom: insets.bottom + 32 }}>
          {step === 'skin' && (
            <Section title="Skin tone">
              <Swatches colours={PALETTE.skin} value={current.skin} onPick={(c) => set('skin', c)} />
            </Section>
          )}

          {step === 'eyes' && (
            <>
              <Section title="Eye colour">
                <Swatches
                  colours={PALETTE.eye}
                  value={current.eyeColour}
                  onPick={(c) => set('eyeColour', c)}
                />
              </Section>
              <Section title="Expression">
                <Heads
                  assets={assets}
                  cfg={current}
                  field="expression"
                  options={Object.keys(assets.expressions)}
                  value={current.expression}
                  onPick={(k) => set('expression', k)}
                  tileSize={tileSize}
                />
              </Section>
            </>
          )}

          {step === 'hair' && (
            <>
              <Section title="Hair colour">
                <Swatches
                  colours={PALETTE.hair}
                  value={current.hairColour}
                  onPick={(c) => set('hairColour', c)}
                />
              </Section>
              <Section title="Hair">
                <Heads
                  assets={assets}
                  cfg={current}
                  field="hair"
                  options={[null, ...Object.keys(assets.hair)]}
                  value={current.hair}
                  onPick={(k) => set('hair', k)}
                  tileSize={tileSize}
                />
              </Section>
            </>
          )}

          {step === 'eyewear' && (
            <Section title="Glasses">
              <Heads
                assets={assets}
                cfg={current}
                field="glasses"
                options={[null, ...Object.keys(assets.glasses ?? {})]}
                value={current.glasses}
                onPick={(k) => set('glasses', k)}
                tileSize={tileSize}
              />
            </Section>
          )}

          {step === 'facialhair' && (
            <Section title="Facial hair">
              <Heads
                assets={assets}
                cfg={current}
                field="facialHair"
                options={[null, ...Object.keys(assets.facialhair)]}
                value={current.facialHair}
                onPick={(k) => set('facialHair', k)}
                tileSize={tileSize}
              />
            </Section>
          )}

          {step === 'wearables' && (
            <Section title="Shirt colour">
              <Swatches
                colours={PALETTE.shirt}
                value={current.shirt}
                onPick={(c) => set('shirt', c)}
              />
            </Section>
          )}

          {step === 'colour' && (
            <Section title="Your colour">
              <Swatches
                colours={AVATAR_COLOUR_NAMES.map((_, i) => avatarBackgroundFor(i))}
                value={ground}
                onPick={(c) => {
                  const i = AVATAR_COLOUR_NAMES.findIndex((_, n) => avatarBackgroundFor(n) === c);
                  if (i >= 0) setColour(AVATAR_COLOUR_NAMES[i]);
                }}
              />
            </Section>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Chip({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.9)',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <RNText style={{ fontFamily: fontFamilies.bold, fontSize: 13, color: GROUND_INK_DARK }}>
        {label}
      </RNText>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ marginBottom: 24 }}>
      <RNText
        style={{
          fontFamily: fontFamilies.bold,
          fontSize: 17,
          color: theme.colors.ink,
          marginBottom: 12,
          paddingHorizontal: 16,
        }}
      >
        {title}
      </RNText>
      {children}
    </View>
  );
}

function Swatches({
  colours,
  value,
  onPick,
}: {
  colours: readonly string[];
  value: string | null;
  onPick: (c: string) => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        paddingHorizontal: 16,
      }}
    >
      {colours.map((c) => (
        <Pressable
          key={c}
          accessibilityRole="button"
          accessibilityState={{ selected: value === c }}
          onPress={() => onPick(c)}
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            borderWidth: 2,
            // ⚠ The unselected border needs its own dark-mode step, as on the web: the resting
            // token is very nearly the surface it sits on and reads as no border at all.
            borderColor: value === c ? theme.colors.primary : theme.colors.silver,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: c }} />
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Asset tiles: a bare head wearing only the thing being chosen.
 *
 * ⚠⚠ EVERY OTHER SLOT IS NULLED, and the first version of this got it wrong — it composed the
 * member's FULL config per tile, so all twelve expression cards wore his sunglasses, his beard
 * and his shirt. Ryan: "just like on web each card should JUST have the base avatar head and the
 * asset on it." The card is the asset; anything else on it is noise competing with the choice.
 *
 * ⭐ BUT THE HAIR STAYS, deliberately, for every family except hair itself. The web note records
 * why: long hair covers the ears, so an earring on `m15-locs` either floats or vanishes, and a
 * member has to be able to SEE that before choosing. `base` keeps `cfg.hair`; the hair family
 * simply overrides it, so one expression covers both cases.
 *
 * ⚠ `headOnly` is given the BACKFILL and BEHIND layers for whichever hair is drawn. Without them
 * a long style loses the piece that sits behind the neck — the fix recorded in the fullbeard work.
 *
 * 🔴 25 hair tiles are 25 composed SVGs and SvgXml re-parses per render. Memoised on the narrow
 * set that actually changes a bare head — NOT on `cfg`, which would recompose all of them on
 * every unrelated tap.
 */
function Heads({
  assets,
  cfg,
  field,
  options,
  value,
  onPick,
  tileSize,
}: {
  assets: NonNullable<ReturnType<typeof useAvatarAssets>['assets']>;
  cfg: StoredAvatarBuild;
  /** The one slot this grid varies. Setting it to `hair` makes the cards bare heads. */
  field: 'hair' | 'expression' | 'glasses' | 'facialHair';
  options: (string | null)[];
  value: string | null | undefined;
  onPick: (k: string | null) => void;
  tileSize: number;
}) {
  const theme = useTheme();

  const tiles = useMemo(() => {
    const base = {
      ...cfg,
      expression: null,
      eyes: null,
      mouth: null,
      facialHair: null,
      glasses: null,
      earrings: null,
      garment: null,
      mark: false,
      background: HEAD_GROUND,
    } as AvatarConfig;

    return options.map((k) => {
      // ⚠ `base` already carries cfg.hair, so this one spread covers both cases: the hair family
      // overrides it with the option, every other family leaves it alone.
      const full = { ...base, [field]: k } as AvatarConfig;
      const head = headOnly(
        composeAvatar(full, assets),
        { skin: full.skin, shirt: full.shirt, hair: full.hairColour },
        (full.hair && assets.hairBackfill?.[full.hair]) || '',
        (full.hair && assets.hairBehind?.[full.hair]) || '',
      )
        .replace(/viewBox="[^"]*"/, `viewBox="${HEAD_CROP}"`)
        .replace(HEAD_CANVAS, '');
      return { k, head };
    });
    // ⚠ THE DEPENDENCY LIST IS THE CONTRACT: everything a card draws, and nothing else. `cfg`
    // itself must never appear here — a new object every render would defeat the whole memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    assets,
    options,
    field,
    cfg.base,
    cfg.skin,
    cfg.shirt,
    cfg.hair,
    cfg.hairColour,
    cfg.eyeColour,
    cfg.mouthColour,
  ]);

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16 }}>
      {tiles.map(({ k, head }) => (
        <Pressable
          key={k ?? 'none'}
          accessibilityRole="button"
          accessibilityState={{ selected: value === k }}
          onPress={() => onPick(k)}
          style={{
            width: tileSize,
            height: tileSize,
            borderRadius: 20,
            borderWidth: 2,
            borderColor: value === k ? theme.colors.primary : theme.colors.silver,
            backgroundColor: theme.colors.surface,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <SvgXml xml={head} width={tileSize - 12} height={tileSize - 12} />
        </Pressable>
      ))}
    </View>
  );
}
