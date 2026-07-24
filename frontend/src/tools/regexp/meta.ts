import type { ToolMeta } from '../../registry/types';

export const regexpMeta: ToolMeta = {
  id: 'regexp',
  name: '正则表达式测试器',
  description: '在浏览器本地测试 JavaScript 正则表达式、捕获组与替换结果',
  category: '文本',
  keywords: ['regexp', 'regex', 'regular expression', '正则', '匹配', '替换'],
  icon: '🔎',
  load: () => import('./RegexpTool'),
};
