import { Cron } from 'croner';
import type { CronProfileFieldName, CronProfileId } from './profiles';

export type CronFieldName = 'minute' | 'hour' | 'dayOfMonth' | 'month' | 'dayOfWeek';
export type FiveFieldProfileId = 'linux-vixie' | 'macos-bsd' | 'kubernetes';

export type CronBaseNode =
  | Readonly<{ kind: 'wildcard' }>
  | Readonly<{ kind: 'value'; value: number }>
  | Readonly<{ kind: 'range'; start: number; end: number }>;

export type CronMemberNode = CronBaseNode | Readonly<{ kind: 'step'; base: CronBaseNode; step: number }>;

export type CronNode = CronMemberNode | Readonly<{ kind: 'list'; items: readonly CronMemberNode[] }>;

export type CronField<Name extends CronProfileFieldName> = Readonly<{ name: Name; node: CronNode }>;

export type FiveFieldCronFields = readonly [
  CronField<'minute'>,
  CronField<'hour'>,
  CronField<'dayOfMonth'>,
  CronField<'month'>,
  CronField<'dayOfWeek'>,
];

export type ParsedFiveFieldCron<Profile extends FiveFieldProfileId = FiveFieldProfileId> = Readonly<{
  profile: Profile;
  normalized: string;
  fields: FiveFieldCronFields;
}>;

export type FiveFieldCron = ParsedFiveFieldCron;

export type ParsedCron =
  | ParsedFiveFieldCron<'linux-vixie'>
  | ParsedFiveFieldCron<'macos-bsd'>
  | ParsedFiveFieldCron<'kubernetes'>;

export type CronSyntaxErrorCode =
  | 'field-count'
  | 'unsupported'
  | 'empty-member'
  | 'invalid-value'
  | 'descending-range'
  | 'invalid-step'
  | 'semantic'
  | 'profile-not-implemented';

export type ProfileSyntaxError = Readonly<{
  profile: CronProfileId;
  field: CronProfileFieldName | 'expression';
  code: CronSyntaxErrorCode;
  message: string;
}>;

export type CronSyntaxError = Readonly<{
  profile: 'linux-vixie';
  field: CronFieldName | 'expression';
  code: CronSyntaxErrorCode;
  message: string;
}>;

export type ParseCronResult =
  | Readonly<{ ok: true; value: ParsedCron }>
  | Readonly<{ ok: false; error: ProfileSyntaxError }>;

type ParseFiveFieldProfileResult<Profile extends FiveFieldProfileId> =
  | Readonly<{ ok: true; value: ParsedFiveFieldCron<Profile> }>
  | Readonly<{
    ok: false;
    error: Readonly<{
      profile: Profile;
      field: CronFieldName | 'expression';
      code: CronSyntaxErrorCode;
      message: string;
    }>;
  }>;

export type ParseFiveFieldCronResult = ParseFiveFieldProfileResult<'linux-vixie'>;

type FieldDefinition = Readonly<{
  name: CronFieldName;
  minimum: number;
  maximum: number;
  names?: Readonly<Record<string, number>>;
}>;

const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 } as const;
const WEEKDAYS = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 } as const;
const LINUX_FIELDS: readonly FieldDefinition[] = [
  { name: 'minute', minimum: 0, maximum: 59 },
  { name: 'hour', minimum: 0, maximum: 23 },
  { name: 'dayOfMonth', minimum: 1, maximum: 31 },
  { name: 'month', minimum: 1, maximum: 12, names: MONTHS },
  { name: 'dayOfWeek', minimum: 0, maximum: 7, names: WEEKDAYS },
];

const MACOS_FIELDS: readonly FieldDefinition[] = [
  { name: 'minute', minimum: 0, maximum: 59 },
  { name: 'hour', minimum: 0, maximum: 23 },
  { name: 'dayOfMonth', minimum: 1, maximum: 31 },
  { name: 'month', minimum: 1, maximum: 12 },
  { name: 'dayOfWeek', minimum: 0, maximum: 7 },
];

