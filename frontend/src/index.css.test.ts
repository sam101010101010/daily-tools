import { describe, it, expect } from 'vitest';
import cssRaw from './index.css?raw';

/**
 * Design-system lock (see reference/design-system.md + ADR-0005 in the upper repo).
 *
 * The theme is token-driven: index.css :root (and its dark-mode override) is
 * the single source of truth for colour. Raw colour literals may appear ONLY
 * inside a --custom-property definition; everywhere else must go through
 * var(--token). This test is the forced consumption point — it runs in the CI
 * `frontend-test` job on every PR, so a stray hardcoded colour fails the build
 * instead of silently drifting the palette.
 */
const css = cssRaw.replace(/\/\*[\s\S]*?\*\//g, ''); // drop comments so notes can mention colours

const COLOUR = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;
const TOKEN_DEF = /--[a-z0-9-]+\s*:/;

describe('design tokens are the single source of truth', () => {
  it('has no raw colour outside a token definition', () => {
    const offenders = css
      .split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => COLOUR.test(line) && !TOKEN_DEF.test(line));

    expect(
      offenders,
      `raw colours must be tokenised — add a --token in :root and use var(--…):\n` +
        offenders.map((o) => `  L${o.n}: ${o.line}`).join('\n'),
    ).toEqual([]);
  });

  it('defines responsive, token-based hash tool surfaces with a wrapping digest', () => {
    expect(css).toMatch(/\.hash__controls\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/\.hash__file-summary\s*\{[^}]*var\(--surface-sunken\)/);
    expect(css).toMatch(/\.hash__progress\s*\{[^}]*var\(--accent\)/);
    expect(css).toMatch(/\.hash__result\s*\{[^}]*var\(--border\)/);
    expect(css).toMatch(/\.hash__digest\s*\{[^}]*overflow-wrap:\s*anywhere/);
    expect(css).toMatch(/@media \(max-width: 560px\)\s*\{[\s\S]*\.hash__controls\s*\{[\s\S]*grid-template-columns:\s*1fr/);
  });

  it('keeps Cron nested surfaces unframed and stacks controls at 390px', () => {
    expect(css).toMatch(/\.cron \.cron__section-head\s*\{[^}]*box-shadow:\s*none/);
    expect(css).toMatch(/\.cron \.cron__table-wrap\s*\{[^}]*padding:\s*0[^}]*box-shadow:\s*none/);
    expect(css).toMatch(/@media \(max-width: 390px\)\s*\{[\s\S]*\.cron__expression-row,[\s\S]*\.cron__field-legend\s*\{[\s\S]*grid-template-columns:\s*1fr/);
  });

  it('styles Cron profile context and lets six and seven field legends wrap', () => {
    expect(css).toMatch(/\.cron__profile-selector\s*\{[^}]*width:\s*100%/);
    expect(css).toMatch(/\.cron__profile-notice\s*\{[^}]*var\(--accent-weak\)/);
    expect(css).toMatch(/\.cron__profile-required\s*\{[^}]*var\(--text-muted\)/);
    expect(css).toMatch(/\.cron__field-legend\s*\{[^}]*repeat\(auto-fit, minmax\(8rem, 1fr\)\)/);
    expect(css).toMatch(/@media \(max-width: 390px\)\s*\{[\s\S]*\.cron__profile-selector\s*\{[\s\S]*width:\s*100%/);
  });
});
