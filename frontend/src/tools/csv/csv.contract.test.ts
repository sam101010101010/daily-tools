import { describe, expect, it } from 'vitest';
import { convertTabular } from './csv';

type Delimiter = ',' | '\t' | ';';

const FIVE_MIB = 5 * 1024 * 1024;
const MAX_DATA_ROWS = 100_000;
const utf8 = new TextEncoder();

function csvWithDataRows(count: number): string {
  return `id\n${'1\n'.repeat(count)}`;
}

function csvToJson(
  input: string,
  options: { delimiter?: Delimiter; header?: boolean } = {},
) {
  return convertTabular({
    mode: 'csv-to-json',
    input,
    delimiter: options.delimiter ?? ',',
    header: options.header ?? true,
    spreadsheetSafe: false,
  });
}

function jsonToCsv(
  input: string,
  options: { delimiter?: Delimiter; spreadsheetSafe?: boolean } = {},
) {
  return convertTabular({
    mode: 'json-to-csv',
    input,
    delimiter: options.delimiter ?? ',',
    header: true,
    spreadsheetSafe: options.spreadsheetSafe ?? false,
  });
}

describe('CSV dialect and string-cell contract', () => {
  it.each([
    [',', 'id,name\n001,Ada\n'],
    ['\t', 'id\tname\n001\tAda\n'],
    [';', 'id;name\n001;Ada\n'],
  ] as const)('parses the explicit %j delimiter without dialect guessing', (delimiter, input) => {
    expect(csvToJson(input, { delimiter })).toEqual({
      kind: 'success',
      headers: ['id', 'name'],
      rows: [['001', 'Ada']],
      output: '[\n  {\n    "id": "001",\n    "name": "Ada"\n  }\n]\n',
      rowCount: 1,
      columnCount: 2,
      warnings: [],
    });
  });

  it('strips one UTF-8 BOM and accepts CRLF records', () => {
    expect(csvToJson('\ufeffname,city\r\nAda,杭州\r\n')).toEqual({
      kind: 'success',
      headers: ['name', 'city'],
      rows: [['Ada', '杭州']],
      output: '[\n  {\n    "name": "Ada",\n    "city": "杭州"\n  }\n]\n',
      rowCount: 1,
      columnCount: 2,
      warnings: [],
    });
  });

  it('preserves delimiters, escaped quotes and newlines inside quoted cells', () => {
    expect(csvToJson('name,note\r\nAda,"comma, quote "" and\r\nnewline"\r\n')).toMatchObject({
      kind: 'success',
      headers: ['name', 'note'],
      rows: [['Ada', 'comma, quote " and\r\nnewline']],
      output:
        '[\n  {\n    "name": "Ada",\n    "note": "comma, quote \\" and\\r\\nnewline"\n  }\n]\n',
      rowCount: 1,
      columnCount: 2,
    });
  });

  it('keeps every CSV cell as a string without type or date inference', () => {
    expect(csvToJson('id,flag,date,empty\n001,true,2026-08-17,\n')).toMatchObject({
      kind: 'success',
      rows: [['001', 'true', '2026-08-17', '']],
      output:
        '[\n  {\n    "id": "001",\n    "flag": "true",\n    "date": "2026-08-17",\n    "empty": ""\n  }\n]\n',
    });
  });

  it('preserves Unicode code points in headers and cells', () => {
    expect(csvToJson('姓名,emoji\n小明,👨‍👩‍👧\n')).toMatchObject({
      kind: 'success',
      headers: ['姓名', 'emoji'],
      rows: [['小明', '👨‍👩‍👧']],
    });
  });

  it('uses arrays of arrays when the header switch is explicitly off', () => {
    expect(csvToJson('001,true\n002,false\n', { header: false })).toEqual({
      kind: 'success',
      headers: [],
      rows: [
        ['001', 'true'],
        ['002', 'false'],
      ],
      output: '[\n  [\n    "001",\n    "true"\n  ],\n  [\n    "002",\n    "false"\n  ]\n]\n',
      rowCount: 2,
      columnCount: 2,
      warnings: [],
    });
  });
});

describe('CSV header and ragged-row diagnostics', () => {
  it('rejects an empty CSV file', () => {
    expect(csvToJson('')).toEqual({
      kind: 'failure',
      code: 'TABULAR_EMPTY_INPUT',
    });
  });

  it('rejects a blank header at its one-based row and column', () => {
    expect(csvToJson('id,\n1,Ada\n')).toEqual({
      kind: 'failure',
      code: 'CSV_BLANK_HEADER',
      row: 1,
      column: 2,
    });
  });

  it('rejects the second occurrence of a duplicate header', () => {
    expect(csvToJson('id,id\n1,2\n')).toEqual({
      kind: 'failure',
      code: 'CSV_DUPLICATE_HEADER',
      row: 1,
      column: 2,
    });
  });

  it('pads missing cells with empty strings instead of dropping object keys', () => {
    expect(csvToJson('id,name,note\n1,Ada\n')).toMatchObject({
      kind: 'success',
      rows: [['1', 'Ada', '']],
      output:
        '[\n  {\n    "id": "1",\n    "name": "Ada",\n    "note": ""\n  }\n]\n',
    });
  });

  it('rejects the first extra cell instead of truncating it', () => {
    expect(csvToJson('id,name\n1,Ada,extra\n')).toEqual({
      kind: 'failure',
      code: 'CSV_EXTRA_CELL',
      row: 2,
      column: 3,
    });
  });
});

