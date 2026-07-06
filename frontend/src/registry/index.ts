import type { ToolMeta } from './types';

export const tools: ToolMeta[] = [
  // registered by tools/*/meta.ts — populated in Tasks 6, 7, 11, 12
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
