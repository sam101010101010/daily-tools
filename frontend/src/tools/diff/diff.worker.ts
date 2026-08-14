import { diffArrays, diffLines } from 'diff';
import type { Change } from 'diff';

import {
  DiffComputationError,
  splitSourceLines,
  toDiffErrorCode,
  validateDiffRequest,
} from './diff';
import type {
  DiffErrorCode,
  DiffHunk,
  DiffRequest,
  DiffResult,
  DiffRow,
  DiffSummary,
  InlineDiff,
  InlineSegment,
  LineEnding,
  SourceLine,
} from './diff';

const ENGINE_TIMEOUT_MS = 2_000;
const HUNK_CONTEXT_LINES = 3;

export type DiffWorkerStartMessage = Readonly<{
  type: 'start';
  jobId: string;
  request: DiffRequest;
}>;

export type DiffWorkerMessage =
  | Readonly<{ type: 'result'; jobId: string; result: DiffResult }>
  | Readonly<{ type: 'error'; jobId: string; code: DiffErrorCode }>;

type IndexedLine = Readonly<SourceLine & { key: string }>;

function comparisonKey(line: SourceLine, request: DiffRequest): string {
  const text = request.options.ignoreTrailingWhitespace
    ? line.text.replace(/[ \t]+$/u, '')
    : line.text;
  const ending = request.options.ignoreLineEndingStyle && line.ending !== 'none'
    ? 'newline'
    : line.ending;
  return JSON.stringify([text, ending]);
}

function prepareLines(input: string, request: DiffRequest): IndexedLine[] {
  return splitSourceLines(input).map((line) => ({
    ...line,
    key: comparisonKey(line, request),
  }));
}

function engineInput(lines: readonly IndexedLine[]): string {
  return lines.map((line) => `${line.key}\n`).join('');
}

function logicalLineCount(change: Change): number {
  if (typeof change.value !== 'string') return 0;
  let count = 0;
  for (const token of change.value.split('\n')) {
    if (token !== '') count += 1;
  }
  return count;
}

function appendSegment(
  segments: InlineSegment[],
  kind: InlineSegment['kind'],
  text: string,
): void {
  if (text === '') return;
  const previous = segments.at(-1);
  if (previous?.kind === kind) {
    segments[segments.length - 1] = { kind, text: previous.text + text };
  } else {
    segments.push({ kind, text });
  }
}

function wholeChangeInline(leftText: string, rightText: string): InlineDiff {
  return {
    left: leftText === '' ? [] : [{ kind: 'delete', text: leftText }],
    right: rightText === '' ? [] : [{ kind: 'insert', text: rightText }],
  };
}

function remainingEngineTime(deadline: number): number {
  return Math.max(0, deadline - Date.now());
}

function refineChangedText(
  leftText: string,
  rightText: string,
  segmenter: Intl.Segmenter,
  deadline: number,
): InlineDiff {
  if (remainingEngineTime(deadline) === 0) return wholeChangeInline(leftText, rightText);

  const leftGraphemes = Array.from(segmenter.segment(leftText), ({ segment }) => segment);
  const rightGraphemes = Array.from(segmenter.segment(rightText), ({ segment }) => segment);
  const timeout = remainingEngineTime(deadline);
  if (timeout === 0) return wholeChangeInline(leftText, rightText);
  const changes = diffArrays(leftGraphemes, rightGraphemes, { timeout });

  if (changes === undefined) {
    return wholeChangeInline(leftText, rightText);
  }

  const left: InlineSegment[] = [];
  const right: InlineSegment[] = [];
  for (const change of changes) {
    const text = change.value.join('');
    if (change.removed) {
      appendSegment(left, 'delete', text);
    } else if (change.added) {
      appendSegment(right, 'insert', text);
    } else {
      appendSegment(left, 'equal', text);
      appendSegment(right, 'equal', text);
    }
  }
  return { left, right };
}

