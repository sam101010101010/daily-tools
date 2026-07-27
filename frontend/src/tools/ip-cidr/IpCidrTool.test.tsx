import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import IpCidrTool from './IpCidrTool';

afterEach(() => vi.unstubAllGlobals());

test('uses a safe public default and calculates a complete IPv4 report without fetching', async () => {
  const user = userEvent.setup();
  const fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
  render(<IpCidrTool />);

  expect(screen.getByLabelText('IP 地址 / CIDR')).toHaveValue(
    '192.168.1.42/24',
  );
  expect(screen.getByLabelText('IPv4 点分掩码（可选）')).toHaveValue('');
  expect(screen.getByLabelText('待判断地址（可选）')).toHaveValue('');
  expect(screen.queryByLabelText('计算结果')).not.toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: '计算' }));

  const report = screen.getByLabelText('计算结果');
  expect(within(report).getByLabelText('规范 CIDR')).toHaveTextContent(
    '192.168.1.42/24',
  );
  expect(within(report).getByLabelText('网络地址')).toHaveTextContent(
    '192.168.1.0',
  );
  expect(within(report).getByLabelText('首地址')).toHaveTextContent(
    '192.168.1.0',
  );
  expect(within(report).getByLabelText('末地址')).toHaveTextContent(
    '192.168.1.255',
  );
  expect(within(report).getByLabelText('子网掩码')).toHaveTextContent(
    '255.255.255.0',
  );
  expect(within(report).getByLabelText('Wildcard mask')).toHaveTextContent(
    '0.0.0.255',
  );
  expect(within(report).getByLabelText('广播地址')).toHaveTextContent(
    '192.168.1.255',
  );
  expect(within(report).getByLabelText('地址总数')).toHaveTextContent('256');
  expect(fetchSpy).not.toHaveBeenCalled();
});

test('renders exact large IPv6 values as text without IPv4-only rows', async () => {
  const user = userEvent.setup();
  render(<IpCidrTool />);

  await replaceInput(user, 'IP 地址 / CIDR', '2001:db8::1/0');
  await user.click(screen.getByRole('button', { name: '计算' }));

  const report = screen.getByLabelText('计算结果');
  expect(within(report).getByLabelText('规范 CIDR')).toHaveTextContent(
    '2001:db8::1/0',
  );
  expect(within(report).getByLabelText('网络地址')).toHaveTextContent('::');
  expect(within(report).getByLabelText('末地址')).toHaveTextContent(
    'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
  );
  expect(within(report).getByLabelText('地址总数')).toHaveTextContent(
    '340282366920938463463374607431768211456',
  );
  expect(
    within(report).queryByLabelText('广播地址'),
  ).not.toBeInTheDocument();
  expect(
    within(report).queryByLabelText('Wildcard mask'),
  ).not.toBeInTheDocument();
});

test('lets an optional dotted mask override the CIDR prefix', async () => {
  const user = userEvent.setup();
  render(<IpCidrTool />);

  await replaceInput(user, 'IP 地址 / CIDR', '192.168.1.42/32');
  await replaceInput(
    user,
    'IPv4 点分掩码（可选）',
    '255.255.255.0',
  );
  await user.click(screen.getByRole('button', { name: '计算' }));

  expect(screen.getByLabelText('规范 CIDR')).toHaveTextContent(
    '192.168.1.42/24',
  );
  expect(screen.getByLabelText('子网掩码')).toHaveTextContent(
    '255.255.255.0',
  );
});

test('reports optional same-family membership', async () => {
  const user = userEvent.setup();
  render(<IpCidrTool />);

  await replaceInput(user, '待判断地址（可选）', '192.168.1.200');
  await user.click(screen.getByRole('button', { name: '计算' }));
  expect(screen.getByLabelText('成员判断')).toHaveTextContent(
    '192.168.1.200 属于该网段',
  );

  await replaceInput(user, '待判断地址（可选）', '192.168.2.1');
  await user.click(screen.getByRole('button', { name: '计算' }));
  expect(screen.getByLabelText('成员判断')).toHaveTextContent(
    '192.168.2.1 不属于该网段',
  );
});

test('submits with Enter and exposes labelled fields and the allocation note', async () => {
  const user = userEvent.setup();
  render(<IpCidrTool />);

  expect(
    screen.getByText(/数学地址范围不等于云厂商、操作系统或协议实际可分配的主机数/),
  ).toBeInTheDocument();
  await replaceInput(user, 'IP 地址 / CIDR', '192.0.2.1/32');
  await user.keyboard('{Enter}');

  expect(screen.getByLabelText('网络地址')).toHaveTextContent('192.0.2.1');
});

