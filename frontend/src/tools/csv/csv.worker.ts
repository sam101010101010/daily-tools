import { convertTabular, isTabularRequest } from './csv';
import type { TabularErrorCode, TabularRequest, TabularResult } from './csv';

export type { TabularErrorCode, TabularRequest, TabularResult } from './csv';

export type TabularWorkerStartMessage = Readonly<{
  type: 'start';
  jobId: string;
  request: TabularRequest;
}>;

export type TabularWorkerMessage =
  | Readonly<{ type: 'result'; jobId: string; result: TabularResult }>
  | Readonly<{ type: 'error'; jobId: string; code: TabularErrorCode }>;

function isStartMessage(value: unknown): value is TabularWorkerStartMessage {
  return value !== null
    && typeof value === 'object'
    && (value as { type?: unknown }).type === 'start'
    && typeof (value as { jobId?: unknown }).jobId === 'string'
    && isTabularRequest((value as { request?: unknown }).request);
}

export function runTabularWorkerJob(
  message: unknown,
  postMessage: (message: TabularWorkerMessage) => void,
): void {
  if (!isStartMessage(message)) {
    const jobId = message !== null && typeof message === 'object' && typeof (message as { jobId?: unknown }).jobId === 'string'
      ? (message as { jobId: string }).jobId
      : '';
    postMessage({ type: 'error', jobId, code: 'TABULAR_ENGINE_FAILED' });
    return;
  }
  try {
    postMessage({ type: 'result', jobId: message.jobId, result: convertTabular(message.request) });
  } catch {
    postMessage({ type: 'error', jobId: message.jobId, code: 'TABULAR_ENGINE_FAILED' });
  }
}

if (typeof document === 'undefined') {
  globalThis.addEventListener('message', (event: MessageEvent<unknown>) => {
    runTabularWorkerJob(event.data, (message) => globalThis.postMessage(message));
  });
}
