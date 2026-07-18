import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { formatNumericDate } from './jwt';
import JwtTool from './JwtTool';

function base64url(value: unknown): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(value))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function token(payload: Record<string, unknown>) {
  return `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url(payload)}.c2ln`;
}

function setClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
}

afterEach(() => vi.unstubAllGlobals());

test('decodes locally with formatted JSON, claims, readable NumericDates, and persistent safety meaning', async () => {
  const user = userEvent.setup();
  const fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
  render(<JwtTool />);

  expect(screen.getByLabelText('页面安全说明')).toHaveTextContent('已解码，未验证签名');
  expect(screen.getByLabelText('页面安全说明')).toHaveTextContent('请勿据此决定访问权限');
  await user.type(screen.getByLabelText('JWT'), token({
    iss: 'https://issuer.example', sub: 'reader-123', aud: ['daily-tools', 'mobile'], exp: 0, nbf: 1, iat: -1,
  }));
  await user.click(screen.getByRole('button', { name: '解码' }));

  expect(screen.getByLabelText('Header JSON')).toHaveTextContent('"alg": "HS256"');
  expect(screen.getByLabelText('Payload JSON')).toHaveTextContent('"sub": "reader-123"');
  expect(screen.getByText('https://issuer.example')).toBeInTheDocument();
  expect(screen.getByText('reader-123')).toBeInTheDocument();
  expect(screen.getByText('daily-tools、mobile')).toBeInTheDocument();
  expect(screen.getByText((_, element) => element?.textContent === `可读时间：${formatNumericDate(0)}`)).toBeInTheDocument();
  expect(screen.getByText((_, element) => element?.textContent === `可读时间：${formatNumericDate(1)}`)).toBeInTheDocument();
  expect(screen.getByText((_, element) => element?.textContent === `可读时间：${formatNumericDate(-1)}`)).toBeInTheDocument();
  const results = screen.getByLabelText('解码结果');
  expect(screen.getByLabelText('页面安全说明')).not.toBe(within(results).getByLabelText('解码结果安全说明'));
  expect(within(results).getByLabelText('解码结果安全说明')).toHaveTextContent('已解码，未验证签名');
  expect(within(results).getByLabelText('解码结果安全说明')).toHaveTextContent('签名尚未验证');
  expect(within(results).getByLabelText('解码结果安全说明')).toHaveTextContent('请勿据此决定访问权限');
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('copies formatted Header and Payload through the shared safe clipboard helper', async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  setClipboard(writeText);
  render(<JwtTool />);
  await user.type(screen.getByLabelText('JWT'), token({ sub: 'reader-123' }));
  await user.click(screen.getByRole('button', { name: '解码' }));

  await user.click(screen.getByRole('button', { name: '复制 Header' }));
  expect(writeText).toHaveBeenLastCalledWith(JSON.stringify({ alg: 'HS256', typ: 'JWT' }, null, 2));
  await user.click(screen.getByRole('button', { name: '复制 Payload' }));
  expect(writeText).toHaveBeenLastCalledWith(JSON.stringify({ sub: 'reader-123' }, null, 2));
});

test('resets copy success state when a new token is decoded', async () => {
  const user = userEvent.setup();
  setClipboard(vi.fn().mockResolvedValue(undefined));
  render(<JwtTool />);
  const input = screen.getByLabelText('JWT');

  await user.type(input, token({ sub: 'token-a' }));
  await user.click(screen.getByRole('button', { name: '解码' }));
  await user.click(screen.getByRole('button', { name: '复制 Header' }));
  expect(screen.getByRole('status')).toHaveTextContent('已复制');

  await user.clear(input);
  await user.type(input, token({ sub: 'token-b' }));
  await user.click(screen.getByRole('button', { name: '解码' }));

  expect(screen.getByLabelText('Payload JSON')).toHaveTextContent('token-b');
  expect(screen.queryByText('已复制')).not.toBeInTheDocument();
});

test('clears stale results when decoding fails', async () => {
  const user = userEvent.setup();
  render(<JwtTool />);
  const input = screen.getByLabelText('JWT');
  await user.type(input, token({ sub: 'reader-123' }));
  await user.click(screen.getByRole('button', { name: '解码' }));
  expect(screen.getByLabelText('Header JSON')).toBeInTheDocument();

  await user.clear(input);
  await user.type(input, 'not-a-jwt');
  await user.click(screen.getByRole('button', { name: '解码' }));

  expect(screen.getByRole('alert')).toHaveTextContent('JWT 必须是三段紧凑 JWS 格式');
  expect(screen.queryByLabelText('Header JSON')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Payload JSON')).not.toBeInTheDocument();
});

test('shows a neutral state when no registered claims are present', async () => {
  const user = userEvent.setup();
  render(<JwtTool />);
  await user.type(screen.getByLabelText('JWT'), token({ custom: 'only' }));
  await user.click(screen.getByRole('button', { name: '解码' }));

  expect(screen.getByText('没有可展示的注册 claims。')).toBeInTheDocument();
});

test('describes an expired exp only as a comparison with the local clock', async () => {
  const user = userEvent.setup();
  render(<JwtTool />);
  await user.type(screen.getByLabelText('JWT'), token({ exp: 0 }));
  await user.click(screen.getByRole('button', { name: '解码' }));

  expect(screen.getByText('时间已过（相对本地时钟）')).toBeInTheDocument();
  expect(screen.getAllByText('已解码，未验证签名')).toHaveLength(2);
  expect(screen.queryByText(/有效|可信|安全|已验证/)).not.toBeInTheDocument();
});

test('reports a clipboard write failure without losing the decoded result', async () => {
  const user = userEvent.setup();
  setClipboard(vi.fn().mockRejectedValue(new Error('denied')));
  render(<JwtTool />);
  await user.type(screen.getByLabelText('JWT'), token({ sub: 'reader-123' }));
  await user.click(screen.getByRole('button', { name: '解码' }));

  await user.click(screen.getByRole('button', { name: '复制 Header' }));

  expect(screen.getByRole('status')).toHaveTextContent('复制失败，请手动复制。');
  expect(screen.getByLabelText('Header JSON')).toBeInTheDocument();
});
