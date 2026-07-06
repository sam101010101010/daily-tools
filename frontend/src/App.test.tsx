import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the site header', () => {
  render(<App />);
  expect(screen.getByRole('banner')).toHaveTextContent(/daily tools/i);
});
