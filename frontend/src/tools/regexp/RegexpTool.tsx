import { useEffect, useRef, useState } from 'react';
import { ErrorView } from '../../components/ErrorView';
import { copyText } from '../../lib/copy';
import {
  DEFAULT_REGEXP_REQUEST,
  REGEXP_FLAGS,
  type RegexMatch,
  type RegexRequest,
} from './regexp';
import type { RegexWorkerResult } from './regexp.worker';
import { startRegexJob } from './regexpWorkerClient';

const DEBOUNCE_MS = 250;

const FLAG_LABELS: Record<(typeof REGEXP_FLAGS)[number], string> = {
  g: '全局',
  i: '忽略大小写',
  m: '多行',
  s: '点号匹配换行',
  u: 'Unicode',
};

function HighlightedText({ text, matches }: { text: string; matches: RegexMatch[] }) {
  const parts: React.ReactNode[] = [];
  let cursor = 0;

  matches.forEach((match, index) => {
    const start = Math.max(0, Math.min(text.length, match.index));
    const end = Math.max(start, Math.min(text.length, start + match.text.length));
    if (start < cursor || end === start) return;
    if (start > cursor) parts.push(text.slice(cursor, start));
    parts.push(<mark key={`${start}-${end}-${index}`}>{text.slice(start, end)}</mark>);
    cursor = end;
  });

  if (cursor < text.length) parts.push(text.slice(cursor));
  return <pre className="regexp__highlight" aria-label="匹配高亮">{parts}</pre>;
}

function CaptureValue({ value }: { value: string | null }) {
  return <code>{value === null ? '未参与匹配' : value === '' ? '（空字符串）' : value}</code>;
}

function MatchDetails({ matches }: { matches: RegexMatch[] }) {
  return (
    <ol className="regexp__matches" aria-label="匹配详情">
      {matches.map((match, matchIndex) => (
        <li key={`${match.index}-${matchIndex}`} className="regexp__match">
          <p>完整匹配：<code>{match.text === '' ? '（空匹配）' : match.text}</code></p>
          <p>索引：{match.index}</p>
          {match.captures.length > 0 ? (
            <dl>
              {match.captures.map((capture, captureIndex) => (
                <div key={captureIndex}>
                  <dt>捕获组 {captureIndex + 1}</dt>
                  <dd><CaptureValue value={capture} /></dd>
                </div>
              ))}
            </dl>
          ) : <p>编号捕获组：无</p>}
          {Object.keys(match.namedCaptures).length > 0 ? (
            <dl>
              {Object.entries(match.namedCaptures).map(([name, capture]) => (
                <div key={name}>
                  <dt>命名组 {name}</dt>
                  <dd><CaptureValue value={capture} /></dd>
                </div>
              ))}
            </dl>
          ) : <p>命名捕获组：无</p>}
        </li>
      ))}
    </ol>
  );
}

function formatMatches(matches: RegexMatch[]): string {
  return matches.map((match, index) => {
    const numbered = match.captures.map(
      (capture, captureIndex) => `捕获组 ${captureIndex + 1}：${capture ?? '未参与匹配'}`,
    );
    const named = Object.entries(match.namedCaptures).map(
      ([name, capture]) => `命名组 ${name}：${capture ?? '未参与匹配'}`,
    );
    return [
      `匹配 ${index + 1}：${match.text}（索引 ${match.index}）`,
      ...numbered,
      ...named,
    ].join('\n');
  }).join('\n\n');
}

