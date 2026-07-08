import type { ToolMeta } from '../../registry/types';
export const jsonMeta: ToolMeta = {
  id: 'json', name: 'JSON 工具', description: '格式化 / 树·表格视图 / JSONPath 查询 / diff 对比 / 排序去重', category: '格式化',
  keywords: ['json', 'format', 'minify', '格式化', 'tree', '树', 'jsonpath', '查询', 'diff', '对比', 'sort', 'dedupe', '排序', '去重'], icon: '🧩',
  load: () => import('./JsonToolView'),
};
