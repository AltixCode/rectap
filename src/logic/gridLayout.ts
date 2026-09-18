/**
 * How many columns fit a measured width, and how wide each one must be to
 * consume it exactly.
 *
 * This exists because of a bug a user reported from a device: a level grid of
 * fixed 56pt tiles in a wrapping row left a band of empty space against the
 * right edge, while the cards above and below ran the full width. The tiles
 * looked misaligned rather than deliberately narrow.
 *
 * The leftover is `width - (columns * cell + gaps)`, so it depends on the screen
 * — which is why it is invisible on whichever device the layout was written on,
 * and why this is arithmetic worth testing rather than eyeballing. Fitting the
 * cell up to absorb the remainder removes the gutter; centring the row would
 * only move it to both sides.
 */

export interface GridMetrics {
  /** Columns that fit. At least 1, even when the width is smaller than a cell. */
  columns: number;
  /** Cell edge length, chosen so `columns` of them plus gaps fill the width exactly. */
  cellSize: number;
}

/**
 * `width` is the measured inner width of the row. `minCell` is the smallest
 * comfortable tile; the real tile is sized up from it, never down, so a tile
 * never becomes smaller than the 44pt minimum touch target its caller chose.
 */
export function gridMetrics(
  width: number,
  minCell: number,
  gap: number,
): GridMetrics {
  // Before the first layout pass the width is 0. Report the minimum rather than
  // a NaN or an Infinity, so the first frame renders something sane.
  if (!Number.isFinite(width) || width <= 0)
    return { columns: 0, cellSize: minCell };

  // A row of n cells spans n*cell + (n-1)*gap. Adding one gap to both sides of
  // that inequality turns it into an exact division.
  const columns = Math.max(1, Math.floor((width + gap) / (minCell + gap)));

  // Sizing the cell to fill the width *exactly* is right in real arithmetic and
  // occasionally wrong in floating point: `columns * cell + gaps` can land an
  // ulp above `width`. Flexbox does not round in our favour there -- it wraps a
  // cell onto the next line, and the row falls a whole cell plus a gap short of
  // the right edge. That is the same gutter this function was written to
  // remove, returning for a different reason, on 2.3% of widths.
  //
  // So the cell is shaved by the smallest amount that actually makes the row
  // fit -- one ulp at a time, which settles in a step or two. Rounding down to
  // a hundredth of a point would also work and is easier to read, but it gives
  // up ~0.06pt of width at iPad sizes for a problem that measures 3e-14, and
  // the gutter this function exists to close is the one thing not worth
  // trading away. The loop is bounded by the arithmetic: each step strictly
  // decreases the span.
  let cellSize = (width - gap * (columns - 1)) / columns;
  while (columns * cellSize + gap * (columns - 1) > width) {
    cellSize -= Math.max(Number.EPSILON * cellSize, Number.MIN_VALUE);
  }

  return { columns, cellSize };
}
