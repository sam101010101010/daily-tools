import type { ToolMeta } from '../../registry/types';

export const idGeneratorMeta: ToolMeta = {
  id: 'id-generator',
  name: 'UUID / ULID 生成器',
  description: '在浏览器本地批量生成并检查 UUID v4、UUID v7 与 ULID',
  category: '开发',
  keywords: ['UUID', 'GUID', 'ULID', '唯一标识', '随机', '时间有序'],
  icon: '🆔',
  load: () => import('./IdGeneratorTool'),
};
