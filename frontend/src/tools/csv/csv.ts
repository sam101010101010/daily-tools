import { parse } from 'csv-parse/browser/esm/sync';

export const TABULAR_MAX_INPUT_BYTES = 5 * 1024 * 1024;
export const TABULAR_MAX_DATA_ROWS = 100_000;

export type TabularMode = 'csv-to-json' | 'json-to-csv';
export type TabularDelimiter = ',' | '\t' | ';';
export type TabularErrorCode =
  | 'TABULAR_EMPTY_INPUT'
  | 'TABULAR_INPUT_TOO_LARGE'
  | 'TABULAR_TOO_MANY_ROWS'
  | 'TABULAR_ENGINE_FAILED'
  | 'CSV_INVALID_SYNTAX'
  | 'CSV_BLANK_HEADER'
  | 'CSV_DUPLICATE_HEADER'
  | 'CSV_EXTRA_CELL'
  | 'JSON_INVALID_INPUT'
  | 'JSON_EMPTY_ARRAY'
  | 'JSON_MIXED_ROW_TYPES'
  | 'JSON_INCONSISTENT_KEYS'
  | 'JSON_INCONSISTENT_WIDTH'
  | 'JSON_NESTED_VALUE';

export type TabularRequest = Readonly<{
  mode: TabularMode;
  input: string;
  delimiter: TabularDelimiter;
  header: boolean;
  spreadsheetSafe: boolean;
}>;

export type TabularSuccess = Readonly<{
  kind: 'success';
  headers: string[];
  rows: string[][];
  output: string;
  rowCount: number;
  columnCount: number;
  warnings: string[];
}>;

export type TabularFailure = Readonly<{
  kind: 'failure';
  code: TabularErrorCode;
  row?: number;
  column?: number;
}>;

export type TabularResult = TabularSuccess | TabularFailure;

type JsonLeaf = string | number | boolean | null;

function failure(
  code: TabularErrorCode,
  row?: number,
  column?: number,
): TabularFailure {
  return { kind: 'failure', code, ...(row === undefined ? {} : { row }), ...(column === undefined ? {} : { column }) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isMode(value: unknown): value is TabularMode {
  return value === 'csv-to-json' || value === 'json-to-csv';
}

function isDelimiter(value: unknown): value is TabularDelimiter {
  return value === ',' || value === '\t' || value === ';';
}

export function isTabularRequest(value: unknown): value is TabularRequest {
  return isRecord(value)
    && isMode(value.mode)
    && typeof value.input === 'string'
    && isDelimiter(value.delimiter)
    && typeof value.header === 'boolean'
    && typeof value.spreadsheetSafe === 'boolean';
}

export function isTabularErrorCode(value: unknown): value is TabularErrorCode {
  return value === 'TABULAR_EMPTY_INPUT'
    || value === 'TABULAR_INPUT_TOO_LARGE'
    || value === 'TABULAR_TOO_MANY_ROWS'
    || value === 'TABULAR_ENGINE_FAILED'
    || value === 'CSV_INVALID_SYNTAX'
    || value === 'CSV_BLANK_HEADER'
    || value === 'CSV_DUPLICATE_HEADER'
    || value === 'CSV_EXTRA_CELL'
    || value === 'JSON_INVALID_INPUT'
    || value === 'JSON_EMPTY_ARRAY'
    || value === 'JSON_MIXED_ROW_TYPES'
    || value === 'JSON_INCONSISTENT_KEYS'
    || value === 'JSON_INCONSISTENT_WIDTH'
    || value === 'JSON_NESTED_VALUE';
}

function withinLimits(input: string): TabularFailure | undefined {
  if (new TextEncoder().encode(input).byteLength > TABULAR_MAX_INPUT_BYTES) {
    return failure('TABULAR_INPUT_TOO_LARGE');
  }
  return undefined;
}

function success(
  headers: string[],
  rows: string[][],
  output: string,
  warnings: string[] = [],
): TabularSuccess {
  return {
    kind: 'success',
    headers,
    rows,
    output,
    rowCount: rows.length,
    columnCount: headers.length === 0 ? (rows[0]?.length ?? 0) : headers.length,
    warnings,
  };
}

function validateHeaders(headers: string[]): TabularFailure | undefined {
  const seen = new Set<string>();
  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index];
    if (header === '') return failure('CSV_BLANK_HEADER', 1, index + 1);
    if (seen.has(header)) return failure('CSV_DUPLICATE_HEADER', 1, index + 1);
    seen.add(header);
  }
  return undefined;
}

function normalizeCsvRows(
  records: string[][],
  expectedWidth: number,
  firstDataRow: number,
): TabularResult | string[][] {
  const rows: string[][] = [];
  for (let index = 0; index < records.length; index += 1) {
    if (index === TABULAR_MAX_DATA_ROWS) return failure('TABULAR_TOO_MANY_ROWS');
    const record = records[index];
    if (record.length > expectedWidth) {
      return failure('CSV_EXTRA_CELL', firstDataRow + index, expectedWidth + 1);
    }
    rows.push([...record, ...Array<string>(expectedWidth - record.length).fill('')]);
  }
  return rows;
}

