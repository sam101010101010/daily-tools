function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function cell(v: unknown): string {
  if (v === undefined) return '';
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Render an array of objects as a table (union of keys as columns).
 *  Anything else falls back to a hint pointing at the tree/text views. */
export default function JsonTable({ value }: { value: unknown }) {
  const tabular = Array.isArray(value) && value.length > 0 && value.every(isPlainObject);
  if (!tabular) {
    return <p className="json-table__fallback">当前数据不是对象数组，改用「树」或「文本」视图查看。</p>;
  }

  const rows = value as Array<Record<string, unknown>>;
  const cols: string[] = [];
  for (const row of rows) for (const k of Object.keys(row)) if (!cols.includes(k)) cols.push(k);

  return (
    <table className="json-table">
      <thead>
        <tr>{cols.map((c) => <th key={c}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>{cols.map((c) => <td key={c}>{cell(row[c])}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}
