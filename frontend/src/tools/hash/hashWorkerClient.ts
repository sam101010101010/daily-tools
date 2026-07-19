import type { HashAlgorithm, HashProgress, HashSource, HashSuccess } from './hash';
import type { HashWorkerMessage, HashWorkerStartMessage } from './hash.worker';

export type HashJobRequest = Readonly<{
  algorithm: HashAlgorithm;
  source: HashSource;
}>;

export type HashJobHandlers = Readonly<{
  onProgress: (progress: HashProgress) => void;
  onSuccess: (success: HashSuccess) => void;
  onError: (message: string) => void;
}>;

let currentJob: Readonly<{ jobId: string; worker: Worker }> | undefined;
let nextJobId = 0;
const HASH_WORKER_ERROR = '本地哈希计算失败，请重试。';

function terminateWorker(worker: Worker): void {
  try {
    worker.terminate();
  } catch {
    // Cleanup must still clear client state and expose the approved UI error.
  }
}

function cancelCurrentJob(): void {
  const worker = currentJob?.worker;
  currentJob = undefined;
  if (worker) terminateWorker(worker);
}

export function startHashJob(request: HashJobRequest, handlers: HashJobHandlers): () => void {
  cancelCurrentJob();

  let worker: Worker;
  try {
    worker = new Worker(new URL('./hash.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    handlers.onError(HASH_WORKER_ERROR);
    return () => undefined;
  }
  const jobId = `hash-job-${++nextJobId}`;
  currentJob = { jobId, worker };

  worker.onmessage = (event: MessageEvent<HashWorkerMessage>) => {
    const message = event.data;
    if (currentJob?.jobId !== jobId || message.jobId !== jobId) return;

    switch (message.type) {
      case 'progress':
        handlers.onProgress({
          completedBytes: message.completedBytes,
          totalBytes: message.totalBytes,
        });
        break;
      case 'done':
        handlers.onSuccess({ algorithm: request.algorithm, digest: message.digest });
        if (currentJob?.jobId === jobId) {
          worker.terminate();
          currentJob = undefined;
        }
        break;
      case 'error':
        handlers.onError(message.message);
        if (currentJob?.jobId === jobId) {
          worker.terminate();
          currentJob = undefined;
        }
        break;
    }
  };

  worker.onerror = () => {
    if (currentJob?.jobId === jobId) {
      currentJob = undefined;
      terminateWorker(worker);
      handlers.onError(HASH_WORKER_ERROR);
    }
  };

  const startMessage: HashWorkerStartMessage = {
    type: 'start',
    jobId,
    algorithm: request.algorithm,
    source: request.source,
  };
  try {
    worker.postMessage(startMessage);
  } catch {
    if (currentJob?.jobId === jobId) currentJob = undefined;
    terminateWorker(worker);
    handlers.onError(HASH_WORKER_ERROR);
    return () => undefined;
  }

  return () => {
    if (currentJob?.jobId === jobId) {
      worker.terminate();
      currentJob = undefined;
    }
  };
}
