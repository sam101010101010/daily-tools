import { describe, expect, it } from 'vitest';
import { runHashWorkerJob } from './hash.worker';
import type { HashWorkerMessage } from './hash.worker';

const ABC_DIGESTS = {
  md5: '900150983cd24fb0d6963f7d28e17f72',
  sha1: 'a9993e364706816aba3e25717850c26c9cd0d89d',
  sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  sha384:
    'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7',
  sha512:
    'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
} as const;

const LARGE_FILE_SHA256 = 'acd560a1e1d523c090ab93aed616d154b7b5e8206a153cced729d83f2c7dcfc3';

async function collectMessages(
  request: Parameters<typeof runHashWorkerJob>[0],
): Promise<HashWorkerMessage[]> {
  const messages: HashWorkerMessage[] = [];
  await runHashWorkerJob(request, (message) => messages.push(message));
  return messages;
}

describe('hash worker', () => {
  it.each(Object.entries(ABC_DIGESTS))('hashes text abc with %s', async (algorithm, digest) => {
    const messages = await collectMessages({
      type: 'start',
      jobId: algorithm,
      algorithm: algorithm as keyof typeof ABC_DIGESTS,
      source: { kind: 'text', text: 'abc' },
    });

    expect(messages).toContainEqual({
      type: 'progress',
      jobId: algorithm,
      completedBytes: 3,
      totalBytes: 3,
    });
    expect(messages).toContainEqual({ type: 'done', jobId: algorithm, digest });
  });

  it.each(Object.entries(ABC_DIGESTS))('hashes File abc with %s', async (algorithm, digest) => {
    const messages = await collectMessages({
      type: 'start',
      jobId: `file-${algorithm}`,
      algorithm: algorithm as keyof typeof ABC_DIGESTS,
      source: { kind: 'file', file: new File(['abc'], 'abc.txt') },
    });

    expect(messages).toContainEqual({ type: 'done', jobId: `file-${algorithm}`, digest });
  });

  it('hashes an empty file and reports completion', async () => {
    const messages = await collectMessages({
      type: 'start',
      jobId: 'empty',
      algorithm: 'sha256',
      source: { kind: 'file', file: new File([], 'empty.txt') },
    });

    expect(messages).toContainEqual({
      type: 'progress',
      jobId: 'empty',
      completedBytes: 0,
      totalBytes: 0,
    });
    expect(messages).toContainEqual({
      type: 'done',
      jobId: 'empty',
      digest: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    });
  });

  it('reads a file across the 4 MiB boundary with non-decreasing progress', async () => {
    const file = new File([new Uint8Array(4 * 1024 * 1024 + 1).fill(97)], 'large.txt');
    const messages = await collectMessages({
      type: 'start',
      jobId: 'large',
      algorithm: 'sha256',
      source: { kind: 'file', file },
    });
    const progress = messages.filter(
      (message): message is Extract<HashWorkerMessage, { type: 'progress' }> =>
        message.type === 'progress',
    );

    expect(progress.map(({ completedBytes }) => completedBytes)).toEqual([
      4 * 1024 * 1024,
      file.size,
    ]);
    expect(progress.every(({ completedBytes }, index) => index === 0 || completedBytes >= progress[index - 1].completedBytes)).toBe(true);
    expect(progress.at(-1)).toEqual({
      type: 'progress',
      jobId: 'large',
      completedBytes: file.size,
      totalBytes: file.size,
    });
    expect(messages).toContainEqual({
      type: 'done',
      jobId: 'large',
      digest: LARGE_FILE_SHA256,
    });
  });

  it('returns only the approved Chinese message when reading fails', async () => {
    const unreadableFile = {
      name: 'unreadable.txt',
      size: 1,
      slice: () => ({ arrayBuffer: async () => Promise.reject(new Error('read failed')) }),
    } as unknown as File;
    const messages = await collectMessages({
      type: 'start',
      jobId: 'broken',
      algorithm: 'sha256',
      source: { kind: 'file', file: unreadableFile },
    });

    expect(messages).toEqual([
      { type: 'error', jobId: 'broken', message: '本地哈希计算失败，请重试。' },
    ]);
  });
});
