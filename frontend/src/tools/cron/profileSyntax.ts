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
  | ParsedFiveFieldCron<'kubernetes'>
  | ParsedAdvancedCron<'spring'>
  | ParsedAdvancedCron<'quartz'>
  | ParsedAdvancedCron<'eventbridge-scheduler'>
  | ParsedAdvancedCron<'eventbridge-legacy'>;

export type AdvancedProfileId = 'spring' | 'quartz' | 'eventbridge-scheduler' | 'eventbridge-legacy';

export type ParsedAdvancedCron<Profile extends AdvancedProfileId = AdvancedProfileId> = Readonly<{
  profile: Profile;
  /** The profile-native fields, without EventBridge's required cron(...) wrapper. */
  normalized: string;
  fieldValues: readonly string[];
}>;

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
const SUNDAY_FIRST_WEEKDAYS = { SUN: 1, MON: 2, TUE: 3, WED: 4, THU: 5, FRI: 6, SAT: 7 } as const;
const LINUX_FIELDS: readonly FieldDefinition[] = [
  { name: 'minute', minimum: 0, maximum: 59 },
  { name: 'hour', minimum: 0, maximum: 23 },
  { name: 'dayOfMonth', minimum: 1, maximum: 31 },
  { name: 'month', minimum: 1, maximum: 12, names: MONTHS },
  { name: 'dayOfWeek', minimum: 0, maximum: 7, names: WEEKDAYS },
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

const SPRING_MACROS: Readonly<Record<string, string>> = {
  '@YEARLY': '0 0 0 1 1 *',
  '@ANNUALLY': '0 0 0 1 1 *',
  '@MONTHLY': '0 0 0 1 * *',
  '@WEEKLY': '0 0 0 * * 0',
  '@DAILY': '0 0 0 * * *',
  '@MIDNIGHT': '0 0 0 * * *',
  '@HOURLY': '0 0 * * * *',
};

function definitionsFor(profile: FiveFieldProfileId): readonly FieldDefinition[] {
  if (profile === 'kubernetes') return KUBERNETES_FIELDS;
  return LINUX_FIELDS;
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
  return parseAdvancedProfile(profile, input);
}

export function parseFiveFieldCron(input: string): ParseFiveFieldCronResult {
  return parseFiveFieldProfile('linux-vixie', input);
}

function advancedFailure<Profile extends AdvancedProfileId>(
  profile: Profile,
  field: CronProfileFieldName | 'expression',
  code: CronSyntaxErrorCode,
  message: string,
): Readonly<{ ok: false; error: ProfileSyntaxError }> {
  return { ok: false, error: { profile, field, code, message } };
}

function unwrapEventBridge(input: string): string | undefined {
  const match = /^cron\((.*)\)$/is.exec(input.trim());
  return match?.[1]?.trim();
}

function valuesFromToken(token: string, names: Readonly<Record<string, number>> | undefined): number[] | undefined {
  const valueOf = (value: string): number | undefined => {
    const byName = names?.[value.toUpperCase()];
    if (byName !== undefined) return byName;
    return /^\d+$/.test(value) ? Number(value) : undefined;
  };
  const bare = token.split('/')[0];
  const pieces = bare === '*' ? [] : bare.split('-');
  if (pieces.length > 2) return undefined;
  const values = pieces.map(valueOf);
  if (values.some((value) => value === undefined)) return undefined;
  if (token.includes('/')) {
    const step = token.split('/')[1];
    if (!/^\d+$/.test(step) || Number(step) === 0) return undefined;
  }
  return values as number[];
}

function validStandardField(
  token: string,
  minimum: number,
  maximum: number,
  names?: Readonly<Record<string, number>>,
): boolean {
  return token.split(',').every((member) => {
    const values = valuesFromToken(member, names);
    return values !== undefined && values.every((value) => value >= minimum && value <= maximum)
      && (values.length !== 2 || values[0] <= values[1]);
  });
}

function validDayOfMonth(token: string, supportsLastDayOffset: boolean): boolean {
  return token === '?' || token === 'L' || token === 'LW'
    || (supportsLastDayOffset && /^L-(?:[1-9]|[12]\d|30)$/.test(token))
    || /^([1-9]|[12]\d|3[01])W$/.test(token)
    || validStandardField(token, 1, 31);
}

function validDayOfWeek(token: string, minimum: number, names: Readonly<Record<string, number>>): boolean {
  if (token === '?' || token === 'L') return true;
  const special = /^([A-Z]+|\d+)(?:L|#[1-5])$/i.exec(token);
  if (special) return validStandardField(special[1], minimum, 7, names);
  return validStandardField(token, minimum, 7, names);
}

function validYear(token: string, minimum: number, maximum: number): boolean {
  return validStandardField(token, minimum, maximum);
}

function validateAdvancedFields<Profile extends AdvancedProfileId>(
  profile: Profile,
  fields: readonly string[],
): Readonly<{ ok: true }> | Readonly<{ ok: false; error: ProfileSyntaxError }> {
  const isEventBridge = profile === 'eventbridge-scheduler' || profile === 'eventbridge-legacy';
  const isQuartzStyle = profile === 'quartz' || isEventBridge;
  const expected = isEventBridge ? 6 : profile === 'spring' ? 6 : undefined;
  const acceptsCount = expected === undefined ? fields.length === 6 || fields.length === 7 : fields.length === expected;
  if (!acceptsCount) {
    return advancedFailure(profile, 'expression', 'field-count', isQuartzStyle && !isEventBridge
      ? 'Cron 表达式必须包含六或七个字段'
      : `Cron 表达式必须恰好包含${expected}个字段`);
  }
  const offset = isEventBridge ? -1 : 0;
  const names = isQuartzStyle ? SUNDAY_FIRST_WEEKDAYS : WEEKDAYS;
  const fieldNames: readonly CronProfileFieldName[] = isEventBridge
    ? ['minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek', 'year']
    : ['second', 'minute', 'hour', 'dayOfMonth', 'month', 'dayOfWeek', 'year'];
  const definitions: readonly [number, number, Readonly<Record<string, number>>?][] = [
    [0, 59], [0, 59], [0, 23], [1, 31], [1, 12, MONTHS], [isQuartzStyle ? 1 : 0, 7, names], [1, 9999],
  ];
  for (let index = 0; index < fields.length; index += 1) {
    const sourceIndex = index - offset;
    const name = fieldNames[index];
    const [minimum, maximum, fieldNamesMap] = definitions[sourceIndex];
    const token = fields[index];
    if (isEventBridge && name === 'dayOfWeek' && (token.match(/#/g)?.length ?? 0) > 1) {
      return advancedFailure(profile, name, 'semantic', 'EventBridge 星期字段只允许一个 # 项');
    }
    const valid = name === 'dayOfMonth'
      ? validDayOfMonth(token, !isEventBridge)
      : name === 'dayOfWeek'
        ? validDayOfWeek(token, minimum, fieldNamesMap ?? {})
        : name === 'year' && isEventBridge
          ? validYear(token, 1970, 2199)
          : validStandardField(token, minimum, maximum, fieldNamesMap);
    if (!valid) return advancedFailure(profile, name, 'invalid-value', '字段值无效');
  }
  const dom = fields[isEventBridge ? 2 : 3];
  const dow = fields[isEventBridge ? 4 : 5];
  if (isQuartzStyle && ((dom === '?') === (dow === '?'))) {
    return advancedFailure(profile, 'expression', 'semantic', '日期和星期字段必须且只能有一个使用 ?');
  }
  return { ok: true };
}

function cronOptionsFor(profile: AdvancedProfileId): Readonly<{
  mode: '6-part' | '6-or-7-parts' | '7-part';
  alternativeWeekdays: boolean;
  domAndDow: boolean;
}> {
  if (profile === 'spring') return { mode: '6-part', alternativeWeekdays: false, domAndDow: true };
  if (profile === 'quartz') return { mode: '6-or-7-parts', alternativeWeekdays: true, domAndDow: true };
  return { mode: '7-part', alternativeWeekdays: true, domAndDow: true };
}

export function cronerPatternFor(cron: ParsedCron): string {
  return cron.profile === 'eventbridge-scheduler' || cron.profile === 'eventbridge-legacy'
    ? `0 ${cron.normalized}`
    : cron.normalized;
}

export function hasLastDayOffset(cron: ParsedCron): boolean {
  if ('fields' in cron) return false;
  const dayOfMonth = cron.fieldValues[cron.profile === 'eventbridge-scheduler' || cron.profile === 'eventbridge-legacy' ? 2 : 3];
  return /^L-\d+$/.test(dayOfMonth);
}

export function hasBareLastDayOfWeek(cron: ParsedCron): boolean {
  if ('fields' in cron) return false;
  const dayOfWeek = cron.fieldValues[cron.profile === 'eventbridge-scheduler' || cron.profile === 'eventbridge-legacy' ? 4 : 5];
  return dayOfWeek === 'L';
}

export function cronerOptionsFor(cron: ParsedCron): Readonly<{
  mode: '5-part' | '6-part' | '6-or-7-parts' | '7-part';
  alternativeWeekdays?: boolean;
  domAndDow: boolean;
}> {
  if (cron.profile === 'linux-vixie' || cron.profile === 'macos-bsd' || cron.profile === 'kubernetes') {
    return { mode: '5-part', domAndDow: false };
  }
  return cronOptionsFor(cron.profile);
}

function parseAdvancedProfile<Profile extends AdvancedProfileId>(profile: Profile, input: string): ParseCronResult {
  let normalized = input.trim().replace(/\s+/g, ' ');
  const isEventBridge = profile === 'eventbridge-scheduler' || profile === 'eventbridge-legacy';
  if (isEventBridge) {
    const inner = unwrapEventBridge(input);
    if (inner === undefined) return advancedFailure(profile, 'expression', 'unsupported', '此 Cron 方言必须使用 cron(...) 外壳');
    normalized = inner.replace(/\s+/g, ' ');
  } else if (/^cron\(/i.test(normalized)) {
    return advancedFailure(profile, 'expression', 'unsupported', '此 Cron 方言不使用 cron(...) 外壳');
  }
  if (profile === 'spring' && normalized.startsWith('@')) {
    const macro = SPRING_MACROS[normalized.toUpperCase()];
    if (!macro) return advancedFailure(profile, 'expression', 'unsupported', '该 Cron 方言不支持此宏');
    normalized = macro;
  }
  const fields = normalized === '' ? [] : normalized.toUpperCase().split(' ');
  const validation = validateAdvancedFields(profile, fields);
  if (!validation.ok) return validation;
  try {
    const evaluatorFields = [...fields];
    const dayOfWeekIndex = isEventBridge ? 4 : 5;
    if (evaluatorFields[dayOfWeekIndex] === 'L') evaluatorFields[dayOfWeekIndex] = '1L';
    const evaluatorNormalized = evaluatorFields.join(' ').replace(/\bL-(?:[1-9]|[12]\d|30)\b/, 'L');
    const evaluatorPattern = isEventBridge ? `0 ${evaluatorNormalized}` : evaluatorNormalized;
    new Cron(evaluatorPattern, {
      paused: true,
      ...cronOptionsFor(profile),
    });
  } catch {
    return advancedFailure(profile, 'expression', 'semantic', 'Cron 表达式的字段组合无效');
  }
  return { ok: true, value: { profile, normalized, fieldValues: fields } };
}
