import { expect, test } from 'vitest';
import {
  DEFAULT_REGEXP_REQUEST,
  evaluateRegex,
  REGEXP_FLAGS,
  createReplacementPreview,
} from './regexp';

test('exports the public date walkthrough defaults and a normalized flag alphabet', () => {
  expect(DEFAULT_REGEXP_REQUEST).toEqual({
    pattern: '(?<year>\\d{4})-(\\d{2})-(\\d{2})',
    flags: 'g',
    text: '日志：2026-07-22，下一次 2026-08-01',
    replacement: '$2/$3/$<year>',
  });
  expect(REGEXP_FLAGS).toEqual(['g', 'i', 'm', 's', 'u']);
  expect(evaluateRegex({ ...DEFAULT_REGEXP_REQUEST, flags: 'usggimx' })).toMatchObject({
    kind: 'success',
    flags: 'gimsu',
  });
});

test('returns only the first match without g, including numbered and named captures', () => {
  expect(evaluateRegex({
    pattern: '(?<word>\\w+)-(\\d+)(?:-(optional))?',
    flags: 'i',
    text: 'first-1 second-2-tail',
    replacement: '',
  })).toEqual({
    kind: 'success',
    flags: 'i',
    matches: [{
      text: 'first-1',
      index: 0,
      captures: ['first', '1', null],
      namedCaptures: { word: 'first' },
    }],
    truncated: false,
  });
});

test('returns global matches in index order and preserves unmatched captures as null', () => {
  expect(evaluateRegex({
    pattern: '(?<letter>[a-z])?(\\d)',
    flags: 'g',
    text: 'a1 2',
    replacement: '',
  })).toEqual({
    kind: 'success',
    flags: 'g',
    matches: [
      { text: 'a1', index: 0, captures: ['a', '1'], namedCaptures: { letter: 'a' } },
      { text: '2', index: 3, captures: [null, '2'], namedCaptures: { letter: null } },
    ],
    truncated: false,
  });
});

test('handles empty patterns, Unicode, zero-length global matches, and the 500-match limit', () => {
  expect(evaluateRegex({ pattern: '', flags: 'g', text: 'ab', replacement: '' })).toMatchObject({
    kind: 'success',
    matches: [
      { text: '', index: 0 },
      { text: '', index: 1 },
      { text: '', index: 2 },
    ],
  });
  expect(evaluateRegex({ pattern: '.', flags: 'gu', text: '😀', replacement: '' })).toMatchObject({
    kind: 'success',
    matches: [{ text: '😀', index: 0 }],
  });
  expect(evaluateRegex({ pattern: '(?=.)', flags: 'gu', text: '😀A', replacement: '' })).toMatchObject({
    kind: 'success',
    matches: [{ index: 0 }, { index: 2 }],
  });
  const limited = evaluateRegex({ pattern: 'a', flags: 'g', text: 'a'.repeat(501), replacement: '' });
  expect(limited).toMatchObject({
    kind: 'limit-reached',
    truncated: true,
  });
  expect(limited.kind === 'limit-reached' && limited.matches[0]).toMatchObject({ index: 0 });
  expect(limited.kind === 'limit-reached' && limited.matches[499]).toMatchObject({ index: 499 });
  expect(limited.kind === 'limit-reached' && limited.matches).toHaveLength(500);
});

test('returns a Chinese syntax error instead of throwing for malformed patterns', () => {
  expect(evaluateRegex({ pattern: '(', flags: 'g', text: 'text', replacement: '' })).toEqual({
    kind: 'syntax-error',
    error: '正则语法错误，请检查表达式。',
  });
});

test('uses JavaScript replacement semantics and marks a preview with no matches', () => {
  expect(createReplacementPreview({
    pattern: '(?<year>\\d{4})-(\\d{2})-(\\d{2})',
    flags: 'g',
    text: '2026-07-22',
    replacement: '$& → $2/$3/$<year>',
  })).toEqual({ kind: 'preview', value: '2026-07-22 → 07/22/2026' });
  expect(createReplacementPreview({
    pattern: 'z', flags: 'g', text: 'abc', replacement: '$&',
  })).toEqual({ kind: 'no-match' });
});
