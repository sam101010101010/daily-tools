import { useEffect, useRef, useState } from 'react';
import { ErrorView } from '../../components/ErrorView';
import { copyText } from '../../lib/copy';
import {
  DEFAULT_HASH_ALGORITHM,
  formatBytes,
  HASH_ALGORITHMS,
  normalizeExpectedChecksum,
  type HashAlgorithm,
  type HashProgress,
  type HashSource,
  type HashSuccess,
} from './hash';
import { startHashJob } from './hashWorkerClient';

const EXAMPLE_TEXT = 'hello world';

function byteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

export default function HashTool() {
  const [sourceKind, setSourceKind] = useState<'text' | 'file'>('text');
  const [text, setText] = useState(EXAMPLE_TEXT);
  const [file, setFile] = useState<File>();
  const [algorithm, setAlgorithm] = useState<HashAlgorithm>(DEFAULT_HASH_ALGORITHM);
  const [expected, setExpected] = useState('');
  const [progress, setProgress] = useState<HashProgress>();
  const [result, setResult] = useState<HashSuccess>();
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<(() => void) | undefined>(undefined);
  const jobVersion = useRef(0);

  function cancelJob() {
    jobVersion.current += 1;
    cancelRef.current?.();
    cancelRef.current = undefined;
    setBusy(false);
  }

  function resetForInputChange() {
    cancelJob();
    setProgress(undefined);
    setResult(undefined);
    setError('');
    setCopyStatus('');
  }

  useEffect(() => () => cancelJob(), []);

  function selectSource(kind: 'text' | 'file') {
    resetForInputChange();
    setSourceKind(kind);
  }

  function selectFile(nextFile: File | undefined) {
    resetForInputChange();
    setFile(nextFile);
  }

  function start() {
    const normalizedExpected = expected.trim() === '' ? undefined : normalizeExpectedChecksum(expected, algorithm);
    if (normalizedExpected && !normalizedExpected.ok) {
      setError(normalizedExpected.error);
      return;
    }

    const source: HashSource | undefined = sourceKind === 'text'
      ? { kind: 'text', text }
      : file ? { kind: 'file', file } : undefined;
    if (!source) {
      setError('请选择本地文件');
      return;
    }

    resetForInputChange();
    const version = ++jobVersion.current;
    const totalBytes = source.kind === 'text' ? byteLength(source.text) : source.file.size;
    setProgress({ completedBytes: 0, totalBytes });
    setBusy(true);
    cancelRef.current = startHashJob({ algorithm, source }, {
      onProgress: nextProgress => {
        if (jobVersion.current === version) setProgress(nextProgress);
      },
      onSuccess: success => {
        if (jobVersion.current !== version) return;
        cancelRef.current = undefined;
        setBusy(false);
        setResult({ ...success, digest: success.digest.toLowerCase() });
      },
      onError: message => {
        if (jobVersion.current !== version) return;
        cancelRef.current = undefined;
        setBusy(false);
        setError(message);
      },
    });
  }

  async function copyResult() {
    if (!result) return;
    const copied = await copyText(result.digest);
    setCopyStatus(copied.ok ? '已复制' : copied.message);
  }

  const selectedAlgorithm = HASH_ALGORITHMS.find(({ id }) => id === algorithm)!;
  const sourceSize = sourceKind === 'text' ? byteLength(text) : file?.size;
  const normalizedExpected = expected.trim() === '' ? undefined : normalizeExpectedChecksum(expected, algorithm);
  const verdict = result && normalizedExpected?.ok
    ? result.digest === normalizedExpected.value ? '匹配' : '不匹配'
    : undefined;

  return (
    <section className="hash">
      <p>文件仅在当前浏览器本地读取，不会上传</p>
      <label htmlFor="hash-source">输入来源</label>
      <select id="hash-source" aria-label="输入来源" value={sourceKind} disabled={busy} onChange={event => selectSource(event.target.value as 'text' | 'file')}>
        <option value="text">文本</option>
        <option value="file">本地文件</option>
      </select>

      {sourceKind === 'text' ? (
        <><label htmlFor="hash-text">文本内容</label><textarea id="hash-text" aria-label="文本内容" value={text} disabled={busy} onChange={event => { resetForInputChange(); setText(event.target.value); }} /></>
      ) : (
        <><label htmlFor="hash-file">本地文件</label><input id="hash-file" aria-label="本地文件" type="file" onChange={event => selectFile(event.target.files?.[0])} /></>
      )}
      {sourceKind === 'file' && file && <p>{file.name} · {formatBytes(file.size)}</p>}

      <label htmlFor="hash-algorithm">哈希算法</label>
      <select id="hash-algorithm" aria-label="哈希算法" value={algorithm} disabled={busy} onChange={event => { resetForInputChange(); setAlgorithm(event.target.value as HashAlgorithm); }}>
        {HASH_ALGORITHMS.map(definition => <option key={definition.id} value={definition.id}>{definition.label}{definition.legacy ? ' — 仅兼容旧校验，不适用于安全用途' : ''}</option>)}
      </select>
      {selectedAlgorithm.legacy && <p>仅兼容旧校验，不适用于安全用途</p>}

      <label htmlFor="hash-expected">预期校验和</label>
      <input id="hash-expected" aria-label="预期校验和" value={expected} disabled={busy} onChange={event => { resetForInputChange(); setExpected(event.target.value); }} />
      {sourceSize !== undefined && <p aria-label="输入大小">{formatBytes(sourceSize)}</p>}
      <button type="button" onClick={start} disabled={busy}>计算哈希</button>
      {busy && <button type="button" onClick={cancelJob}>取消</button>}
      {progress && busy && <p role="status" aria-live="polite">{formatBytes(progress.completedBytes)} / {formatBytes(progress.totalBytes)}</p>}
      {error && <ErrorView message={error} />}
      {result && <div>
        <code aria-label="哈希结果">{result.digest}</code>
        <button type="button" aria-label="复制哈希结果" onClick={() => void copyResult()}>复制</button>
        {copyStatus && <span role="status" aria-live="polite">{copyStatus}</span>}
        {verdict && <p>{verdict}</p>}
      </div>}
    </section>
  );
}
