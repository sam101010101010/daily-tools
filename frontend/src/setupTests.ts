import '@testing-library/jest-dom';
import { Buffer } from 'node:buffer';
import { webcrypto } from 'node:crypto';

function toNodeCryptoValue(value: unknown): unknown {
  if (value instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(value));
  }

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
    );
  }

  if (Array.isArray(value)) {
    return value.map(toNodeCryptoValue);
  }

  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, toNodeCryptoValue(entry)]),
    );
  }

  return value;
}

const subtle = new Proxy(webcrypto.subtle, {
  get(target, property) {
    const member = Reflect.get(target, property, target);
    if (typeof member !== 'function') return member;

    return (...args: unknown[]) => Reflect.apply(
      member,
      target,
      args.map(toNodeCryptoValue),
    );
  },
});

const testCrypto = {
  subtle,
  randomUUID: webcrypto.randomUUID.bind(webcrypto),
  getRandomValues<T extends ArrayBufferView>(array: T): T {
    const bytes = Buffer.alloc(array.byteLength);
    webcrypto.getRandomValues(bytes);
    new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(bytes);
    return array;
  },
} as Crypto;

// Node 20 validates BufferSource values against its host realm. Vitest's jsdom
// realm creates different ArrayBuffer instances, so normalize test-only crypto
// inputs before PKI.js is imported. Production keeps the browser implementation.
Object.defineProperty(window, 'crypto', {
  configurable: true,
  value: testCrypto,
});
