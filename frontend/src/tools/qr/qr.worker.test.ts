import { describe, expect, it } from 'vitest';
import { generateQr } from './qr';
import { runQrDecodeWorkerJob } from './qr.worker';
import type { QrDecodeWorkerMessage, QrDecodeWorkerStartMessage } from './qr.worker';

function renderQrPixels(text: string, scale = 4): QrDecodeWorkerStartMessage {
  const { matrix } = generateQr(text);
  const width = matrix[0].length * scale;
  const height = matrix.length * scale;
  const pixels = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const color = matrix[Math.floor(y / scale)][Math.floor(x / scale)] ? 0 : 255;
      const offset = (y * width + x) * 4;
      pixels[offset] = color;
      pixels[offset + 1] = color;
      pixels[offset + 2] = color;
      pixels[offset + 3] = 255;
    }
  }

  return {
    type: 'decode',
    jobId: 'worker-test',
    width,
    height,
    pixels: pixels.buffer,
  };
}

function collectMessages(request: QrDecodeWorkerStartMessage): QrDecodeWorkerMessage[] {
  const messages: QrDecodeWorkerMessage[] = [];
  runQrDecodeWorkerJob(request, (message) => messages.push(message));
  return messages;
}

describe('QR decode worker', () => {
  it('decodes raw RGBA pixels to the exact untrusted plain-text payload', () => {
    const messages = collectMessages(renderQrPixels('https://example.test/?q=<script>'));

    expect(messages).toEqual([
      {
        type: 'success',
        jobId: 'worker-test',
        text: 'https://example.test/?q=<script>',
      },
    ]);
  });

  it('returns a typed not-found result for valid pixels with no QR code', () => {
    const width = 64;
    const height = 64;
    const pixels = new Uint8ClampedArray(width * height * 4).fill(255);

    const messages = collectMessages({
      type: 'decode',
      jobId: 'no-code',
      width,
      height,
      pixels: pixels.buffer,
    });

    expect(messages).toEqual([
      {
        type: 'not-found',
        jobId: 'no-code',
        message: '未在图片中识别到二维码',
      },
    ]);
  });

  it('treats a valid tiny blank image as not-found rather than a decoder fault', () => {
    const messages = collectMessages({
      type: 'decode',
      jobId: 'tiny-no-code',
      width: 1,
      height: 1,
      pixels: Uint8ClampedArray.of(255, 255, 255, 255).buffer,
    });

    expect(messages).toEqual([
      {
        type: 'not-found',
        jobId: 'tiny-no-code',
        message: '未在图片中识别到二维码',
      },
    ]);
  });

  it('rejects dimensions above 4096 before QR decoding', () => {
    const width = 4097;
    const messages = collectMessages({
      type: 'decode',
      jobId: 'oversized-worker-input',
      width,
      height: 1,
      pixels: new Uint8ClampedArray(width * 4).buffer,
    });

    expect(messages).toEqual([
      {
        type: 'error',
        jobId: 'oversized-worker-input',
        message: '二维码解析失败，请重试。',
      },
    ]);
  });

  it('maps decoder exceptions to a fixed local error without bytes or stack details', () => {
    const request = renderQrPixels('worker exception sanitization');
    const pixels = new Uint8ClampedArray(request.pixels);

    for (let y = Math.floor(request.height / 2); y < request.height; y += 1) {
      for (let x = Math.floor(request.width / 2); x < request.width; x += 1) {
        const offset = (y * request.width + x) * 4;
        pixels[offset] = 255 - pixels[offset];
        pixels[offset + 1] = 255 - pixels[offset + 1];
        pixels[offset + 2] = 255 - pixels[offset + 2];
      }
    }

    const messages = collectMessages({
      ...request,
      jobId: 'malformed-code',
      pixels: pixels.buffer,
    });

    expect(messages).toEqual([
      {
        type: 'error',
        jobId: 'malformed-code',
        message: '二维码解析失败，请重试。',
      },
    ]);
  });
});
