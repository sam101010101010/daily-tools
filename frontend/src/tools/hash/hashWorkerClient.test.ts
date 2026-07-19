import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startHashJob } from './hashWorkerClient';

class MockWorker {
  static instances: MockWorker[] = [];

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor(..._args: unknown[]) {
    MockWorker.instances.push(this);
  }

  emit(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

describe('hash worker client', () => {
  beforeEach(() => {
    MockWorker.instances = [];
    vi.stubGlobal('Worker', MockWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('forwards matching progress and success messages to the active job handlers', () => {
    const onProgress = vi.fn();
    const onSuccess = vi.fn();

    startHashJob(
      { algorithm: 'sha256', source: { kind: 'text', text: 'abc' } },
      { onProgress, onSuccess, onError: vi.fn() },
    );
    const worker = MockWorker.instances[0];
    const [{ jobId }] = worker.postMessage.mock.calls.map(([message]) => message) as [{ jobId: string }];

    worker.emit({ type: 'progress', jobId, completedBytes: 2, totalBytes: 3 });
    worker.emit({ type: 'done', jobId, digest: 'a'.repeat(64) });

    expect(onProgress).toHaveBeenCalledWith({ completedBytes: 2, totalBytes: 3 });
    expect(onSuccess).toHaveBeenCalledWith({ algorithm: 'sha256', digest: 'a'.repeat(64) });
  });

  it('terminates the previous worker and ignores its late messages when a new job starts', () => {
    const oldHandlers = { onProgress: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() };
    startHashJob({ algorithm: 'sha256', source: { kind: 'text', text: 'old' } }, oldHandlers);
    const oldWorker = MockWorker.instances[0];
    const [{ jobId: oldJobId }] = oldWorker.postMessage.mock.calls.map(([message]) => message) as [
      { jobId: string },
    ];

    const newHandlers = { onProgress: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() };
    startHashJob({ algorithm: 'sha512', source: { kind: 'text', text: 'new' } }, newHandlers);
    const newWorker = MockWorker.instances[1];
    const [{ jobId: newJobId }] = newWorker.postMessage.mock.calls.map(([message]) => message) as [
      { jobId: string },
    ];

    oldWorker.emit({ type: 'done', jobId: oldJobId, digest: 'stale' });
    newWorker.emit({ type: 'progress', jobId: newJobId, completedBytes: 3, totalBytes: 3 });

    expect(oldWorker.terminate).toHaveBeenCalledOnce();
    expect(oldHandlers.onSuccess).not.toHaveBeenCalled();
    expect(newHandlers.onProgress).toHaveBeenCalledWith({ completedBytes: 3, totalBytes: 3 });
  });

  it('terminates on cancellation and ignores messages that arrive afterwards', () => {
    const onSuccess = vi.fn();
    const cancel = startHashJob(
      { algorithm: 'md5', source: { kind: 'text', text: 'abc' } },
      { onProgress: vi.fn(), onSuccess, onError: vi.fn() },
    );
    const worker = MockWorker.instances[0];
    const [{ jobId }] = worker.postMessage.mock.calls.map(([message]) => message) as [{ jobId: string }];

    cancel();
    worker.emit({ type: 'done', jobId, digest: '900150983cd24fb0d6963f7d28e17f72' });

    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('terminates the worker after a final success message', () => {
    startHashJob(
      { algorithm: 'sha256', source: { kind: 'text', text: 'abc' } },
      { onProgress: vi.fn(), onSuccess: vi.fn(), onError: vi.fn() },
    );
    const worker = MockWorker.instances[0];
    const [{ jobId }] = worker.postMessage.mock.calls.map(([message]) => message) as [{ jobId: string }];

    worker.emit({ type: 'done', jobId, digest: 'a'.repeat(64) });

    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