function createInlineDiff(
  leftText: string,
  rightText: string,
  deadline: number,
): InlineDiff | undefined {
  if (leftText === rightText) return undefined;
  if (typeof Intl.Segmenter !== 'function') return wholeChangeInline(leftText, rightText);
  if (remainingEngineTime(deadline) === 0) return wholeChangeInline(leftText, rightText);

  const wordSegmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
  const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const leftWords = Array.from(wordSegmenter.segment(leftText), ({ segment }) => segment);
  const rightWords = Array.from(wordSegmenter.segment(rightText), ({ segment }) => segment);
  const timeout = remainingEngineTime(deadline);
  if (timeout === 0) return wholeChangeInline(leftText, rightText);
  const changes = diffArrays(leftWords, rightWords, { timeout });
  if (changes === undefined) return wholeChangeInline(leftText, rightText);

  const left: InlineSegment[] = [];
  const right: InlineSegment[] = [];
  for (let index = 0; index < changes.length;) {
    const change = changes[index];
    if (!change.added && !change.removed) {
      const text = change.value.join('');
      appendSegment(left, 'equal', text);
      appendSegment(right, 'equal', text);
      index += 1;
      continue;
    }

    let changedLeft = '';
    let changedRight = '';
    while (index < changes.length && (changes[index].added || changes[index].removed)) {
      if (changes[index].removed) changedLeft += changes[index].value.join('');
      if (changes[index].added) changedRight += changes[index].value.join('');
      index += 1;
    }
    const refined = refineChangedText(changedLeft, changedRight, graphemeSegmenter, deadline);
    for (const segment of refined.left) appendSegment(left, segment.kind, segment.text);
    for (const segment of refined.right) appendSegment(right, segment.kind, segment.text);
  }

  return { left, right };
}

