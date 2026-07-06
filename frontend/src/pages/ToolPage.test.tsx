import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import ToolPage from './ToolPage';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes><Route path="/tools/:id" element={<ToolPage />} /></Routes>
    </MemoryRouter>,
  );
}

test('unknown tool id shows a not-found message', () => {
  renderAt('/tools/nope');
  expect(screen.getByText(/工具不存在/)).toBeInTheDocument();
});

test('renders a known tool lazily', async () => {
  renderAt('/tools/json');
  expect(await screen.findByText(/JSON/i)).toBeInTheDocument();
});
