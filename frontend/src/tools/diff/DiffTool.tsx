import { Fragment, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { ErrorView } from '../../components/ErrorView';
import { copyText } from '../../lib/copy';
import type { DiffJob } from './diffWorkerClient';
import type { DiffHunk, DiffResult, DiffRow, InlineSegment } from './diff';
import { startDiffJob } from './diffWorkerClient';

const DEFAULT_LEFT = 'Hello\nworld';
const DEFAULT_RIGHT = 'Hello\nCodex';

type ViewMode = 'unified' | 'split';
type Side = 'left' | 'right';

type RowGroup = Readonly<{
  start: number;
  rows: readonly DiffRow[];
  collapsed: boolean;
}>;

function groupRows(rows: readonly DiffRow[], hunks: readonly DiffHunk[]): RowGroup[] {
  const groups: RowGroup[] = [];
  const visibleRows = new Uint8Array(rows.length);
  hunks.forEach(hunk => {
    visibleRows.fill(1, hunk.rowStart, hunk.rowEnd);
  });
  let index = 0;

  while (index < rows.length) {
    const start = index;
    const isCollapsedContext = (rowIndex: number) => rows[rowIndex].kind === 'equal'
      && visibleRows[rowIndex] === 0;
    if (isCollapsedContext(index)) {
      while (index < rows.length && isCollapsedContext(index)) index += 1;
      groups.push({ start, rows: rows.slice(start, index), collapsed: true });
    } else {
      index += 1;
      groups.push({ start, rows: rows.slice(start, index), collapsed: false });
    }
  }

  return groups;
}

function InlineText({ segments, text }: {
  segments: readonly InlineSegment[] | undefined;
  text: string;
}) {
  if (!segments) return <>{text}</>;

  return <>{segments.map((segment, index) => (
    segment.kind === 'equal'
      ? <Fragment key={index}>{segment.text}</Fragment>
      : <mark key={index} className={`diff__inline diff__inline--${segment.kind}`}>{segment.text}</mark>
  ))}</>;
}

function Marker({ kind }: { kind: 'equal' | 'insert' | 'delete' | 'none' }) {
  const definition = {
    equal: { label: '未更改行', symbol: '·' },
    insert: { label: '新增行', symbol: '+' },
    delete: { label: '删除行', symbol: '−' },
    none: { label: '无对应行', symbol: '·' },
  }[kind];

  return <span className={`diff__marker diff__marker--${kind}`} aria-label={definition.label}>{definition.symbol}</span>;
}

function LineNumber({ number, side }: { number: number | null; side: Side }) {
  const sideLabel = side === 'left' ? '原始文本' : '修改后文本';
  return (
    <span
      className="diff__line-number"
      aria-label={number === null ? `${sideLabel}无对应行` : `${sideLabel}第 ${number} 行`}
    >
      {number ?? '—'}
    </span>
  );
}

function UnifiedLine({
  leftLineNumber,
  marker,
  rightLineNumber,
  segments,
  text,
}: {
  leftLineNumber: number | null;
  marker: 'equal' | 'insert' | 'delete';
  rightLineNumber: number | null;
  segments?: readonly InlineSegment[];
  text: string;
}) {
  return (
    <li className={`diff__row diff__row--${marker}`}>
      <Marker kind={marker} />
      <LineNumber number={leftLineNumber} side="left" />
      <LineNumber number={rightLineNumber} side="right" />
      <code className="diff__text" aria-label={text}><InlineText segments={segments} text={text} /></code>
    </li>
  );
}

function UnifiedRow({ row }: { row: DiffRow }) {
  if (row.kind === 'replace') {
    return (
      <>
        <UnifiedLine
          leftLineNumber={row.leftLineNumber}
          marker="delete"
          rightLineNumber={null}
          segments={row.inline?.left}
          text={row.leftText ?? ''}
        />
        <UnifiedLine
          leftLineNumber={null}
          marker="insert"
          rightLineNumber={row.rightLineNumber}
          segments={row.inline?.right}
          text={row.rightText ?? ''}
        />
      </>
    );
  }

  if (row.kind === 'insert') {
    return <UnifiedLine leftLineNumber={null} marker="insert" rightLineNumber={row.rightLineNumber} text={row.rightText ?? ''} />;
  }
  if (row.kind === 'delete') {
    return <UnifiedLine leftLineNumber={row.leftLineNumber} marker="delete" rightLineNumber={null} text={row.leftText ?? ''} />;
  }
  return <UnifiedLine leftLineNumber={row.leftLineNumber} marker="equal" rightLineNumber={row.rightLineNumber} text={row.leftText ?? ''} />;
}

function markerForSplit(row: DiffRow, side: Side): 'equal' | 'insert' | 'delete' | 'none' {
  if (side === 'left') {
    if (row.leftText === null) return 'none';
    return row.kind === 'equal' ? 'equal' : 'delete';
  }
  if (row.rightText === null) return 'none';
  return row.kind === 'equal' ? 'equal' : 'insert';
}

function SplitSide({ row, side }: { row: DiffRow; side: Side }) {
  const lineNumber = side === 'left' ? row.leftLineNumber : row.rightLineNumber;
  const text = side === 'left' ? row.leftText : row.rightText;
  const segments = side === 'left' ? row.inline?.left : row.inline?.right;
  const marker = markerForSplit(row, side);

  return (
    <div className={`diff__side diff__side--${side}`}>
      <Marker kind={marker} />
      <LineNumber number={lineNumber} side={side} />
      <code className="diff__text" aria-label={text ?? '无对应文本'}>
        {text === null ? '—' : <InlineText segments={segments} text={text} />}
      </code>
    </div>
  );
}

function SplitRow({ row }: { row: DiffRow }) {
  return (
    <li className={`diff__row diff__row--${row.kind}`}>
      <SplitSide row={row} side="left" />
      <SplitSide row={row} side="right" />
    </li>
  );
}

function CollapsedContext({ children, count }: { children: ReactNode; count: number }) {
  return (
    <li className="diff__context">
      <details>
        <summary>显示 {count} 行未更改内容</summary>
        <ol className="diff__context-rows">{children}</ol>
      </details>
    </li>
  );
}

function UnifiedView({ result }: { result: DiffResult }) {
  return (
    <ol className="diff__rows diff__rows--unified" aria-label="统一差异">
      {groupRows(result.rows, result.hunks).map(group => group.collapsed ? (
        <CollapsedContext key={group.start} count={group.rows.length}>
          {group.rows.map((row, index) => <UnifiedRow key={group.start + index} row={row} />)}
        </CollapsedContext>
      ) : (
        <UnifiedRow key={group.start} row={group.rows[0]} />
      ))}
    </ol>
  );
}

function SplitView({ result }: { result: DiffResult }) {
  return (
    <div className="diff__split">
      <div className="diff__split-headings" aria-hidden="true">
        <span>原始文本</span>
        <span>修改后文本</span>
      </div>
      <ol className="diff__rows diff__rows--split" aria-label="并排差异">
        {groupRows(result.rows, result.hunks).map(group => group.collapsed ? (
          <CollapsedContext key={group.start} count={group.rows.length}>
            {group.rows.map((row, index) => <SplitRow key={group.start + index} row={row} />)}
          </CollapsedContext>
        ) : (
          <SplitRow key={group.start} row={group.rows[0]} />
        ))}
      </ol>
    </div>
  );
}

function DiffSummary({ result }: { result: DiffResult }) {
  const { summary } = result;
  return (
    <dl className="diff__summary" aria-label="差异摘要">
      <div><dt>新增</dt><dd>{summary.added}</dd></div>
      <div><dt>删除</dt><dd>{summary.deleted}</dd></div>
      <div><dt>修改</dt><dd>{summary.changed}</dd></div>
      <div><dt>未更改</dt><dd>{summary.unchanged}</dd></div>
    </dl>
  );
}

export default function DiffTool() {
  const [left, setLeft] = useState(DEFAULT_LEFT);
  const [right, setRight] = useState(DEFAULT_RIGHT);
  const [ignoreLineEndingStyle, setIgnoreLineEndingStyle] = useState(false);
  const [ignoreTrailingWhitespace, setIgnoreTrailingWhitespace] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('unified');
  const [result, setResult] = useState<DiffResult>();
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const cancelRef = useRef<DiffJob | undefined>(undefined);
  const versionRef = useRef(0);

  function invalidateComparison() {
    versionRef.current += 1;
    cancelRef.current?.cancel();
    cancelRef.current = undefined;
    setRunning(false);
    setResult(undefined);
    setError('');
    setCopyStatus('');
  }

  useEffect(() => () => {
    versionRef.current += 1;
    cancelRef.current?.cancel();
    cancelRef.current = undefined;
  }, []);

  function compare() {
    invalidateComparison();
    const version = versionRef.current;
    let settled = false;
    setRunning(true);

    const job = startDiffJob(
      {
        left,
        right,
        options: { ignoreLineEndingStyle, ignoreTrailingWhitespace },
      },
      {
        onResult: nextResult => {
          if (settled || versionRef.current !== version) return;
          settled = true;
          cancelRef.current = undefined;
          setRunning(false);
          setError('');
          setResult(nextResult);
        },
        onError: message => {
          if (settled || versionRef.current !== version) return;
          settled = true;
          cancelRef.current = undefined;
          setRunning(false);
          setResult(undefined);
          setError(message);
        },
      },
    );

    if (!settled && versionRef.current === version) cancelRef.current = job;
  }

  function cancelComparison() {
    versionRef.current += 1;
    cancelRef.current?.cancel();
    cancelRef.current = undefined;
    setRunning(false);
  }

  function swapSources() {
    invalidateComparison();
    setLeft(right);
    setRight(left);
  }

  async function copyUnifiedText() {
    if (!result) return;
    const version = versionRef.current;
    const copied = await copyText(result.unifiedText);
    if (versionRef.current !== version) return;
    setCopyStatus(copied.ok ? '统一差异已复制' : copied.message);
  }

  return (
    <section className="diff">
      <div className="diff__inputs">
        <div className="diff__field">
          <label htmlFor="diff-left">原始文本</label>
          <textarea
            id="diff-left"
            value={left}
            spellCheck={false}
            onChange={event => {
              invalidateComparison();
              setLeft(event.target.value);
            }}
          />
        </div>
        <div className="diff__field">
          <label htmlFor="diff-right">修改后文本</label>
          <textarea
            id="diff-right"
            value={right}
            spellCheck={false}
            onChange={event => {
              invalidateComparison();
              setRight(event.target.value);
            }}
          />
        </div>
      </div>

      <div className="diff__source-actions">
        <button type="button" onClick={swapSources}>交换两侧</button>
      </div>

      <fieldset className="diff__options">
        <legend>比较选项</legend>
        <label>
          <input
            type="checkbox"
            checked={ignoreLineEndingStyle}
            onChange={event => {
              invalidateComparison();
              setIgnoreLineEndingStyle(event.target.checked);
            }}
          />
          忽略换行符样式
        </label>
        <label>
          <input
            type="checkbox"
            checked={ignoreTrailingWhitespace}
            onChange={event => {
              invalidateComparison();
              setIgnoreTrailingWhitespace(event.target.checked);
            }}
          />
          忽略行尾空白
        </label>
      </fieldset>

      <div className="diff__actions">
        <button type="button" disabled={running} onClick={compare}>比较文本</button>
        {running && <button type="button" onClick={cancelComparison}>取消比较</button>}
      </div>

      {error && <ErrorView message={error} />}

      {result && (
        <section className="diff__result">
          <header className="diff__result-header">
            <DiffSummary result={result} />
            <button type="button" onClick={() => void copyUnifiedText()}>复制统一差异</button>
          </header>

          <fieldset className="diff__view-switch">
            <legend>显示方式</legend>
            <label>
              <input
                type="radio"
                name="diff-view"
                checked={viewMode === 'unified'}
                onChange={() => setViewMode('unified')}
              />
              统一视图
            </label>
            <label>
              <input
                type="radio"
                name="diff-view"
                checked={viewMode === 'split'}
                onChange={() => setViewMode('split')}
              />
              并排视图
            </label>
          </fieldset>

          {viewMode === 'unified'
            ? <UnifiedView result={result} />
            : <SplitView result={result} />}
        </section>
      )}

      {(running || copyStatus) && (
        <p className="diff__status" role="status" aria-live="polite">
          {running ? '正在比较文本' : copyStatus}
        </p>
      )}
    </section>
  );
}
