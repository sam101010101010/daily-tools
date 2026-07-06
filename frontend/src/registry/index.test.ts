import { expect, test, beforeEach, afterEach } from 'vitest';
import type { ToolMeta } from './types';
import { searchTools, getTool, tools } from './index';

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
