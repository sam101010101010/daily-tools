import { useEffect, useRef, useState } from 'react';
import { ErrorView } from '../../components/ErrorView';
import { copyText } from '../../lib/copy';
import type { TabularErrorCode, TabularRequest, TabularResult } from './csv.worker';
import { startTabularJob, type TabularJob } from './csvWorkerClient';

const DEFAULT_SOURCE = 'id,name,active\n001,Ada,true\n002,小明,false\n';
const PREVIEW_LIMIT = 100;
const WARNINGS_ID = 'csv-conversion-warnings';

const MODE_DETAILS: Record<TabularMode, Readonly<{
  sourceLabel: string;
  outputLabel: string;
  downloadLabel: string;
  filename: string;
  mimeType: string;
}>> = {
  'csv-to-json': {
    sourceLabel: 'CSV/TSV 输入',
    outputLabel: 'JSON 输出',
    downloadLabel: '下载 JSON',
    filename: 'daily-tools-csv-output.json',
    mimeType: 'application/json;charset=utf-8',
  },
  'json-to-csv': {
    sourceLabel: 'JSON 输入',
    outputLabel: 'CSV/TSV 输出',
    downloadLabel: '下载 CSV',
    filename: 'daily-tools-csv-output.csv',
    mimeType: 'text/csv;charset=utf-8',
  },
};

const DIAGNOSTICS: Record<TabularErrorCode, string> = {
  TABULAR_EMPTY_INPUT: '请输入要转换的内容。',
  TABULAR_INPUT_TOO_LARGE: '输入内容超过 5 MB 限制。',
  TABULAR_TOO_MANY_ROWS: '数据行数超过 100,000 行限制。',
  TABULAR_ENGINE_FAILED: '转换引擎暂时不可用，请重试。',
  CSV_INVALID_SYNTAX: 'CSV/TSV 格式无效。',
  CSV_BLANK_HEADER: 'CSV 表头不能为空。',
  CSV_DUPLICATE_HEADER: 'CSV 表头不能重复。',
  CSV_EXTRA_CELL: 'CSV 数据行包含多余单元格。',
  JSON_INVALID_INPUT: '请输入有效的 JSON 数组。',
  JSON_EMPTY_ARRAY: 'JSON 数组不能为空。',
  JSON_MIXED_ROW_TYPES: 'JSON 数组中的行类型必须一致。',
  JSON_INCONSISTENT_KEYS: 'JSON 对象行的字段必须一致。',
  JSON_INCONSISTENT_WIDTH: 'JSON 数组行的列数必须一致。',
  JSON_NESTED_VALUE: 'JSON 单元格只支持字符串、数字、布尔值或 null。',
};

type Diagnostic = Readonly<{ code: TabularErrorCode; row?: number; column?: number }>;
type TabularMode = TabularRequest['mode'];
type TabularDelimiter = TabularRequest['delimiter'];
type TabularSuccess = Extract<TabularResult, { kind: 'success' }>;

function warningMessage(warning: string): string {
  return warning === 'SPREADSHEET_SAFE_EXPORT_LOSSY'
    ? '已启用电子表格安全导出，公式样式单元格会添加单引号。'
    : warning;
}

function diagnosticMessage(diagnostic: Diagnostic): string {
  const location = diagnostic.row === undefined
    ? ''
    : `第 ${diagnostic.row} 行${diagnostic.column === undefined ? '' : `，第 ${diagnostic.column} 列`}`;
  return `${DIAGNOSTICS[diagnostic.code]}${location}`;
}

