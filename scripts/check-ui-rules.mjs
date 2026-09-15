#!/usr/bin/env node
/**
 * Three UI rules that fail silently at runtime, checked before they ship.
 *
 * 1. **No colour literal in a view.** A palette tuned against a dark ground
 *    falls to roughly 2:1 on a light card. Colours come from `useTheme()` so
 *    both appearances stay correct; a hex in a screen is how the light theme
 *    quietly becomes unreachable.
 * 2. **No hardcoded user-facing string.** Every label, alert and accessibility
 *    label goes through `t()`. A literal renders perfectly in English and is
 *    invisible to the thirteen other locales.
 * 3. **No NativeWind no-ops.** `space-x-*`, `space-y-*` and `bg-gradient-*` do
 *    nothing in React Native and produce no warning.
 *
 * Usage: node scripts/check-ui-rules.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOTS = ['app', 'src/components', 'src/hooks'];
// The palette is the one place colours are allowed to be written down.
const COLOUR_EXEMPT = ['src/theme/tokens.ts', 'src/theme/color.ts'];

const files = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(full);
    } else if (/\.tsx?$/.test(entry.name)) {
      files.push(full);
    }
  }
};
// A root an app has not created yet is not a failure — src/hooks only appears
// once an app has one.
for (const dir of ROOTS) {
  const full = path.join(root, dir);
  if (fs.existsSync(full)) walk(full);
}

const problems = [];
const report = (file, line, message) =>
  problems.push(`${path.relative(root, file)}:${line}: ${message}`);

const TEXT_PROPS = /\b(accessibilityLabel|accessibilityHint|title|placeholder|dialogTitle)=(["'])([^"']{3,})\2/g;
// Anchored on a closing tag, so a generic type argument such as
// `Promise<PurchaseOutcome>` is not mistaken for rendered copy.
const JSX_TEXT = />\s*([A-Za-z][A-Za-z0-9 ,.'’!?—–-]{3,})\s*<\//g;
const ALERT = /Alert\.alert\(\s*(["'])([^"']{3,})\1/g;
const COLOUR = /(#[0-9a-fA-F]{3,8}\b|\brgba?\()/;
const NATIVEWIND_NOOP = /className=["'][^"']*\b(space-[xy]-\d|bg-gradient-)/;

/**
 * A state expressed by dimming, on something the user can still tap.
 *
 * This defect has now been found in ten apps and in three different costumes:
 * `opacity: unlocked ? 1 : 0.4`, `tone={used ? 'muted' : 'default'}`, and a
 * colour picked to be faint. Every time, the one state the screen exists to
 * communicate was rendered in the least legible way available -- a locked
 * level at 2.65:1, a used scorecard row, a PRO badge at 2.19:1.
 *
 * A locked row is not a disabled control. It is something you can buy, and
 * tapping it opens the paywall, so it is information and must meet 4.5:1. The
 * state belongs in a lock icon, a badge or a label at full contrast.
 *
 * Only *conditional* dimming is flagged: a constant `opacity: 0.6` on a
 * decorative element is not a state, and a genuinely disabled control keeps
 * its dimming -- that is what `disabled` means and it is exempted below.
 */
/*
 * The signature is one state at FULL opacity and the sibling state dimmed below
 * 0.6. Both halves of that are load-bearing, and both came from measuring real
 * screens rather than from taste:
 *
 *   - `1` on one branch is what makes the dim *relative* — a state rendered
 *     fainter than the state beside it. klondo's empty-slot placeholder is
 *     `slot ? 0.5 : 0`: faint versus invisible, a drop-target hint with no text
 *     and no gated content, and not this defect.
 *   - 0.6 is where it starts to matter. memoflip dims a matched card to 0.7 and
 *     its symbol still measures 7.56:1, because the text and its own card fill
 *     dim together toward the same screen colour. At 0.55 the same arithmetic
 *     gives 4.39:1, at 0.5 gives 3.72:1, and at 0.4 gives 2.61:1.
 */
const CONDITIONAL_DIM =
  /opacity:\s*[^,;}]*\?\s*(?:1\s*:\s*0?\.([0-5])|0?\.([0-5])\d*\s*:\s*1)/;
/*
 * Two exemptions, both found by running this against real screens rather than
 * by reasoning about it. `pressed ? 0.7 : 1` is press feedback and was five of
 * the first seven hits -- the commonest legitimate conditional opacity in React
 * Native. A genuinely `disabled` control keeps its dimming; that is what
 * disabled means.
 */
const EXEMPT_DIM = /\b(isDisabled|disabled|pressed|focused|hovered)\b/;

/*
 * There is deliberately no rule for `tone={x ? 'muted' : 'default'}`.
 *
 * The first version of this file had one, and its very first hit was a correct
 * segmented control: the `muted` token measures 5.91:1 light and 7.59:1 dark on
 * its own, comfortably past AA. The token is *designed* to pass. What made
 * dicewit's used-row bad was that the muted tone was the sole marker of a state
 * the screen exists to communicate -- and no regex can see "sole marker".
 *
 * A check that flags correct code sends people to repaint working screens, so
 * it is worse than no check. Opacity is different and is flagged below: it
 * multiplies whatever contrast the token had, so it can only ever make things
 * worse.
 */

for (const file of files) {
  const relative = path.relative(root, file);
  const source = fs.readFileSync(file, 'utf8');
  const lines = source.split('\n');

  lines.forEach((line, i) => {
    const n = i + 1;
    const code = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');

    if (!COLOUR_EXEMPT.includes(relative) && COLOUR.test(code)) {
      report(file, n, `colour literal in a view — use a token from useTheme(): ${code.trim()}`);
    }
    if (NATIVEWIND_NOOP.test(code)) {
      report(file, n, 'NativeWind class that is a no-op in React Native');
    }
    if (CONDITIONAL_DIM.test(code) && !EXEMPT_DIM.test(code)) {
      report(
        file,
        n,
        'a state shown by dimming — a locked or used row is information, not a ' +
          'disabled control, so it must stay at full contrast and carry its ' +
          'state in a lock icon, a badge or a label',
      );
    }

    const patterns = file.endsWith('.tsx')
      ? [TEXT_PROPS, ALERT, JSX_TEXT]
      : [TEXT_PROPS, ALERT];
    for (const re of patterns) {
      re.lastIndex = 0;
      let match;
      while ((match = re.exec(code))) {
        const text = (match[3] ?? match[2] ?? match[1] ?? '').trim();
        // A value interpolated from t() is fine; only literals are a problem.
        if (!text || !/[A-Za-z]{3}/.test(text)) continue;
        report(file, n, `hardcoded user-facing string "${text}" — wrap it in t()`);
      }
    }
  });
}

if (problems.length) {
  console.error(`check-ui-rules: ${problems.length} problem(s)\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`check-ui-rules: ${files.length} files clean`);
