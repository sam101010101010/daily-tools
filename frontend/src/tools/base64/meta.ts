import type { ToolMeta } from '../../registry/types';
export const base64Meta: ToolMeta = {
  id: 'base64', name: 'Base64 编解码', description: '文本 ⇄ Base64（含 URL-safe）', category: '编码',
  keywords: ['base64', 'encode', 'decode', '编码'], icon: '🔤',
  load: () => import('./Base64ToolView'),
};
