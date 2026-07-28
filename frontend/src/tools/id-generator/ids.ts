import { v4, v7 } from 'uuid';
import { monotonicFactory } from 'ulid';

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
