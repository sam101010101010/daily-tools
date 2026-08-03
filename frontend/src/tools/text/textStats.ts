export interface TextStats {
  characters: number;
  words: number;
  lines: number;
  bytes: number;
}

export function calculateTextStats(input: string): TextStats {
  return {
    characters: Array.from(input).length,
    words: input.trim() === '' ? 0 : input.trim().split(/\s+/u).length,
    lines: input === '' ? 0 : input.replace(/\r\n?/g, '\n').split('\n').length,
    bytes: new TextEncoder().encode(input).length,
  };
}
