/**
 * Small colour helpers for the contribution grid.
 *
 * The grid needs the habit's accent at several opacities on an opaque
 * background. Rendering translucent squares over a card would work, but the
 * squares overlap a hairline grid gap, so we pre-blend against the surface
 * colour instead and emit opaque hex — no compositing artefacts, no
 * per-square transparency cost.
 */

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHex(hex: string): Rgb {
  let value = hex.replace('#', '').trim();
  if (value.length === 3) {
    value = value
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const int = Number.parseInt(value.slice(0, 6), 16);
  if (!Number.isFinite(int)) return { r: 0, g: 0, b: 0 };
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function toHex({ r, g, b }: Rgb): string {
  const channel = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** Blends `color` over `background` at `amount` (0…1) and returns opaque hex. */
export function mix(color: string, background: string, amount: number): string {
  const a = parseHex(color);
  const b = parseHex(background);
  const t = Math.max(0, Math.min(1, amount));
  return toHex({
    r: b.r + (a.r - b.r) * t,
    g: b.g + (a.g - b.g) * t,
    b: b.b + (a.b - b.b) * t,
  });
}

/** The same colour with an explicit alpha, for overlays and press states. */
export function withAlpha(color: string, alpha: number): string {
  const { r, g, b } = parseHex(color);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

/** Relative luminance per WCAG 2.1. */
export function luminance(color: string): number {
  const { r, g, b } = parseHex(color);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two colours (1…21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const light = Math.max(la, lb);
  const dark = Math.min(la, lb);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Picks whichever of black/white text clears 4.5:1 on `background`, preferring
 * the higher-contrast option. Used for filled buttons tinted with a habit
 * colour the user chose, where we cannot hardcode a foreground.
 */
export function readableTextOn(background: string): string {
  return contrastRatio('#FFFFFF', background) >= contrastRatio('#000000', background)
    ? '#FFFFFF'
    : '#000000';
}
