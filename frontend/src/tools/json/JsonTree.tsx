import { useState } from 'react';
import { jsonTypeOf } from './stats';

function collectContainers(v: unknown, path: string, acc: string[]): void {
  if (Array.isArray(v)) {
    acc.push(path);
    v.forEach((el, i) => collectContainers(el, `${path}[${i}]`, acc));
  } else if (v && typeof v === 'object') {
    acc.push(path);
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) collectContainers(val, `${path}.${k}`, acc);
  }
}

function Scalar({ value }: { value: unknown }) {
  const type = jsonTypeOf(value);
  const text = type === 'string' ? JSON.stringify(value) : String(value);
  return <span className={`json-tree__${type}`}>{text}</span>;
}

interface RowProps {
  label?: string;
  labelClass?: string;
  value: unknown;
  path: string;
  open: Set<string>;
  toggle: (p: string) => void;
}

function Row({ label, labelClass, value, path, open, toggle }: RowProps) {
  const type = jsonTypeOf(value);
  const isContainer = type === 'object' || type === 'array';
  const keyEl = label !== undefined
    ? (<><span className={labelClass}>{label}</span><span className="json-tree__punct">: </span></>)
    : null;

  if (!isContainer) {
    return <li className="json-tree__leaf">{keyEl}<Scalar value={value} /></li>;
  }

  const isArray = Array.isArray(value);
  const entries: Array<[string, unknown, string, string]> = isArray
    ? (value as unknown[]).map((v, i) => [String(i), v, `${path}[${i}]`, 'json-tree__index'] as [string, unknown, string, string])
    : Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, v, `${path}.${k}`, 'json-tree__key'] as [string, unknown, string, string]);
  const openB = isArray ? '[' : '{';
  const closeB = isArray ? ']' : '}';
  const isOpen = open.has(path);

  return (
    <li className="json-tree__branch">
      <span
        className="json-tree__toggle"
        role="button"
        tabIndex={0}
        aria-expanded={isOpen}
        onClick={() => toggle(path)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(path); } }}
      >
        <span className="json-tree__caret">{isOpen ? '▾' : '▸'}</span>
        {keyEl}
        <span className="json-tree__punct">{openB}{isOpen ? '' : ` … ${entries.length} ${closeB}`}</span>
      </span>
      {isOpen && (
        <ul>
          {entries.map(([k, v, p, cls]) => (
            <Row key={p} label={k} labelClass={cls} value={v} path={p} open={open} toggle={toggle} />
          ))}
        </ul>
      )}
      {isOpen && <span className="json-tree__punct json-tree__close">{closeB}</span>}
    </li>
  );
}

export default function JsonTree({ value }: { value: unknown }) {
  const [open, setOpen] = useState<Set<string>>(() => {
    const acc: string[] = [];
    collectContainers(value, '$', acc);
    return new Set(acc);
  });

  const toggle = (p: string) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(p)) next.delete(p); else next.add(p);
    return next;
  });
  const expandAll = () => {
    const acc: string[] = [];
    collectContainers(value, '$', acc);
    setOpen(new Set(acc));
  };
  const collapseAll = () => setOpen(new Set(['$']));

  return (
    <div className="json-tree">
      <div className="json-tree__controls">
        <button type="button" className="json-tree__ctl" onClick={expandAll}>展开全部</button>
        <button type="button" className="json-tree__ctl" onClick={collapseAll}>折叠全部</button>
      </div>
      <ul className="json-tree__root">
        <Row value={value} path="$" open={open} toggle={toggle} />
      </ul>
    </div>
  );
}