const KUBERNETES_FIELDS: readonly FieldDefinition[] = [
  { name: 'minute', minimum: 0, maximum: 59 },
  { name: 'hour', minimum: 0, maximum: 23 },
  { name: 'dayOfMonth', minimum: 1, maximum: 31 },
  { name: 'month', minimum: 1, maximum: 12, names: MONTHS },
  { name: 'dayOfWeek', minimum: 0, maximum: 6, names: WEEKDAYS },
];

const KUBERNETES_MACROS: Readonly<Record<string, string>> = {
  '@YEARLY': '0 0 1 1 *',
  '@ANNUALLY': '0 0 1 1 *',
  '@MONTHLY': '0 0 1 * *',
  '@WEEKLY': '0 0 * * 0',
  '@DAILY': '0 0 * * *',
  '@MIDNIGHT': '0 0 * * *',
  '@HOURLY': '0 * * * *',
};

function definitionsFor(profile: FiveFieldProfileId): readonly FieldDefinition[] {
  if (profile === 'macos-bsd') return MACOS_FIELDS;
  if (profile === 'kubernetes') return KUBERNETES_FIELDS;
  return LINUX_FIELDS;
}

function failure<Profile extends CronProfileId>(
  profile: Profile,
  field: CronProfileFieldName | 'expression',
  code: CronSyntaxErrorCode,
  message: string,
): ParseCronResult {
  return { ok: false, error: { profile, field, code, message } };
}

function fiveFieldFailure<Profile extends FiveFieldProfileId>(
  profile: Profile,
  field: CronFieldName | 'expression',
  code: CronSyntaxErrorCode,
  message: string,
): ParseFiveFieldProfileResult<Profile> {
  return { ok: false, error: { profile, field, code, message } };
}

function readValue(token: string, definition: FieldDefinition): number | undefined {
  if (definition.names && Object.hasOwn(definition.names, token.toUpperCase())) return definition.names[token.toUpperCase()];
  if (!/^\d+$/.test(token)) return undefined;
  const value = Number(token);
  return value >= definition.minimum && value <= definition.maximum ? value : undefined;
}

function parseBase<Profile extends FiveFieldProfileId>(
  profile: Profile,
  token: string,
  definition: FieldDefinition,
): CronBaseNode | ParseFiveFieldProfileResult<Profile> {
  if (token === '*') return { kind: 'wildcard' };
  const range = /^([A-Za-z\d]+)-([A-Za-z\d]+)$/.exec(token);
  if (range) {
    const start = readValue(range[1], definition);
    const end = readValue(range[2], definition);
    if (start === undefined || end === undefined) return fiveFieldFailure(profile, definition.name, 'invalid-value', '字段值超出允许范围');
    if (start > end) return fiveFieldFailure(profile, definition.name, 'descending-range', '范围必须从小到大');
    return { kind: 'range', start, end };
  }
  const value = readValue(token, definition);
  return value === undefined
    ? fiveFieldFailure(profile, definition.name, 'invalid-value', '字段值无效')
    : { kind: 'value', value };
}

function isFailure<Profile extends FiveFieldProfileId>(value: unknown): value is ParseFiveFieldProfileResult<Profile> {
  return typeof value === 'object' && value !== null && 'ok' in value;
}

