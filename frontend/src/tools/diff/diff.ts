export const MAX_DIFF_BYTES_PER_SIDE = 1_048_576;
export const MAX_DIFF_LINES_PER_SIDE = 50_000;

export type DiffOptions = Readonly<{
  ignoreLineEndingStyle: boolean;
  ignoreTrailingWhitespace: boolean;
}>;

export type DiffRequest = Readonly<{
  left: string;
  right: string;
  options: DiffOptions;
}>;

export type LineEnding = 'lf' | 'crlf' | 'cr' | 'none';
export type DiffRowKind = 'equal' | 'insert' | 'delete' | 'replace';
export type InlineSegmentKind = 'equal' | 'insert' | 'delete';

export type InlineSegment = Readonly<{
  kind: InlineSegmentKind;
  text: string;
}>;

export type InlineDiff = Readonly<{
  left: readonly InlineSegment[];
  right: readonly InlineSegment[];
}>;

export type DiffRow = Readonly<{
  kind: DiffRowKind;
  leftLineNumber: number | null;
  rightLineNumber: number | null;
  leftText: string | null;
  rightText: string | null;
  leftEnding: LineEnding | null;
  rightEnding: LineEnding | null;
  inline?: InlineDiff;
}>;

export type DiffSummary = Readonly<{
  added: number;
  deleted: number;
  changed: number;
  unchanged: number;
}>;

export type DiffHunk = Readonly<{
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  rowStart: number;
  rowEnd: number;
}>;

export type DiffResult = Readonly<{
  summary: DiffSummary;
  rows: readonly DiffRow[];
  hunks: readonly DiffHunk[];
  unifiedText: string;
}>;

export type DiffErrorCode =
  | 'DIFF_INPUT_TOO_LARGE'
  | 'DIFF_TOO_MANY_LINES'
  | 'DIFF_TOO_COMPLEX'
  | 'DIFF_ENGINE_FAILED';

export const DIFF_ERROR_MESSAGES: Readonly<Record<DiffErrorCode, string>> = {
  DIFF_INPUT_TOO_LARGE: '每侧文本不能超过 1 MiB。',
  DIFF_TOO_MANY_LINES: '每侧文本不能超过 50,000 行。',
  DIFF_TOO_COMPLEX: '文本差异过于复杂，请缩小输入后重试。',
  DIFF_ENGINE_FAILED: '本地文本对比失败，请重试。',
};

export class DiffComputationError extends Error {
  readonly code: DiffErrorCode;

  constructor(code: DiffErrorCode) {
    super(DIFF_ERROR_MESSAGES[code]);
    this.name = 'DiffComputationError';
    this.code = code;
  }
}

export type SourceLine = Readonly<{
  text: string;
  ending: LineEnding;
}>;

export function splitSourceLines(input: string): SourceLine[] {
  if (input === '') return [];

  const lines: SourceLine[] = [];
  const endings = /\r\n|\n|\r/g;
  let start = 0;
  let match: RegExpExecArray | null;

  while ((match = endings.exec(input)) !== null) {
    const rawEnding = match[0];
    lines.push({
      text: input.slice(start, match.index),
      ending: rawEnding === '\r\n' ? 'crlf' : rawEnding === '\n' ? 'lf' : 'cr',
    });
    start = match.index + rawEnding.length;
  }

  if (start < input.length) {
    lines.push({ text: input.slice(start), ending: 'none' });
  }

  return lines;
}

function assertRequestShape(request: DiffRequest): void {
  if (
    request === null ||
    typeof request !== 'object' ||
    typeof request.left !== 'string' ||
    typeof request.right !== 'string' ||
    request.options === null ||
    typeof request.options !== 'object' ||
    typeof request.options.ignoreLineEndingStyle !== 'boolean' ||
    typeof request.options.ignoreTrailingWhitespace !== 'boolean'
  ) {
    throw new DiffComputationError('DIFF_ENGINE_FAILED');
  }
}

export function validateDiffRequest(request: DiffRequest): void {
  assertRequestShape(request);

  const encoder = new TextEncoder();
  if (
    encoder.encode(request.left).byteLength > MAX_DIFF_BYTES_PER_SIDE ||
    encoder.encode(request.right).byteLength > MAX_DIFF_BYTES_PER_SIDE
  ) {
    throw new DiffComputationError('DIFF_INPUT_TOO_LARGE');
  }

  if (
    splitSourceLines(request.left).length > MAX_DIFF_LINES_PER_SIDE ||
    splitSourceLines(request.right).length > MAX_DIFF_LINES_PER_SIDE
  ) {
    throw new DiffComputationError('DIFF_TOO_MANY_LINES');
  }
}

export function toDiffErrorCode(error: unknown): DiffErrorCode {
  return error instanceof DiffComputationError ? error.code : 'DIFF_ENGINE_FAILED';
}

export function isDiffErrorCode(value: unknown): value is DiffErrorCode {
  return typeof value === 'string' && Object.hasOwn(DIFF_ERROR_MESSAGES, value);
}
