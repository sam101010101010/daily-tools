import { Link } from 'react-router-dom';
import type { ToolMeta } from '../registry/types';

export function ToolCard({ tool }: { tool: ToolMeta }) {
  return (
    <Link to={`/tools/${tool.id}`} className="tool-card">
      <h3>{tool.icon ? `${tool.icon} ` : ''}{tool.name}</h3>
      <p>{tool.description}</p>
      <span className="tool-card__cat">{tool.category}</span>
    </Link>
  );
}
