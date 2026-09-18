/**
 * The property that matters is that the tiles consume the width exactly.
 *
 * A user reported the failure from a device: fixed 56pt tiles in a wrapping row
 * left a gutter against the right edge while everything else on the screen ran
 * full width. The size of that gutter depends on the screen, so it is invisible
 * on whichever device the layout was written on — which is exactly why it is
 * checked here by arithmetic across many widths rather than by looking at one.
 */

import { gridMetrics } from '../gridLayout';

const MIN_CELL = 56;
const GAP = 8;

/** The width a row of `columns` cells actually occupies. */
const occupied = (m: { columns: number; cellSize: number }, gap: number) =>
  m.columns * m.cellSize + gap * (m.columns - 1);

describe("gridMetrics", () => {
  it("fills the width exactly, at every width a device might give it", () => {
    // Every integer width from a small phone to a 13" iPad in landscape.
    for (let width = 200; width <= 1400; width += 1) {
      const m = gridMetrics(width, MIN_CELL, GAP);
      expect(occupied(m, GAP)).toBeCloseTo(width, 6);
    }
  });

  it("never makes a tile smaller than the minimum", () => {
    // Sizing up is safe; sizing down would eventually breach the 44pt touch
    // target, which is the reason the minimum exists at all.
    for (let width = 200; width <= 1400; width += 1) {
      expect(gridMetrics(width, MIN_CELL, GAP).cellSize).toBeGreaterThanOrEqual(
        MIN_CELL,
      );
    }
  });

  it("fits as many columns as the width allows, and no more", () => {
    const m = gridMetrics(600, MIN_CELL, GAP);
    // 9 columns need 9*56 + 8*8 = 568; a 10th would need 632.
    expect(m.columns).toBe(9);
    expect(occupied(m, GAP)).toBeCloseTo(600, 6);
  });

  it("gives one full-width column when even a single tile barely fits", () => {
    const m = gridMetrics(60, MIN_CELL, GAP);
    expect(m.columns).toBe(1);
    expect(m.cellSize).toBe(60);
  });

  it("reports the minimum before the first layout pass", () => {
    // Width is 0 until onLayout fires. The answer must be renderable, not NaN.
    expect(gridMetrics(0, MIN_CELL, GAP)).toEqual({
      columns: 0,
      cellSize: MIN_CELL,
    });
  });

  it("survives a nonsense width rather than producing NaN", () => {
    for (const width of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const m = gridMetrics(width, MIN_CELL, GAP);
      expect(Number.isFinite(m.cellSize)).toBe(true);
      expect(m.cellSize).toBe(MIN_CELL);
    }
  });

  it("leaves no gutter at the widths that actually shipped", () => {
    // The two the screenshots came from: iPad 13" and iPhone 6.9", inner width
    // after the screen's own padding.
    for (const width of [1128, 358]) {
      const m = gridMetrics(width, MIN_CELL, GAP);
      expect(width - occupied(m, GAP)).toBeCloseTo(0, 6);
    }
  });
});

describe('a row never overflows the width it was measured against', () => {
  /*
   * The cell is sized so a row spans the width *exactly*, which is right in
   * real arithmetic and occasionally wrong in floating point: the sum can land
   * an ulp above `width`. Flexbox does not round in our favour there -- it
   * wraps a cell onto the next line, and the row is left a whole cell plus a
   * gap short of the right edge.
   *
   * That is the gutter the user reported, reappearing for a second reason
   * after the first was fixed. It shows on 2.3% of widths in the 200-600pt
   * range, which is why it survives a look on one device.
   */
  it.each([216.02, 216.03, 216.04, 216.21, 216.22, 216.23])(
    'width %p',
    (width) => {
      const { columns, cellSize } = gridMetrics(width, 56, 12);
      const span = columns * cellSize + 12 * (columns - 1);
      expect(span).toBeLessThanOrEqual(width);
    },
  );

  it('leaves at most a hair of the width unused', () => {
    for (let w = 200; w <= 600; w += 0.01) {
      const { columns, cellSize } = gridMetrics(w, 56, 12);
      const span = columns * cellSize + 12 * (columns - 1);
      expect(span).toBeLessThanOrEqual(w);
      expect(w - span).toBeLessThan(1);
    }
  });
});
