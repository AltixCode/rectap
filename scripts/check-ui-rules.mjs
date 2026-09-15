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
