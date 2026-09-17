/**
 * The tablet rhythm scale.
 *
 * These are pure functions on purpose: every screen in the app reads spacing
 * and typography out of the theme, so a mistake here is a mistake everywhere,
 * and every other test in this suite runs at phone width and would not notice.
 * The phone assertions matter more than the tablet ones for exactly that
 * reason -- the change is only safe if a phone is provably untouched.
 */
import {
  MIN_TOUCH_TARGET,
  TABLET_MIN_WIDTH,
  scaleSpacing,
  scaleTypography,
  spacing,
  typography,
} from '../tokens';

describe('tablet rhythm scale', () => {
  it('returns the phone tokens themselves, not a copy', () => {
    // Identity, not equality: a phone must take the original object so there is
    // no way for the scaled path to drift from the tokens it claims to mirror.
    expect(scaleSpacing(false)).toBe(spacing);
    expect(scaleTypography(false)).toBe(typography);
  });

  it('grows space and type on a tablet', () => {
    expect(scaleSpacing(true).base).toBeGreaterThan(spacing.base);
    expect(scaleTypography(true).body.fontSize).toBeGreaterThan(typography.body.fontSize);
  });

  it('grows space faster than type, because the dead area is vertical', () => {
    const spaceRatio = scaleSpacing(true).base / spacing.base;
    const typeRatio = scaleTypography(true).body.fontSize / typography.body.fontSize;
    expect(spaceRatio).toBeGreaterThan(typeRatio);
  });

  it('keeps the scale modest — this is a rhythm change, not a zoom', () => {
    expect(scaleSpacing(true).base / spacing.base).toBeLessThanOrEqual(1.35);
    expect(scaleTypography(true).body.fontSize / typography.body.fontSize).toBeLessThanOrEqual(1.25);
  });

  it('scales every spacing step, leaving no step behind', () => {
    const scaled = scaleSpacing(true);
    for (const key of Object.keys(spacing) as (keyof typeof spacing)[]) {
      expect(scaled[key]).toBeGreaterThan(spacing[key]);
    }
  });

  it('keeps every step a whole number of points', () => {
    for (const value of Object.values(scaleSpacing(true))) {
      expect(Number.isInteger(value)).toBe(true);
    }
    for (const style of Object.values(scaleTypography(true))) {
      expect(Number.isInteger(style.fontSize)).toBe(true);
      expect(Number.isInteger(style.lineHeight)).toBe(true);
    }
  });

  it('keeps spacing steps in ascending order, so the scale never inverts', () => {
    const scaled = scaleSpacing(true);
    const values = (Object.keys(spacing) as (keyof typeof spacing)[]).map((k) => scaled[k]);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });

  it('keeps every line height proportional to its own font size', () => {
    const scaled = scaleTypography(true);
    for (const key of Object.keys(typography) as (keyof typeof typography)[]) {
      const before = typography[key].lineHeight / typography[key].fontSize;
      const after = scaled[key].lineHeight / scaled[key].fontSize;
      expect(after).toBeCloseTo(before, 1);
    }
  });

  it('carries every non-numeric style property through untouched', () => {
    const scaled = scaleTypography(true);
    expect(scaled.display.fontWeight).toBe(typography.display.fontWeight);
    expect(scaled.display.letterSpacing).toBe(typography.display.letterSpacing);
  });

  it('does not scale the touch-target floor, which is about fingers', () => {
    expect(MIN_TOUCH_TARGET).toBe(44);
  });

  it('puts the boundary above the widest phone and below the narrowest tablet', () => {
    // 440pt is the widest iPhone; 744pt the narrowest iPad in portrait.
    expect(TABLET_MIN_WIDTH).toBeGreaterThan(440);
    expect(TABLET_MIN_WIDTH).toBeLessThanOrEqual(744);
  });
});
