// =============================================================
// No theme tokens on a hard-coded surface
// =============================================================
// `PlayerBadges` draws onto two surfaces that do NOT change with the theme: a
// white pill and a green pitch. So nothing drawn on them may change either —
// and a theme colour is precisely a colour that changes.
//
// This is not hypothetical. The goal marker was `color="ink"`, which is
// #1B2340 in light mode and #E8EAF0 in dark. Against its white pill that is
// 15.43:1 and then 1.20:1: perfect in one mode, invisible in the other, with
// nothing in the types, the tests or either lint config to say so. Ryan found
// it on a screenshot.
//
// ⚠ SOURCE-TEXT, BECAUSE THERE IS NO RUNTIME SEAM. Rendering the component in
// both themes and comparing pixels is the only other way to catch this, and
// that machinery does not exist here.
// =============================================================

import { readFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';

const RAW = readFileSync(
  join(__dirname, '..', '..', 'components', 'match', 'PlayerBadges.tsx'),
  'utf8',
);

/**
 * ⚠ COMMENTS STRIPPED FIRST. The file EXPLAINS the bug it forbids — it names
 * `color="ink"` in prose — so a naive scan matches its own reasoning and fails.
 * This guard caught itself on the first run, exactly as the migration-140 one
 * did. A rule that cannot survive being documented is not much of a rule.
 */
const SRC = RAW.split('\n')
  .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
  .join('\n');

describe('PlayerBadges draws in fixed colours only', () => {
  it('⚠⚠ uses no `color=` theme token', () => {
    // `Icon` takes either `color` (a theme token) or `tint` (a literal). On a
    // surface that does not follow the theme, only `tint` is safe.
    const tokens = SRC.match(/color="[a-z]+"/g) ?? [];
    expect(tokens, `theme tokens found: ${tokens.join(', ')}`).toEqual([]);
  });

  it('⚠ uses no `theme.colors.` lookup either', () => {
    expect(SRC).not.toContain('theme.colors.');
    expect(SRC).not.toContain('useTheme');
  });

  it('every colour it does use is a literal hex or a named constant', () => {
    // The positive half: a file with no colours at all would also pass above.
    expect(SRC).toContain("const ON_WHITE = '#111827'");
    expect(SRC).toContain("const CARD_COLOR");
    expect(SRC.match(/#[0-9A-Fa-f]{6}/g)?.length ?? 0).toBeGreaterThan(4);
  });

  it('⚠ a card is the same yellow in both themes', () => {
    // Not because the theme's amber would be illegible in dark mode — it is
    // perfectly fine there — but because a yellow card is a fact about football
    // rather than a decision about a colour scheme.
    expect(SRC).toContain("amber: '#F59E0B'");
    expect(SRC).toContain("red: '#EF4444'");
  });
});
