import { describe, expect, test } from 'vitest';

import { computeTextDiff, runDiffWorkerJob } from './diff.worker';

type Options = {
  ignoreLineEndingStyle?: boolean;
  ignoreTrailingWhitespace?: boolean;
};

function compare(left: string, right: string, options: Options = {}) {
  return computeTextDiff({
    left,
    right,
    options: {
      ignoreLineEndingStyle: options.ignoreLineEndingStyle ?? false,
      ignoreTrailingWhitespace: options.ignoreTrailingWhitespace ?? false,
    },
  });
}

describe('text diff DTO contract', () => {
  test('reports CRLF versus LF as a changed line unless line-ending style is ignored', () => {
    const preserved = compare('same\r\n', 'same\n');

    expect(preserved.summary).toEqual({ added: 0, deleted: 0, changed: 1, unchanged: 0 });
    expect(preserved.rows).toEqual([
      {
        kind: 'replace',
        leftLineNumber: 1,
        rightLineNumber: 1,
        leftText: 'same',
        rightText: 'same',
        leftEnding: 'crlf',
        rightEnding: 'lf',
      },
    ]);
    expect(preserved.unifiedText).toBe(
      '--- original\n+++ modified\n@@ -1,1 +1,1 @@\n-same\r\n+same\n',
    );

    const ignored = compare('same\r\n', 'same\n', { ignoreLineEndingStyle: true });
    expect(ignored.summary).toEqual({ added: 0, deleted: 0, changed: 0, unchanged: 1 });
    expect(ignored.rows[0]).toMatchObject({ kind: 'equal', leftText: 'same', rightText: 'same' });
    expect(ignored.hunks).toEqual([]);
    expect(ignored.unifiedText).toBe('');
  });

  test('preserves a missing final newline and emits the standard marker', () => {
    const result = compare('alpha\nbeta\n', 'alpha\nbeta');

    expect(result.rows.at(-1)).toMatchObject({
      kind: 'replace',
      leftLineNumber: 2,
      rightLineNumber: 2,
      leftText: 'beta',
      rightText: 'beta',
      leftEnding: 'lf',
      rightEnding: 'none',
    });
    expect(result.unifiedText).toBe(
      '--- original\n+++ modified\n@@ -1,2 +1,2 @@\n alpha\n-beta\n+beta\n\\ No newline at end of file\n',
    );
  });

  test('keeps extended grapheme clusters intact in subordinate inline segments', () => {
    const result = compare('family 👨‍👩‍👧\n', 'family 👨‍👩‍👦\n');

    expect(result.rows).toEqual([
      {
        kind: 'replace',
        leftLineNumber: 1,
        rightLineNumber: 1,
        leftText: 'family 👨‍👩‍👧',
        rightText: 'family 👨‍👩‍👦',
        leftEnding: 'lf',
        rightEnding: 'lf',
        inline: {
          left: [
            { kind: 'equal', text: 'family ' },
            { kind: 'delete', text: '👨‍👩‍👧' },
          ],
          right: [
            { kind: 'equal', text: 'family ' },
            { kind: 'insert', text: '👨‍👩‍👦' },
          ],
        },
      },
    ]);
    expect(result.unifiedText).toBe(
      '--- original\n+++ modified\n@@ -1,1 +1,1 @@\n-family 👨‍👩‍👧\n+family 👨‍👩‍👦\n',
    );
  });

  test('ignores trailing spaces and tabs only when explicitly requested', () => {
    const preserved = compare('alpha  \n', 'alpha\t\n');
    expect(preserved.summary.changed).toBe(1);
    expect(preserved.rows[0]).toMatchObject({
      kind: 'replace',
      leftText: 'alpha  ',
      rightText: 'alpha\t',
    });

    const ignored = compare('alpha  \n', 'alpha\t\n', { ignoreTrailingWhitespace: true });
    expect(ignored.summary).toEqual({ added: 0, deleted: 0, changed: 0, unchanged: 1 });
    expect(ignored.rows[0]).toMatchObject({
      kind: 'equal',
      leftText: 'alpha  ',
      rightText: 'alpha\t',
    });
    expect(ignored.hunks).toEqual([]);
    expect(ignored.unifiedText).toBe('');
  });

  test('represents an empty original side as one insertion with an exact hunk range', () => {
    const result = compare('', 'new\n');

    expect(result.summary).toEqual({ added: 1, deleted: 0, changed: 0, unchanged: 0 });
    expect(result.rows).toEqual([
      {
        kind: 'insert',
        leftLineNumber: null,
        rightLineNumber: 1,
        leftText: null,
        rightText: 'new',
        leftEnding: null,
        rightEnding: 'lf',
      },
    ]);
    expect(result.hunks).toEqual([
      { oldStart: 0, oldLines: 0, newStart: 1, newLines: 1, rowStart: 0, rowEnd: 1 },
    ]);
    expect(result.unifiedText).toBe(
      '--- original\n+++ modified\n@@ -0,0 +1,1 @@\n+new\n',
    );
  });

  test('represents an empty modified side as one deletion with an exact hunk range', () => {
    const result = compare('old\n', '');

    expect(result.summary).toEqual({ added: 0, deleted: 1, changed: 0, unchanged: 0 });
    expect(result.rows[0]).toMatchObject({
      kind: 'delete',
      leftLineNumber: 1,
      rightLineNumber: null,
      leftText: 'old',
      rightText: null,
    });
    expect(result.hunks).toEqual([
      { oldStart: 1, oldLines: 1, newStart: 0, newLines: 0, rowStart: 0, rowEnd: 1 },
    ]);
    expect(result.unifiedText).toBe(
      '--- original\n+++ modified\n@@ -1,1 +0,0 @@\n-old\n',
    );
  });

  test('pairs an all-changed input into deterministic replace rows', () => {
    const result = compare('one\ntwo\n', 'three\nfour\n');

    expect(result.summary).toEqual({ added: 0, deleted: 0, changed: 2, unchanged: 0 });
    expect(result.rows.map((row: { kind: string }) => row.kind)).toEqual(['replace', 'replace']);
    expect(result.hunks).toEqual([
      { oldStart: 1, oldLines: 2, newStart: 1, newLines: 2, rowStart: 0, rowEnd: 2 },
    ]);
    expect(result.unifiedText).toBe(
      '--- original\n+++ modified\n@@ -1,2 +1,2 @@\n-one\n-two\n+three\n+four\n',
    );
  });

  test('uses exact file headers and three context lines for separated hunks', () => {
    const result = compare(
      'a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\n',
      'a\nB\nc\nd\ne\nf\ng\nh\ni\nJ\nk\n',
    );

    expect(result.unifiedText).toBe(
      '--- original\n+++ modified\n' +
        '@@ -1,5 +1,5 @@\n a\n-b\n+B\n c\n d\n e\n' +
        '@@ -7,5 +7,5 @@\n g\n h\n i\n-j\n+J\n k\n',
    );
    expect(result.hunks).toEqual([
      { oldStart: 1, oldLines: 5, newStart: 1, newLines: 5, rowStart: 0, rowEnd: 5 },
      { oldStart: 7, oldLines: 5, newStart: 7, newLines: 5, rowStart: 6, rowEnd: 11 },
    ]);
  });
});

