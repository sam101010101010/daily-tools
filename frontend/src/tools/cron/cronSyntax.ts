import { Cron } from 'croner';

export type CronFieldName = 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'dayOfWeek';

export type CronBaseNode =
  | Readonly<{ kind: 'wildcard' }>
  | Readonly<{ kind: 'value'; value: number }>
  | Readonly<{ kind: 'range'; start: number; end: number }>;

export type CronMemberNode = CronBaseNode | Readonly<{ kind: 'step'; base: CronBaseNode; step: number }>;

export type CronNode = CronMemberNode | Readonly<{ kind: 'list'; items: readonly CronMemberNode[] }>;

export type FiveFieldCron = Readonly<{
  normalized: string;
  fields: readonly Readonly<{ name: CronFieldName; node: CronNode }>[];
}>;

export type CronSyntaxError = Readonly<{
  field: CronFieldName | 'expression';
  code: 'field-count' | 'unsupported' | 'empty-member' | 'invalid-value' | 'descending-range' | 'invalid-step' | 'semantic';
  message: string;
}>;

export type ParseFiveFieldCronResult =
  | Readonly<{ ok: true; value: FiveFieldCron }>
  | Readonly<{ ok: false; error: CronSyntaxError }>;

type FieldDefinition = Readonly<{
  name: CronFieldName;
  minimum: number;
  maximum: number;
  names?: Readonly<Record<string, number>>;
}>;

const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 } as const;
const WEEKDAYS = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 } as const;
const FIELDS: readonly FieldDefinition[] = [
  { name: 'minute', minimum: 0, maximum: 59 },
  { name: 'hour', minimum: 0, maximum: 23 },
  { name: 'dayOfMonth', minimum: 1, maximum: 31 },
  { name: 'month', minimum: 1, maximum: 12, names: MONTHS },
  { name: 'dayOfWeek', minimum: 0, maximum: 7, names: WEEKDAYS },
];

function failure(field: CronSyntaxError['field'], code: CronSyntaxError['code'], message: string): ParseFiveFieldCronResult {
  return { ok: false, error: { field, code, message } };
}

function normalizeToken(token: string, definition: FieldDefinition): string | undefined {
  const uppercase = token.toUpperCase();
  if (!definition.names) return uppercase;
  return uppercase.replace(/[A-Z]+/g, (name) => String(definition.names?.[name] ?? Number.NaN));
}

function readValue(token: string, definition: FieldDefinition): number | undefined {
  if (!/^\d+$/.test(token)) return undefined;
  const value = Number(token);
  return value >= definition.minimum && value <= definition.maximum ? value : undefined;
}

function parseBase(token: string, definition: FieldDefinition): CronBaseNode | ParseFiveFieldCronResult {
  if (token === '*') return { kind: 'wildcard' };
  const range = /^(\d+)-(\d+)$/.exec(token);
  if (range) {
    const start = readValue(range[1], definition);
    const end = readValue(range[2], definition);
    if (start === undefined || end === undefined) return failure(definition.name, 'invalid-value', '字段值超出允许范围');
    if (start > end) return failure(definition.name, 'descending-range', '范围必须从小到大');
    return { kind: 'range', start, end };
  }
  const value = readValue(token, definition);
  return value === undefined
    ? failure(definition.name, 'invalid-value', '字段值无效')
    : { kind: 'value', value };
}

function isFailure(value: unknown): value is ParseFiveFieldCronResult {
  return typeof value === 'object' && value !== null && 'ok' in value;
}

function parseMember(member: string, definition: FieldDefinition): CronMemberNode | ParseFiveFieldCronResult {
  if (member.length === 0) return failure(definition.name, 'empty-member', '列表中不能有空项');
  if (!/^[\d*/-]+$/.test(member)) return failure(definition.name, 'unsupported', '字段包含不支持的语法');

  const stepParts = member.split('/');
  if (stepParts.length > 2) return failure(definition.name, 'unsupported', '字段包含不支持的语法');
  if (stepParts.length === 2) {
    const [baseToken, stepToken] = stepParts;
    if (!/^\d+$/.test(stepToken)) return failure(definition.name, 'invalid-step', '步长必须是正整数');
    const step = Number(stepToken);
    if (step === 0 || step > definition.maximum - definition.minimum + 1) return failure(definition.name, 'invalid-step', '步长超出允许范围');
    const base = parseBase(baseToken, definition);
    if (isFailure(base)) return base;
    return { kind: 'step', base, step };
  }
  return parseBase(member, definition);
}

function parseField(rawField: string, definition: FieldDefinition): CronNode | ParseFiveFieldCronResult {
  const normalizedField = normalizeToken(rawField, definition);
  if (!normalizedField || normalizedField.includes('NaN')) return failure(definition.name, 'unsupported', '字段包含不支持的名称');
  const members = normalizedField.split(',');
  const nodes: CronMemberNode[] = [];
  for (const member of members) {
    const node = parseMember(member, definition);
    if (isFailure(node)) return node;
    nodes.push(node);
  }
  return nodes.length === 1 ? nodes[0] : { kind: 'list', items: nodes };
}

export function parseFiveFieldCron(input: string): ParseFiveFieldCronResult {
  const normalized = input.trim().replace(/\s+/g, ' ');
  const rawFields = normalized === '' ? [] : normalized.split(' ');
  if (rawFields.length !== 5) return failure('expression', 'field-count', 'Cron 表达式必须恰好包含五个字段');

  const fields: FiveFieldCron['fields'][number][] = [];
  for (let index = 0; index < FIELDS.length; index += 1) {
    const definition = FIELDS[index];
    const node = parseField(rawFields[index], definition);
    if (isFailure(node)) return node;
    fields.push({ name: definition.name, node });
  }

  try {
    new Cron(normalized.toUpperCase(), { paused: true, domAndDow: false, mode: '5-part' });
  } catch {
    return failure('expression', 'semantic', 'Cron 表达式的字段组合无效');
  }

  return { ok: true, value: { normalized: normalized.toUpperCase(), fields } };
}
