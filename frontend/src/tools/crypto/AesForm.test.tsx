import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, afterEach, test, expect } from 'vitest';
import { callTool } from '../../lib/api';
import AesForm from './AesForm';

vi.mock('../../lib/api', () => ({
  callTool: vi.fn(async () => ({ ok: true, data: { output: 'Q0lQSEVS', iv: 'aabbccdd' } })),
}));

afterEach(() => vi.clearAllMocks());

test('CBC encrypt shows the returned ciphertext', async () => {
  render(<AesForm mode="CBC" />);
  await userEvent.type(screen.getByLabelText('密钥'), '0123456789abcdef');
  await userEvent.type(screen.getByLabelText('IV'), '00112233445566778899aabbccddeeff');
  await userEvent.type(screen.getByLabelText('输入'), 'secret');
  await userEvent.click(screen.getByRole('button', { name: '加密' }));
  expect(await screen.findByLabelText('输出')).toHaveTextContent('Q0lQSEVS');
});

test('a failure envelope renders the error', async () => {
  vi.mocked(callTool).mockResolvedValueOnce({
    ok: false, error: { code: 'DECRYPT_FAILED', message: '解密失败：密钥、IV 或密文不匹配' },
  });
  render(<AesForm mode="CBC" />);
  await userEvent.type(screen.getByLabelText('密钥'), 'x');
  await userEvent.type(screen.getByLabelText('输入'), 'y');
  await userEvent.click(screen.getByRole('button', { name: '解密' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('DECRYPT_FAILED');
});

test('ECB mode hides the IV row', () => {
  render(<AesForm mode="ECB" />);
  expect(screen.queryByLabelText('IV')).not.toBeInTheDocument();
});

test('generate-random-IV fills the IV field', async () => {
  render(<AesForm mode="CBC" />);
  expect(screen.getByLabelText('IV')).toHaveValue('');
  await userEvent.click(screen.getByRole('button', { name: /生成随机 IV/ }));
  expect(screen.getByLabelText('IV')).not.toHaveValue('');
});

test('choosing password-hash key source reveals the hash algorithm select', async () => {
  render(<AesForm mode="CBC" />);
  expect(screen.queryByLabelText('哈希算法')).not.toBeInTheDocument();
  await userEvent.selectOptions(screen.getByLabelText('密钥来源'), 'hash');
  expect(screen.getByLabelText('哈希算法')).toBeInTheDocument();
});

test('typing a preset name enters preset mode and submits a passphrase-free request', async () => {
  render(<AesForm mode="CBC" />);
  await userEvent.type(screen.getByLabelText('密钥'), 'tapdata');
  expect(screen.getByText(/已套用 tapdata 预设/)).toBeInTheDocument();
  expect(screen.getByLabelText('填充')).toBeDisabled(); // preset locks the scheme
  await userEvent.type(screen.getByLabelText('输入'), 'root123');
  await userEvent.click(screen.getByRole('button', { name: '加密' }));
  const body = vi.mocked(callTool).mock.calls[0][1] as Record<string, unknown>;
  expect(body).toMatchObject({ op: 'encrypt', keySource: 'preset', preset: 'tapdata' });
  expect(body.key).toBeUndefined();       // the passphrase is never sent
  expect(body.mode).toBeUndefined();       // backend derives mode/padding from the preset
});

test('preset mode omits encoding overrides so the backend applies per-op legacy-hex defaults', async () => {
  render(<AesForm mode="ECB" />);
  await userEvent.type(screen.getByLabelText('密钥'), 'tapdata');
  await userEvent.type(screen.getByLabelText('输入'), '414932aaef43ec67ab32846f090bc033');
  await userEvent.click(screen.getByRole('button', { name: '解密' }));
  const body = vi.mocked(callTool).mock.calls[0][1] as Record<string, unknown>;
  expect(body).toMatchObject({ op: 'decrypt', keySource: 'preset', preset: 'tapdata' });
  expect(body.inputEnc).toBeUndefined();   // decrypt defaults to hex-in on the backend
  expect(body.outputEnc).toBeUndefined();  // ...and utf8-out — one-click, no manual toggling
});

test('preset mode hides the input/output encoding selects', async () => {
  render(<AesForm mode="ECB" />);
  expect(screen.getByLabelText('输入编码')).toBeInTheDocument();
  await userEvent.type(screen.getByLabelText('密钥'), 'tapdata');
  expect(screen.queryByLabelText('输入编码')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('输出编码')).not.toBeInTheDocument();
});

test('changing the key away from a preset name exits preset mode', async () => {
  render(<AesForm mode="CBC" />);
  await userEvent.type(screen.getByLabelText('密钥'), 'tapdata');
  expect(screen.getByText(/已套用 tapdata 预设/)).toBeInTheDocument();
  await userEvent.clear(screen.getByLabelText('密钥'));
  await userEvent.type(screen.getByLabelText('密钥'), 'abc');
  expect(screen.queryByText(/已套用 tapdata 预设/)).not.toBeInTheDocument();
  expect(screen.getByLabelText('填充')).not.toBeDisabled(); // scheme selectable again
});
