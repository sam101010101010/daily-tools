import { useMemo, useState } from 'react';
import { parseJson } from './jsonTool';
import { sortKeys, dedupe } from './transforms';
import { jsonStats } from './stats';
import { queryJsonPath } from './jsonpath';
import JsonTree from './JsonTree';
import JsonTable from './JsonTable';
import DiffView from './DiffView';
import { ErrorView } from '../../components/ErrorView';

type Mode = 'tree' | 'text' | 'table';
const MODE_LABEL: Record<Mode, string> = { tree: '树', text: '文本', table: '表格' };

function btnCls(active: boolean) {
  return `json-workbench__btn${active ? ' is-active' : ''}`;
}

export default function JsonTool() {
  const [input, setInput] = useState('');
  const [inputB, setInputB] = useState('');
  const [mode, setMode] = useState<Mode>('text');
  const [sortOn, setSortOn] = useState(false);
  const [dedupeOn, setDedupeOn] = useState(false);
  const [compact, setCompact] = useState(false);
  const [jsonPath, setJsonPath] = useState('');
  const [diffMode, setDiffMode] = useState(false);

  const parsed = useMemo(() => parseJson(input), [input]);

  const view = useMemo(() => {
    if (parsed.error !== undefined) return { error: parsed.error };
    let v = parsed.value;
    if (sortOn) v = sortKeys(v);
    if (dedupeOn) v = dedupe(v);
    if (jsonPath.trim()) {
      const r = queryJsonPath(v, jsonPath.trim());
      if (!r.ok) return { error: `JSONPath：${r.error}` };
      v = r.matches;
    }
    return { value: v, stats: jsonStats(v) };
  }, [parsed, sortOn, dedupeOn, jsonPath]);

  function renderView() {
    if (view.error !== undefined) return <ErrorView message={view.error} />;
    if (mode === 'text') {
      return (
        <pre aria-label="json 输出" className="json-workbench__pre">
          {JSON.stringify(view.value, null, compact ? 0 : 2)}
        </pre>
      );
    }
    if (mode === 'tree') return <JsonTree key={JSON.stringify(view.value)} value={view.value} />;
    return <JsonTable value={view.value} />;
  }

  function renderDiff() {
    const a = parseJson(input);
    const b = parseJson(inputB);
    if (a.error !== undefined) return <ErrorView message={`输入 A：${a.error}`} />;
    if (b.error !== undefined) return <ErrorView message={`输入 B：${b.error}`} />;
    return <DiffView a={a.value} b={b.value} />;
  }

  return (
    <div className="json-workbench">
      <div className="json-workbench__pane json-workbench__pane--input">
        <label className="json-workbench__label" htmlFor="json-in">{diffMode ? '输入 A' : '输入'}</label>
        <textarea
          id="json-in"
          aria-label="json 输入"
          className="json-workbench__ta"
          value={input}
          spellCheck={false}
          placeholder="在此粘贴 JSON…"
          onChange={(e) => setInput(e.target.value)}
        />
        {diffMode && (
          <>
            <label className="json-workbench__label" htmlFor="json-in-b">输入 B</label>
            <textarea
              id="json-in-b"
              aria-label="json 输入 B"
              className="json-workbench__ta"
              value={inputB}
              spellCheck={false}
              placeholder="粘贴要对比的 JSON…"
              onChange={(e) => setInputB(e.target.value)}
            />
          </>
        )}
      </div>

      <div className="json-workbench__pane json-workbench__pane--output">
        <div className="json-workbench__toolbar">
          {!diffMode && (
            <div className="json-workbench__tabs">
              {(['tree', 'text', 'table'] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  className={`json-workbench__tab${mode === m ? ' is-active' : ''}`}
                  onClick={() => setMode(m)}
                >
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
          )}
          {!diffMode && (
            <>
              <button type="button" aria-pressed={sortOn} className={btnCls(sortOn)} onClick={() => setSortOn((s) => !s)}>排序键</button>
              <button type="button" aria-pressed={dedupeOn} className={btnCls(dedupeOn)} onClick={() => setDedupeOn((s) => !s)}>去重</button>
              {mode === 'text' && (
                <button type="button" aria-pressed={compact} className={btnCls(compact)} onClick={() => setCompact((c) => !c)}>紧凑</button>
              )}
            </>
          )}
          <button
            type="button"
            aria-pressed={diffMode}
            className={`${btnCls(diffMode)} json-workbench__diff-toggle`}
            onClick={() => setDiffMode((d) => !d)}
          >
            Diff
          </button>
        </div>

        {!diffMode && (
          <input
            type="text"
            aria-label="JSONPath"
            className="json-workbench__path"
            placeholder="JSONPath：$.a.b[*]（支持 . [] [*] .. 子集）"
            value={jsonPath}
            onChange={(e) => setJsonPath(e.target.value)}
          />
        )}

        <div className="json-workbench__body">
          {diffMode ? renderDiff() : renderView()}
        </div>

        {!diffMode && view.error === undefined && view.stats && (
          <div className="json-workbench__status">
            ✓ 有效 · {view.stats.nodes} 节点 · 深度 {view.stats.depth}
          </div>
        )}
      </div>
    </div>
  );
}
