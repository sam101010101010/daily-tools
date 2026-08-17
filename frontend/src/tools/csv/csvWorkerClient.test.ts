import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startTabularJob } from './csvWorkerClient';

class MockWorker {
  static instances: MockWorker[] = [];
  static constructorError: Error | undefined;
  static postMessageError: Error | undefined;
  static terminateError: Error | undefined;

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn((_message: unknown) => {
    if (MockWorker.postMessageError) throw MockWorker.postMessageError;
  });
  terminate = vi.fn(() => {
    if (MockWorker.terminateError) throw MockWorker.terminateError;
  });

  constructor(..._args: unknown[]) {
    if (MockWorker.constructorError) throw MockWorker.constructorError;
    MockWorker.instances.push(this);
  }
}

const request = {
  mode: 'csv-to-json',
  input: 'id\n001\n',
  delimiter: ',',
  header: true,
  spreadsheetSafe: false,
} as const;

const result = {
  kind: 'success',
  headers: ['id'],
  rows: [['001']],
  output: '[\n  {\n    "id": "001"\n  }\n]\n',
  rowCount: 1,
  columnCount: 1,
  warnings: [],
} as const;

function handlers() {
  return { onResult: vi.fn(), onError: vi.fn() };
}

function postedJobId(worker: MockWorker): string {
  return (worker.postMessage.mock.calls[0][0] as { jobId: string }).jobId;
}

