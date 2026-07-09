import type { ToolMeta } from '../../registry/types';
export const cryptoMeta: ToolMeta = {
  id: 'crypto',
  name: 'Base64 / AES 加解密',
  description: 'base64/hex 编解码 + AES 对称加解密（ECB/CBC/GCM）',
  category: '编码',
  keywords: ['base64', 'hex', 'aes', '加密', '解密', '编码', 'encrypt', 'decrypt'],
  icon: '🔐',
  load: () => import('./CryptoToolView'),
  backend: '/api/java/crypto',
};
