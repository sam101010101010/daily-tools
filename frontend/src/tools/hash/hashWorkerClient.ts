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

function cancelCurrentJob(): void {
  currentJob?.worker.terminate();
  currentJob = undefined;
}

export function startHashJob(request: HashJobRequest, handlers: HashJobHandlers): () => void {
  cancelCurrentJob();

  const worker = new Worker(new URL('./hash.worker.ts', import.meta.url), { type: 'module' });
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
      worker.terminate();
      currentJob = undefined;
      handlers.onError('本地哈希计算失败，请重试。');
    }
  };

  const startMessage: HashWorkerStartMessage = {
    type: 'start',
    jobId,
    algorithm: request.algorithm,
    source: request.source,
  };
  worker.postMessage(startMessage);

  return () => {
    if (currentJob?.jobId === jobId) {
      worker.terminate();
      currentJob = undefined;
    }
  };
}
