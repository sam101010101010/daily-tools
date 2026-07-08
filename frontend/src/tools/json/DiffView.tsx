import { diffJson } from './diff';

const MARK: Record<string, string> = { add: '+', del: '−', change: '~' };

/** Render the structural diff of two already-parsed JSON values. */
export default function DiffView({ a, b }: { a: unknown; b: unknown }) {
  const entries = diffJson(a, b);
  if (entries.length === 0) return <p className="diff-view__empty">两侧 JSON 相同。</p>;

  return (
    <ul className="diff-view">
      {entries.map((e) => (
        <li key={e.path} className={`diff-line diff-line--${e.kind}`}>
          <span className="diff-line__mark">{MARK[e.kind]}</span>
          <span className="diff-line__path">{e.path}</span>
          <span className="diff-line__val">
            {e.kind === 'change'
              ? `${JSON.stringify(e.before)} → ${JSON.stringify(e.after)}`
              : e.kind === 'add'
                ? JSON.stringify(e.after)
                : JSON.stringify(e.before)}
          </span>
        </li>
      ))}
    </ul>
  );
}
