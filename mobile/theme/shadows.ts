import type { ViewStyle } from 'react-native';

export const shadows = {
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardElevated: {
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  /**
   * An avatar lifted off the surface. Deeper and softer than a card, because a
   * 80pt circle needs more spread than a full-width panel to read as raised
   * rather than merely outlined.
   *
   * ⚠ A shadow is CLIPPED by `overflow: 'hidden'` on the same view, and an
   * avatar needs that clip to stay round. So carry this on a wrapper and put
   * the clipping on the child — the two cannot be the same element.
   *
   * ⚠ Android needs a solid `backgroundColor` on the elevated view or the
   * elevation renders nothing at all.
   */
  avatar: {
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  /**
   * The DARK-MODE counterpart to `avatar`.
   *
   * ⚠ A dark shadow on a near-black surface is invisible — it was applied to
   * both duel avatars and rendered nothing, which read as the effect only
   * working on one of them. On dark, depth has to come from LIGHT: a centred
   * coloured glow rather than an offset drop shadow.
   *
   * Callers set `shadowColor` to the subject's own colour; black here is only a
   * fallback for a subject that has none.
   */
  avatarGlow: {
    shadowColor: '#000000',
    shadowOpacity: 0.6,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  none: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
} as const satisfies Record<string, ViewStyle>;

export type ShadowToken = keyof typeof shadows;