export default function CsvTool() {
  const [mode, setMode] = useState<TabularMode>('csv-to-json');
  const [source, setSource] = useState(DEFAULT_SOURCE);
  const [delimiter, setDelimiter] = useState<TabularDelimiter>(',');
  const [header, setHeader] = useState(true);
  const [spreadsheetSafe, setSpreadsheetSafe] = useState(false);
  const [result, setResult] = useState<TabularSuccess | undefined>(undefined);
  const [diagnostic, setDiagnostic] = useState<Diagnostic>();
  const [status, setStatus] = useState('');
  const [copyError, setCopyError] = useState('');
  const [pending, setPending] = useState(false);
  const activeJobRef = useRef<TabularJob | undefined>(undefined);
  const jobTokenRef = useRef(0);
  const copyTokenRef = useRef(0);
  const mountedRef = useRef(true);
  const activeDownloadsRef = useRef(new Set<string>());
  const downloadTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const details = MODE_DETAILS[mode];

  useEffect(() => () => {
    mountedRef.current = false;
    jobTokenRef.current += 1;
    activeJobRef.current?.cancel();
    activeJobRef.current = undefined;
    copyTokenRef.current += 1;
    downloadTimersRef.current.forEach(timer => clearTimeout(timer));
    downloadTimersRef.current.clear();
    activeDownloadsRef.current.forEach(url => URL.revokeObjectURL(url));
    activeDownloadsRef.current.clear();
  }, []);

  function cancelActiveJob() {
    jobTokenRef.current += 1;
    activeJobRef.current?.cancel();
    activeJobRef.current = undefined;
    setPending(false);
  }

  function clearDerivedState() {
    cancelActiveJob();
    copyTokenRef.current += 1;
    setResult(undefined);
    setDiagnostic(undefined);
    setStatus('');
    setCopyError('');
  }

  function changeSource(value: string) {
    setSource(value);
    clearDerivedState();
  }

  function changeMode(value: TabularMode) {
    setMode(value);
    clearDerivedState();
  }

  function convert() {
    clearDerivedState();
    const token = jobTokenRef.current + 1;
    jobTokenRef.current = token;
    let settled = false;
    setPending(true);
    const job = startTabularJob({
      mode,
      input: source,
      delimiter,
      header: mode === 'csv-to-json' ? header : true,
      spreadsheetSafe: mode === 'json-to-csv' ? spreadsheetSafe : false,
    }, {
      onResult: value => {
        if (!mountedRef.current || jobTokenRef.current !== token) return;
        settled = true;
        activeJobRef.current = undefined;
        setPending(false);
        if (value.kind === 'failure') {
          setResult(undefined);
          setDiagnostic(value);
          return;
        }
        setDiagnostic(undefined);
        setResult(value);
        setStatus('处理完成');
      },
      onError: code => {
        if (!mountedRef.current || jobTokenRef.current !== token) return;
        settled = true;
        activeJobRef.current = undefined;
        setPending(false);
        setResult(undefined);
        setDiagnostic({ code });
      },
    });
    if (mountedRef.current && jobTokenRef.current === token && !settled) activeJobRef.current = job;
  }

  async function copyOutput() {
    if (!result) return;
    const token = copyTokenRef.current + 1;
    copyTokenRef.current = token;
    setStatus('');
    setCopyError('');
    const copyResult = await copyText(result.output);
    if (!mountedRef.current || copyTokenRef.current !== token) return;
    if (copyResult.ok) setStatus('已复制输出');
    else setCopyError(copyResult.message);
  }

  function releaseDownload(url: string) {
    const timer = downloadTimersRef.current.get(url);
    if (timer !== undefined) clearTimeout(timer);
    downloadTimersRef.current.delete(url);
    activeDownloadsRef.current.delete(url);
    URL.revokeObjectURL(url);
  }

  function downloadOutput() {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([result.output], { type: details.mimeType }));
    activeDownloadsRef.current.add(url);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = details.filename;
    const timer = setTimeout(() => releaseDownload(url), 0);
    downloadTimersRef.current.set(url, timer);
    try {
      anchor.click();
    } catch {
      releaseDownload(url);
    }
  }

  function useOutputAsInput() {
    if (!result) return;
    const nextMode: TabularMode = mode === 'csv-to-json' ? 'json-to-csv' : 'csv-to-json';
    setSource(result.output);
    setMode(nextMode);
    clearDerivedState();
  }

  const previewHeaders = result?.headers.length
    ? result.headers
    : Array.from({ length: result?.columnCount ?? 0 }, (_, index) => `第 ${index + 1} 列`);

  return (
    <div className="csv-tool" role="region" aria-label="CSV 与 JSON 工作台">
      <p>所有内容仅在当前浏览器本地处理，不会上传。</p>
      <p>CSV 单元格始终按字符串处理。</p>
      <div className="csv-tool__controls">
        <label htmlFor="csv-mode">处理方式</label>
        <select id="csv-mode" value={mode} onChange={event => changeMode(event.target.value as TabularMode)}>
          <option value="csv-to-json">CSV / TSV 转 JSON</option>
          <option value="json-to-csv">JSON 转 CSV / TSV</option>
        </select>
        <label htmlFor="csv-delimiter">分隔符</label>
        <select
          id="csv-delimiter"
          value={delimiter}
          onChange={event => {
            setDelimiter(event.target.value as TabularDelimiter);
            clearDerivedState();
          }}
        >
          <option value=",">逗号 (,)</option>
          <option value={'\t'}>制表符 (Tab)</option>
          <option value=";">分号 (;)</option>
        </select>
        <label>
          <input
            type="checkbox"
            checked={header}
            disabled={mode !== 'csv-to-json'}
            onChange={event => {
              setHeader(event.target.checked);
              clearDerivedState();
            }}
          />
          首行作为表头
        </label>
        <label>
          <input
            type="checkbox"
            checked={spreadsheetSafe}
            disabled={mode !== 'json-to-csv'}
            onChange={event => {
              setSpreadsheetSafe(event.target.checked);
              clearDerivedState();
            }}
          />
          电子表格安全导出（会添加单引号）
        </label>
      </div>
      <div className="csv-tool__panes">
        <div>
          <label htmlFor="csv-source">{details.sourceLabel}</label>
          <textarea
            id="csv-source"
            aria-label={details.sourceLabel}
            value={source}
            spellCheck={false}
            onChange={event => changeSource(event.target.value)}
          />
        </div>
        <div>
          <label htmlFor="csv-output">{details.outputLabel}</label>
          <textarea
            id="csv-output"
            aria-label={details.outputLabel}
            value={result?.output ?? ''}
            readOnly
            spellCheck={false}
          />
        </div>
      </div>
      <div className="csv-tool__actions">
        <button type="button" onClick={convert} disabled={pending}>转换</button>
        {pending && <button type="button" onClick={cancelActiveJob}>取消转换</button>}
        {result && (
          <>
            <button type="button" onClick={useOutputAsInput}>用输出作为输入</button>
            <button type="button" onClick={() => void copyOutput()}>复制输出</button>
            <button type="button" onClick={downloadOutput}>{details.downloadLabel}</button>
          </>
        )}
      </div>
      {diagnostic && <ErrorView message={diagnosticMessage(diagnostic)} />}
      {copyError && <ErrorView message={copyError} />}
      {result && (
        <>
          {result.warnings.length > 0 && (
            <ul id={WARNINGS_ID} aria-label="转换提示" aria-live="polite" aria-atomic="true">
              {result.warnings.map(warning => <li key={warning}>{warningMessage(warning)}</li>)}
            </ul>
          )}
          <p role="status" aria-live="polite" aria-describedby={result.warnings.length > 0 ? WARNINGS_ID : undefined}>
            {status || '处理完成'}
          </p>
          <p>共 {result.rowCount} 行，{result.columnCount} 列。</p>
          <div className="csv-tool__preview" style={{ overflowX: 'auto' }}>
            <table aria-label="转换结果预览">
              <thead>
                <tr>{previewHeaders.map(headerValue => <th key={headerValue} scope="col">{headerValue}</th>)}</tr>
              </thead>
              <tbody>
                {result.rows.slice(0, PREVIEW_LIMIT).map((row, rowIndex) => (
                  <tr key={rowIndex}>{row.map((cell, columnIndex) => <td key={columnIndex}>{cell}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.rowCount > PREVIEW_LIMIT && <p>仅显示前 100 行，共 {result.rowCount} 行。</p>}
        </>
      )}
    </div>
  );
}
