import type { ToolMeta } from './types';
import { jsonMeta } from '../tools/json/meta';
import { cryptoMeta } from '../tools/crypto/meta';
import { sslMeta } from '../tools/ssl/meta';
import { dnsMeta } from '../tools/dns/meta';
import { jwtMeta } from '../tools/jwt/meta';
import { timestampMeta } from '../tools/timestamp/meta';
import { urlMeta } from '../tools/url/meta';
import { hashMeta } from '../tools/hash/meta';

export const tools: ToolMeta[] = [
  jsonMeta,
  cryptoMeta,
  sslMeta,
  dnsMeta,
  jwtMeta,
  timestampMeta,
  urlMeta,
  hashMeta,
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
