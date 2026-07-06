import { useMemo, useState } from 'react';
import { tools as registryTools, searchTools } from '../registry';
import type { ToolMeta } from '../registry/types';
import { SearchBar } from '../components/SearchBar';
import { ToolCard } from '../components/ToolCard';

export default function HomePage({ allTools = registryTools }: { allTools?: ToolMeta[] }) {
  const [query, setQuery] = useState('');
  const shown = useMemo(() => searchTools(allTools, query), [allTools, query]);
  return (
    <section>
      <SearchBar value={query} onChange={setQuery} />
      <div className="tool-grid">
        {shown.map(t => <ToolCard key={t.id} tool={t} />)}
      </div>
      {shown.length === 0 && <p>没有匹配的工具</p>}
    </section>
  );
}
