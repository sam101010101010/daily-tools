import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ToolMeta } from '../registry/types';
import HomePage from './HomePage';

const stub: ToolMeta[] = [
  { id: 'json', name: 'JSON 工具', description: '格式化', category: '格式化', keywords: ['json'], load: async () => ({ default: () => null }) },
  { id: 'ssl', name: 'SSL 检查', description: '证书', category: '网络', keywords: ['cert'], load: async () => ({ default: () => null }), backend: '/api/java/ssl' },
];

function renderHome() {
  return render(<MemoryRouter><HomePage allTools={stub} /></MemoryRouter>);
}

test('lists all tools and links to their pages', () => {
  renderHome();
  expect(screen.getByRole('link', { name: /JSON 工具/ })).toHaveAttribute('href', '/tools/json');
  expect(screen.getByRole('link', { name: /SSL 检查/ })).toHaveAttribute('href', '/tools/ssl');
});

test('search filters the list', async () => {
  renderHome();
  await userEvent.type(screen.getByRole('searchbox'), 'cert');
  expect(screen.queryByRole('link', { name: /JSON 工具/ })).toBeNull();
  expect(screen.getByRole('link', { name: /SSL 检查/ })).toBeInTheDocument();
});
