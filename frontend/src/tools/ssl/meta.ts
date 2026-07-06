import type { ToolMeta } from '../../registry/types';
export const sslMeta: ToolMeta = {
  id: 'ssl', name: 'SSL 证书检查', description: '查远程主机 443 证书链、有效期、SAN', category: '网络',
  keywords: ['ssl', 'tls', 'cert', '证书'], icon: '🔒',
  load: () => import('./SslTool'), backend: '/api/java/ssl',
};
