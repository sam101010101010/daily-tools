import type { ToolMeta } from '../../registry/types';

export const urlMeta: ToolMeta = {
  id: 'url',
  name: 'URL 编解码器',
  description: '在浏览器本地按 URL 组件规则编码或解码文本',
  category: '编码',
  keywords: ['url', '网址', '链接', 'encode', 'decode', '编码', '解码'],
  icon: '🔗',
  load: () => import('./UrlTool'),
};
