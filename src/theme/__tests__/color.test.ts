import { contrastRatio, luminance, mix, readableTextOn, withAlpha } from '../color';
import { darkPalette, lightPalette } from '../tokens';

describe('mix', () => {
  it('returns the background at 0 and the colour at 1', () => {
    expect(mix('#FFFFFF', '#000000', 0)).toBe('#000000');
    expect(mix('#FFFFFF', '#000000', 1)).toBe('#ffffff');
  });

  it('blends halfway', () => {
    expect(mix('#FFFFFF', '#000000', 0.5)).toBe('#808080');
  });

  it('clamps an out-of-range amount rather than producing an invalid channel', () => {
    expect(mix('#FFFFFF', '#000000', 2)).toBe('#ffffff');
    expect(mix('#FFFFFF', '#000000', -1)).toBe('#000000');
  });

  it('expands three-digit hex', () => {
    expect(mix('#FFF', '#000', 1)).toBe('#ffffff');
  });

  it('degrades to black for an unparseable colour rather than throwing', () => {
    expect(() => mix('not-a-colour', '#000000', 1)).not.toThrow();
  });
});

describe('withAlpha', () => {
  it('emits rgba with the requested alpha', () => {
    expect(withAlpha('#FF0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
  });

  it('clamps alpha to 0…1', () => {
    expect(withAlpha('#FF0000', 5)).toBe('rgba(255, 0, 0, 1)');
    expect(withAlpha('#FF0000', -5)).toBe('rgba(255, 0, 0, 0)');
  });
});

describe('luminance / contrastRatio', () => {
  it('puts black and white at the extremes', () => {
    expect(luminance('#000000')).toBeCloseTo(0, 5);
    expect(luminance('#FFFFFF')).toBeCloseTo(1, 5);
  });

  it('reports the maximum ratio for black on white, in either order', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 1);
  });

  it('reports 1 for a colour against itself', () => {
    expect(contrastRatio('#3366CC', '#3366CC')).toBeCloseTo(1, 5);
  });
});

describe('readableTextOn', () => {
  it('picks white on a dark ground and black on a light one', () => {
    expect(readableTextOn('#000000')).toBe('#FFFFFF');
    expect(readableTextOn('#FFFFFF')).toBe('#000000');
  });
});

describe('palette accessibility', () => {
  // These are the pairs that carry actual words. A palette edit that quietly drops
  // one below WCAG AA is exactly the regression this catches.
  it.each([
    ['light text', lightPalette.text, lightPalette.background],
    ['light muted text', lightPalette.textMuted, lightPalette.background],
    ['light text on surface', lightPalette.text, lightPalette.surface],
    ['dark text', darkPalette.text, darkPalette.background],
    ['dark muted text', darkPalette.textMuted, darkPalette.background],
    ['dark text on surface', darkPalette.text, darkPalette.surface],
  ])('%s clears WCAG AA (4.5:1)', (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ['light faint text', lightPalette.textFaint, lightPalette.background],
    ['dark faint text', darkPalette.textFaint, darkPalette.background],
  ])('%s clears the 3:1 floor for non-essential metadata', (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(3);
  });

  it.each([
    ['light accent', lightPalette.accent, lightPalette.onAccent],
    ['dark accent', darkPalette.accent, darkPalette.onAccent],
  ])('%s carries readable text on a filled button', (_label, accent, on) => {
    expect(contrastRatio(accent, on)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('a component boundary can be seen', () => {
  /**
   * WCAG AA asks 3:1 for the boundary of a non-text UI component. A card, a
   * board cell and a tile are all exactly that, and in this template they are
   * drawn with `borderStrong`.
   *
   * This test exists because the portfolio shipped without it. `surface` sits
   * about 1.1:1 against `background` and `border` about 1.3:1, so a board drawn
   * with either is invisible in dark mode -- and two live App Store screenshots
   * showed grids with more than 70% of the frame indistinguishable from its own
   * background. The screenshots were accurate; the apps were unreadable.
   *
   * The dark background is substituted per app, so this assertion is the only
   * thing that holds the guarantee once the template has been copied.
   */
  const MIN_COMPONENT_CONTRAST = 3;

  it('keeps borderStrong at 3:1 against the dark background', () => {
    expect(
      contrastRatio(darkPalette.borderStrong, darkPalette.background)
    ).toBeGreaterThanOrEqual(MIN_COMPONENT_CONTRAST);
  });

  it('keeps borderStrong at 3:1 against the light background', () => {
    expect(
      contrastRatio(lightPalette.borderStrong, lightPalette.background)
    ).toBeGreaterThanOrEqual(MIN_COMPONENT_CONTRAST);
  });
});
