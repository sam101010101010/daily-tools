import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import ToolPage from './pages/ToolPage';

export default function App() {
  return (
    <BrowserRouter>
      <header><h1>Daily Tools</h1></header>
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/tools/:id" element={<ToolPage />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
