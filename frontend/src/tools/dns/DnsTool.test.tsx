import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, afterEach, test, expect } from 'vitest';
import { callTool } from '../../lib/api';
import DnsTool from './DnsTool';

vi.mock('../../lib/api', () => ({ callTool: vi.fn() }));
const mockedCallTool = vi.mocked(callTool);

afterEach(() => vi.clearAllMocks());

function record(over: Record<string, unknown> = {}) {
  return {
    name: 'example.com.', type: 'MX', recordClass: 'IN', ttl: 300,
    value: '10 mail.example.com.',
    fields: { preference: '10', exchange: 'mail.example.com.' },
    ...over,
  };
}

function query(over: Record<string, unknown> = {}) {
  return {
    queryName: 'example.com.', type: 'MX', elapsedMs: 18, rcode: 'NOERROR',
    flags: { authoritative: false, truncated: false, recursionDesired: true, recursionAvailable: true, authenticatedData: false },
    error: null,
    answer: [record()],
    authority: [record({ type: 'NS', value: 'ns1.example.com.', fields: { target: 'ns1.example.com.' } })],
    additional: [record({ name: 'ns1.example.com.', type: 'A', value: '192.0.2.53', fields: { address: '192.0.2.53' } })],
    ...over,
  };
}

function report(over: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    data: {
      input: 'example.com', resolver: 'system', elapsedMs: 66,
      queryCount: 12, respondedQueryCount: 12, queries: [query()],
      ...over,
    },
  };
}

async function runQuery(domain = 'example.com') {
  render(<DnsTool />);
  await userEvent.type(screen.getByLabelText(/domain/i), domain);
  await userEvent.click(screen.getByRole('button', { name: /查询/ }));
}

test('defaults to the server system resolver and sends the chosen Cloudflare resolver', async () => {
  mockedCallTool.mockResolvedValue(report());
  render(<DnsTool />);

  expect(screen.getByLabelText(/dns 服务器/i)).toHaveValue('system');
  expect((screen.getByRole('option', { name: '服务器系统 DNS' }) as HTMLOptionElement).selected).toBe(true);
  await userEvent.type(screen.getByLabelText(/domain/i), 'example.com');
  await userEvent.selectOptions(screen.getByLabelText(/dns 服务器/i), 'cloudflare');
  await userEvent.click(screen.getByRole('button', { name: /查询/ }));

  expect(mockedCallTool).toHaveBeenCalledWith('/api/java/dns', {
    domain: 'example.com', resolver: 'cloudflare',
  });
});

test('renders the report summary and answer records while supplementary sections start collapsed', async () => {
  mockedCallTool.mockResolvedValue(report());
  await runQuery();

  await screen.findByText('DNS 来源');
  expect(screen.getByText('服务器系统 DNS', { selector: 'dd' })).toBeInTheDocument();
  expect(screen.getByText('12 / 12')).toBeInTheDocument();
  expect(screen.getByText('66 ms')).toBeInTheDocument();
  expect(screen.getByText('10 mail.example.com.')).toBeVisible();
  expect(screen.getAllByText('响应 TTL')[0]).toBeVisible();
  expect(screen.getByText('优先级')).toBeVisible();
  expect(screen.getAllByText('目标')[0]).toBeVisible();

  const authority = screen.getByText('Authority').closest('details');
  const additional = screen.getByText('Additional').closest('details');
  const raw = screen.getByText('原始响应').closest('details');
  expect(authority).not.toHaveAttribute('open');
  expect(additional).not.toHaveAttribute('open');
  expect(raw).not.toHaveAttribute('open');
});

test('shows protocol rcode rather than ErrorView for a successful NXDOMAIN response', async () => {
  mockedCallTool.mockResolvedValue(report({
    queries: [query({ rcode: 'NXDOMAIN', answer: [], authority: [], additional: [] })],
  }));
  await runQuery();

  expect(await screen.findByText('NXDOMAIN')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('keeps an empty Answer open while retaining an Authority section', async () => {
  mockedCallTool.mockResolvedValue(report({
    queries: [query({ answer: [], authority: [record({ type: 'NS', value: 'ns1.example.com.' })], additional: [] })],
  }));
  await runQuery();

  const answer = await screen.findByText('Answer（0）');
  expect(answer.closest('details')).toHaveAttribute('open');
  expect(answer.closest('details')).toHaveTextContent('没有记录。');
  expect(screen.getByText('Authority（1）')).toBeVisible();
});

test('renders reports containing only per-query errors without a top-level ErrorView', async () => {
  mockedCallTool.mockResolvedValue(report({
    respondedQueryCount: 0,
    queries: [
      query({ type: 'A', rcode: null, flags: null, error: { code: 'DNS_TIMEOUT', message: '查询超时' }, answer: [], authority: [], additional: [] }),
      query({ type: 'AAAA', rcode: null, flags: null, error: { code: 'DNS_TRANSPORT_ERROR', message: '网络不可达' }, answer: [], authority: [], additional: [] }),
    ],
  }));
  await runQuery();

  expect(await screen.findByText('DNS_TIMEOUT: 查询超时')).toBeInTheDocument();
  expect(screen.getByText('DNS_TRANSPORT_ERROR: 网络不可达')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('shows a query-level timeout in the corresponding record-type block', async () => {
  mockedCallTool.mockResolvedValue(report({
    queries: [query({ type: 'AAAA', rcode: null, flags: null, error: { code: 'DNS_TIMEOUT', message: '查询超时' }, answer: [], authority: [], additional: [] })],
  }));
  await runQuery();

  const block = (await screen.findByText(/AAAA · example\.com\./)).closest('details');
  expect(block).toHaveTextContent('DNS_TIMEOUT: 查询超时');
});

test('uses ErrorView for a top-level DNS lookup failure', async () => {
  mockedCallTool.mockResolvedValue({
    ok: false, error: { code: 'DNS_LOOKUP_FAILED', message: 'DNS 查询未收到任何协议响应' },
  });
  await runQuery();

  expect(await screen.findByRole('alert')).toHaveTextContent('DNS_LOOKUP_FAILED');
});

test('identifies reverse PTR queries for IP input', async () => {
  mockedCallTool.mockResolvedValue(report({
    input: '203.0.113.7', queryCount: 1, respondedQueryCount: 1,
    queries: [query({ queryName: '7.113.0.203.in-addr.arpa.', type: 'PTR' })],
  }));
  await runQuery('203.0.113.7');

  expect(await screen.findByText(/PTR · 7\.113\.0\.203\.in-addr\.arpa\./)).toBeInTheDocument();
  expect(screen.getByText(/反向查询/)).toBeInTheDocument();
});