function buildRows(
  changes: readonly Change[],
  leftLines: readonly IndexedLine[],
  rightLines: readonly IndexedLine[],
  deadline: number,
): DiffRow[] {
  const rows: DiffRow[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  let pendingLeft: IndexedLine[] = [];
  let pendingRight: IndexedLine[] = [];

  const flushChanges = () => {
    const paired = Math.min(pendingLeft.length, pendingRight.length);
    for (let index = 0; index < paired; index += 1) {
      const left = pendingLeft[index];
      const right = pendingRight[index];
      const inline = createInlineDiff(left.text, right.text, deadline);
      rows.push({
        kind: 'replace',
        leftLineNumber: leftIndex - pendingLeft.length + index + 1,
        rightLineNumber: rightIndex - pendingRight.length + index + 1,
        leftText: left.text,
        rightText: right.text,
        leftEnding: left.ending,
        rightEnding: right.ending,
        ...(inline === undefined ? {} : { inline }),
      });
    }
    for (let index = paired; index < pendingLeft.length; index += 1) {
      const left = pendingLeft[index];
      rows.push({
        kind: 'delete',
        leftLineNumber: leftIndex - pendingLeft.length + index + 1,
        rightLineNumber: null,
        leftText: left.text,
        rightText: null,
        leftEnding: left.ending,
        rightEnding: null,
      });
    }
    for (let index = paired; index < pendingRight.length; index += 1) {
      const right = pendingRight[index];
      rows.push({
        kind: 'insert',
        leftLineNumber: null,
        rightLineNumber: rightIndex - pendingRight.length + index + 1,
        leftText: null,
        rightText: right.text,
        leftEnding: null,
        rightEnding: right.ending,
      });
    }
    pendingLeft = [];
    pendingRight = [];
  };

  for (const change of changes) {
    const count = logicalLineCount(change);
    if (count === 0) continue;

    if (change.removed) {
      pendingLeft.push(...leftLines.slice(leftIndex, leftIndex + count));
      leftIndex += count;
    } else if (change.added) {
      pendingRight.push(...rightLines.slice(rightIndex, rightIndex + count));
      rightIndex += count;
    } else {
      flushChanges();
      for (let offset = 0; offset < count; offset += 1) {
        const left = leftLines[leftIndex + offset];
        const right = rightLines[rightIndex + offset];
        rows.push({
          kind: 'equal',
          leftLineNumber: leftIndex + offset + 1,
          rightLineNumber: rightIndex + offset + 1,
          leftText: left.text,
          rightText: right.text,
          leftEnding: left.ending,
          rightEnding: right.ending,
        });
      }
      leftIndex += count;
      rightIndex += count;
    }
  }
  flushChanges();

  if (leftIndex !== leftLines.length || rightIndex !== rightLines.length) {
    throw new DiffComputationError('DIFF_ENGINE_FAILED');
  }
  return rows;
}

function summarize(rows: readonly DiffRow[]): DiffSummary {
  const summary = { added: 0, deleted: 0, changed: 0, unchanged: 0 };
  for (const row of rows) {
    if (row.kind === 'insert') summary.added += 1;
    if (row.kind === 'delete') summary.deleted += 1;
    if (row.kind === 'replace') summary.changed += 1;
    if (row.kind === 'equal') summary.unchanged += 1;
  }
  return summary;
}

function createHunks(rows: readonly DiffRow[]): DiffHunk[] {
  const changedRows = rows
    .map((row, index) => row.kind === 'equal' ? -1 : index)
    .filter((index) => index >= 0);
  if (changedRows.length === 0) return [];

  const ranges: Array<{ start: number; end: number }> = [];
  for (const changedRow of changedRows) {
    const start = Math.max(0, changedRow - HUNK_CONTEXT_LINES);
    const end = Math.min(rows.length, changedRow + HUNK_CONTEXT_LINES + 1);
    const previous = ranges.at(-1);
    if (previous && start <= previous.end) {
      previous.end = Math.max(previous.end, end);
    } else {
      ranges.push({ start, end });
    }
  }

  return ranges.map(({ start, end }) => {
    const hunkRows = rows.slice(start, end);
    const leftNumbers = hunkRows
      .map((row) => row.leftLineNumber)
      .filter((line): line is number => line !== null);
    const rightNumbers = hunkRows
      .map((row) => row.rightLineNumber)
      .filter((line): line is number => line !== null);
    return {
      oldStart: leftNumbers[0] ?? 0,
      oldLines: leftNumbers.length,
      newStart: rightNumbers[0] ?? 0,
      newLines: rightNumbers.length,
      rowStart: start,
      rowEnd: end,
    };
  });
}

function endingText(ending: LineEnding): string {
  if (ending === 'lf') return '\n';
  if (ending === 'crlf') return '\r\n';
  if (ending === 'cr') return '\r';
  return '';
}

function unifiedLine(prefix: ' ' | '-' | '+', text: string, ending: LineEnding): string {
  const content = `${prefix}${text}${endingText(ending)}`;
  return ending === 'none' ? `${content}\n\\ No newline at end of file\n` : content;
}

function createUnifiedText(rows: readonly DiffRow[], hunks: readonly DiffHunk[]): string {
  if (hunks.length === 0) return '';

  let unified = '--- original\n+++ modified\n';
  for (const hunk of hunks) {
    unified += `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n`;
    const hunkRows = rows.slice(hunk.rowStart, hunk.rowEnd);
    for (let index = 0; index < hunkRows.length;) {
      const row = hunkRows[index];
      if (row.kind === 'equal') {
        unified += unifiedLine(' ', row.leftText ?? '', row.leftEnding ?? 'none');
        index += 1;
        continue;
      }

      const block: DiffRow[] = [];
      while (index < hunkRows.length && hunkRows[index].kind !== 'equal') {
        block.push(hunkRows[index]);
        index += 1;
      }
      for (const changed of block) {
        if (changed.leftText !== null && changed.leftEnding !== null) {
          unified += unifiedLine('-', changed.leftText, changed.leftEnding);
        }
      }
      for (const changed of block) {
        if (changed.rightText !== null && changed.rightEnding !== null) {
          unified += unifiedLine('+', changed.rightText, changed.rightEnding);
        }
      }
    }
  }
  return unified;
}

export function computeTextDiff(request: DiffRequest): DiffResult {
  const deadline = Date.now() + ENGINE_TIMEOUT_MS;
  validateDiffRequest(request);
  const leftLines = prepareLines(request.left, request);
  const rightLines = prepareLines(request.right, request);
  const leftEngineInput = engineInput(leftLines);
  const rightEngineInput = engineInput(rightLines);
  const timeout = remainingEngineTime(deadline);
  if (timeout === 0) throw new DiffComputationError('DIFF_TOO_COMPLEX');
  const changes = diffLines(leftEngineInput, rightEngineInput, {
    newlineIsToken: true,
    timeout,
  });
  if (changes === undefined) throw new DiffComputationError('DIFF_TOO_COMPLEX');

  const rows = buildRows(changes, leftLines, rightLines, deadline);
  const hunks = createHunks(rows);
  return {
    summary: summarize(rows),
    rows,
    hunks,
    unifiedText: createUnifiedText(rows, hunks),
  };
}

export function runDiffWorkerJob(
  message: DiffWorkerStartMessage,
  postMessage: (message: DiffWorkerMessage) => void,
): void {
  const jobId = typeof message?.jobId === 'string' ? message.jobId : '';
  try {
    const result = computeTextDiff(message.request);
    postMessage({ type: 'result', jobId, result });
  } catch (error) {
    postMessage({ type: 'error', jobId, code: toDiffErrorCode(error) });
  }
}

if (
  typeof document === 'undefined' &&
  typeof globalThis.addEventListener === 'function' &&
  typeof globalThis.postMessage === 'function'
) {
  globalThis.addEventListener('message', (event: MessageEvent<DiffWorkerStartMessage>) => {
    if (event.data?.type === 'start') {
      runDiffWorkerJob(event.data, (message) => globalThis.postMessage(message));
    }
  });
}
