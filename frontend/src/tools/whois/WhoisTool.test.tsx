import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import { callTool } from '../../lib/api';
import { copyText } from '../../lib/copy';
import WhoisTool from './WhoisTool';

vi.mock('../../lib/api', () => ({ callTool: vi.fn() }));
vi.mock('../../lib/copy', () => ({ copyText: vi.fn() }));

const mockedCallTool = vi.mocked(callTool);
const mockedCopyText = vi.mocked(copyText);

const rawJson = '{"ldhName":"example.com","status":["active"]}';

function foundReport(overrides: Record<string, unknown> = {}) {
  return {
    ok: true as const,
    data: {
      input: 'Example.COM',
      domain: 'example.com',
      found: true,
      source: 'https://rdap.example/domain/example.com',
      ldhName: 'example.com',
      unicodeName: null,
      handle: '2336799_DOMAIN_COM-VRSN',
      statuses: ['active', 'client transfer prohibited'],
      events: [
        { action: 'registration', date: '1995-08-14T04:00:00Z', actor: null },
        { action: 'expiration', date: '2027-08-13T04:00:00Z', actor: 'Example Registrar' },
      ],
      registrar: { name: 'Example Registrar', handle: '376' },
      nameservers: [
        { ldhName: 'a.iana-servers.net', unicodeName: null, statuses: ['associated'] },
        { ldhName: 'b.iana-servers.net', unicodeName: null, statuses: [] },
      ],
      notices: [
        { title: 'Terms of Service', description: ['Public registration data'] },
      ],
      rawJson,
      ...overrides,
    },
  };
}

async function query() {
  const user = userEvent.setup();
  render(<WhoisTool />);
  await user.click(screen.getByRole('button', { name: '查询' }));
  return user;
}

afterEach(() => {
  vi.clearAllMocks();
});

test('pre-fills a public example and only requests the exact RDAP endpoint after explicit query', async () => {
  let resolveLookup: (value: ReturnType<typeof foundReport>) => void = () => {};
  mockedCallTool.mockImplementation(() => new Promise((resolve) => {
    resolveLookup = resolve;
  }));
  const user = userEvent.setup();
  render(<WhoisTool />);

  expect(screen.getByLabelText('域名')).toHaveValue('example.com');
  expect(mockedCallTool).not.toHaveBeenCalled();

  await user.click(screen.getByRole('button', { name: '查询' }));

  expect(mockedCallTool).toHaveBeenCalledOnce();
  expect(mockedCallTool).toHaveBeenCalledWith('/api/java/whois', { domain: 'example.com' });
  expect(screen.getByText('查询中…')).toBeInTheDocument();

  resolveLookup(foundReport());
  expect(await screen.findByText('域名摘要')).toBeInTheDocument();
});

test('renders a readable found report, keeps raw JSON closed, and copies its exact source text', async () => {
  mockedCallTool.mockResolvedValue(foundReport());
  mockedCopyText.mockResolvedValue({ ok: true });
  const user = await query();

  expect(await screen.findByText('域名摘要')).toBeInTheDocument();
  expect(screen.getByText('规范域名')).toBeInTheDocument();
  expect(screen.getAllByText('example.com', { selector: 'dd' })).not.toHaveLength(0);
  expect(screen.getByText('状态')).toBeInTheDocument();
  expect(screen.getByText('active')).toBeInTheDocument();
  expect(screen.getByText('生命周期')).toBeInTheDocument();
  expect(screen.getByText('registration')).toBeInTheDocument();
  expect(screen.getByText('expiration')).toBeInTheDocument();
  expect(screen.getAllByText('Example Registrar')).not.toHaveLength(0);
  expect(screen.getByText('a.iana-servers.net')).toBeInTheDocument();
  expect(screen.getByText('b.iana-servers.net')).toBeInTheDocument();
  expect(screen.getByText('Terms of Service')).toBeInTheDocument();

  const rawDetails = screen.getByText('原始 RDAP JSON').closest('details');
  expect(rawDetails).not.toHaveAttribute('open');

  await user.click(screen.getByRole('button', { name: '复制原始 JSON' }));

  expect(mockedCopyText).toHaveBeenCalledWith(rawJson);
  expect(screen.getByRole('status')).toHaveTextContent('已复制');
});

test('treats a successful RDAP 404 report as a normal not-found result', async () => {
  mockedCallTool.mockResolvedValue({
    ok: true,
    data: {
      input: 'missing.example',
      domain: 'missing.example',
      found: false,
      source: 'https://rdap.example/domain/missing.example',
      ldhName: null,
      unicodeName: null,
      handle: null,
      statuses: [],
      events: [],
      registrar: null,
      nameservers: [],
      notices: [],
      rawJson: null,
    },
  });

  await query();

  expect(await screen.findByText('未找到公开注册信息')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('uses ErrorView for an RDAP lookup failure envelope', async () => {
  mockedCallTool.mockResolvedValue({
    ok: false,
    error: { code: 'RDAP_LOOKUP_FAILED', message: 'RDAP 查询暂时不可用' },
  });

  await query();

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'RDAP_LOOKUP_FAILED: RDAP 查询暂时不可用',
  );
});

test('renders untrusted remote fields as literal text and shows missing optional fields explicitly', async () => {
  const malicious = '<img src=x>';
  mockedCallTool.mockResolvedValue(foundReport({
    unicodeName: malicious,
    handle: null,
    registrar: { name: malicious, handle: null },
    notices: [{ title: malicious, description: [malicious] }],
  }));

  await query();

  expect(await screen.findAllByText(malicious)).not.toHaveLength(0);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getAllByText('未公开')).not.toHaveLength(0);
});
