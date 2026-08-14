import {
  DIFF_ERROR_MESSAGES,
  DiffComputationError,
  isDiffErrorCode,
  validateDiffRequest,
} from './diff';
import type {
  DiffRequest,
  DiffResult,
  DiffRowKind,
  InlineSegmentKind,
  LineEnding,
} from './diff';
import type { DiffWorkerMessage, DiffWorkerStartMessage } from './diff.worker';

export type DiffJobHandlers = Readonly<{
  onResult: (result: DiffResult) => void;
  onError: (message: string) => void;
}>;

export type DiffJob = Readonly<{
  cancel: () => void;
}>;

type ActiveJob = Readonly<{
  jobId: string;
  worker: Worker;
}>;

let activeJob: ActiveJob | undefined;
let nextJobId = 0;

function terminateWorker(worker: Worker): void {
  try {
    worker.terminate();
  } catch {
    // Cancellation must stay safe even if the native Worker cleanup fails.
  }
}

function clearActiveJob(jobId: string): boolean {
  if (activeJob?.jobId !== jobId) return false;
  const { worker } = activeJob;
  activeJob = undefined;
  terminateWorker(worker);
  return true;
}

function cancelActiveJob(): void {
  if (activeJob) clearActiveJob(activeJob.jobId);
}

function idleJob(): DiffJob {
  return { cancel: () => undefined };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return isNonNegativeInteger(value) && value > 0;
}

function isLineEnding(value: unknown): value is LineEnding {
  return value === 'lf' || value === 'crlf' || value === 'cr' || value === 'none';
}

function isDiffRowKind(value: unknown): value is DiffRowKind {
  return value === 'equal' || value === 'insert' || value === 'delete' || value === 'replace';
}

function isInlineSegmentKind(value: unknown): value is InlineSegmentKind {
  return value === 'equal' || value === 'insert' || value === 'delete';
}

function everyArrayItem(
  values: readonly unknown[],
  predicate: (value: unknown) => boolean,
): boolean {
  for (let index = 0; index < values.length; index += 1) {
    if (!predicate(values[index])) return false;
  }
  return true;
}

function isInlineSegment(value: unknown, side: 'left' | 'right'): boolean {
  if (!isRecord(value) || !isInlineSegmentKind(value.kind) || typeof value.text !== 'string') {
    return false;
  }
  return side === 'left' ? value.kind !== 'insert' : value.kind !== 'delete';
}

function isInlineDiff(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.left) || !Array.isArray(value.right)) return false;
  return everyArrayItem(value.left, segment => isInlineSegment(segment, 'left'))
    && everyArrayItem(value.right, segment => isInlineSegment(segment, 'right'));
}

function isPresentLine(number: unknown, text: unknown, ending: unknown): boolean {
  return isPositiveInteger(number) && typeof text === 'string' && isLineEnding(ending);
}

function isAbsentLine(number: unknown, text: unknown, ending: unknown): boolean {
  return number === null && text === null && ending === null;
}

function isDiffRow(value: unknown): boolean {
  if (!isRecord(value) || !isDiffRowKind(value.kind)) return false;
  if (value.inline !== undefined && (value.kind !== 'replace' || !isInlineDiff(value.inline))) {
    return false;
  }

  const leftPresent = isPresentLine(value.leftLineNumber, value.leftText, value.leftEnding);
  const rightPresent = isPresentLine(value.rightLineNumber, value.rightText, value.rightEnding);
  if (value.kind === 'insert') {
    return isAbsentLine(value.leftLineNumber, value.leftText, value.leftEnding) && rightPresent;
  }
  if (value.kind === 'delete') {
    return leftPresent && isAbsentLine(value.rightLineNumber, value.rightText, value.rightEnding);
  }
  return leftPresent && rightPresent;
}

function isDiffHunk(value: unknown, rowCount: number): boolean {
  if (!isRecord(value)) return false;
  if (
    !isNonNegativeInteger(value.oldStart)
    || !isNonNegativeInteger(value.oldLines)
    || !isNonNegativeInteger(value.newStart)
    || !isNonNegativeInteger(value.newLines)
    || !isNonNegativeInteger(value.rowStart)
    || !isNonNegativeInteger(value.rowEnd)
  ) {
    return false;
  }
  return value.rowStart < value.rowEnd && value.rowEnd <= rowCount;
}

function isDiffResult(value: unknown): value is DiffResult {
  if (!isRecord(value) || !isRecord(value.summary)) return false;
  if (!Array.isArray(value.rows) || !Array.isArray(value.hunks)) return false;
  const rows = value.rows;
  const hunks = value.hunks;
  const summaryCounts = [
    value.summary.added,
    value.summary.deleted,
    value.summary.changed,
    value.summary.unchanged,
  ];
  return summaryCounts.every(isNonNegativeInteger)
    && everyArrayItem(rows, isDiffRow)
    && everyArrayItem(hunks, hunk => isDiffHunk(hunk, rows.length))
    && typeof value.unifiedText === 'string';
}

export function startDiffJob(request: DiffRequest, handlers: DiffJobHandlers): DiffJob {
  cancelActiveJob();

  try {
    validateDiffRequest(request);
  } catch (error) {
    const code = error instanceof DiffComputationError ? error.code : 'DIFF_ENGINE_FAILED';
    handlers.onError(DIFF_ERROR_MESSAGES[code]);
    return idleJob();
  }

  let worker: Worker;
  try {
    worker = new Worker(new URL('./diff.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    handlers.onError(DIFF_ERROR_MESSAGES.DIFF_ENGINE_FAILED);
    return idleJob();
  }

  const jobId = `diff-job-${++nextJobId}`;
  activeJob = { jobId, worker };

  worker.onmessage = (event: MessageEvent<DiffWorkerMessage>) => {
    const message: unknown = event.data;
    if (message === null || typeof message !== 'object') return;
    const candidate = message as Partial<DiffWorkerMessage>;
    if (activeJob?.jobId !== jobId || candidate.jobId !== jobId) return;

    if (candidate.type === 'result' && isDiffResult(candidate.result)) {
      if (clearActiveJob(jobId)) handlers.onResult(candidate.result);
      return;
    }
    if (candidate.type === 'error' && isDiffErrorCode(candidate.code)) {
      if (clearActiveJob(jobId)) handlers.onError(DIFF_ERROR_MESSAGES[candidate.code]);
      return;
    }
    if (clearActiveJob(jobId)) handlers.onError(DIFF_ERROR_MESSAGES.DIFF_ENGINE_FAILED);
  };

  worker.onerror = () => {
    if (clearActiveJob(jobId)) handlers.onError(DIFF_ERROR_MESSAGES.DIFF_ENGINE_FAILED);
  };

  const message: DiffWorkerStartMessage = { type: 'start', jobId, request };
  try {
    worker.postMessage(message);
  } catch {
    if (clearActiveJob(jobId)) handlers.onError(DIFF_ERROR_MESSAGES.DIFF_ENGINE_FAILED);
    return idleJob();
  }

  return {
    cancel: () => {
      clearActiveJob(jobId);
    },
  };
}