function csvSyntaxFailure(error: unknown): TabularFailure {
  if (!isRecord(error)) return failure('CSV_INVALID_SYNTAX');
  const row = typeof error.lines === 'number' && Number.isInteger(error.lines) && error.lines > 0
    ? error.lines
    : undefined;
  const column = typeof error.column === 'number' && Number.isInteger(error.column) && error.column > 0
    ? error.column
    : undefined;
  return failure('CSV_INVALID_SYNTAX', row, column);
}

function convertCsvToJson(request: TabularRequest): TabularResult {
  if (request.input === '') return failure('TABULAR_EMPTY_INPUT');

  let records: string[][];
  try {
    records = parse(request.input, {
      bom: true,
      delimiter: request.delimiter,
      relax_column_count_less: true,
      relax_column_count_more: true,
    });
  } catch (error) {
    return csvSyntaxFailure(error);
  }
  if (records.length === 0) return failure('TABULAR_EMPTY_INPUT');

  const headers = request.header ? records[0] : [];
  const headerFailure = request.header ? validateHeaders(headers) : undefined;
  if (headerFailure) return headerFailure;
  const dataRecords = request.header ? records.slice(1) : records;
  const expectedWidth = request.header ? headers.length : (dataRecords[0]?.length ?? 0);
  const rows = normalizeCsvRows(dataRecords, expectedWidth, request.header ? 2 : 1);
  if (!Array.isArray(rows)) return rows;
  const value = request.header
    ? rows.map(row => Object.fromEntries(headers.map((header, index) => [header, row[index]])))
    : rows;
  return success(headers, rows, `${JSON.stringify(value, null, 2)}\n`);
}

function isJsonLeaf(value: unknown): value is JsonLeaf {
  return value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value));
}

function toCell(value: JsonLeaf): string {
  return value === null ? '' : String(value);
}

function quoteCell(value: string, delimiter: TabularDelimiter, spreadsheetSafe: boolean): string {
  const safeValue = spreadsheetSafe && /^[=+\-@]/u.test(value) ? `'${value}` : value;
  return safeValue.includes(delimiter) || /["\r\n]/u.test(safeValue)
    ? `"${safeValue.replaceAll('"', '""')}"`
    : safeValue;
}

function serializeCsv(
  headers: string[],
  rows: string[][],
  delimiter: TabularDelimiter,
  spreadsheetSafe: boolean,
): string {
  const records = headers.length === 0 ? rows : [headers, ...rows];
  return records
    .map(row => row.map(cell => quoteCell(cell, delimiter, spreadsheetSafe)).join(delimiter))
    .join('\r\n')
    .concat('\r\n');
}

function convertJsonToCsv(request: TabularRequest): TabularResult {
  if (request.input === '') return failure('TABULAR_EMPTY_INPUT');
  let input: unknown;
  try {
    input = JSON.parse(request.input);
  } catch {
    return failure('JSON_INVALID_INPUT');
  }
  if (!Array.isArray(input)) return failure('JSON_INVALID_INPUT');
  if (input.length === 0) return failure('JSON_EMPTY_ARRAY');
  if (input.length > TABULAR_MAX_DATA_ROWS) return failure('TABULAR_TOO_MANY_ROWS');

  const first = input[0];
  const objectMode = isRecord(first);
  const arrayMode = Array.isArray(first);
  if (!objectMode && !arrayMode) return failure('JSON_MIXED_ROW_TYPES', 1, 1);

  const headers = objectMode ? Object.keys(first) : [];
  const firstWidth = objectMode ? headers.length : first.length;
  const rows: string[][] = [];
  for (let rowIndex = 0; rowIndex < input.length; rowIndex += 1) {
    const row = input[rowIndex];
    if (objectMode) {
      if (!isRecord(row)) return failure('JSON_MIXED_ROW_TYPES', rowIndex + 1, 1);
      const keys = Object.keys(row);
      if (keys.length !== headers.length || headers.some(header => !Object.hasOwn(row, header))) {
        return failure('JSON_INCONSISTENT_KEYS', rowIndex + 1, 1);
      }
      const cells: string[] = [];
      for (let columnIndex = 0; columnIndex < headers.length; columnIndex += 1) {
        const value = row[headers[columnIndex]];
        if (!isJsonLeaf(value)) return failure('JSON_NESTED_VALUE', rowIndex + 1, columnIndex + 1);
        cells.push(toCell(value));
      }
      rows.push(cells);
    } else {
      if (!Array.isArray(row)) return failure('JSON_MIXED_ROW_TYPES', rowIndex + 1, 1);
      if (row.length !== firstWidth) return failure('JSON_INCONSISTENT_WIDTH', rowIndex + 1, Math.min(row.length, firstWidth) + 1);
      const cells: string[] = [];
      for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
        const value = row[columnIndex];
        if (!isJsonLeaf(value)) return failure('JSON_NESTED_VALUE', rowIndex + 1, columnIndex + 1);
        cells.push(toCell(value));
      }
      rows.push(cells);
    }
  }
  const warnings = request.spreadsheetSafe ? ['SPREADSHEET_SAFE_EXPORT_LOSSY'] : [];
  return success(headers, rows, serializeCsv(headers, rows, request.delimiter, request.spreadsheetSafe), warnings);
}

export function convertTabular(request: TabularRequest): TabularResult {
  if (!isTabularRequest(request)) return failure('TABULAR_ENGINE_FAILED');
  const inputFailure = withinLimits(request.input);
  if (inputFailure) return inputFailure;
  return request.mode === 'csv-to-json' ? convertCsvToJson(request) : convertJsonToCsv(request);
}
