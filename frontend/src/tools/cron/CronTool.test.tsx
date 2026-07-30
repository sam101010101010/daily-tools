import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, test, vi } from 'vitest';
import * as cronExplain from './cronExplain';
import * as cronPreview from './cronPreview';
import * as profileSyntax from './profileSyntax';
import { CRON_PROFILES } from './profiles';
import CronTool from './CronTool';

const FIXED_NOW = new Date('2024-01-01T00:07:00.000Z');

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

test('requires an explicit profile before it enables or interprets an expression', () => {
  const parseSpy = vi.spyOn(profileSyntax, 'parseCron');
  const fetchSpy = vi.fn();
  const storageGetSpy = vi.spyOn(Storage.prototype, 'getItem');
  const storageSetSpy = vi.spyOn(Storage.prototype, 'setItem');
  vi.stubGlobal('fetch', fetchSpy);

  render(<CronTool now={() => FIXED_NOW} />);

  expect(screen.getByRole('status')).toHaveTextContent('请先选择目标 Cron 方言');
  expect(screen.getByLabelText('Cron 表达式')).toBeDisabled();
  expect(screen.getByRole('button', { name: '生成预览' })).toBeDisabled();
  expect(screen.queryByLabelText('IANA 时区')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Kubernetes spec.timeZone')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('表达式解释')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('未来 10 次运行时间')).not.toBeInTheDocument();
  expect(parseSpy).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(storageGetSpy).not.toHaveBeenCalled();
  expect(storageSetSpy).not.toHaveBeenCalled();
});

test('lists exactly the seven approved profiles and adapts the visible field context after selection', async () => {
  const user = userEvent.setup();
  render(<CronTool now={() => FIXED_NOW} />);

  const selector = screen.getByLabelText('Cron 方言 profile');
  expect(within(selector).getAllByRole('option').slice(1).map(option => option.getAttribute('value')))
    .toEqual(CRON_PROFILES.map(profile => profile.id));
  expect(within(selector).getAllByRole('option').slice(1).map(option => option.textContent))
    .toEqual(CRON_PROFILES.map(profile => profile.label));

  for (const profile of CRON_PROFILES) {
    await user.selectOptions(selector, profile.id);
    expect(screen.getByTestId('cron-profile-badge')).toHaveTextContent(profile.label);
    expect(within(screen.getByLabelText('字段顺序')).getAllByRole('listitem')).toHaveLength(profile.fieldOrder.length);
    expect(screen.getByLabelText('Cron 表达式')).toHaveAttribute('placeholder', profile.defaultExpression);
    if (profile.wrapper === 'cron-required') {
      expect(screen.getByText('必须使用 cron(...) 外壳')).toBeInTheDocument();
    } else {
      expect(screen.queryByText('必须使用 cron(...) 外壳')).not.toBeInTheDocument();
    }
  }
});

test('keeps input text but synchronously clears old results when the profile changes', async () => {
  const user = userEvent.setup();
  render(<CronTool now={() => FIXED_NOW} />);

  await user.selectOptions(screen.getByLabelText('Cron 方言 profile'), 'linux-vixie');
  await user.click(screen.getByRole('button', { name: '填入示例' }));
  await user.click(screen.getByLabelText('Cron 表达式'));
  await user.keyboard('{Enter}');
  expect(screen.getByLabelText('未来 10 次运行时间')).toBeInTheDocument();

  const expression = screen.getByLabelText('Cron 表达式');
  const previousValue = (expression as HTMLInputElement).value;
  await user.selectOptions(screen.getByLabelText('Cron 方言 profile'), 'spring');

  expect(expression).toHaveValue(previousValue);
  expect(screen.queryByLabelText('表达式解释')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('未来 10 次运行时间')).not.toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('renders a selected profile on valid output and clears it before an invalid re-submit', async () => {
  const user = userEvent.setup();
  const { container } = render(<CronTool now={() => FIXED_NOW} />);

  await user.selectOptions(screen.getByLabelText('Cron 方言 profile'), 'macos-bsd');
  await user.click(screen.getByRole('button', { name: '填入示例' }));
  await user.click(screen.getByLabelText('Cron 表达式'));
  await user.keyboard('{Enter}');
  expect(container.querySelector('.cron__results')).toHaveAttribute('data-cron-profile', 'macos-bsd');

  await user.clear(screen.getByLabelText('Cron 表达式'));
  await user.type(screen.getByLabelText('Cron 表达式'), '0 0 1 1 * *');
  await user.keyboard('{Enter}');

  expect(screen.getByRole('alert').parentElement).toHaveAttribute('data-cron-profile', 'macos-bsd');
  expect(screen.queryByLabelText('未来 10 次运行时间')).not.toBeInTheDocument();
});

test('turns a mismatched preview profile into the stable safe error without stale results', async () => {
  const user = userEvent.setup();
  render(<CronTool now={() => FIXED_NOW} />);

  await user.selectOptions(screen.getByLabelText('Cron 方言 profile'), 'linux-vixie');
  const realPreview = cronPreview.previewCron;
  vi.spyOn(cronPreview, 'previewCron').mockImplementationOnce((cron, timeZone, now) => ({
    ...realPreview(cron, timeZone, now),
    profile: 'macos-bsd',
  }));
  await user.click(screen.getByRole('button', { name: '填入示例' }));
  await user.click(screen.getByLabelText('Cron 表达式'));
  await user.keyboard('{Enter}');

  expect(screen.getByRole('alert')).toHaveTextContent('无法生成预览，请检查所选 Cron 方言与 IANA 时区');
  expect(screen.queryByLabelText('未来 10 次运行时间')).not.toBeInTheDocument();
});

test('turns a mismatched explanation profile into the stable safe error without stale results', async () => {
  const user = userEvent.setup();
  render(<CronTool now={() => FIXED_NOW} />);

  await user.selectOptions(screen.getByLabelText('Cron 方言 profile'), 'linux-vixie');
  const realExplain = cronExplain.explainCron;
  vi.spyOn(cronExplain, 'explainCron').mockImplementationOnce((cron) => ({
    ...realExplain(cron),
    profile: 'macos-bsd',
  }));
  await user.click(screen.getByRole('button', { name: '填入示例' }));
  await user.click(screen.getByLabelText('Cron 表达式'));
  await user.keyboard('{Enter}');

  expect(screen.getByRole('alert')).toHaveTextContent('无法生成预览，请检查所选 Cron 方言与 IANA 时区');
  expect(screen.queryByLabelText('表达式解释')).not.toBeInTheDocument();
});

test.each(['preview', 'explanation'] as const)('hides a thrown %s dependency error behind the stable safe error', async (dependency) => {
  const user = userEvent.setup();
  render(<CronTool now={() => FIXED_NOW} />);

  await user.selectOptions(screen.getByLabelText('Cron 方言 profile'), 'linux-vixie');
  await user.click(screen.getByRole('button', { name: '填入示例' }));
  await user.click(screen.getByLabelText('Cron 表达式'));
  await user.keyboard('{Enter}');
  expect(screen.getByLabelText('未来 10 次运行时间')).toBeInTheDocument();

  if (dependency === 'preview') {
    vi.spyOn(cronPreview, 'previewCron').mockImplementationOnce(() => {
      throw new Error('Croner exploded\\n    at dependency-stack.js:42');
    });
  } else {
    vi.spyOn(cronExplain, 'explainCron').mockImplementationOnce(() => {
      throw new Error('explainer exploded\\n    at dependency-stack.js:42');
    });
  }
  await user.clear(screen.getByLabelText('Cron 表达式'));
  await user.type(screen.getByLabelText('Cron 表达式'), '0 9 * * *');
  await user.keyboard('{Enter}');

  expect(screen.getByRole('alert')).toHaveTextContent('无法生成预览，请检查所选 Cron 方言与 IANA 时区');
  expect(screen.getByRole('alert')).not.toHaveTextContent(/Croner|exploder|dependency-stack/);
  expect(screen.queryByLabelText('未来 10 次运行时间')).not.toBeInTheDocument();
});

test('uses profile-specific time-zone controls and keeps Kubernetes time-zone out of the expression', async () => {
  const user = userEvent.setup();
  render(<CronTool now={() => FIXED_NOW} />);

  await user.selectOptions(screen.getByLabelText('Cron 方言 profile'), 'eventbridge-legacy');
  expect(screen.getByText('固定 UTC（EventBridge legacy rule）')).toBeInTheDocument();
  expect(screen.queryByLabelText('IANA 时区')).not.toBeInTheDocument();

  await user.selectOptions(screen.getByLabelText('Cron 方言 profile'), 'kubernetes');
  expect(screen.getByLabelText('Kubernetes spec.timeZone')).toBeInTheDocument();
  await user.type(screen.getByLabelText('Cron 表达式'), 'TZ=UTC 0 9 * * *');
  await user.keyboard('{Enter}');
  expect(screen.getByRole('alert')).toHaveTextContent('Cron 表达式不支持环境变量前缀');

  for (const profile of CRON_PROFILES.filter(candidate => candidate.id !== 'eventbridge-legacy' && candidate.id !== 'kubernetes')) {
    await user.selectOptions(screen.getByLabelText('Cron 方言 profile'), profile.id);
    expect(screen.getByLabelText('IANA 时区')).toBeInTheDocument();
  }
});

test('shows wrapper and DOM/DOW context without converting an EventBridge expression', async () => {
  const user = userEvent.setup();
  render(<CronTool now={() => FIXED_NOW} />);

  await user.selectOptions(screen.getByLabelText('Cron 方言 profile'), 'eventbridge-scheduler');
  expect(screen.getByText('日期和星期字段必须且只能有一个使用 ?')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: '填入示例' }));
  await user.click(screen.getByLabelText('Cron 表达式'));
  await user.keyboard('{Enter}');

  expect(screen.getByLabelText('Cron 表达式')).toHaveValue('cron(0 9 ? * MON-FRI *)');
  expect(screen.getByLabelText('未来 10 次运行时间')).toBeInTheDocument();
  expect(screen.getByTestId('cron-profile-badge')).toHaveTextContent('EventBridge Scheduler');
});

test('submits on Enter and copies the selected profile normalized expression and runs', async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  const fetchSpy = vi.fn();
  const storageGetSpy = vi.spyOn(Storage.prototype, 'getItem');
  const storageSetSpy = vi.spyOn(Storage.prototype, 'setItem');
  const storageRemoveSpy = vi.spyOn(Storage.prototype, 'removeItem');
  const storageClearSpy = vi.spyOn(Storage.prototype, 'clear');
  vi.stubGlobal('fetch', fetchSpy);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  render(<CronTool now={() => FIXED_NOW} />);

  await user.selectOptions(screen.getByLabelText('Cron 方言 profile'), 'linux-vixie');
  await user.click(screen.getByRole('button', { name: '填入示例' }));
  await user.selectOptions(screen.getByLabelText('IANA 时区'), 'UTC');
  await user.click(screen.getByLabelText('Cron 表达式'));
  await user.keyboard('{Enter}');
  await user.click(screen.getByRole('button', { name: '复制表达式' }));
  expect(writeText).toHaveBeenLastCalledWith('*/15 9-17 * * MON-FRI');

  await user.click(screen.getByRole('button', { name: '复制全部运行时间' }));
  expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining('UTC'));
  expect(screen.getByRole('status')).toHaveTextContent('已复制运行时间');
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(storageGetSpy).not.toHaveBeenCalled();
  expect(storageSetSpy).not.toHaveBeenCalled();
  expect(storageRemoveSpy).not.toHaveBeenCalled();
  expect(storageClearSpy).not.toHaveBeenCalled();
});
