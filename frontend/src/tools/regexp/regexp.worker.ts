import {
  createReplacementPreview,
  evaluateRegex,
} from './regexp';
import type {
  RegexEvaluation,
  RegexRequest,
  ReplacementPreview,
} from './regexp';

export type RegexWorkerStartMessage = Readonly<{
  type: 'start';
  jobId: string;
  request: RegexRequest;
}>;

export type RegexWorkerResult = Readonly<{
  evaluation: RegexEvaluation;
  replacementPreview?: ReplacementPreview;
}>;

export type RegexWorkerMessage =
  | Readonly<
      {
        type: 'result';
        jobId: string;
      } & RegexWorkerResult
    >
  | Readonly<{ type: 'error'; jobId: string; message: '正则执行失败，请重试。' }>;

export function runRegexWorkerJob(
  message: RegexWorkerStartMessage,
  postMessage: (message: RegexWorkerMessage) => void,
): void {
  try {
    const result: RegexWorkerResult = {
      evaluation: evaluateRegex(message.request),
      ...(message.request.replacement === ''
        ? {}
        : { replacementPreview: createReplacementPreview(message.request) }),
    };
    postMessage({ type: 'result', jobId: message.jobId, ...result });
  } catch {
    postMessage({ type: 'error', jobId: message.jobId, message: '正则执行失败，请重试。' });
  }
}

if (
  typeof document === 'undefined' &&
  typeof globalThis.addEventListener === 'function' &&
  typeof globalThis.postMessage === 'function'
) {
  globalThis.addEventListener('message', (event: MessageEvent<RegexWorkerStartMessage>) => {
    if (event.data.type === 'start') {
      runRegexWorkerJob(event.data, (message) => globalThis.postMessage(message));
    }
  });
}
