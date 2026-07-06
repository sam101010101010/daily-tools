import { Suspense, lazy, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getTool } from '../registry';
import { ErrorView } from '../components/ErrorView';

export default function ToolPage() {
  const { id = '' } = useParams();
  const tool = getTool(id);
  const Lazy = useMemo(() => (tool ? lazy(tool.load) : null), [tool]);
  if (!tool || !Lazy) return <ErrorView message="工具不存在" />;
  return (
    <section>
      <p><Link to="/">← 返回</Link></p>
      <h2>{tool.name}</h2>
      <Suspense fallback={<p>加载中…</p>}><Lazy /></Suspense>
    </section>
  );
}
