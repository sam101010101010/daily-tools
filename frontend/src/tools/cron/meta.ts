import type { ToolMeta } from '../../registry/types';

export const cronMeta: ToolMeta = {
  id: 'cron',
  name: 'Cron 表达式助手',
  description: '严格校验和解释五字段 Cron，并按 IANA 时区预览未来运行时间',
  category: '开发',
  keywords: ['cron', 'crontab', '定时', '计划任务', '表达式', '时区'],
  icon: '🗓️',
  load: () => import('./CronTool'),
};
