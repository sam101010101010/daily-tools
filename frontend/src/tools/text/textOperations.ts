import { calculateTextStats, type TextStats } from './textStats';

export type TextOperation =
  | 'uppercase'
  | 'lowercase'
  | 'trim'
  | 'trim-lines'
  | 'collapse-horizontal-whitespace'
  | 'remove-blank-lines'
  | 'sort-ascending'
  | 'sort-descending'
  | 'reverse-lines'
  | 'dedupe-lines';

export interface TextOperationRequest {
  operation: TextOperation;
  input: string;
}

export interface TextOperationResult {
  output: string;
  stats: TextStats;
}

export function normalizeNewlines(input: string): string {
  return input.replace(/\r\n?/g, '\n');
}

export function applyTextOperation({ operation, input }: TextOperationRequest): TextOperationResult {
  const normalizedInput = normalizeNewlines(input);
  const output = transform(operation, normalizedInput);

  return { output, stats: calculateTextStats(output) };
}

function transform(operation: TextOperation, input: string): string {
  switch (operation) {
    case 'uppercase':
      return input.toUpperCase();
    case 'lowercase':
      return input.toLowerCase();
    case 'trim':
      return input.trim();
    case 'trim-lines':
      return input.split('\n').map((line) => line.trim()).join('\n');
    case 'collapse-horizontal-whitespace':
      return input.replace(/[ \t]+/g, ' ');
    case 'remove-blank-lines':
      return input.split('\n').filter((line) => line.trim() !== '').join('\n');
    case 'sort-ascending':
      return input.split('\n').sort(compareCodePoints).join('\n');
    case 'sort-descending':
      return input.split('\n').sort((left, right) => compareCodePoints(right, left)).join('\n');
    case 'reverse-lines':
      return input.split('\n').reverse().join('\n');
    case 'dedupe-lines':
      return [...new Set(input.split('\n'))].join('\n');
  }
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left);
  const rightPoints = Array.from(right);
  const length = Math.min(leftPoints.length, rightPoints.length);

  for (let index = 0; index < length; index += 1) {
    const difference = leftPoints[index].codePointAt(0)! - rightPoints[index].codePointAt(0)!;
    if (difference !== 0) return difference;
  }

  return leftPoints.length - rightPoints.length;
}
