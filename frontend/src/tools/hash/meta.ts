import type { ToolMeta } from '../../registry/types';

export const hashMeta: ToolMeta = {
  id: 'hash',
  name: '哈希 / 文件校验',
  description: '在浏览器本地计算文本或文件的 MD5、SHA 校验和',
  category: '编码',
  keywords: ['hash', 'checksum', 'MD5', 'SHA', '哈希', '校验和', '文件', 'file'],
  icon: '🔐',
  load: () => import('./HashTool'),
};
