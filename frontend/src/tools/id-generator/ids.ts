import { validate as validateUuid, v4, v7, version as uuidVersion } from 'uuid';
import { decodeTime, isValid as isValidUlid, monotonicFactory } from 'ulid';

export const IdKind = Object.freeze({
  UUID_V4: 'uuid-v4',
  UUID_V7: 'uuid-v7',
  ULID: 'ulid',
} as const);

export type IdKind = (typeof IdKind)[keyof typeof IdKind];

export type GenerateRequest = Readonly<{
  kind: IdKind;
  count?: number;
}>;

export type GeneratedIds = readonly string[];

export const IdInspectionErrorCode = Object.freeze({
  INVALID_ID: 'INVALID_ID',
  TIME_OVERFLOW: 'TIME_OVERFLOW',
} as const);

export type IdInspectionErrorCode = (typeof IdInspectionErrorCode)[keyof typeof IdInspectionErrorCode];

type UuidInspection = Readonly<{
  kind: typeof IdKind.UUID_V4 | typeof IdKind.UUID_V7;
  canonical: string;
  version: 4 | 7;
  variant: 'RFC_4122';
  timestamp?: number;
}>;

type UlidInspection = Readonly<{
  kind: typeof IdKind.ULID;
  canonical: string;
  timestamp: number;
}>;

type InvalidIdInspection = Readonly<{
  kind: 'invalid';
  errorCode: IdInspectionErrorCode;
}>;

export type IdInspection = UuidInspection | UlidInspection | InvalidIdInspection;

const generateMonotonicUlid = monotonicFactory();

function resolveCount(count: number | undefined): number {
  if (count === undefined) return 1;
  if (!Number.isInteger(count) || count < 1 || count > 100) {
    throw new RangeError('count must be an integer between 1 and 100');
  }
  return count;
}

function generateId(kind: IdKind): string {
  switch (kind) {
    case IdKind.UUID_V4:
      return v4();
    case IdKind.UUID_V7:
      return v7();
    case IdKind.ULID:
      return generateMonotonicUlid();
  }
}

export function generateIds({ kind, count }: GenerateRequest): GeneratedIds {
  const resolvedCount = resolveCount(count);
  const ids = Array.from({ length: resolvedCount }, () => generateId(kind));
  return Object.freeze(ids);
}

export function decodeUuidV7Timestamp(uuid: string): number {
  return Number.parseInt(uuid.replaceAll('-', '').slice(0, 12), 16);
}

function invalidInspection(errorCode: IdInspectionErrorCode): InvalidIdInspection {
  return { kind: 'invalid', errorCode };
}

function inspectUuid(input: string): IdInspection | undefined {
  if (!validateUuid(input)) return undefined;

  const version = uuidVersion(input);
  const canonical = input.toLowerCase();

  if (version === 4) {
    return {
      kind: IdKind.UUID_V4,
      canonical,
      version,
      variant: 'RFC_4122',
    };
  }

  if (version === 7) {
    return {
      kind: IdKind.UUID_V7,
      canonical,
      version,
      variant: 'RFC_4122',
      timestamp: decodeUuidV7Timestamp(canonical),
    };
  }

  return invalidInspection(IdInspectionErrorCode.INVALID_ID);
}

export function inspectId(input: string): IdInspection {
  const uuidInspection = inspectUuid(input);
  if (uuidInspection !== undefined) return uuidInspection;

  if (!isValidUlid(input)) {
    return invalidInspection(IdInspectionErrorCode.INVALID_ID);
  }

  const canonical = input.toUpperCase();
  try {
    return {
      kind: IdKind.ULID,
      canonical,
      timestamp: decodeTime(canonical),
    };
  } catch {
    return invalidInspection(IdInspectionErrorCode.TIME_OVERFLOW);
  }
}
