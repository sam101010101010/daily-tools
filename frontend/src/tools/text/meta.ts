import type { ToolMeta } from '../../registry/types';

export const textMeta: ToolMeta = {
  id: 'text',
  name: '文本处理器',
  description: '在浏览器本地执行大小写、空白和逐行操作，并对比 Unicode / UTF-8 统计',
  category: '文本',
  keywords: ['text', '文本', '大小写', '空白', '排序', '去重', '统计', '行'],
  load: () => import('./TextTool'),
};
