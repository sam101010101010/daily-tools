import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startDiffJob } from './diffWorkerClient';

class MockWorker {
  static instances: MockWorker[] = [];
  static constructorError: Error | undefined;
  static postMessageError: Error | undefined;

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn((_message: unknown) => {
    if (MockWorker.postMessageError) throw MockWorker.postMessageError;
  });
  terminate = vi.fn();

  constructor(..._args: unknown[]) {
    if (MockWorker.constructorError) throw MockWorker.constructorError;
    MockWorker.instances.push(this);
  }

  emit(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  emitError(): void {
    this.onerror?.({ message: 'native secret' } as ErrorEvent);
  }
}

const request = {
  left: 'before\n',
  right: 'after\n',
  options: { ignoreLineEndingStyle: false, ignoreTrailingWhitespace: false },
};

const result = {
  summary: { added: 0, deleted: 0, changed: 1, unchanged: 0 },
  rows: [],
  hunks: [],
  unifiedText: 'patch',
};

function handlers() {
  return { onResult: vi.fn(), onError: vi.fn() };
}

function postedJobId(worker: MockWorker): string {
  return (worker.postMessage.mock.calls[0][0] as { jobId: string }).jobId;
}

describe('diff Worker client', () => {
  beforeEach(() => {
    MockWorker.instances = [];
    MockWorker.constructorError = undefined;
    MockWorker.postMessageError = undefined;
    vi.stubGlobal('Worker', MockWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ['UTF-8 byte', { ...request, left: '你'.repeat(349_526) }, '每侧文本不能超过 1 MiB。'],
    ['line', { ...request, right: '\n'.repeat(50_001) }, '每侧文本不能超过 50,000 行。'],
  ])('rejects the %s limit before constructing a Worker', (_name, oversized, message) => {
    const callbacks = handlers();

    const job = startDiffJob(oversized, callbacks);

    expect(MockWorker.instances).toHaveLength(0);
    expect(callbacks.onError).toHaveBeenCalledWith(message);
    expect(job).toEqual({ cancel: expect.any(Function) });
    expect(() => job.cancel()).not.toThrow();
  });

  it('starts a module Worker with an increasing id and completes only the matching result', () => {
    const firstHandlers = handlers();
    startDiffJob(request, firstHandlers);
    const firstWorker = MockWorker.instances[0];
    const firstMessage = firstWorker.postMessage.mock.calls[0][0] as {
      type: string;
      jobId: string;
      request: unknown;
    };

    const secondHandlers = handlers();
    startDiffJob({ ...request, right: 'new\n' }, secondHandlers);
    const secondWorker = MockWorker.instances[1];
    const secondMessage = secondWorker.postMessage.mock.calls[0][0] as typeof firstMessage;
    secondWorker.emit({ type: 'result', jobId: secondMessage.jobId, result });

    expect(firstMessage).toEqual({ type: 'start', jobId: firstMessage.jobId, request });
    expect(Number(secondMessage.jobId.split('-').at(-1))).toBe(
      Number(firstMessage.jobId.split('-').at(-1)) + 1,
    );
    expect(secondHandlers.onResult).toHaveBeenCalledWith(result);
    expect(secondWorker.terminate).toHaveBeenCalledOnce();
  });

  it('makes saved late success and error handlers inert after cancellation', () => {
    const callbacks = handlers();
    const job = startDiffJob(request, callbacks);
    const worker = MockWorker.instances[0];
    const jobId = postedJobId(worker);
    const savedMessage = worker.onmessage;
    const savedError = worker.onerror;

    job.cancel();
    savedMessage?.({ data: { type: 'result', jobId, result } } as MessageEvent);
    savedMessage?.({ data: { type: 'error', jobId, code: 'DIFF_TOO_COMPLEX' } } as MessageEvent);
    savedError?.({ message: 'late secret' } as ErrorEvent);

    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(callbacks.onResult).not.toHaveBeenCalled();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  it('terminates a superseded Worker and ignores both of its saved late paths', () => {
    const oldHandlers = handlers();
    startDiffJob(request, oldHandlers);
    const oldWorker = MockWorker.instances[0];
    const oldJobId = postedJobId(oldWorker);
    const oldMessage = oldWorker.onmessage;
    const oldError = oldWorker.onerror;

    const currentHandlers = handlers();
    startDiffJob({ ...request, left: 'current\n' }, currentHandlers);
    const currentWorker = MockWorker.instances[1];
    const currentJobId = postedJobId(currentWorker);

    oldMessage?.({ data: { type: 'result', jobId: oldJobId, result } } as MessageEvent);
    oldMessage?.({ data: { type: 'error', jobId: oldJobId, code: 'DIFF_ENGINE_FAILED' } } as MessageEvent);
    oldError?.({ message: 'old secret' } as ErrorEvent);
    currentWorker.emit({ type: 'result', jobId: currentJobId, result });

    expect(oldWorker.terminate).toHaveBeenCalledOnce();
    expect(oldHandlers.onResult).not.toHaveBeenCalled();
    expect(oldHandlers.onError).not.toHaveBeenCalled();
    expect(currentHandlers.onResult).toHaveBeenCalledWith(result);
  });

  it('ignores stale ids on both message paths without disturbing the active job', () => {
    const callbacks = handlers();
    startDiffJob(request, callbacks);
    const worker = MockWorker.instances[0];
    const jobId = postedJobId(worker);

    worker.emit({ type: 'result', jobId: 'diff-job-stale', result });
    worker.emit({ type: 'error', jobId: 'diff-job-stale', code: 'DIFF_TOO_COMPLEX' });
    worker.emit({ type: 'result', jobId, result });

    expect(callbacks.onError).not.toHaveBeenCalled();
    expect(callbacks.onResult).toHaveBeenCalledOnce();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it.each([
    ['DIFF_INPUT_TOO_LARGE', '每侧文本不能超过 1 MiB。'],
    ['DIFF_TOO_MANY_LINES', '每侧文本不能超过 50,000 行。'],
    ['DIFF_TOO_COMPLEX', '文本差异过于复杂，请缩小输入后重试。'],
    ['DIFF_ENGINE_FAILED', '本地文本对比失败，请重试。'],
  ])('maps %s without trusting a Worker-provided message', (code, expected) => {
    const callbacks = handlers();
    startDiffJob(request, callbacks);
    const worker = MockWorker.instances[0];
    const jobId = postedJobId(worker);

    worker.emit({ type: 'error', jobId, code, message: 'internal stack and input' });

    expect(callbacks.onError).toHaveBeenCalledWith(expected);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('maps a malformed current message to the generic error and closes the job', () => {
    const callbacks = handlers();
    startDiffJob(request, callbacks);
    const worker = MockWorker.instances[0];
    const jobId = postedJobId(worker);

    worker.emit({ type: 'result', jobId });

    expect(callbacks.onError).toHaveBeenCalledWith('本地文本对比失败，请重试。');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('does not accept inherited object property names as Worker error codes', () => {
    const callbacks = handlers();
    startDiffJob(request, callbacks);
    const worker = MockWorker.instances[0];
    const jobId = postedJobId(worker);

    worker.emit({ type: 'error', jobId, code: '__proto__' });

    expect(callbacks.onError).toHaveBeenCalledWith('本地文本对比失败，请重试。');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('sanitizes a native Worker error and makes its saved message handler inert', () => {
    const callbacks = handlers();
    startDiffJob(request, callbacks);
    const worker = MockWorker.instances[0];
    const jobId = postedJobId(worker);
    const savedMessage = worker.onmessage;

    worker.emitError();
    savedMessage?.({ data: { type: 'result', jobId, result } } as MessageEvent);

    expect(callbacks.onError).toHaveBeenCalledWith('本地文本对比失败，请重试。');
    expect(callbacks.onResult).not.toHaveBeenCalled();
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it.each(['constructor', 'postMessage'] as const)(
    'maps %s failures and permits a later job',
    (failure) => {
      const callbacks = handlers();
      if (failure === 'constructor') MockWorker.constructorError = new Error('unavailable secret');
      if (failure === 'postMessage') MockWorker.postMessageError = new Error('clone secret');

      expect(() => startDiffJob(request, callbacks)).not.toThrow();
      expect(callbacks.onError).toHaveBeenCalledWith('本地文本对比失败，请重试。');
      if (failure === 'postMessage') {
        expect(MockWorker.instances[0].terminate).toHaveBeenCalledOnce();
      }

      MockWorker.constructorError = undefined;
      MockWorker.postMessageError = undefined;
      startDiffJob({ ...request, right: 'recovered\n' }, handlers());
      expect(MockWorker.instances.at(-1)?.postMessage).toHaveBeenCalledOnce();
    },
  );

  it('does not let an old cancellation handle terminate a replacement Worker', () => {
    const oldJob = startDiffJob(request, handlers());
    const oldWorker = MockWorker.instances[0];
    startDiffJob({ ...request, right: 'replacement\n' }, handlers());
    const replacementWorker = MockWorker.instances[1];

    oldJob.cancel();

    expect(oldWorker.terminate).toHaveBeenCalledOnce();
    expect(replacementWorker.terminate).not.toHaveBeenCalled();
  });
});