describe('CSV Worker client', () => {
  beforeEach(() => {
    MockWorker.instances = [];
    MockWorker.constructorError = undefined;
    MockWorker.postMessageError = undefined;
    MockWorker.terminateError = undefined;
    vi.stubGlobal('Worker', MockWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects an oversized UTF-8 request before constructing a Worker', () => {
    const callbacks = handlers();

    startTabularJob({ ...request, input: 'a'.repeat(5 * 1024 * 1024 + 1) }, callbacks);

    expect(MockWorker.instances).toHaveLength(0);
    expect(callbacks.onError).toHaveBeenCalledWith('TABULAR_INPUT_TOO_LARGE');
  });

  it('completes only its matching result and releases its Worker', () => {
    const callbacks = handlers();
    startTabularJob(request, callbacks);
    const worker = MockWorker.instances[0];
    const jobId = postedJobId(worker);

    worker.onmessage?.({ data: { type: 'result', jobId, result } } as MessageEvent);

    expect(callbacks.onResult).toHaveBeenCalledWith(result);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('makes saved completion and native-error handlers inert after unmount cancellation', () => {
    const callbacks = handlers();
    const job = startTabularJob(request, callbacks);
    const worker = MockWorker.instances[0];
    const jobId = postedJobId(worker);
    const savedMessage = worker.onmessage;
    const savedError = worker.onerror;

    job.cancel();
    savedMessage?.({ data: { type: 'result', jobId, result } } as MessageEvent);
    savedError?.({} as ErrorEvent);

    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(callbacks.onResult).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it('terminates a superseded Worker and keeps its retained late handlers from clobbering the current job', () => {
    const oldCallbacks = handlers();
    startTabularJob(request, oldCallbacks);
    const oldWorker = MockWorker.instances[0];
    const oldJobId = postedJobId(oldWorker);
    const oldMessage = oldWorker.onmessage;
    const oldError = oldWorker.onerror;

    const currentCallbacks = handlers();
    startTabularJob({ ...request, input: 'id\n002\n' }, currentCallbacks);
    const currentWorker = MockWorker.instances[1];
    const currentJobId = postedJobId(currentWorker);

    oldMessage?.({ data: { type: 'result', jobId: oldJobId, result } } as MessageEvent);
    oldError?.({} as ErrorEvent);
    currentWorker.onmessage?.({ data: { type: 'result', jobId: currentJobId, result } } as MessageEvent);

    expect(oldWorker.terminate).toHaveBeenCalledOnce();
    expect(oldCallbacks.onResult).not.toHaveBeenCalled();
    expect(oldCallbacks.onError).not.toHaveBeenCalled();
    expect(currentCallbacks.onResult).toHaveBeenCalledWith(result);
  });

  it('turns a malformed current result into a stable engine failure and closes the Worker', () => {
    const callbacks = handlers();
    startTabularJob(request, callbacks);
    const worker = MockWorker.instances[0];
    const jobId = postedJobId(worker);

    worker.onmessage?.({ data: { type: 'result', jobId, result: { kind: 'success' } } } as MessageEvent);

    expect(callbacks.onResult).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledWith('TABULAR_ENGINE_FAILED');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it.each([
    ['missing job id', () => ({ type: 'result', result })],
    ['wrong job id', () => ({ type: 'result', jobId: 'csv-job-wrong', result })],
    ['unexpected wrapper key', (jobId: string) => ({ type: 'result', jobId, result, stack: 'native detail' })],
  ])('fails a %s from the current Worker instead of leaving it active', (_name, createMessage) => {
    const callbacks = handlers();
    startTabularJob(request, callbacks);
    const worker = MockWorker.instances[0];
    const jobId = postedJobId(worker);

    worker.onmessage?.({ data: createMessage(jobId) } as MessageEvent);

    expect(callbacks.onResult).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledWith('TABULAR_ENGINE_FAILED');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('rejects a failure DTO that leaks partial success data', () => {
    const callbacks = handlers();
    startTabularJob(request, callbacks);
    const worker = MockWorker.instances[0];
    const jobId = postedJobId(worker);

    worker.onmessage?.({
      data: { type: 'result', jobId, result: { kind: 'failure', code: 'CSV_INVALID_SYNTAX', rows: [] } },
    } as MessageEvent);

    expect(callbacks.onResult).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledWith('TABULAR_ENGINE_FAILED');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it.each([
    ['failure stack', { kind: 'failure', code: 'CSV_INVALID_SYNTAX', stack: 'parser stack' }],
    ['success dependency object', { ...result, parser: { internal: true } }],
  ])('rejects a result with arbitrary extra %s', (_name, malformedResult) => {
    const callbacks = handlers();
    startTabularJob(request, callbacks);
    const worker = MockWorker.instances[0];
    const jobId = postedJobId(worker);

    worker.onmessage?.({ data: { type: 'result', jobId, result: malformedResult } } as MessageEvent);

    expect(callbacks.onResult).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledWith('TABULAR_ENGINE_FAILED');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('rejects a success DTO whose preview width disagrees with its declared columns', () => {
    const callbacks = handlers();
    startTabularJob(request, callbacks);
    const worker = MockWorker.instances[0];
    const jobId = postedJobId(worker);

    worker.onmessage?.({
      data: { type: 'result', jobId, result: { ...result, rows: [['001', 'unexpected']] } },
    } as MessageEvent);

    expect(callbacks.onResult).not.toHaveBeenCalled();
    expect(callbacks.onError).toHaveBeenCalledWith('TABULAR_ENGINE_FAILED');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it.each(['constructor', 'postMessage', 'terminate'] as const)(
    'contains %s failures and permits a later job',
    (failure) => {
      const callbacks = handlers();
      if (failure === 'constructor') MockWorker.constructorError = new Error('unavailable');
      if (failure === 'postMessage') MockWorker.postMessageError = new Error('clone');
      if (failure === 'terminate') MockWorker.terminateError = new Error('cleanup');

      expect(() => startTabularJob(request, callbacks)).not.toThrow();
      if (failure === 'terminate') {
        const worker = MockWorker.instances[0];
        worker.onmessage?.({ data: { type: 'error', jobId: postedJobId(worker), code: 'TABULAR_ENGINE_FAILED' } } as MessageEvent);
      }

      expect(callbacks.onError).toHaveBeenCalledWith('TABULAR_ENGINE_FAILED');
      MockWorker.constructorError = undefined;
      MockWorker.postMessageError = undefined;
      MockWorker.terminateError = undefined;
      startTabularJob(request, handlers());
      expect(MockWorker.instances.at(-1)?.postMessage).toHaveBeenCalledOnce();
    },
  );
});
