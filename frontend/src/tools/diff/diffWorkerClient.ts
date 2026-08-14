import {
  DIFF_ERROR_MESSAGES,
  DiffComputationError,
  isDiffErrorCode,
  validateDiffRequest,
} from './diff';
import type { DiffRequest, DiffResult } from './diff';
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

function isDiffResult(value: unknown): value is DiffResult {
  if (value === null || typeof value !== 'object') return false;
  const result = value as Partial<DiffResult>;
  return (
    result.summary !== null &&
    typeof result.summary === 'object' &&
    Array.isArray(result.rows) &&
    Array.isArray(result.hunks) &&
    typeof result.unifiedText === 'string'
  );
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
