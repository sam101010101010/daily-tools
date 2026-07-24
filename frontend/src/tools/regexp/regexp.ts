export const REGEXP_FLAGS = ['g', 'i', 'm', 's', 'u'] as const;

export type RegexRequest = Readonly<{
  pattern: string;
  flags: string;
  text: string;
  replacement: string;
}>;

export type RegexMatch = Readonly<{
  text: string;
  index: number;
  captures: Array<string | null>;
  namedCaptures: Record<string, string | null>;
}>;

export type RegexEvaluation =
  | Readonly<{ kind: 'success'; flags: string; matches: RegexMatch[]; truncated: false }>
  | Readonly<{ kind: 'no-match'; flags: string; matches: []; truncated: false }>
  | Readonly<{ kind: 'limit-reached'; flags: string; matches: RegexMatch[]; truncated: true }>
  | Readonly<{ kind: 'syntax-error'; error: string }>;

export type ReplacementPreview =
  | Readonly<{ kind: 'preview'; value: string }>
  | Readonly<{ kind: 'no-match' }>
  | Readonly<{ kind: 'syntax-error'; error: string }>;

export const DEFAULT_REGEXP_REQUEST: RegexRequest = {
  pattern: '(?<year>\\d{4})-(\\d{2})-(\\d{2})',
  flags: 'g',
  text: '日志：2026-07-22，下一次 2026-08-01',
  replacement: '$2/$3/$<year>',
};

const MAX_MATCHES = 500;
const SYNTAX_ERROR_MESSAGE = '正则语法错误，请检查表达式。';

function normalizeFlags(flags: string): string {
  return REGEXP_FLAGS.filter((flag) => flags.includes(flag)).join('');
}

function advanceStringIndex(text: string, index: number, unicode: boolean): number {
  if (!unicode) return index + 1;
  const first = text.charCodeAt(index);
  const second = text.charCodeAt(index + 1);
  return first >= 0xd800 && first <= 0xdbff && second >= 0xdc00 && second <= 0xdfff
    ? index + 2
    : index + 1;
}

function toRegexMatch(match: RegExpExecArray): RegexMatch {
  return {
    text: match[0],
    index: match.index,
    captures: match.slice(1).map((capture) => capture ?? null),
    namedCaptures: Object.fromEntries(
      Object.entries(match.groups ?? {}).map(([name, capture]) => [name, capture ?? null]),
    ),
  };
}

export function evaluateRegex(request: RegexRequest): RegexEvaluation {
  const flags = normalizeFlags(request.flags);
  let regex: RegExp;
  try {
    regex = new RegExp(request.pattern, flags);
  } catch {
    return { kind: 'syntax-error', error: SYNTAX_ERROR_MESSAGE };
  }

  const matches: RegexMatch[] = [];
  let match = regex.exec(request.text);
  while (match && matches.length < MAX_MATCHES) {
    matches.push(toRegexMatch(match));
    if (!regex.global) break;
    if (match[0] === '') regex.lastIndex = advanceStringIndex(request.text, regex.lastIndex, regex.unicode);
    match = regex.exec(request.text);
  }

  if (matches.length === 0) return { kind: 'no-match', flags, matches: [], truncated: false };
  if (matches.length === MAX_MATCHES && match) {
    return { kind: 'limit-reached', flags, matches, truncated: true };
  }
  return { kind: 'success', flags, matches, truncated: false };
}

export function createReplacementPreview(request: RegexRequest): ReplacementPreview {
  const flags = normalizeFlags(request.flags);
  let regex: RegExp;
  try {
    regex = new RegExp(request.pattern, flags);
  } catch {
    return { kind: 'syntax-error', error: SYNTAX_ERROR_MESSAGE };
  }

  if (!regex.exec(request.text)) return { kind: 'no-match' };
  return { kind: 'preview', value: request.text.replace(regex, request.replacement) };
}
