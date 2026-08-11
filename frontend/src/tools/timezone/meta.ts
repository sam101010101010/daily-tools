import type { ToolMeta } from '../../registry/types';

export const timezoneMeta: ToolMeta = {
  id: 'timezone',
  name: '时区转换器',
  description: '把一个源时区的本地时间同时转换到多个 IANA 时区，并明确处理夏令时歧义',
  category: '日期时间',
  keywords: ['时区', 'timezone', '世界时间', '会议', 'DST', '夏令时', 'IANA', 'UTC'],
  load: () => import('./TimezoneTool'),
};
