import type { ToolMeta } from '../../registry/types';

export const qrMeta: ToolMeta = {
  id: 'qr',
  name: '二维码工具',
  description: '在浏览器本地生成二维码并识别 PNG、JPEG 或 WebP 图片',
  category: '编码',
  keywords: ['QR', '二维码', '生成', '识别', '扫码', '图片'],
  icon: '▦',
  load: () => import('./QrTool'),
};
