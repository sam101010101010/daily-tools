import type { ComponentType } from 'react';

export interface ToolMeta {
  id: string;
  name: string;
  description: string;
  category: string;
  keywords: string[];
  icon?: string;
  load: () => Promise<{ default: ComponentType }>;
  backend?: string; // e.g. '/api/java/ssl'; omit for pure-frontend tools
}
