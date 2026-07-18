import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { test, expect } from 'vitest';
import CryptoToolView from './CryptoToolView';

test('pre-fills a safe Base64 example', () => {
  render(<CryptoToolView />);
  expect(screen.getByLabelText('输入')).toHaveValue('Hello, Daily Tools!');
});

test('base64 protocol encodes the input', async () => {
  render(<CryptoToolView />);
  await userEvent.clear(screen.getByLabelText('输入'));
  await userEvent.type(screen.getByLabelText('输入'), 'hi');
  await userEvent.click(screen.getByRole('button', { name: '编码' }));
  expect(screen.getByLabelText('输出')).toHaveTextContent('aGk='); // btoa('hi')
});

test('switching to an AES protocol hides the encoding controls', async () => {
  render(<CryptoToolView />);
  expect(screen.getByRole('button', { name: '编码' })).toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText('协议'), 'AES-CBC');
  expect(screen.queryByRole('button', { name: '编码' })).not.toBeInTheDocument();
});

test('invalid hex decode shows an error', async () => {
  render(<CryptoToolView />);
  await userEvent.selectOptions(screen.getByLabelText('协议'), 'hex');
  await userEvent.clear(screen.getByLabelText('输入'));
  await userEvent.type(screen.getByLabelText('输入'), 'zz');
  await userEvent.click(screen.getByRole('button', { name: '解码' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('不是合法的 Hex 输入');
});
