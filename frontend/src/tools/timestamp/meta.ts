import type { ToolMeta } from '../../registry/types';

export const timestampMeta: ToolMeta = {
  id: 'timestamp',
  name: '时间戳转换器',
  description: '在 Unix 秒、毫秒、ISO 8601 与可选时区日期之间本地转换',
  category: '日期时间',
  keywords: ['timestamp', '时间戳', 'unix', 'epoch', '日期', '时区', 'iso 8601'],
  icon: '⏱️',
  load: () => import('./TimestampTool'),
};
