import type { ToolMeta } from '../../registry/types';

export const diffMeta: ToolMeta = {
  id: 'diff',
  name: '文本差异对比',
  description: '在浏览器本地逐行比较两段文本，查看统一或并排差异',
  category: '文本',
  keywords: ['diff', '文本对比', '差异', '比较', '逐行', '统一差异', '并排'],
  load: () => import('./DiffTool'),
};
