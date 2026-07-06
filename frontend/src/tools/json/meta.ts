import type { ToolMeta } from '../../registry/types';
export const jsonMeta: ToolMeta = {
  id: 'json', name: 'JSON 工具', description: '格式化 / 压缩 / 校验 JSON', category: '格式化',
  keywords: ['json', 'format', 'minify', '格式化'], icon: '🧩',
  load: () => import('./JsonToolView'),
};
