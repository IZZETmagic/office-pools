import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// =============================================================
// The prompt dialog moves with the keyboard — it never snaps
// =============================================================
// Ryan, 2026-10-02, on "Name your crew": the card "pushes up, very sudden and
// abrupt", and the same on dismiss. It sat in a KeyboardAvoidingView with
// behavior "padding" on iOS, which animates through LayoutAnimation — and on
// the New Architecture that snaps. Now, on iOS, the card's own translateY
// follows the keyboard on the native driver, and holds still while closing.
// =============================================================

const src = readFileSync(join(__dirname, '../../components/ui/PromptDialog.tsx'), 'utf8');

describe('PromptDialog', () => {
  it('iOS does not hand the keyboard to KeyboardAvoidingView (LayoutAnimation snaps on the new arch)', () => {
    expect(src).not.toMatch(/behavior=\{Platform\.OS === 'ios' \? 'padding'/);
    expect(src).toMatch(/enabled=\{!IOS\}/);
  });
  it('the card follows the keyboard’s own timing, on the native driver', () => {
    expect(src).toMatch(/keyboardWillShow/);
    expect(src).toMatch(/useNativeDriver: true/);
    expect(src).toMatch(/translateY: lift/);
  });
  it('closing holds the card still — only a keyboard dismissed with the dialog up brings it back down', () => {
    expect(src).toMatch(/keyboardWillHide[\s\S]{0,300}if \(visibleRef\.current\) move\(0/);
  });
});