export default function RegexpTool() {
  const [pattern, setPattern] = useState(DEFAULT_REGEXP_REQUEST.pattern);
  const [flags, setFlags] = useState(DEFAULT_REGEXP_REQUEST.flags);
  const [text, setText] = useState(DEFAULT_REGEXP_REQUEST.text);
  const [replacement, setReplacement] = useState(DEFAULT_REGEXP_REQUEST.replacement);
  const [result, setResult] = useState<RegexWorkerResult>();
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const versionRef = useRef(0);

  useEffect(() => {
    const request: RegexRequest = { pattern, flags, text, replacement };
    const version = ++versionRef.current;
    let active = true;
    let cancel: () => void = () => undefined;

    setResult(undefined);
    setError('');
    setRunning(false);
    setCopyStatus('');

    const debounceId = setTimeout(() => {
      if (!active) return;
      setRunning(true);
      cancel = startRegexJob(request, {
        onResult: nextResult => {
          if (!active) return;
          setRunning(false);
          if (nextResult.evaluation.kind === 'syntax-error') {
            setResult(undefined);
            setError(nextResult.evaluation.error);
            return;
          }
          setError('');
          setResult(nextResult);
        },
        onError: message => {
          if (!active) return;
          setRunning(false);
          setResult(undefined);
          setError(message);
        },
      });
    }, DEBOUNCE_MS);

    return () => {
      active = false;
      versionRef.current = Math.max(versionRef.current, version + 1);
      clearTimeout(debounceId);
      cancel();
    };
  }, [flags, pattern, replacement, text]);

  function toggleFlag(flag: (typeof REGEXP_FLAGS)[number]) {
    setFlags(currentFlags => REGEXP_FLAGS
      .filter(candidate => candidate === flag
        ? !currentFlags.includes(candidate)
        : currentFlags.includes(candidate))
      .join(''));
  }

  async function copyMatches() {
    if (!result || result.evaluation.kind === 'no-match' || result.evaluation.kind === 'syntax-error') {
      return;
    }
    const version = versionRef.current;
    const copied = await copyText(formatMatches(result.evaluation.matches));
    if (versionRef.current !== version) return;
    setCopyStatus(copied.ok ? '匹配结果已复制' : copied.message);
  }

  async function copyReplacementPreview() {
    if (result?.replacementPreview?.kind !== 'preview') return;
    const version = versionRef.current;
    const copied = await copyText(result.replacementPreview.value);
    if (versionRef.current !== version) return;
    setCopyStatus(copied.ok ? '替换预览已复制' : copied.message);
  }

  const evaluation = result?.evaluation;
  const matches = evaluation && evaluation.kind !== 'syntax-error'
    ? evaluation.matches
    : [];
  const hasMatches = evaluation?.kind === 'success' || evaluation?.kind === 'limit-reached';
  const replacementPreview = result?.replacementPreview?.kind === 'preview'
    ? result.replacementPreview.value
    : undefined;

  return (
    <section className="regexp">
      <p className="regexp__engine">
        使用浏览器内置 JavaScript RegExp；模式不含 <code>/</code> 分隔符，不支持 PCRE 或 Python 方言。
      </p>

      <div className="regexp__field">
        <label htmlFor="regexp-pattern">正则表达式</label>
        <input
          id="regexp-pattern"
          value={pattern}
          spellCheck={false}
          onChange={event => setPattern(event.target.value)}
        />
      </div>

      <fieldset className="regexp__flags">
        <legend>Flags</legend>
        {REGEXP_FLAGS.map(flag => (
          <label key={flag} title={FLAG_LABELS[flag]}>
            <input
              type="checkbox"
              aria-label={flag}
              checked={flags.includes(flag)}
              onChange={() => toggleFlag(flag)}
            />
            <code>{flag}</code>
            <span>{FLAG_LABELS[flag]}</span>
          </label>
        ))}
      </fieldset>

      <div className="regexp__field">
        <label htmlFor="regexp-text">测试文本</label>
        <textarea
          id="regexp-text"
          value={text}
          spellCheck={false}
          onChange={event => setText(event.target.value)}
        />
      </div>

      <div className="regexp__field">
        <label htmlFor="regexp-replacement">替换模板</label>
        <input
          id="regexp-replacement"
          value={replacement}
          spellCheck={false}
          onChange={event => setReplacement(event.target.value)}
        />
      </div>

      {running && <p role="status" aria-live="polite">正在运行</p>}
      {error && <ErrorView message={error} />}

      {evaluation?.kind === 'no-match' && <p className="regexp__empty">未找到匹配</p>}
      {hasMatches && (
        <section className="regexp__results">
          <header>
            <p>找到 {matches.length} 个匹配</p>
            <button type="button" onClick={() => void copyMatches()}>复制匹配结果</button>
          </header>
          {evaluation.kind === 'limit-reached' && (
            <p className="regexp__truncated">结果已截断，仅显示前 500 个匹配</p>
          )}
          <HighlightedText text={text} matches={matches} />
          <MatchDetails matches={matches} />
        </section>
      )}

      {replacementPreview !== undefined && (
        <section className="regexp__replacement">
          <h3>JavaScript 替换预览</h3>
          <pre aria-label="JavaScript 替换预览">{replacementPreview}</pre>
          <button type="button" onClick={() => void copyReplacementPreview()}>复制替换预览</button>
        </section>
      )}

      {copyStatus && <p role="status" aria-live="polite">{copyStatus}</p>}
    </section>
  );
}