describe('text diff computation bounds', () => {
  test('accepts exactly 50,000 lines and rejects the next line defensively', () => {
    const atLimit = '\n'.repeat(50_000);
    expect(compare(atLimit, atLimit).summary.unchanged).toBe(50_000);

    const messages: unknown[] = [];
    runDiffWorkerJob(
      {
        type: 'start',
        jobId: 'line-limit',
        request: {
          left: `${atLimit}\n`,
          right: '',
          options: { ignoreLineEndingStyle: false, ignoreTrailingWhitespace: false },
        },
      },
      (message) => messages.push(message),
    );

    expect(messages).toEqual([
      { type: 'error', jobId: 'line-limit', code: 'DIFF_TOO_MANY_LINES' },
    ]);
  });

  test('rejects a side above 1 MiB by UTF-8 bytes without leaking internal details', () => {
    const messages: unknown[] = [];
    runDiffWorkerJob(
      {
        type: 'start',
        jobId: 'byte-limit',
        request: {
          left: '你'.repeat(349_526),
          right: '',
          options: { ignoreLineEndingStyle: false, ignoreTrailingWhitespace: false },
        },
      },
      (message) => messages.push(message),
    );

    expect(messages).toEqual([
      { type: 'error', jobId: 'byte-limit', code: 'DIFF_INPUT_TOO_LARGE' },
    ]);
  });

  test('collapses malformed requests into the stable engine error code', () => {
    const messages: unknown[] = [];
    runDiffWorkerJob(
      {
        type: 'start',
        jobId: 'malformed',
        request: null,
      } as never,
      (message) => messages.push(message),
    );

    expect(messages).toEqual([
      { type: 'error', jobId: 'malformed', code: 'DIFF_ENGINE_FAILED' },
    ]);
  });

  test('maps the engine deadline sentinel to the stable complexity error code', () => {
    const left = Array.from({ length: 50_000 }, (_, index) => `left-${index}\n`).join('');
    const right = Array.from({ length: 50_000 }, (_, index) => `right-${index}\n`).join('');
    const messages: unknown[] = [];

    runDiffWorkerJob(
      {
        type: 'start',
        jobId: 'complexity',
        request: {
          left,
          right,
          options: { ignoreLineEndingStyle: false, ignoreTrailingWhitespace: false },
        },
      },
      (message) => messages.push(message),
    );

    expect(messages).toEqual([
      { type: 'error', jobId: 'complexity', code: 'DIFF_TOO_COMPLEX' },
    ]);
  }, 5_000);
});