function parseMember<Profile extends FiveFieldProfileId>(
  profile: Profile,
  member: string,
  definition: FieldDefinition,
): CronMemberNode | ParseFiveFieldProfileResult<Profile> {
  if (member.length === 0) return fiveFieldFailure(profile, definition.name, 'empty-member', '列表中不能有空项');
  if (!/^[A-Za-z\d*/-]+$/.test(member)) return fiveFieldFailure(profile, definition.name, 'unsupported', '字段包含不支持的语法');

  const stepParts = member.split('/');
  if (stepParts.length > 2) return fiveFieldFailure(profile, definition.name, 'unsupported', '字段包含不支持的语法');
  if (stepParts.length === 2) {
    const [baseToken, stepToken] = stepParts;
    if (!/^\d+$/.test(stepToken)) return fiveFieldFailure(profile, definition.name, 'invalid-step', '步长必须是正整数');
    const step = Number(stepToken);
    if (step === 0 || step > definition.maximum - definition.minimum + 1) {
      return fiveFieldFailure(profile, definition.name, 'invalid-step', '步长超出允许范围');
    }
    const base = parseBase(profile, baseToken, definition);
    if (isFailure<Profile>(base)) return base;
    return { kind: 'step', base, step };
  }
  return parseBase(profile, member, definition);
}

function parseField<Profile extends FiveFieldProfileId>(
  profile: Profile,
  rawField: string,
  definition: FieldDefinition,
): CronNode | ParseFiveFieldProfileResult<Profile> {
  const members = rawField.split(',');
  const nodes: CronMemberNode[] = [];
  for (const member of members) {
    const node = parseMember(profile, member, definition);
    if (isFailure<Profile>(node)) return node;
    nodes.push(node);
  }
  return nodes.length === 1 ? nodes[0] : { kind: 'list', items: nodes };
}

function parseFiveFieldProfile<Profile extends FiveFieldProfileId>(
  profile: Profile,
  input: string,
): ParseFiveFieldProfileResult<Profile> {
  let normalized = input.trim().replace(/\s+/g, ' ');
  if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(normalized)) {
    return fiveFieldFailure(profile, 'expression', 'unsupported', 'Cron 表达式不支持环境变量前缀');
  }
  if (normalized.startsWith('@')) {
    const macro = profile === 'kubernetes' ? KUBERNETES_MACROS[normalized.toUpperCase()] : undefined;
    if (!macro) return fiveFieldFailure(profile, 'expression', 'unsupported', '该 Cron 方言不支持此宏');
    normalized = macro;
  }
  const rawFields = normalized === '' ? [] : normalized.split(' ');
  if (rawFields.length !== 5) {
    return fiveFieldFailure(profile, 'expression', 'field-count', 'Cron 表达式必须恰好包含五个字段');
  }

  if (profile === 'kubernetes') {
    for (const index of [2, 4]) {
      if (rawFields[index] === '?') rawFields[index] = '*';
    }
  }

  const fields: CronNode[] = [];
  const definitions = definitionsFor(profile);
  for (let index = 0; index < definitions.length; index += 1) {
    const definition = definitions[index];
    const node = parseField(profile, rawFields[index], definition);
    if (isFailure<Profile>(node)) return node;
    fields.push(node);
  }

  const upperCaseExpression = rawFields.join(' ').toUpperCase();
  try {
    new Cron(upperCaseExpression, { paused: true, domAndDow: false, mode: '5-part' });
  } catch {
    return fiveFieldFailure(profile, 'expression', 'semantic', 'Cron 表达式的字段组合无效');
  }

  return {
    ok: true,
    value: {
      profile,
      normalized: upperCaseExpression,
      fields: [
        { name: 'minute', node: fields[0] },
        { name: 'hour', node: fields[1] },
        { name: 'dayOfMonth', node: fields[2] },
        { name: 'month', node: fields[3] },
        { name: 'dayOfWeek', node: fields[4] },
      ],
    },
  };
}

export function parseCron(
  profile: CronProfileId,
  input: string,
): ParseCronResult {
  if (profile === 'linux-vixie' || profile === 'macos-bsd' || profile === 'kubernetes') {
    return parseFiveFieldProfile(profile, input);
  }
  return failure(profile, 'expression', 'profile-not-implemented', '该 Cron 方言尚未实现');
}

export function parseFiveFieldCron(input: string): ParseFiveFieldCronResult {
  return parseFiveFieldProfile('linux-vixie', input);
}
