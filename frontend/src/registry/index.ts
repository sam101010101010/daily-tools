import type { ToolMeta } from './types';
import { jsonMeta } from '../tools/json/meta';
import { base64Meta } from '../tools/base64/meta';

export const tools: ToolMeta[] = [
  jsonMeta,
  base64Meta,
  // remaining tools registered by tools/*/meta.ts — populated in Tasks 11, 12
];

export function getTool(id: string): ToolMeta | undefined {
  return tools.find(t => t.id === id);
}

export function searchTools(list: ToolMeta[], query: string): ToolMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(t =>
    t.name.toLowerCase().includes(q) ||
    t.description.toLowerCase().includes(q) ||
    t.category.toLowerCase().includes(q) ||
    t.keywords.some(k => k.toLowerCase().includes(q)),
  );
}
