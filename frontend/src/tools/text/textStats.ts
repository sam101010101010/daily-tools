export interface TextStats {
  characters: number;
  words: number;
  lines: number;
  bytes: number;
}

export function calculateTextStats(input: string): TextStats {
  return {
    characters: Array.from(input).length,
    words: countWords(input),
    lines: input === '' ? 0 : input.replace(/\r\n?/g, '\n').split('\n').length,
    bytes: new TextEncoder().encode(input).length,
  };
}

function countWords(input: string): number {
  let words = 0;
  let insideWord = false;

  for (const character of input) {
    if (isUnicodeWhiteSpace(character)) {
      insideWord = false;
    } else if (!insideWord) {
      words += 1;
      insideWord = true;
    }
  }

  return words;
}

function isUnicodeWhiteSpace(character: string): boolean {
  const codePoint = character.codePointAt(0)!;
  return (
    (codePoint >= 0x0009 && codePoint <= 0x000d) ||
    codePoint === 0x0020 ||
    codePoint === 0x0085 ||
    codePoint === 0x00a0 ||
    codePoint === 0x1680 ||
    (codePoint >= 0x2000 && codePoint <= 0x200a) ||
    codePoint === 0x2028 ||
    codePoint === 0x2029 ||
    codePoint === 0x202f ||
    codePoint === 0x205f ||
    codePoint === 0x3000
  );
}
