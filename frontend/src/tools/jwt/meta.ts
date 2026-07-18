import type { ToolMeta } from '../../registry/types';

export const jwtMeta: ToolMeta = {
  id: 'jwt',
  name: 'JWT 解码器',
  description: '在浏览器本地查看 JWT Header、Payload 与常见 claims',
  category: '编码',
  keywords: ['jwt', '令牌', 'token', 'jws', '解码'],
  icon: '🪪',
  load: () => import('./JwtTool'),
};
