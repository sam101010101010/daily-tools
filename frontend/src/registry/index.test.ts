import { expect, test, beforeEach, afterEach } from 'vitest';
import type { ToolMeta } from './types';
import { searchTools, getTool, tools } from './index';

// Snapshot the real registry at import time — beforeEach swaps `tools` for `sample` below.
const registry = [...tools];

const sample: ToolMeta[] = [
  { id: 'json', name: 'JSON 工具', description: '格式化校验', category: '格式化', keywords: ['json', 'format'], load: async () => ({ default: () => null }) },
  { id: 'ssl', name: 'SSL 检查', description: '证书', category: '网络', keywords: ['tls', 'cert'], load: async () => ({ default: () => null }), backend: '/api/java/ssl' },
];

beforeEach(() => {
  tools.length = 0;
  tools.push(...sample);
});

afterEach(() => {
  tools.length = 0;
});

test('empty query returns all', () => {
  expect(searchTools(sample, '  ')).toHaveLength(2);
});
test('matches by name, keyword, and category (case-insensitive)', () => {
  expect(searchTools(sample, 'JSON').map(t => t.id)).toEqual(['json']);
  expect(searchTools(sample, 'cert').map(t => t.id)).toEqual(['ssl']);
  expect(searchTools(sample, '网络').map(t => t.id)).toEqual(['ssl']);
});
test('getTool resolves by id', () => {
  expect(getTool('ssl')?.name).toBe('SSL 检查');
  expect(getTool('nope')).toBeUndefined();
});

test('crypto tool is a single registry entry with a backend; base64 is merged in', () => {
  const crypto = registry.filter(t => t.id === 'crypto');
  expect(crypto).toHaveLength(1);
  expect(crypto[0].backend).toBe('/api/java/crypto');
  expect(crypto[0].keywords).toContain('base64'); // search still hits "base64"
  expect(registry.some(t => t.id === 'base64')).toBe(false);
  const ids = registry.map(t => t.id);
  expect(new Set(ids).size).toBe(ids.length); // ids unique
});

test('JWT decoder is a single local registry tool searchable by jwt and 令牌', async () => {
  const jwt = registry.filter(t => t.id === 'jwt');
  expect(jwt).toHaveLength(1);
  expect(jwt[0]).toMatchObject({ id: 'jwt', name: 'JWT 解码器' });
  expect(jwt[0].backend).toBeUndefined();
  expect(searchTools(registry, 'jwt').map(t => t.id)).toEqual(['jwt']);
  expect(searchTools(registry, 'JWT').map(t => t.id)).toEqual(['jwt']);
  expect(searchTools(registry, '令牌').map(t => t.id)).toEqual(['jwt']);
  await expect(jwt[0].load()).resolves.toHaveProperty('default');
});
