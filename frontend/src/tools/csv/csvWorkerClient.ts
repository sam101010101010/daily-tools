import type {
  TabularErrorCode,
  TabularRequest,
  TabularResult,
  TabularWorkerMessage,
  TabularWorkerStartMessage,
} from './csv.worker';

export type TabularJobHandlers = Readonly<{
  onResult: (result: TabularResult) => void;
  onError: (code: TabularErrorCode) => void;
}>;

export type TabularJob = Readonly<{ cancel: () => void }>;

type ActiveJob = Readonly<{ jobId: string; worker: Worker }>;

let activeJob: ActiveJob | undefined;
let nextJobId = 0;
const MAX_INPUT_BYTES = 5 * 1024 * 1024;

function terminateWorker(worker: Worker): void {
  try {
    worker.terminate();
  } catch {
    // Worker cleanup must never expose native failures to consumers.
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function hasOnlyOwnKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Reflect.ownKeys(value).every(key => typeof key === 'string' && allowed.includes(key));
}

function hasExactOwnKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return hasOnlyOwnKeys(value, expected)
    && expected.length === Reflect.ownKeys(value).length
    && expected.every(key => Object.hasOwn(value, key));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function isRows(value: unknown): value is string[][] {
  return Array.isArray(value) && value.every(isStringArray);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isTabularErrorCode(value: unknown): value is TabularErrorCode {
  return value === 'TABULAR_EMPTY_INPUT'
    || value === 'TABULAR_INPUT_TOO_LARGE'
    || value === 'TABULAR_TOO_MANY_ROWS'
    || value === 'TABULAR_ENGINE_FAILED'
    || value === 'CSV_INVALID_SYNTAX'
    || value === 'CSV_BLANK_HEADER'
    || value === 'CSV_DUPLICATE_HEADER'
    || value === 'CSV_EXTRA_CELL'
    || value === 'JSON_INVALID_INPUT'
    || value === 'JSON_EMPTY_ARRAY'
    || value === 'JSON_MIXED_ROW_TYPES'
    || value === 'JSON_INCONSISTENT_KEYS'
    || value === 'JSON_INCONSISTENT_WIDTH'
    || value === 'JSON_NESTED_VALUE';
}

function isTabularResult(value: unknown): value is TabularResult {
  if (!isRecord(value) || (value.kind !== 'success' && value.kind !== 'failure')) return false;
  if (value.kind === 'failure') {
    return hasOnlyOwnKeys(value, ['kind', 'code', 'row', 'column'])
      && Object.hasOwn(value, 'kind')
      && Object.hasOwn(value, 'code')
      && isTabularErrorCode(value.code)
      && (!Object.hasOwn(value, 'row') || (isNonNegativeInteger(value.row) && value.row > 0))
      && (!Object.hasOwn(value, 'column') || (isNonNegativeInteger(value.column) && value.column > 0));
  }
  if (!hasExactOwnKeys(value, ['kind', 'headers', 'rows', 'output', 'rowCount', 'columnCount', 'warnings'])) return false;
  if (
    !isStringArray(value.headers)
    || !isRows(value.rows)
    || typeof value.output !== 'string'
    || !isNonNegativeInteger(value.rowCount)
    || !isNonNegativeInteger(value.columnCount)
    || !isStringArray(value.warnings)
  ) {
    return false;
  }
  const columnCount = value.headers.length === 0 ? (value.rows[0]?.length ?? 0) : value.headers.length;
  return value.rowCount === value.rows.length
    && value.columnCount === columnCount
    && value.rows.every(row => row.length === columnCount);
}

function isWorkerMessage(value: unknown): value is TabularWorkerMessage {
  if (!isRecord(value) || typeof value.jobId !== 'string') return false;
  if (value.type === 'result') {
    return hasExactOwnKeys(value, ['type', 'jobId', 'result']) && isTabularResult(value.result);
  }
  return value.type === 'error'
    && hasExactOwnKeys(value, ['type', 'jobId', 'code'])
    && isTabularErrorCode(value.code);
}

export function startTabularJob(request: TabularRequest, handlers: TabularJobHandlers): TabularJob {
  cancelActiveJob();
  if (new TextEncoder().encode(request.input).byteLength > MAX_INPUT_BYTES) {
    handlers.onError('TABULAR_INPUT_TOO_LARGE');
    return { cancel: () => undefined };
  }
  let worker: Worker;
  try {
    worker = new Worker(new URL('./csv.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    handlers.onError('TABULAR_ENGINE_FAILED');
    return { cancel: () => undefined };
  }

  const jobId = `csv-job-${++nextJobId}`;
  activeJob = { jobId, worker };
  worker.onmessage = (event: MessageEvent<unknown>) => {
    const message = event.data;
    if (activeJob?.jobId !== jobId) return;
    if (!isWorkerMessage(message) || message.jobId !== jobId) {
      if (clearActiveJob(jobId)) handlers.onError('TABULAR_ENGINE_FAILED');
      return;
    }
    if (message.type === 'result') {
      if (clearActiveJob(jobId)) handlers.onResult(message.result);
    } else if (clearActiveJob(jobId)) {
      handlers.onError(message.code);
    }
  };
  worker.onerror = () => {
    if (clearActiveJob(jobId)) handlers.onError('TABULAR_ENGINE_FAILED');
  };

  const message: TabularWorkerStartMessage = { type: 'start', jobId, request };
  try {
    worker.postMessage(message);
  } catch {
    if (clearActiveJob(jobId)) handlers.onError('TABULAR_ENGINE_FAILED');
    return { cancel: () => undefined };
  }
  return { cancel: () => { clearActiveJob(jobId); } };
}
