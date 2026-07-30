import type { ToolMeta } from '../../registry/types';

export const cronMeta: ToolMeta = {
  id: 'cron',
  name: 'Cron 表达式助手',
  description: '先选择目标平台，再校验、解释并按平台时区预览 Cron 表达式',
  category: '开发',
  keywords: ['cron', 'crontab', '定时', '计划任务', '表达式', '时区', 'spring', 'quartz', 'kubernetes', 'eventbridge'],
  icon: '🗓️',
  load: () => import('./CronTool'),
};