describe('flat JSON to deterministic CSV contract', () => {
  it('serializes flat objects in first-object key order with CRLF records', () => {
    expect(
      jsonToCsv(
        '[{"id":"001","active":true,"score":2.5,"note":null},{"note":"ok","score":3,"active":false,"id":"002"}]',
      ),
    ).toEqual({
      kind: 'success',
      headers: ['id', 'active', 'score', 'note'],
      rows: [
        ['001', 'true', '2.5', ''],
        ['002', 'false', '3', 'ok'],
      ],
      output: 'id,active,score,note\r\n001,true,2.5,\r\n002,false,3,ok\r\n',
      rowCount: 2,
      columnCount: 4,
      warnings: [],
    });
  });

  it('serializes consistent arrays without inventing a header row', () => {
    expect(jsonToCsv('[["001","Ada"],["002","小明"]]', { delimiter: '\t' })).toEqual({
      kind: 'success',
      headers: [],
      rows: [
        ['001', 'Ada'],
        ['002', '小明'],
      ],
      output: '001\tAda\r\n002\t小明\r\n',
      rowCount: 2,
      columnCount: 2,
      warnings: [],
    });
  });

  it('quotes the selected delimiter, quotes and newlines for lossless round-trip', () => {
    const result = jsonToCsv('[{"value":"a,b \\"quoted\\"\\nnext"}]');

    expect(result).toMatchObject({
      kind: 'success',
      rows: [['a,b "quoted"\nnext']],
      output: 'value\r\n"a,b ""quoted""\nnext"\r\n',
    });
    expect(result.kind === 'success' && csvToJson(result.output)).toMatchObject({
      kind: 'success',
      rows: [['a,b "quoted"\nnext']],
    });
  });

  it('rejects object rows whose key set differs from the first row', () => {
    expect(jsonToCsv('[{"id":1,"name":"Ada"},{"id":2,"extra":"x"}]')).toEqual({
      kind: 'failure',
      code: 'JSON_INCONSISTENT_KEYS',
      row: 2,
      column: 1,
    });
  });

  it('rejects array rows whose width differs from the first row', () => {
    expect(jsonToCsv('[["id","name"],["1"]]')).toEqual({
      kind: 'failure',
      code: 'JSON_INCONSISTENT_WIDTH',
      row: 2,
      column: 2,
    });
  });

  it.each([
    ['nested object', '[{"id":1,"value":{"nested":true}}]'],
    ['nested array', '[{"id":1,"value":["nested"]}]'],
  ])('rejects a %s value at the owning table cell', (_label, input) => {
    expect(jsonToCsv(input)).toEqual({
      kind: 'failure',
      code: 'JSON_NESTED_VALUE',
      row: 1,
      column: 2,
    });
  });
});

describe('UTF-8 byte and data-row limits', () => {
  it('accepts input of exactly 5 MiB measured as UTF-8 bytes', () => {
    const input = `value\n${'a'.repeat(FIVE_MIB - 9)}界`;
    expect(utf8.encode(input)).toHaveLength(FIVE_MIB);

    expect(csvToJson(input)).toMatchObject({
      kind: 'success',
      rowCount: 1,
      columnCount: 1,
    });
  });

  it('rejects input of 5 MiB plus one UTF-8 byte before parsing', () => {
    const input = `value\n${'a'.repeat(FIVE_MIB - 9)}界b`;
    expect(utf8.encode(input)).toHaveLength(FIVE_MIB + 1);

    expect(csvToJson(input)).toMatchObject({
      kind: 'failure',
      code: 'TABULAR_INPUT_TOO_LARGE',
    });
  });

  it('accepts exactly 100,000 data rows without counting the header row', () => {
    expect(csvToJson(csvWithDataRows(MAX_DATA_ROWS))).toMatchObject({
      kind: 'success',
      rowCount: MAX_DATA_ROWS,
      columnCount: 1,
    });
  });

  it('rejects the 100,001st data row without returning partial output', () => {
    expect(csvToJson(csvWithDataRows(MAX_DATA_ROWS + 1))).toMatchObject({
      kind: 'failure',
      code: 'TABULAR_TOO_MANY_ROWS',
    });
  });
});

describe('spreadsheet-safe export contract', () => {
  const formulaInput = JSON.stringify([
    { equals: '=1+1', plus: '+cmd', minus: '-2+3', at: '@SUM(A1)', tab: '\tkeep' },
  ]);

  it('preserves formula-like cells by default and does not claim a lossy warning', () => {
    expect(jsonToCsv(formulaInput)).toMatchObject({
      kind: 'success',
      rows: [['=1+1', '+cmd', '-2+3', '@SUM(A1)', '\tkeep']],
      output:
        'equals,plus,minus,at,tab\r\n=1+1,+cmd,-2+3,@SUM(A1),\tkeep\r\n',
      warnings: [],
    });
  });

  it('prefixes only = + - @ in safe output without mutating preview rows', () => {
    expect(jsonToCsv(formulaInput, { spreadsheetSafe: true })).toMatchObject({
      kind: 'success',
      rows: [['=1+1', '+cmd', '-2+3', '@SUM(A1)', '\tkeep']],
      output:
        "equals,plus,minus,at,tab\r\n'=1+1,'+cmd,'-2+3,'@SUM(A1),\tkeep\r\n",
      warnings: ['SPREADSHEET_SAFE_EXPORT_LOSSY'],
    });
  });
});