test('announces an error and removes stale results after invalid input', async () => {
  const user = userEvent.setup();
  render(<IpCidrTool />);

  await user.click(screen.getByRole('button', { name: '计算' }));
  expect(screen.getByLabelText('计算结果')).toBeInTheDocument();

  await replaceInput(
    user,
    'IPv4 点分掩码（可选）',
    '255.0.255.0',
  );
  await user.click(screen.getByRole('button', { name: '计算' }));

  expect(screen.getByRole('alert')).toHaveTextContent(
    'IPv4 点分掩码必须是连续的 1 后接连续的 0',
  );
  expect(screen.queryByLabelText('计算结果')).not.toBeInTheDocument();
});

test('does not let an optional mask hide an extra slash in the primary input', async () => {
  const user = userEvent.setup();
  render(<IpCidrTool />);

  await user.click(screen.getByRole('button', { name: '计算' }));
  await replaceInput(
    user,
    'IP 地址 / CIDR',
    '192.168.1.42/24/garbage',
  );
  await replaceInput(
    user,
    'IPv4 点分掩码（可选）',
    '255.255.255.0',
  );
  await user.click(screen.getByRole('button', { name: '计算' }));

  expect(screen.getByRole('alert')).toHaveTextContent('CIDR 格式无效');
  expect(screen.queryByLabelText('计算结果')).not.toBeInTheDocument();
});

test('maps invalid primary and candidate IP addresses to local UI errors', async () => {
  const user = userEvent.setup();
  render(<IpCidrTool />);

  await replaceInput(user, 'IP 地址 / CIDR', '999.1.1.1/24');
  await user.click(screen.getByRole('button', { name: '计算' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'IPv4 地址格式无效',
  );
  expect(screen.queryByLabelText('计算结果')).not.toBeInTheDocument();

  await replaceInput(user, 'IP 地址 / CIDR', '192.168.1.42/24');
  await replaceInput(user, '待判断地址（可选）', '999.1.1.1');
  await user.click(screen.getByRole('button', { name: '计算' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'IPv4 地址格式无效',
  );
  expect(screen.queryByLabelText('计算结果')).not.toBeInTheDocument();
});

test('rejects mixed-family membership and removes the previous report', async () => {
  const user = userEvent.setup();
  render(<IpCidrTool />);

  await user.click(screen.getByRole('button', { name: '计算' }));
  await replaceInput(user, '待判断地址（可选）', '2001:db8::1');
  await user.click(screen.getByRole('button', { name: '计算' }));

  expect(screen.getByRole('alert')).toHaveTextContent(
    '待判断地址必须与网段使用相同的地址族',
  );
  expect(screen.queryByLabelText('计算结果')).not.toBeInTheDocument();
});

test('copies one field and a deterministic whole report with accessible status', async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  render(<IpCidrTool />);

  await replaceInput(user, '待判断地址（可选）', '192.168.1.200');
  await user.click(screen.getByRole('button', { name: '计算' }));
  await user.click(
    screen.getByRole('button', { name: '复制 网络地址' }),
  );

  expect(writeText).toHaveBeenNthCalledWith(1, '192.168.1.0');
  expect(screen.getByRole('status')).toHaveTextContent('网络地址已复制');

  await user.click(screen.getByRole('button', { name: '复制完整报告' }));
  expect(writeText).toHaveBeenNthCalledWith(
    2,
    [
      '规范 CIDR：192.168.1.42/24',
      '地址族：IPv4',
      '规范地址：192.168.1.42',
      '网络地址：192.168.1.0',
      '首地址：192.168.1.0',
      '末地址：192.168.1.255',
      '前缀长度：/24',
      '子网掩码：255.255.255.0',
      'Wildcard mask：0.0.0.255',
      '广播地址：192.168.1.255',
      '地址总数：256',
      '成员判断：192.168.1.200 属于该网段',
    ].join('\n'),
  );
  expect(screen.getByRole('status')).toHaveTextContent('完整报告已复制');
});

async function replaceInput(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  value: string,
): Promise<void> {
  const input = screen.getByLabelText(label);
  await user.clear(input);
  await user.type(input, value);
}
