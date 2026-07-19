import {
  createMD5,
  createSHA1,
  createSHA256,
  createSHA384,
  createSHA512,
} from 'hash-wasm';
import type { IHasher } from 'hash-wasm';
import type { HashAlgorithm, HashSource } from './hash';

export const HASH_CHUNK_SIZE = 4 * 1024 * 1024;

export type HashWorkerStartMessage = Readonly<{
  type: 'start';
  jobId: string;
  algorithm: HashAlgorithm;
  source: HashSource;
}>;

export type HashWorkerMessage =
  | Readonly<{
      type: 'progress';
      jobId: string;
      completedBytes: number;
      totalBytes: number;
    }>
  | Readonly<{ type: 'done'; jobId: string; digest: string }>
  | Readonly<{ type: 'error'; jobId: string; message: '本地哈希计算失败，请重试。' }>;

async function createHasher(algorithm: HashAlgorithm): Promise<IHasher> {
  switch (algorithm) {
    case 'md5':
      return createMD5();
    case 'sha1':
      return createSHA1();
    case 'sha256':
      return createSHA256();
    case 'sha384':
      return createSHA384();
    case 'sha512':
      return createSHA512();
  }
}

export async function runHashWorkerJob(
  request: HashWorkerStartMessage,
  postMessage: (message: HashWorkerMessage) => void,
): Promise<void> {
  try {
    const hasher = await createHasher(request.algorithm);
    hasher.init();

    if (request.source.kind === 'text') {
      const bytes = new TextEncoder().encode(request.source.text);
      hasher.update(bytes);
      postMessage({
        type: 'progress',
        jobId: request.jobId,
        completedBytes: bytes.byteLength,
        totalBytes: bytes.byteLength,
      });
    } else {
      const { file } = request.source;
      for (let offset = 0; offset < file.size; offset += HASH_CHUNK_SIZE) {
        const chunk = await file.slice(offset, offset + HASH_CHUNK_SIZE).arrayBuffer();
        hasher.update(new Uint8Array(chunk));
        postMessage({
          type: 'progress',
          jobId: request.jobId,
          completedBytes: Math.min(offset + HASH_CHUNK_SIZE, file.size),
          totalBytes: file.size,
        });
      }

      if (file.size === 0) {
        postMessage({ type: 'progress', jobId: request.jobId, completedBytes: 0, totalBytes: 0 });
      }
    }

    postMessage({ type: 'done', jobId: request.jobId, digest: hasher.digest('hex') });
  } catch {
    postMessage({ type: 'error', jobId: request.jobId, message: '本地哈希计算失败，请重试。' });
  }
}

if (typeof document === 'undefined') {
  globalThis.addEventListener('message', (event: MessageEvent<HashWorkerStartMessage>) => {
    if (event.data.type === 'start') {
      void runHashWorkerJob(event.data, (message) => globalThis.postMessage(message));
    }
  });
}
