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

test('timestamp converter is a single local registry tool searchable by time terms', async () => {
  const timestamp = registry.filter(t => t.id === 'timestamp');
  expect(timestamp).toHaveLength(1);
  expect(timestamp[0]).toMatchObject({ id: 'timestamp', name: '时间戳转换器' });
  expect(timestamp[0].backend).toBeUndefined();
  expect(searchTools(registry, '时间戳').map(t => t.id)).toEqual(['timestamp']);
  expect(searchTools(registry, 'timestamp').map(t => t.id)).toEqual(['timestamp']);
  expect(searchTools(registry, 'Unix').map(t => t.id)).toEqual(['timestamp']);
  await expect(timestamp[0].load()).resolves.toHaveProperty('default');
});

test('URL codec is a single local registry tool searchable by URL terms', async () => {
  const url = registry.filter(t => t.id === 'url');
  expect(url).toHaveLength(1);
  expect(url[0]).toMatchObject({ id: 'url', name: 'URL 编解码器' });
  expect(url[0].backend).toBeUndefined();
  expect(searchTools(registry, 'URL').map(t => t.id)).toEqual(['url']);
  expect(searchTools(registry, '网址').map(t => t.id)).toEqual(['url']);
  expect(searchTools(registry, 'encode').map(t => t.id)).toEqual(['url']);
  await expect(url[0].load()).resolves.toHaveProperty('default');
});

test('hash checksum tool is a single local registry entry searchable by Chinese and English terms', async () => {
  const hash = registry.filter(t => t.id === 'hash');
  expect(hash).toHaveLength(1);
  expect(hash[0]).toMatchObject({
    id: 'hash',
    name: '哈希 / 文件校验',
    category: '编码',
    keywords: expect.arrayContaining(['hash', 'checksum', 'MD5', 'SHA', '校验和', '文件']),
  });
  expect(hash[0].backend).toBeUndefined();
  expect(searchTools(registry, 'hash').map(t => t.id)).toContain('hash');
  expect(searchTools(registry, 'checksum').map(t => t.id)).toContain('hash');
  expect(searchTools(registry, '校验和').map(t => t.id)).toContain('hash');
  expect(searchTools(registry, '文件').map(t => t.id)).toContain('hash');
  await expect(hash[0].load()).resolves.toHaveProperty('default');
});

test('regexp tester is a unique local registry entry searchable by Chinese and English terms', async () => {
  const regexp = registry.filter(t => t.id === 'regexp');
  expect(regexp).toHaveLength(1);
  expect(new Set(registry.map(t => t.id)).size).toBe(registry.length);
  expect(regexp[0]).toMatchObject({
    id: 'regexp',
    name: '正则表达式测试器',
    category: '文本',
    keywords: expect.arrayContaining([
      'regexp',
      'regex',
      'regular expression',
      '正则',
      '匹配',
      '替换',
    ]),
  });
  expect(regexp[0].backend).toBeUndefined();
  expect(searchTools(registry, 'regexp').map(t => t.id)).toContain('regexp');
  expect(searchTools(registry, 'regex').map(t => t.id)).toContain('regexp');
  expect(searchTools(registry, 'regular expression').map(t => t.id)).toContain('regexp');
  expect(searchTools(registry, '正则').map(t => t.id)).toContain('regexp');
  expect(searchTools(registry, '匹配').map(t => t.id)).toContain('regexp');
  expect(searchTools(registry, '替换').map(t => t.id)).toContain('regexp');
  await expect(regexp[0].load()).resolves.toHaveProperty('default');
});
