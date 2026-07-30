import type { CronBaseNode, CronFieldName, CronMemberNode, CronNode, ParsedCron, ParsedFiveFieldCron } from './profileSyntax';
import type { CronProfileId } from './profiles';

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'] as const;

function padded(value: number): string {
  return String(value).padStart(2, '0');
}

function valueText(field: CronFieldName, value: number): string {
  switch (field) {
    case 'minute': return `${padded(value)} 分`;
    case 'hour': return `${padded(value)} 时`;
    case 'dayOfMonth': return `${value} 日`;
    case 'month': return `${value} 月`;
    case 'dayOfWeek': return WEEKDAYS[value === 7 ? 0 : value];
  }
}

function wildcardText(field: CronFieldName): string {
  switch (field) {
    case 'minute': return '每分钟';
    case 'hour': return '每小时';
    case 'dayOfMonth': return '每天';
    case 'month': return '每月';
    case 'dayOfWeek': return '每天';
  }
}

function stepUnit(field: CronFieldName): string {
  switch (field) {
    case 'minute': return '分钟';
    case 'hour': return '小时';
    case 'dayOfMonth': return '天';
    case 'month': return '个月';
    case 'dayOfWeek': return '天';
  }
}

function baseText(field: CronFieldName, node: CronBaseNode): string {
  if (node.kind === 'wildcard') return wildcardText(field);
  if (node.kind === 'value') return valueText(field, node.value);
  return `${valueText(field, node.start)}${field === 'dayOfWeek' ? '至' : '至 '}${valueText(field, node.end)}`;
}

function memberText(field: CronFieldName, node: CronMemberNode): string {
  if (node.kind !== 'step') return baseText(field, node);
  if (node.base.kind === 'wildcard') return `每 ${node.step} ${stepUnit(field)}`;
  return `${baseText(field, node.base)}起每 ${node.step} ${stepUnit(field)}`;
}

function nodeText(field: CronFieldName, node: CronNode): string {
  return node.kind === 'list'
    ? node.items.map((item) => memberText(field, item)).join('、')
    : memberText(field, node);
}

function matchesBase(node: CronBaseNode, value: number): boolean {
  return node.kind === 'wildcard' || node.kind === 'value'
    ? node.kind === 'wildcard' || node.value === value
    : value >= node.start && value <= node.end;
}

function matchesMember(node: CronMemberNode, value: number, minimum: number): boolean {
  if (node.kind !== 'step') return matchesBase(node, value);
  if (!matchesBase(node.base, value)) return false;
  const start = node.base.kind === 'range' ? node.base.start : node.base.kind === 'value' ? node.base.value : minimum;
  return (value - start) % node.step === 0;
}

function matchesNode(node: CronNode, value: number, minimum: number): boolean {
  return node.kind === 'list'
    ? node.items.some((item) => matchesMember(item, value, minimum))
    : matchesMember(node, value, minimum);
}

function isRestricted(node: CronNode, values: readonly number[], minimum: number): boolean {
  return !values.every((value) => matchesNode(node, value, minimum));
}

export type CronExplanation = Readonly<{
  profile: CronProfileId;
  lines: readonly string[];
}>;

function explainFiveFieldCron(cron: ParsedFiveFieldCron): CronExplanation {
  const lines = cron.fields.map(({ name, node }) => {
    const label: Record<CronFieldName, string> = {
      minute: '分钟', hour: '小时', dayOfMonth: '日期', month: '月份', dayOfWeek: '星期',
    };
    return `${label[name]}：${nodeText(name, node)}`;
  });
  const [, , dayOfMonth, , dayOfWeek] = cron.fields;
  if (isRestricted(dayOfMonth.node, Array.from({ length: 31 }, (_, index) => index + 1), 1) &&
    isRestricted(dayOfWeek.node, [0, 1, 2, 3, 4, 5, 6], 0)) {
    lines.push('日期和星期均受限时，任一条件满足即可执行');
  }
  return { profile: cron.profile, lines };
}

const ADVANCED_FIELD_LABELS: Record<string, string> = {
  second: '秒',
  minute: '分钟',
  hour: '小时',
  dayOfMonth: '日期',
  month: '月份',
  dayOfWeek: '星期',
  year: '年份',
};

const SPRING_WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'] as const;
const SUNDAY_FIRST_WEEKDAYS = ['', '星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'] as const;

function advancedWeekdayText(profile: Exclude<CronProfileId, 'linux-vixie' | 'macos-bsd' | 'kubernetes'>, value: string): string {
  if (!/^\d+$/.test(value)) return value;
  const weekday = profile === 'spring' ? SPRING_WEEKDAYS[Number(value)] : SUNDAY_FIRST_WEEKDAYS[Number(value)];
  return weekday ? `${value}（${weekday}）` : value;
}

export function explainCron(cron: ParsedCron): CronExplanation {
  if ('fields' in cron) return explainFiveFieldCron(cron);
  const fieldOrder = cron.profile === 'eventbridge-scheduler' || cron.profile === 'eventbridge-legacy'
    ? ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek', 'year']
    : cron.fieldValues.length === 7
      ? ['second', 'minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek', 'year']
      : ['second', 'minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek'];
  const lines = cron.fieldValues.map((value, index) => {
    const field = fieldOrder[index];
    const description = field === 'dayOfWeek' ? advancedWeekdayText(cron.profile, value) : value;
    return `${ADVANCED_FIELD_LABELS[field]}：${description}`;
  });
  if (cron.profile === 'spring') {
    const dayOfMonth = cron.fieldValues[3];
    const dayOfWeek = cron.fieldValues[5];
    if (dayOfMonth === '?') lines.push('日期字段 ? 表示未指定；Spring 以日期和星期条件同时约束');
    if (dayOfWeek === '?') lines.push('星期字段 ? 表示未指定；Spring 以日期和星期条件同时约束');
  }
  if (cron.profile === 'eventbridge-scheduler' || cron.profile === 'eventbridge-legacy' || cron.profile === 'quartz') {
    lines.push('日期和星期字段使用 ? 明确未指定项');
  }
  return { profile: cron.profile, lines };
}
