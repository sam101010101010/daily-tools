import { BrowserRouter, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';

function Placeholder({ label }: { label: string }) {
  return <p>{label}</p>;
}

export default function App() {
  return (
    <BrowserRouter>
      <header><h1>Daily Tools</h1></header>
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/tools/:id" element={<Placeholder label="tool" />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
