import type { CronBaseNode, CronFieldName, CronMemberNode, CronNode, FiveFieldCron } from './profileSyntax';

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

export function explainCron(cron: FiveFieldCron): string[] {
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
  return lines;
}
