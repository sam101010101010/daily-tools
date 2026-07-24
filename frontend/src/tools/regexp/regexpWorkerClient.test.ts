import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REGEXP_TIMEOUT_MS, startRegexJob } from './regexpWorkerClient';

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
    this.onerror?.({} as ErrorEvent);
  }
}

const request = {
  pattern: '\\w+',
  flags: 'g',
  text: 'hello',
  replacement: '',
};

function handlers() {
  return { onResult: vi.fn(), onError: vi.fn() };
}

function postedJobId(worker: MockWorker): string {
  return (worker.postMessage.mock.calls[0][0] as { jobId: string }).jobId;
}

describe('regexp worker client', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWorker.instances = [];
    MockWorker.constructorError = undefined;
    MockWorker.postMessageError = undefined;
    vi.stubGlobal('Worker', MockWorker);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('posts start messages with increasing job ids', () => {
    startRegexJob(request, handlers());
    const firstWorker = MockWorker.instances[0];
    const firstMessage = firstWorker.postMessage.mock.calls[0][0] as {
      type: string;
      jobId: string;
      request: unknown;
    };

    startRegexJob({ ...request, text: 'next' }, handlers());
    const secondWorker = MockWorker.instances[1];
    const secondMessage = secondWorker.postMessage.mock.calls[0][0] as typeof firstMessage;

    expect(firstMessage).toEqual({ type: 'start', jobId: firstMessage.jobId, request });
    expect(Number(secondMessage.jobId.split('-').at(-1))).toBe(
      Number(firstMessage.jobId.split('-').at(-1)) + 1,
    );
  });

  it('terminates the previous worker and ignores its late messages', () => {
    const oldHandlers = handlers();
    startRegexJob(request, oldHandlers);
    const oldWorker = MockWorker.instances[0];
    const oldJobId = postedJobId(oldWorker);

    const newHandlers = handlers();
    startRegexJob({ ...request, text: 'new' }, newHandlers);
    const newWorker = MockWorker.instances[1];
    const newJobId = postedJobId(newWorker);
    const result = {
      kind: 'success',
      flags: 'g',
      matches: [],
      truncated: false,
    };

    oldWorker.emit({ type: 'result', jobId: oldJobId, evaluation: result });
    newWorker.emit({ type: 'result', jobId: newJobId, evaluation: result });

    expect(oldWorker.terminate).toHaveBeenCalledOnce();
    expect(oldHandlers.onResult).not.toHaveBeenCalled();
    expect(newHandlers.onResult).toHaveBeenCalledWith({
      evaluation: result,
      replacementPreview: undefined,
    });
  });

  it('terminates the current worker after 750 ms and reports the timeout', () => {
    const callbacks = handlers();
    startRegexJob(request, callbacks);
    const worker = MockWorker.instances[0];

    vi.advanceTimersByTime(REGEXP_TIMEOUT_MS);

    expect(REGEXP_TIMEOUT_MS).toBe(750);
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(callbacks.onError).toHaveBeenCalledWith(
      '正则执行超时，请简化表达式或测试文本',
    );
  });

  it.each(['constructor', 'postMessage', 'native worker'] as const)(
    'maps %s errors to the approved retry message',
    (failure) => {
      const callbacks = handlers();
      if (failure === 'constructor') MockWorker.constructorError = new Error('unavailable');
      if (failure === 'postMessage') MockWorker.postMessageError = new Error('clone failed');

      expect(() => startRegexJob(request, callbacks)).not.toThrow();
      if (failure === 'native worker') MockWorker.instances[0].emitError();

      expect(callbacks.onError).toHaveBeenCalledWith('正则执行失败，请重试。');
      if (failure !== 'constructor') {
        expect(MockWorker.instances[0].terminate).toHaveBeenCalledOnce();
      }
    },
  );

  it('does not let an old cancellation handle terminate a newer job', () => {
    const cancelOld = startRegexJob(request, handlers());
    const oldWorker = MockWorker.instances[0];
    startRegexJob({ ...request, text: 'new' }, handlers());
    const newWorker = MockWorker.instances[1];

    cancelOld();

    expect(oldWorker.terminate).toHaveBeenCalledOnce();
    expect(newWorker.terminate).not.toHaveBeenCalled();
  });
});
