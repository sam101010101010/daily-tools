import type { ToolMeta } from '../../registry/types';
export const dnsMeta: ToolMeta = {
  id: 'dns', name: 'DNS 查询', description: '查 A/AAAA/MX/TXT/CNAME 记录', category: '网络',
  keywords: ['dns', 'domain', 'record', '解析'], icon: '🌐',
  load: () => import('./DnsTool'), backend: '/api/java/dns',
};
