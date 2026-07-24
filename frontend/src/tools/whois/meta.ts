import type { ToolMeta } from '../../registry/types';

export const whoisMeta: ToolMeta = {
  id: 'whois',
  name: 'WHOIS / RDAP 查询',
  description: '查询域名的公开注册信息、生命周期和域名服务器',
  category: '网络',
  keywords: ['whois', 'rdap', 'domain', '域名', '注册商'],
  icon: '🔎',
  load: () => import('./WhoisTool'),
  backend: '/api/java/whois',
};
