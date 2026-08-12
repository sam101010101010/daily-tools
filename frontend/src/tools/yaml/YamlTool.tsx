import { useEffect, useRef, useState } from 'react';
import { ErrorView } from '../../components/ErrorView';
import { copyText } from '../../lib/copy';
import { processYaml, type YamlToolMode } from './yaml';

const DEFAULT_SOURCE = 'service:\n  name: example-api\n  enabled: true\n';

const MODE_DETAILS: Record<YamlToolMode, {
  label: string;
  sourceLabel: string;
  outputLabel: string;
  actionLabel: string;
  downloadLabel: string;
  filename: string;
  mimeType: string;
}> = {
  'format-yaml': {
    label: '格式化 YAML',
    sourceLabel: 'YAML 输入',
    outputLabel: '格式化后的 YAML',
    actionLabel: '格式化 YAML',
    downloadLabel: '下载 YAML',
    filename: 'daily-tools-yaml-output.yaml',
    mimeType: 'application/yaml;charset=utf-8',
  },
  'yaml-to-json': {
    label: 'YAML 转 JSON',
    sourceLabel: 'YAML 输入',
    outputLabel: 'JSON 输出',
    actionLabel: '转换为 JSON',
    downloadLabel: '下载 JSON',
    filename: 'daily-tools-yaml-output.json',
    mimeType: 'application/json;charset=utf-8',
  },
  'json-to-yaml': {
    label: 'JSON 转 YAML',
    sourceLabel: 'JSON 输入',
    outputLabel: 'YAML 输出',
    actionLabel: '转换为 YAML',
    downloadLabel: '下载 YAML',
    filename: 'daily-tools-yaml-output.yaml',
    mimeType: 'application/yaml;charset=utf-8',
  },
};

type Diagnostic = {
  message: string;
  line?: number;
  column?: number;
};

export default function YamlTool() {
  const [mode, setMode] = useState<YamlToolMode>('format-yaml');
  const [source, setSource] = useState(DEFAULT_SOURCE);
  const [output, setOutput] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [diagnostic, setDiagnostic] = useState<Diagnostic>();
  const [status, setStatus] = useState('');
  const [copyError, setCopyError] = useState('');
  const copyTokenRef = useRef(0);
  const activeDownloadsRef = useRef(new Set<string>());
  const downloadTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const details = MODE_DETAILS[mode];

  useEffect(() => {
    const activeDownloads = activeDownloadsRef.current;
    const downloadTimers = downloadTimersRef.current;
    return () => {
      downloadTimers.forEach(timer => clearTimeout(timer));
      downloadTimers.clear();
      activeDownloads.forEach(url => URL.revokeObjectURL(url));
      activeDownloads.clear();
    };
  }, []);

  function clearDerivedState() {
    copyTokenRef.current += 1;
    setOutput('');
    setWarnings([]);
    setDiagnostic(undefined);
    setStatus('');
    setCopyError('');
  }

  function changeSource(value: string) {
    setSource(value);
    clearDerivedState();
  }

  function changeMode(value: YamlToolMode) {
    setMode(value);
    clearDerivedState();
  }

  function process() {
    clearDerivedState();
    const result = processYaml({ mode, input: source });
    if (result.kind === 'failure') {
      setDiagnostic(result);
      return;
    }
    setOutput(result.output);
    setWarnings(result.warnings);
    setStatus('处理完成');
  }

  async function copyOutput() {
    if (!output) return;
    const copyToken = copyTokenRef.current + 1;
    copyTokenRef.current = copyToken;
    setStatus('');
    setCopyError('');
    const result = await copyText(output);
    if (copyTokenRef.current !== copyToken) return;
    if (result.ok) setStatus('已复制输出');
    else setCopyError(result.message);
  }

  function releaseDownload(url: string) {
    const timer = downloadTimersRef.current.get(url);
    if (timer !== undefined) clearTimeout(timer);
    downloadTimersRef.current.delete(url);
    activeDownloadsRef.current.delete(url);
    URL.revokeObjectURL(url);
  }

  function downloadOutput() {
    if (!output) return;
    const blob = new Blob([output], { type: details.mimeType });
    const url = URL.createObjectURL(blob);
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

  return (
    <section className="yaml-workbench" aria-label="YAML 与 JSON 工作台">
      <p className="yaml-workbench__privacy">所有内容仅在当前浏览器本地处理，不会上传。</p>
      <div className="yaml-workbench__mode">
        <label htmlFor="yaml-mode">处理方式</label>
        <select
          id="yaml-mode"
          value={mode}
          onChange={event => changeMode(event.target.value as YamlToolMode)}
        >
          {(Object.keys(MODE_DETAILS) as YamlToolMode[]).map(candidate => (
            <option key={candidate} value={candidate}>{MODE_DETAILS[candidate].label}</option>
          ))}
        </select>
      </div>
      <div className="yaml-workbench__panes">
        <div className="yaml-workbench__pane">
          <label htmlFor="yaml-source">{details.sourceLabel}</label>
          <textarea
            id="yaml-source"
            aria-label={details.sourceLabel}
            value={source}
            spellCheck={false}
            onChange={event => changeSource(event.target.value)}
          />
        </div>
        <div className="yaml-workbench__pane">
          <label htmlFor="yaml-output">{details.outputLabel}</label>
          <textarea
            id="yaml-output"
            aria-label={details.outputLabel}
            value={output}
            readOnly
            spellCheck={false}
          />
        </div>
      </div>
      <div className="yaml-workbench__actions">
        <button type="button" onClick={process}>{details.actionLabel}</button>
        {output && (
          <>
            <button type="button" onClick={() => void copyOutput()}>复制输出</button>
            <button type="button" onClick={downloadOutput}>{details.downloadLabel}</button>
          </>
        )}
      </div>
      {diagnostic && (
        <div className="yaml-workbench__diagnostic">
          <ErrorView message={`${diagnostic.message}${
            diagnostic.line !== undefined && diagnostic.column !== undefined
              ? `第 ${diagnostic.line} 行，第 ${diagnostic.column} 列`
              : ''
          }`} />
        </div>
      )}
      {warnings.length > 0 && (
        <ul className="yaml-workbench__warnings" aria-label="转换提示">
          {warnings.map(warning => <li key={warning}>{warning}</li>)}
        </ul>
      )}
      {copyError && <ErrorView message={copyError} />}
      {status && <p className="yaml-workbench__status" role="status" aria-live="polite">{status}</p>}
    </section>
  );
}
