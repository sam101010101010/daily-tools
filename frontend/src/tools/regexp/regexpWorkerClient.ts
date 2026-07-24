import type { RegexRequest } from './regexp';
import type {
  RegexWorkerMessage,
  RegexWorkerResult,
  RegexWorkerStartMessage,
} from './regexp.worker';

export const REGEXP_TIMEOUT_MS = 750;

export type RegexJobHandlers = Readonly<{
  onResult: (result: RegexWorkerResult) => void;
  onError: (message: string) => void;
}>;

type ActiveJob = Readonly<{
  jobId: string;
  worker: Worker;
  timeoutId: ReturnType<typeof setTimeout>;
}>;

const REGEXP_ERROR = '正则执行失败，请重试。';
const REGEXP_TIMEOUT_ERROR = '正则执行超时，请简化表达式或测试文本';

let activeJob: ActiveJob | undefined;
let nextJobId = 0;

function terminateWorker(worker: Worker): void {
  try {
    worker.terminate();
  } catch {
    // Cleanup must not expose native Worker failures to the UI.
  }
}

function clearActiveJob(jobId: string): boolean {
  if (activeJob?.jobId !== jobId) return false;
  const { worker, timeoutId } = activeJob;
  activeJob = undefined;
  clearTimeout(timeoutId);
  terminateWorker(worker);
  return true;
}

function cancelActiveJob(): void {
  if (activeJob) clearActiveJob(activeJob.jobId);
}

export function startRegexJob(
  request: RegexRequest,
  handlers: RegexJobHandlers,
): () => void {
  cancelActiveJob();

  let worker: Worker;
  try {
    worker = new Worker(new URL('./regexp.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    handlers.onError(REGEXP_ERROR);
    return () => undefined;
  }

  const jobId = `regexp-job-${++nextJobId}`;
  const timeoutId = setTimeout(() => {
    if (clearActiveJob(jobId)) handlers.onError(REGEXP_TIMEOUT_ERROR);
  }, REGEXP_TIMEOUT_MS);
  activeJob = { jobId, worker, timeoutId };

  worker.onmessage = (event: MessageEvent<RegexWorkerMessage>) => {
    const message = event.data;
    if (activeJob?.jobId !== jobId || message.jobId !== jobId) return;

    if (message.type === 'result') {
      if (clearActiveJob(jobId)) {
        handlers.onResult({
          evaluation: message.evaluation,
          replacementPreview: message.replacementPreview,
        });
      }
    } else if (clearActiveJob(jobId)) {
      handlers.onError(REGEXP_ERROR);
    }
  };

  worker.onerror = () => {
    if (clearActiveJob(jobId)) handlers.onError(REGEXP_ERROR);
  };

  const startMessage: RegexWorkerStartMessage = { type: 'start', jobId, request };
  try {
    worker.postMessage(startMessage);
  } catch {
    if (clearActiveJob(jobId)) handlers.onError(REGEXP_ERROR);
    return () => undefined;
  }

  return () => {
    clearActiveJob(jobId);
  };
}
