import type { ToolMeta } from '../../registry/types';

export const ipCidrMeta: ToolMeta = {
  id: 'ip-cidr',
  name: 'IP / CIDR 计算器',
  description: '在浏览器本地计算 IPv4/IPv6 子网边界、掩码与成员关系',
  category: '网络',
  keywords: [
    'IP',
    'subnet',
    'CIDR',
    '子网',
    '掩码',
    'IPv4',
    'IPv6',
    'network',
  ],
  icon: '🌐',
  load: () => import('./IpCidrTool'),
};
